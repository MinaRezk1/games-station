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
import type { Quiz, Room } from '../types';

// وقت إضافي صغير عشان النت البطيء، اللاعب مايتظلمش
export const GRACE_MS = 1500;

export const TIME_OPTIONS = [10, 15, 20, 30, 45, 60];

// أقصى نقط 1000 لو جاوب فوراً، وبتقل لحد 500 لو جاوب في آخر ثانية
export function calcPoints(elapsedMs: number, limitMs: number): number {
  if (limitMs <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, elapsedMs / limitMs));
  return Math.round(1000 * (1 - ratio / 2));
}

export function joinUrl(code: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/join/${code}`;
}

export function roomRefFor(code: string): DocumentReference {
  return doc(db, 'rooms', code);
}

// بيعمل غرفة جديدة بكود من 6 أرقام مش مستخدم قبل كده
export async function createRoom(quiz: Quiz, uid: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const ref = roomRefFor(code);
    const created = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) return false;
      tx.set(ref, {
        hostId: uid,
        quizId: quiz.id,
        title: quiz.title,
        status: 'lobby',
        currentIndex: -1,
        totalQuestions: quiz.questions.length,
        question: null,
        questionStartedAt: null,
        questionEndsAt: null,
        correctIndex: null,
        answerCounts: null,
        createdAt: serverTimestamp(),
      });
      return true;
    });
    if (created) return code;
  }
  throw new Error('room-code-exhausted');
}

// بيحسب الفرق بين ساعة الجهاز وساعة سيرفر جوجل
export async function syncServerClock(roomRef: DocumentReference): Promise<number> {
  const before = Date.now();
  await updateDoc(roomRef, { clockSync: serverTimestamp() });
  const acked = Date.now();
  const snap = await getDocFromServer(roomRef);
  const server = (snap.get('clockSync') as Timestamp | undefined)?.toMillis();
  if (!server) return 0;
  return server - (before + acked) / 2;
}

export async function startQuestion(
  roomRef: DocumentReference,
  quiz: Quiz,
  index: number,
  clockOffset: number,
): Promise<void> {
  const q = quiz.questions[index];
  await updateDoc(roomRef, {
    status: 'question',
    currentIndex: index,
    question: { text: q.text, options: q.options, timeLimit: q.timeLimit },
    correctIndex: null,
    answerCounts: null,
    questionStartedAt: serverTimestamp(),
    questionEndsAt: Timestamp.fromMillis(Date.now() + clockOffset + q.timeLimit * 1000 + GRACE_MS),
  });
}

// بيكشف الإجابة ويحسب نقط كل اللاعبين
export async function revealQuestion(roomRef: DocumentReference, quiz: Quiz): Promise<void> {
  const roomSnap = await getDocFromServer(roomRef);
  const room = roomSnap.data() as Room | undefined;
  if (!room || room.status !== 'question') return;

  const i = room.currentIndex;
  const q = quiz.questions[i];
  const startedMs = room.questionStartedAt?.toMillis() ?? 0;
  const limitMs = q.timeLimit * 1000;

  const [answersSnap, playersSnap] = await Promise.all([
    getDocs(query(collection(roomRef, 'answers'), where('qIndex', '==', i))),
    getDocs(collection(roomRef, 'players')),
  ]);

  const counts = q.options.map(() => 0);
  const byUid = new Map<string, { choice: number; at: number }>();
  answersSnap.forEach((d) => {
    const a = d.data() as { uid: string; choice: number; answeredAt?: Timestamp };
    if (a.choice >= 0 && a.choice < counts.length) counts[a.choice]++;
    byUid.set(a.uid, { choice: a.choice, at: a.answeredAt?.toMillis() ?? startedMs + limitMs });
  });

  const roomUpdate = { status: 'reveal', correctIndex: q.correctIndex, answerCounts: counts };
  const players = playersSnap.docs;

  if (players.length === 0) {
    await updateDoc(roomRef, roomUpdate);
    return;
  }

  const CHUNK = 400;
  for (let start = 0; start < players.length; start += CHUNK) {
    const batch = writeBatch(db);
    for (const p of players.slice(start, start + CHUNK)) {
      const ans = byUid.get(p.id);
      const correct = !!ans && ans.choice === q.correctIndex;
      const points = correct ? calcPoints(ans!.at - startedMs, limitMs) : 0;
      batch.update(p.ref, {
        score: increment(points),
        lastPoints: points,
        lastCorrect: correct,
        lastQ: i,
      });
    }
    if (start + CHUNK >= players.length) batch.update(roomRef, roomUpdate);
    await batch.commit();
  }
}

export async function showLeaderboard(roomRef: DocumentReference): Promise<void> {
  await updateDoc(roomRef, { status: 'leaderboard' });
}

export async function endGame(roomRef: DocumentReference): Promise<void> {
  await updateDoc(roomRef, { status: 'ended', question: null });
}
