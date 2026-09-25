import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { signInAnonymously } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { friendlyError } from '../lib/errors';
import { readLocal, writeLocal } from '../lib/storage';
import type { Room } from '../types';

export default function Home() {
  const params = useParams();
  const nav = useNavigate();
  const [code, setCode] = useState(params.code ?? '');
  const [name, setName] = useState(readLocal('gs-name'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [teams, setTeams] = useState<string[] | null>(null);

  async function join(e: FormEvent) {
    e.preventDefault();
    await doJoin(null);
  }

  async function doJoin(team: number | null) {
    const cleanCode = code.replace(/\D/g, '');
    const cleanName = name.trim().slice(0, 30);
    if (cleanCode.length !== 6) return setError('الكود لازم يبقى 6 أرقام.');
    if (!cleanName) return setError('اكتب اسمك الأول.');

    setBusy(true);
    setError('');
    try {
      const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
      const roomSnap = await getDoc(doc(db, 'rooms', cleanCode));
      if (!roomSnap.exists()) {
        setError('مفيش مسابقة بالكود ده، اتأكد منه.');
        return;
      }
      if ((roomSnap.data() as Room).status === 'ended') {
        setError('المسابقة دي خلصت.');
        return;
      }
      const playerRef = doc(db, 'rooms', cleanCode, 'players', user.uid);
      const existing = await getDoc(playerRef);
      if (!existing.exists()) {
        const roomTeams = (roomSnap.data() as Room).teams ?? [];
        if (roomTeams.length > 0 && team === null) {
          setTeams(roomTeams);
          return;
        }
        await setDoc(playerRef, {
          name: cleanName,
          score: 0,
          joinedAt: serverTimestamp(),
          ...(roomTeams.length > 0 && team !== null ? { team } : {}),
        });
      }
      writeLocal('gs-name', cleanName);
      nav(`/play/${cleanCode}`);
    } catch (err) {
      setError(friendlyError(err, 'ماقدرناش ندخلك، جرّب تاني.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="player player-center join-page">
      <form className="join" onSubmit={join}>
        <h1 className="brand">Games Station</h1>
        <label className="field">
          <span>كود المسابقة</span>
          <input
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            placeholder="000000"
            className="code-input"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, ''));
              setTeams(null);
            }}
          />
        </label>
        <label className="field">
          <span>اسمك</span>
          <input maxLength={30} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: مينا" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        {teams ? (
          <div className="team-pick">
            <p>اختار فريقك</p>
            {teams.map((t, i) => (
              <button key={i} type="button" className={`btn btn-tall btn-wide team-btn team-btn-${i}`} disabled={busy} onClick={() => doJoin(i)}>
                {t}
              </button>
            ))}
          </div>
        ) : (
          <button className="btn btn-brand btn-wide btn-tall" disabled={busy}>
            {busy ? 'بندخلك…' : 'ادخل'}
          </button>
        )}
      </form>
      <Link to="/admin" className="admin-link">
        دخول المسؤول
      </Link>
    </main>
  );
}
