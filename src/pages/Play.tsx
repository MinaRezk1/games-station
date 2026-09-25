import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthUser } from '../hooks/useAuthUser';
import { OptionTile } from '../components/OptionTile';
import { Timer } from '../components/Timer';
import { sortPlayers } from '../components/Leaderboard';
import type { Player, Room } from '../types';

export default function Play() {
  const { code = '' } = useParams();
  const { user, loading } = useAuthUser();
  const [room, setRoom] = useState<Room | null>(null);
  const [roomMissing, setRoomMissing] = useState(false);
  const [me, setMe] = useState<Player | null>(null);
  const [meMissing, setMeMissing] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [answered, setAnswered] = useState<{ q: number; choice: number } | null>(null);
  const [lateFor, setLateFor] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(Date.now());
  const receivedAt = useRef<{ q: number; at: number } | null>(null);

  const roomRef = useMemo(() => doc(db, 'rooms', code), [code]);

  useEffect(() => {
    if (!user) return;
    const unsubRoom = onSnapshot(roomRef, (s) => {
      if (!s.exists()) return setRoomMissing(true);
      setRoom(s.data() as Room);
    });
    const unsubMe = onSnapshot(doc(roomRef, 'players', user.uid), (s) => {
      if (!s.exists()) return setMeMissing(true);
      setMe({ id: s.id, ...(s.data() as Omit<Player, 'id'>) });
    });
    const unsubPlayers = onSnapshot(collection(roomRef, 'players'), (s) =>
      setPlayers(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Player, 'id'>) }))),
    );
    return () => {
      unsubRoom();
      unsubMe();
      unsubPlayers();
    };
  }, [user, roomRef]);

  // أول ما سؤال جديد يوصل: نسجّل وقت وصوله، ونشوف لو كان جاوب قبل كده (لو عمل refresh)
  useEffect(() => {
    if (!user || !room || (room.status !== 'question' && room.status !== 'reveal')) return;
    const q = room.currentIndex;
    if (receivedAt.current?.q !== q) receivedAt.current = { q, at: Date.now() };
    getDoc(doc(roomRef, 'answers', `${user.uid}_${q}`))
      .then((s) => {
        if (s.exists()) setAnswered({ q, choice: s.get('choice') as number });
      })
      .catch(() => {
        /* لسه ماجاوبش */
      });
  }, [user, room?.status, room?.currentIndex, roomRef]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  if (!loading && !user) return <Navigate to={`/join/${code}`} replace />;
  if (meMissing) return <Navigate to={`/join/${code}`} replace />;
  if (roomMissing)
    return (
      <main className="stage stage-center">
        <p className="big-msg">المسابقة دي مش موجودة.</p>
      </main>
    );
  if (!room || !me)
    return (
      <main className="stage stage-center">
        <p className="big-msg">بنحمّل…</p>
      </main>
    );

  const qIndex = room.currentIndex;
  const hasAnswered = answered?.q === qIndex;
  const limitMs = (room.question?.timeLimit ?? 0) * 1000;
  const startedAt = receivedAt.current?.q === qIndex ? receivedAt.current.at : now;
  const remainingMs = limitMs - (now - startedAt);
  const sorted = sortPlayers(players);
  const rank = sorted.findIndex((p) => p.id === me.id) + 1;

  async function answer(choice: number) {
    if (!user || hasAnswered || sending) return;
    setSending(true);
    try {
      await setDoc(doc(roomRef, 'answers', `${user.uid}_${qIndex}`), {
        uid: user.uid,
        qIndex,
        choice,
        answeredAt: serverTimestamp(),
      });
      setAnswered({ q: qIndex, choice });
    } catch {
      setLateFor(qIndex);
    } finally {
      setSending(false);
    }
  }

  let body: ReactNode;

  if (room.status === 'lobby') {
    body = (
      <div className="play-msg">
        <p className="big-msg">إنت جوه يا {me.name}</p>
        <p className="muted-light">بص على الشاشة، المسابقة هتبدأ حالاً.</p>
      </div>
    );
  } else if (room.status === 'question' && room.question) {
    if (hasAnswered) {
      body = (
        <div className="play-msg">
          <OptionTile index={answered!.choice} text={room.question.options[answered!.choice]} />
          <p className="big-msg">إجابتك وصلت</p>
          <p className="muted-light">استنى لما الوقت يخلص.</p>
        </div>
      );
    } else if (lateFor === qIndex || remainingMs <= 0) {
      body = (
        <div className="play-msg">
          <p className="big-msg">الوقت خلص</p>
        </div>
      );
    } else {
      body = (
        <div className="play-question">
          <div className="play-q-head">
            <span className="q-num">
              سؤال {qIndex + 1} من {room.totalQuestions}
            </span>
            <Timer remainingMs={remainingMs} totalMs={limitMs} />
          </div>
          <h2 className="play-q-text">{room.question.text}</h2>
          <div className="options play-options">
            {room.question.options.map((opt, i) => (
              <OptionTile key={i} index={i} text={opt} big onClick={() => answer(i)} disabled={sending} />
            ))}
          </div>
        </div>
      );
    }
  } else if (room.status === 'reveal') {
    const ready = me.lastQ === qIndex;
    body = ready ? (
      <div className={`play-result ${me.lastCorrect ? 'is-right' : 'is-wrong'}`}>
        <p className="result-word">{me.lastCorrect ? 'صح' : hasAnswered ? 'غلط' : 'ماجاوبتش'}</p>
        {me.lastCorrect && <p className="result-points">+{me.lastPoints}</p>}
        <p className="muted-light">مجموعك: {me.score}</p>
      </div>
    ) : (
      <div className="play-msg">
        <p className="big-msg">بنحسب النتيجة…</p>
      </div>
    );
  } else if (room.status === 'leaderboard') {
    body = (
      <div className="play-msg">
        <p className="rank-big">#{rank}</p>
        <p className="big-msg">{me.score} نقطة</p>
        <p className="muted-light">من {players.length} لاعب</p>
      </div>
    );
  } else {
    body = (
      <div className="play-msg">
        <p className="muted-light">المسابقة خلصت، ترتيبك</p>
        <p className="rank-big">#{rank}</p>
        <p className="big-msg">{me.score} نقطة</p>
      </div>
    );
  }

  return (
    <main className="stage play">
      <header className="play-bar">
        <span>{me.name}</span>
        <span className="play-score">{me.score}</span>
      </header>
      {body}
    </main>
  );
}
