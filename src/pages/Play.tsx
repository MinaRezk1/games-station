import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthUser } from '../hooks/useAuthUser';
import { OptionTile } from '../components/OptionTile';
import { Timer } from '../components/Timer';
import { Countdown } from '../components/Countdown';
import { QuestionImage } from '../components/QuestionImage';
import { sortPlayers } from '../components/Leaderboard';
import { GRACE_MS, syncServerClock } from '../lib/game';
import type { Player, PublicQuestion, Room } from '../types';

export default function Play() {
  const { code = '' } = useParams();
  const { user, loading } = useAuthUser();
  const [room, setRoom] = useState<Room | null>(null);
  const [roomMissing, setRoomMissing] = useState(false);
  const [me, setMe] = useState<Player | null>(null);
  const [meMissing, setMeMissing] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [answered, setAnswered] = useState<{ q: number; choice: unknown } | null>(null);
  const [lateFor, setLateFor] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const synced = useRef(false);

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

  // نظبط ساعة الموبايل على ساعة السيرفر عشان العد التنازلي يبقى مظبوط مع الشاشة
  const hasMe = !!me;
  useEffect(() => {
    if (!user || !hasMe || synced.current) return;
    synced.current = true;
    syncServerClock(doc(roomRef, 'players', user.uid))
      .then(setOffset)
      .catch(() => setOffset(0));
  }, [user, hasMe, roomRef]);

  // لو عمل refresh: نشوف هل كان جاوب على السؤال الحالي
  const status = room?.status;
  const currentIndex = room?.currentIndex ?? -1;
  useEffect(() => {
    if (!user || (status !== 'question' && status !== 'reveal') || currentIndex < 0) return;
    getDoc(doc(roomRef, 'answers', `${user.uid}_${currentIndex}`))
      .then((s) => {
        if (s.exists()) setAnswered({ q: currentIndex, choice: s.get('choice') });
      })
      .catch(() => {
        /* لسه ماجاوبش */
      });
  }, [user, status, currentIndex, roomRef]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  if (!loading && !user) return <Navigate to={`/join/${code}`} replace />;
  if (meMissing) return <Navigate to={`/join/${code}`} replace />;
  if (roomMissing)
    return (
      <main className="player player-center">
        <p className="big-msg">المسابقة دي مش موجودة.</p>
      </main>
    );
  if (!room || !me)
    return (
      <main className="player player-center">
        <p className="big-msg">بنحمّل…</p>
      </main>
    );

  const qIndex = room.currentIndex;
  const hasAnswered = answered?.q === qIndex;
  const serverNow = now + offset;
  const startMs = room.questionStartedAt?.toMillis() ?? 0;
  const endsMs = room.questionEndsAt?.toMillis() ?? 0;
  const leadLeft = startMs - serverNow;
  const remainingMs = endsMs - GRACE_MS - serverNow;
  const sorted = sortPlayers(players);
  const rank = sorted.findIndex((p) => p.id === me.id) + 1;

  async function submit(choice: number | number[] | string) {
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
      <div className="player-msg">
        <p className="big-msg">إنت جوه يا {me.name}</p>
        <p className="muted">بص على الشاشة، المسابقة هتبدأ حالاً.</p>
      </div>
    );
  } else if (room.status === 'question' && room.question) {
    const q = room.question;
    if (hasAnswered) {
      body = (
        <div className="player-msg">
          <div className="sent-mark" aria-hidden="true">✓</div>
          <p className="big-msg">إجابتك وصلت</p>
          <p className="muted">استنى لما الوقت يخلص.</p>
        </div>
      );
    } else if (leadLeft > 0) {
      body = (
        <div className="player-msg">
          <Countdown leftMs={leadLeft} text={q.text} />
        </div>
      );
    } else if (lateFor === qIndex || remainingMs <= 0) {
      body = (
        <div className="player-msg">
          <p className="big-msg">الوقت خلص</p>
        </div>
      );
    } else {
      body = (
        <div className="player-question">
          <div className="player-q-head">
            <span className="q-num">
              سؤال {q.number ?? qIndex + 1} من {room.totalQuestions}
            </span>
            <Timer remainingMs={remainingMs} totalMs={q.timeLimit * 1000} />
          </div>
          <h2 className="player-q-text">{q.text}</h2>
          <QuestionImage src={q.imageUrl} className="q-image-small" />
          <AnswerInput key={qIndex} question={q} sending={sending} onSubmit={submit} />
        </div>
      );
    }
  } else if (room.status === 'reveal' && room.question) {
    const ready = me.lastQ === qIndex;
    body = ready ? (
      <div className={`player-result ${me.lastCorrect ? 'is-right' : 'is-wrong'}`}>
        <p className="result-word">{me.lastCorrect ? 'صح' : hasAnswered ? 'غلط' : 'ماجاوبتش'}</p>
        {me.lastCorrect && <p className="result-points">+{me.lastPoints}</p>}
        {!!me.lastBonus && <p className="result-streak">منهم {me.lastBonus} نقطة زيادة عشان {me.streak} صح ورا بعض</p>}
        {!me.lastCorrect && room.reveal && <CorrectAnswer question={room.question} reveal={room.reveal} />}
        <p className="result-total">مجموعك: {me.score}</p>
      </div>
    ) : (
      <div className="player-msg">
        <p className="big-msg">بنحسب النتيجة…</p>
      </div>
    );
  } else if (room.status === 'leaderboard') {
    body = (
      <div className="player-msg">
        <p className="rank-big">#{rank}</p>
        <p className="big-msg">{me.score} نقطة</p>
        <p className="muted">من {players.length} لاعب</p>
      </div>
    );
  } else {
    body = (
      <div className="player-msg">
        <p className="muted">المسابقة خلصت، ترتيبك</p>
        <p className="rank-big">#{rank}</p>
        <p className="big-msg">{me.score} نقطة</p>
      </div>
    );
  }

  return (
    <main className="player">
      <header className="player-bar">
        <span className="player-name">{me.name}</span>
        <span className="player-score">{me.score}</span>
      </header>
      {body}
    </main>
  );
}

function CorrectAnswer({ question, reveal }: { question: PublicQuestion; reveal: NonNullable<Room['reveal']> }) {
  let text = '';
  if (question.type === 'short') text = reveal.accepted[0] ?? '';
  else if (question.type === 'order') text = reveal.correct.map((i) => question.options[i]).join(' ← ');
  else text = reveal.correct.map((i) => question.options[i]).join('، ');
  if (!text) return null;
  return (
    <p className="result-correct">
      الإجابة الصح: <b>{text}</b>
    </p>
  );
}

interface AnswerProps {
  question: PublicQuestion;
  sending: boolean;
  onSubmit: (choice: number | number[] | string) => void;
}

function AnswerInput({ question, sending, onSubmit }: AnswerProps) {
  const [picks, setPicks] = useState<number[]>([]);
  const [text, setText] = useState('');

  if (question.type === 'short') {
    const send = (e: FormEvent) => {
      e.preventDefault();
      if (text.trim()) onSubmit(text.trim().slice(0, 100));
    };
    return (
      <form className="short-answer" onSubmit={send}>
        <input
          autoFocus
          maxLength={100}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="اكتب إجابتك هنا"
          aria-label="إجابتك"
        />
        <button className="btn btn-brand btn-wide btn-tall" disabled={sending || !text.trim()}>
          ابعت الإجابة
        </button>
      </form>
    );
  }

  if (question.type === 'order') {
    const remaining = question.options.map((_, i) => i).filter((i) => !picks.includes(i));
    return (
      <div className="order-answer">
        <p className="muted small">دوس على العناصر بالترتيب الصح، ودوس على أي واحد في ترتيبك عشان تشيله.</p>
        <ol className="order-picked">
          {picks.map((i, k) => (
            <li key={i}>
              <button type="button" onClick={() => setPicks(picks.filter((p) => p !== i))}>
                <span className="order-num">{k + 1}</span>
                {question.options[i]}
              </button>
            </li>
          ))}
          {picks.length === 0 && <li className="order-empty">ترتيبك هيظهر هنا</li>}
        </ol>
        <div className="order-pool">
          {remaining.map((i) => (
            <button key={i} type="button" className="order-item" onClick={() => setPicks([...picks, i])}>
              {question.options[i]}
            </button>
          ))}
        </div>
        <button
          className="btn btn-brand btn-wide btn-tall"
          disabled={sending || picks.length !== question.options.length}
          onClick={() => onSubmit(picks)}
        >
          ابعت الترتيب
        </button>
      </div>
    );
  }

  if (question.multi) {
    const toggle = (i: number) => setPicks(picks.includes(i) ? picks.filter((p) => p !== i) : [...picks, i]);
    return (
      <div className="multi-answer">
        <p className="muted small">فيه أكتر من إجابة صح، اختارهم كلهم وبعدين دوس ابعت.</p>
        <div className={`options player-options count-${question.options.length}`}>
          {question.options.map((opt, i) => (
            <OptionTile
              key={i}
              index={i}
              text={opt}
              image={question.optionImages?.[i] || undefined}
              big
              state={picks.includes(i) ? 'selected' : 'normal'}
              onClick={() => toggle(i)}
              disabled={sending}
            />
          ))}
        </div>
        <button className="btn btn-brand btn-wide btn-tall" disabled={sending || picks.length === 0} onClick={() => onSubmit(picks)}>
          ابعت ({picks.length})
        </button>
      </div>
    );
  }

  return (
    <div className={`options player-options count-${question.options.length} ${question.type === 'truefalse' ? 'is-tf' : ''}`}>
      {question.options.map((opt, i) => (
        <OptionTile
          key={i}
          index={i}
          text={opt}
          image={question.optionImages?.[i] || undefined}
          big
          onClick={() => onSubmit(i)}
          disabled={sending}
        />
      ))}
    </div>
  );
}
