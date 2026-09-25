import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { db, isAdminEmail } from '../firebase';
import { useAuthUser } from '../hooks/useAuthUser';
import { friendlyError } from '../lib/errors';
import {
  endGame,
  GRACE_MS,
  joinUrl,
  revealQuestion,
  showLeaderboard,
  startQuestion,
  syncServerClock,
} from '../lib/game';
import { OptionTile } from '../components/OptionTile';
import { Timer } from '../components/Timer';
import { Leaderboard, sortPlayers } from '../components/Leaderboard';
import type { Player, Question, Quiz, Room } from '../types';

export default function Host() {
  const { code = '' } = useParams();
  const { user, loading } = useAuthUser();
  const [room, setRoom] = useState<Room | null>(null);
  const [roomMissing, setRoomMissing] = useState(false);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [answerCount, setAnswerCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [clockReady, setClockReady] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const revealedFor = useRef<number | null>(null);
  const synced = useRef(false);

  const isAdmin = !!user && !user.isAnonymous && isAdminEmail(user.email);
  const roomRef = useMemo(() => doc(db, 'rooms', code), [code]);

  useEffect(() => {
    if (!isAdmin) return;
    const unsubRoom = onSnapshot(
      roomRef,
      (s) => {
        if (!s.exists()) return setRoomMissing(true);
        setRoom(s.data() as Room);
      },
      (e) => setError(friendlyError(e)),
    );
    const unsubPlayers = onSnapshot(collection(roomRef, 'players'), (s) =>
      setPlayers(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Player, 'id'>) }))),
    );
    return () => {
      unsubRoom();
      unsubPlayers();
    };
  }, [isAdmin, roomRef]);

  // نجيب المسابقة (فيها الإجابات الصح، مش بتتبعت للاعبين)
  const quizId = room?.quizId;
  useEffect(() => {
    if (!isAdmin || !quizId || quiz) return;
    getDoc(doc(db, 'quizzes', quizId))
      .then((s) => {
        if (s.exists()) setQuiz({ id: s.id, ...(s.data() as Omit<Quiz, 'id'>) });
        else setError('المسابقة الأصلية اتمسحت.');
      })
      .catch((e) => setError(friendlyError(e)));
  }, [isAdmin, quizId, quiz]);

  // نظبط الساعة على ساعة السيرفر مرة واحدة
  const isOwner = !!room && !!user && room.hostId === user.uid;
  useEffect(() => {
    if (!isOwner || synced.current) return;
    synced.current = true;
    syncServerClock(roomRef)
      .then(setOffset)
      .catch(() => setOffset(0))
      .finally(() => setClockReady(true));
  }, [isOwner, roomRef]);

  // عدد اللي جاوبوا على السؤال الحالي
  const status = room?.status;
  const currentIndex = room?.currentIndex ?? -1;
  useEffect(() => {
    if (!isOwner || status !== 'question') return;
    setAnswerCount(0);
    return onSnapshot(query(collection(roomRef, 'answers'), where('qIndex', '==', currentIndex)), (s) =>
      setAnswerCount(s.size),
    );
  }, [isOwner, status, currentIndex, roomRef]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const endsAt = room?.questionEndsAt?.toMillis() ?? 0;
  const remainingMs = endsAt - GRACE_MS - (now + offset);

  // نكشف الإجابة لوحدنا لما الوقت يخلص أو الكل يجاوب
  useEffect(() => {
    if (!quiz || !clockReady || status !== 'question' || !endsAt) return;
    const timeUp = endsAt - (now + offset) <= 0;
    const allIn = players.length > 0 && answerCount >= players.length;
    if ((timeUp || allIn) && revealedFor.current !== currentIndex) {
      revealedFor.current = currentIndex;
      revealQuestion(roomRef, quiz).catch((e) => setError(friendlyError(e, 'ماقدرناش نكشف الإجابة، دوس "اكشف الإجابة".')));
    }
  }, [quiz, clockReady, status, endsAt, now, offset, players.length, answerCount, currentIndex, roomRef]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!loading && !isAdmin) return <Navigate to="/admin" replace />;
  if (roomMissing)
    return (
      <main className="stage stage-center">
        <p className="big-msg">الغرفة دي مش موجودة.</p>
        <Link to="/admin" className="admin-link">
          رجوع
        </Link>
      </main>
    );
  if (!room || !quiz)
    return (
      <main className="stage stage-center">
        <p className="big-msg">بنحمّل…</p>
        {error && <p className="error">{error}</p>}
      </main>
    );
  if (!isOwner) return <Navigate to="/admin" replace />;

  const total = quiz.questions.length;
  const q: Question | undefined = quiz.questions[room.currentIndex];
  const isLast = room.currentIndex + 1 >= total;
  const next = () => run(() => startQuestion(roomRef, quiz, room.currentIndex + 1, offset));

  let body: ReactNode;

  if (room.status === 'lobby') {
    const url = joinUrl(code);
    body = (
      <section className="lobby">
        <div className="lobby-join">
          <p className="lobby-hint">ادخل على الموقع واكتب الكود</p>
          <div className="code-tiles" aria-label={`الكود ${code}`}>
            {code.split('').map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="qr">
            <QRCodeSVG value={url} size={180} marginSize={2} />
          </div>
          <p className="lobby-url" dir="ltr">
            {url.replace(/^https?:\/\//, '').replace(/#\/join\/\d+$/, '')}
          </p>
        </div>
        <div className="lobby-players">
          <div className="lobby-count">
            <b>{players.length}</b> لاعب دخلوا
          </div>
          <ul className="chips">
            {players.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
          </ul>
          <button
            className="btn btn-gold btn-huge"
            onClick={() => run(() => startQuestion(roomRef, quiz, 0, offset))}
            disabled={busy || !clockReady || players.length === 0}
          >
            ابدأ المسابقة
          </button>
        </div>
      </section>
    );
  } else if (room.status === 'question' && q) {
    body = (
      <section className="host-question">
        <div className="host-q-top">
          <span className="q-num">
            سؤال {room.currentIndex + 1} من {total}
          </span>
          <Timer remainingMs={remainingMs} totalMs={q.timeLimit * 1000} />
          <span className="answered">
            <b>{answerCount}</b> / {players.length} جاوبوا
          </span>
        </div>
        <h2 className="host-q-text">{q.text}</h2>
        <div className="options">
          {q.options.map((opt, i) => (
            <OptionTile key={i} index={i} text={opt} />
          ))}
        </div>
        <div className="host-actions">
          <button
            className="btn btn-line-light"
            disabled={busy}
            onClick={() => {
              revealedFor.current = room.currentIndex;
              run(() => revealQuestion(roomRef, quiz));
            }}
          >
            اكشف الإجابة
          </button>
        </div>
      </section>
    );
  } else if (room.status === 'reveal' && q) {
    const counts = room.answerCounts ?? q.options.map(() => 0);
    const max = Math.max(1, ...counts);
    body = (
      <section className="host-question">
        <div className="host-q-top">
          <span className="q-num">
            سؤال {room.currentIndex + 1} من {total}
          </span>
        </div>
        <h2 className="host-q-text">{q.text}</h2>
        <div className="options">
          {q.options.map((opt, i) => (
            <OptionTile
              key={i}
              index={i}
              text={opt}
              count={counts[i] ?? 0}
              max={max}
              state={i === room.correctIndex ? 'correct' : 'dim'}
            />
          ))}
        </div>
        <div className="host-actions">
          <button className="btn btn-gold" disabled={busy} onClick={() => run(() => showLeaderboard(roomRef))}>
            الترتيب
          </button>
        </div>
      </section>
    );
  } else if (room.status === 'leaderboard') {
    body = (
      <section className="host-board">
        <h2 className="section-title">الترتيب بعد سؤال {room.currentIndex + 1}</h2>
        <Leaderboard players={players} />
        <div className="host-actions">
          {isLast ? (
            <button className="btn btn-gold" disabled={busy} onClick={() => run(() => endGame(roomRef))}>
              النتيجة النهائية
            </button>
          ) : (
            <button className="btn btn-gold" disabled={busy || !clockReady} onClick={next}>
              السؤال الجاي
            </button>
          )}
        </div>
      </section>
    );
  } else {
    const sorted = sortPlayers(players);
    const podium = [sorted[1], sorted[0], sorted[2]];
    body = (
      <section className="host-board">
        <h2 className="section-title">{room.title}</h2>
        <div className="podium">
          {podium.map((p, i) =>
            p ? (
              <div key={p.id} className={`podium-step step-${[2, 1, 3][i]}`}>
                <span className="podium-name">{p.name}</span>
                <span className="podium-score">{p.score}</span>
                <span className="podium-block">{[2, 1, 3][i]}</span>
              </div>
            ) : (
              <div key={i} className="podium-step is-empty" />
            ),
          )}
        </div>
        {sorted.length > 3 && <Leaderboard players={sorted.slice(3)} limit={7} startRank={4} />}
        <div className="host-actions">
          <Link to="/admin" className="btn btn-line-light">
            رجوع للوحة التحكم
          </Link>
        </div>
      </section>
    );
  }

  return (
    <main className="stage host">
      <header className="host-bar">
        <span className="brand-small">Games Station</span>
        <span className="host-title">{room.title}</span>
        {room.status !== 'ended' && room.status !== 'lobby' && (
          <button
            className="btn-text"
            onClick={() => window.confirm('تنهي المسابقة دلوقتي؟') && run(() => endGame(roomRef))}
          >
            إنهاء
          </button>
        )}
      </header>
      {error && <p className="error host-error" role="alert">{error}</p>}
      {body}
    </main>
  );
}
