import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup, signOut } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { auth, db, googleProvider, isAdminEmail } from '../firebase';
import { useAuthUser } from '../hooks/useAuthUser';
import { friendlyError } from '../lib/errors';
import { createRoom } from '../lib/game';
import { DEFAULT_SETTINGS, normalizeQuiz, validateQuestion } from '../lib/quiz';
import type { Quiz } from '../types';

export default function Admin() {
  const { user, loading } = useAuthUser();
  const nav = useNavigate();
  const [quizzes, setQuizzes] = useState<Quiz[] | null>(null);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const isAdmin = !!user && !user.isAnonymous && isAdminEmail(user.email);

  useEffect(() => {
    if (!isAdmin || !user) return;
    return onSnapshot(
      query(collection(db, 'quizzes'), where('ownerId', '==', user.uid)),
      (s) => {
        const list = s.docs.map((d) => normalizeQuiz(d.id, d.data()));
        list.sort((a, b) => (b.updatedAt?.toMillis() ?? Date.now()) - (a.updatedAt?.toMillis() ?? Date.now()));
        setQuizzes(list);
      },
      (e) => setError(friendlyError(e, 'ماقدرناش نجيب المسابقات.')),
    );
  }, [isAdmin, user]);

  async function login() {
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      setError(friendlyError(e, 'ماقدرناش نسجّل دخولك.'));
    }
  }

  async function newQuiz() {
    if (!user) return;
    setBusyId('new');
    try {
      const ref = await addDoc(collection(db, 'quizzes'), {
        ownerId: user.uid,
        title: 'مسابقة جديدة',
        questions: [],
        settings: DEFAULT_SETTINGS,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      nav(`/admin/quiz/${ref.id}`);
    } catch (e) {
      setError(friendlyError(e, 'ماقدرناش نعمل مسابقة جديدة.'));
    } finally {
      setBusyId('');
    }
  }

  async function remove(quiz: Quiz) {
    if (!window.confirm(`تمسح "${quiz.title}"؟ مش هتقدر ترجّعها.`)) return;
    try {
      await deleteDoc(doc(db, 'quizzes', quiz.id));
    } catch (e) {
      setError(friendlyError(e, 'ماقدرناش نمسح المسابقة.'));
    }
  }

  async function goLive(quiz: Quiz) {
    if (!user) return;
    if (quiz.questions.length === 0) return setError('ضيف أسئلة للمسابقة الأول.');
    for (let i = 0; i < quiz.questions.length; i++) {
      const problem = validateQuestion(quiz.questions[i], i + 1);
      if (problem) return setError(`${quiz.title}: ${problem}`);
    }
    setBusyId(quiz.id);
    try {
      const code = await createRoom(quiz, user.uid);
      nav(`/host/${code}`);
    } catch (e) {
      setError(friendlyError(e, 'ماقدرناش نفتح غرفة جديدة.'));
    } finally {
      setBusyId('');
    }
  }

  if (loading) return <main className="page"><p>بنحمّل…</p></main>;

  if (!user || user.isAnonymous) {
    return (
      <main className="page page-narrow">
        <h1 className="page-title">دخول المسؤول</h1>
        <p className="muted">سجّل دخول بحساب جوجل المسموح له يعمل مسابقات.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-brand" onClick={login}>
          الدخول بحساب جوجل
        </button>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="page page-narrow">
        <h1 className="page-title">الحساب ده مش مسموح له</h1>
        <p className="muted">
          إنت داخل بـ {user.email}، والحساب ده مش من حسابات المسؤولين. لو عايز تلعب، ادخل من الصفحة الرئيسية بكود المسابقة.
        </p>
        <button className="btn btn-line" onClick={() => signOut(auth)}>
          تسجيل خروج
        </button>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="page-head">
        <h1 className="page-title">مسابقاتك</h1>
        <div className="row">
          <button className="btn btn-brand" onClick={newQuiz} disabled={busyId === 'new'}>
            مسابقة جديدة
          </button>
          <button className="btn btn-line" onClick={() => signOut(auth)}>
            خروج
          </button>
        </div>
      </header>

      {error && <p className="error" role="alert">{error}</p>}

      {quizzes === null ? (
        <p className="muted">بنحمّل…</p>
      ) : quizzes.length === 0 ? (
        <div className="empty">
          <p>لسه ماعملتش أي مسابقة.</p>
          <button className="btn btn-brand" onClick={newQuiz}>
            اعمل أول مسابقة
          </button>
        </div>
      ) : (
        <ul className="quiz-list">
          {quizzes.map((q) => (
            <li key={q.id} className="quiz-row">
              <div>
                <h2>{q.title}</h2>
                <p className="muted">{q.questions.length} سؤال</p>
              </div>
              <div className="row">
                <button className="btn btn-brand" onClick={() => goLive(q)} disabled={busyId === q.id}>
                  {busyId === q.id ? 'بنفتح…' : 'ابدأ لايف'}
                </button>
                <button className="btn btn-line" onClick={() => nav(`/admin/quiz/${q.id}`)}>
                  تعديل
                </button>
                <button className="btn btn-danger-line" onClick={() => remove(q)}>
                  مسح
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
