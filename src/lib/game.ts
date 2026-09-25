import {
  collection,
  doc,
  getDocFromServer,
  getDocs,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from '../firebase';
import { normalizeAnswer } from './text';
import { activeTeams, countQuestions, questionNumber } from './quiz';
import type { QuestionType, Quiz, RevealData, Room } from '../types';

// وقت إضافي صغير عشان النت البطيء
export const GRACE_MS = 1500;
// العد التنازلي قبل كل سؤال (الموبايلات بتستلم السؤال فيه)
export const LEAD_MS = 4000;

// لو النقط على حسب السرعة: أقصى نقط لو جاوب فوراً، وبتقل لحد أقل نقط لو جاوب في آخر ثانية
export function calcPoints(
  elapsedMs: number,
  limitMs: number,
  maxPoints: number,
  minPoints: number,
  speedBonus: boolean,
): number {
  if (!speedBonus || limitMs <= 0) return maxPoints;
  const ratio = Math.min(1, Math.max(0, elapsedMs / limitMs));
  return Math.round(maxPoints - (maxPoints - Math.min(minPoints, maxPoints)) * ratio);
}

export function joinUrl(code: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/join/${code}`;
}

export async function createRoom(quiz: Quiz, uid: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const ref = doc(db, 'rooms', code);
    const created = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) return false;
      tx.set(ref, {
        hostId: uid,
        quizId: quiz.id,
        title: quiz.title,
        status: 'lobby',
        currentIndex: -1,
        totalQuestions: countQuestions(quiz.questions),
        question: null,
        questionStartedAt: null,
        questionEndsAt: null,
        reveal: null,
        teams: activeTeams(quiz.settings),
        teamScoring: quiz.settings.teamScoring,
        createdAt: serverTimestamp(),
      });
      return true;
    });
    if (created) return code;
  }
  throw new Error('room-code-exhausted');
}

// بيحسب الفرق بين ساعة الجهاز وساعة سيرفر جوجل
export async function syncServerClock(ref: DocumentReference): Promise<number> {
  const before = Date.now();
  await updateDoc(ref, { clockSync: serverTimestamp() });
  const acked = Date.now();
  const snap = await getDocFromServer(ref);
  const server = (snap.get('clockSync') as Timestamp | undefined)?.toMillis();
  if (!server) return 0;
  return server - (before + acked) / 2;
}

function shuffledPerm(n: number, avoidIdentity: boolean): number[] {
  const identity = Array.from({ length: n }, (_, i) => i);
  for (let tries = 0; tries < 10; tries++) {
    const p = [...identity];
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    if (!avoidIdentity || n < 2 || p.some((v, i) => v !== i)) return p;
  }
  return identity;
}

export async function startQuestion(
  roomRef: DocumentReference,
  quiz: Quiz,
  index: number,
  clockOffset: number,
): Promise<void> {
  const q = quiz.questions[index];
  const needsShuffle = q.type === 'order' || (q.type === 'choice' && q.shuffle);
  const perm = needsShuffle
    ? shuffledPerm(q.options.length, q.type === 'order')
    : q.options.map((_, i) => i);
  const startMs = Date.now() + clockOffset + LEAD_MS;

  const batch = writeBatch(db);
  // ترتيب الخلط بيتحفظ في مكان المسؤول بس يشوفه
  batch.set(doc(roomRef, 'secret', 'current'), { qIndex: index, perm });
  batch.update(roomRef, {
    status: 'question',
    currentIndex: index,
    question: {
      type: q.type as QuestionType,
      number: questionNumber(quiz.questions, index),
      text: q.text,
      description: q.description,
      imageUrl: q.imageUrl,
      options: perm.map((i) => q.options[i]),
      optionImages: q.type === 'choice' ? perm.map((i) => q.optionImages[i] ?? '') : [],
      timeLimit: q.timeLimit,
      points: q.points * (q.double ? 2 : 1),
      double: q.double,
      multi: q.type === 'choice' && q.correct.length > 1,
    },
    reveal: null,
    questionStartedAt: Timestamp.fromMillis(startMs),
    questionEndsAt: Timestamp.fromMillis(startMs + q.timeLimit * 1000 + GRACE_MS),
  });
  await batch.commit();
}

function toIntList(c: unknown): number[] {
  if (typeof c === 'number' && Number.isInteger(c)) return [c];
  if (Array.isArray(c)) return c.filter((x): x is number => typeof x === 'number' && Number.isInteger(x));
  return [];
}

// بيكشف الإجابة ويحسب نقط كل اللاعبين
export async function revealQuestion(roomRef: DocumentReference, quiz: Quiz): Promise<void> {
  const roomSnap = await getDocFromServer(roomRef);
  const room = roomSnap.data() as Room | undefined;
  if (!room || room.status !== 'question') return;

  const i = room.currentIndex;
  const q = quiz.questions[i];
  const n = q.options.length;
  const startedMs = room.questionStartedAt?.toMillis() ?? 0;
  const limitMs = q.timeLimit * 1000;

  const secretSnap = await getDocFromServer(doc(roomRef, 'secret', 'current'));
  const savedPerm = secretSnap.exists() && secretSnap.get('qIndex') === i ? (secretSnap.get('perm') as number[]) : null;
  const perm = savedPerm && savedPerm.length === n ? savedPerm : q.options.map((_, k) => k);

  const [answersSnap, playersSnap] = await Promise.all([
    getDocs(query(collection(roomRef, 'answers'), where('qIndex', '==', i))),
    getDocs(collection(roomRef, 'players')),
  ]);

  const sortedCorrect = [...q.correct].sort((a, b) => a - b);
  const accepted = q.accepted.map(normalizeAnswer).filter(Boolean);
  const counts: number[] = new Array(n).fill(0);
  const tally = new Map<string, { text: string; count: number; correct: boolean }>();
  const results = new Map<string, { correct: boolean; at: number }>();

  answersSnap.forEach((d) => {
    const a = d.data() as { uid: string; choice: unknown; answeredAt?: Timestamp };
    const at = a.answeredAt?.toMillis() ?? startedMs + limitMs;
    let correct = false;

    if (q.type === 'choice' || q.type === 'truefalse') {
      const picks = [...new Set(toIntList(a.choice).filter((x) => x >= 0 && x < n))];
      picks.forEach((x) => counts[x]++);
      const orig = picks.map((x) => perm[x]).sort((x, y) => x - y);
      correct = orig.length === sortedCorrect.length && orig.every((v, k) => v === sortedCorrect[k]);
    } else if (q.type === 'order') {
      const seq = toIntList(a.choice);
      correct = seq.length === n && seq.every((dIdx, k) => perm[dIdx] === k);
    } else {
      const raw = typeof a.choice === 'string' ? a.choice.trim().slice(0, 100) : '';
      const norm = normalizeAnswer(raw);
      correct = !!norm && accepted.includes(norm);
      if (norm) {
        const t = tally.get(norm) ?? { text: raw, count: 0, correct };
        t.count++;
        tally.set(norm, t);
      }
    }
    results.set(a.uid, { correct, at });
  });

  let correctCount = 0;
  results.forEach((r) => {
    if (r.correct) correctCount++;
  });

  const reveal: RevealData = {
    correct:
      q.type === 'order'
        ? q.options.map((_, k) => perm.indexOf(k))
        : q.type === 'short'
          ? []
          : q.correct.map((c) => perm.indexOf(c)).filter((x) => x >= 0),
    counts: q.type === 'choice' || q.type === 'truefalse' ? counts : [],
    accepted: q.type === 'short' ? q.accepted.filter((a) => a.trim()) : [],
    topAnswers: [...tally.values()].sort((a, b) => b.count - a.count).slice(0, 8),
    correctCount,
    answerCount: answersSnap.size,
  };
  const roomUpdate = { status: 'reveal', reveal };
  const players = playersSnap.docs;

  if (players.length === 0) {
    await updateDoc(roomRef, roomUpdate);
    return;
  }

  const CHUNK = 400;
  for (let start = 0; start < players.length; start += CHUNK) {
    const batch = writeBatch(db);
    for (const p of players.slice(start, start + CHUNK)) {
      const r = results.get(p.id);
      const correct = !!r?.correct;
      const prevStreak = (p.get('streak') as number | undefined) ?? 0;
      const streak = correct ? prevStreak + 1 : 0;
      const base = correct
        ? calcPoints(r!.at - startedMs, limitMs, q.points, q.minPoints, q.speedBonus) * (q.double ? 2 : 1)
        : 0;
      const bonus = correct && quiz.settings.streakBonus && streak > 1 ? Math.min(500, 100 * (streak - 1)) : 0;
      batch.update(p.ref, {
        score: increment(base + bonus),
        lastPoints: base + bonus,
        lastBonus: bonus,
        lastCorrect: correct,
        lastQ: i,
        streak,
      });
    }
    if (start + CHUNK >= players.length) batch.update(roomRef, roomUpdate);
    await batch.commit();
  }
}

// بيروح للسلايد رقم index: سؤال أو ترتيب، ولو خلصوا بينهي المسابقة
export async function goToSlide(
  roomRef: DocumentReference,
  quiz: Quiz,
  index: number,
  clockOffset: number,
): Promise<void> {
  const slide = quiz.questions[index];
  if (!slide) return endGame(roomRef);
  if (slide.type === 'leaderboard') {
    await updateDoc(roomRef, { status: 'leaderboard', currentIndex: index });
    return;
  }
  await startQuestion(roomRef, quiz, index, clockOffset);
}

export async function endGame(roomRef: DocumentReference): Promise<void> {
  await updateDoc(roomRef, { status: 'ended', question: null });
}
