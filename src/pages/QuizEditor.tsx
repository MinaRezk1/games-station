import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, isAdminEmail } from '../firebase';
import { useAuthUser } from '../hooks/useAuthUser';
import { friendlyError } from '../lib/errors';
import { TIME_OPTIONS } from '../lib/game';
import { SHAPES } from '../components/OptionTile';
import type { Question } from '../types';

const emptyQuestion = (): Question => ({ text: '', options: ['', '', '', ''], correctIndex: 0, timeLimit: 20 });

function validate(title: string, questions: Question[]): string | null {
  if (!title.trim()) return 'اكتب اسم للمسابقة.';
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const n = i + 1;
    if (!q.text.trim()) return `سؤال ${n} مالوش نص.`;
    if (q.options.length < 2) return `سؤال ${n} محتاج اختيارين على الأقل.`;
    if (q.options.some((o) => !o.trim())) return `في اختيار فاضي في سؤال ${n}.`;
    if (q.correctIndex < 0 || q.correctIndex >= q.options.length) return `اختار الإجابة الصح في سؤال ${n}.`;
  }
  return null;
}

export default function QuizEditor() {
  const { quizId = '' } = useParams();
  const { user, loading } = useAuthUser();
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const isAdmin = !!user && !user.isAnonymous && isAdminEmail(user.email);

  useEffect(() => {
    if (!isAdmin) return;
    getDoc(doc(db, 'quizzes', quizId))
      .then((s) => {
        if (!s.exists()) return setMsg({ kind: 'err', text: 'المسابقة دي مش موجودة.' });
        setTitle((s.get('title') as string) ?? '');
        setQuestions((s.get('questions') as Question[]) ?? []);
        setLoaded(true);
      })
      .catch((e) => setMsg({ kind: 'err', text: friendlyError(e, 'ماقدرناش نفتح المسابقة.') }));
  }, [isAdmin, quizId]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!loading && !isAdmin) return <Navigate to="/admin" replace />;

  function edit(fn: (qs: Question[]) => Question[]) {
    setQuestions((qs) => fn(qs));
    setDirty(true);
    setMsg(null);
  }

  function editQ(i: number, patch: Partial<Question>) {
    edit((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  }

  function move(i: number, dir: -1 | 1) {
    edit((qs) => {
      const j = i + dir;
      if (j < 0 || j >= qs.length) return qs;
      const copy = [...qs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  function removeOption(qi: number, oi: number) {
    const q = questions[qi];
    if (q.options.length <= 2) return;
    const options = q.options.filter((_, k) => k !== oi);
    let correctIndex = q.correctIndex;
    if (oi === correctIndex) correctIndex = 0;
    else if (oi < correctIndex) correctIndex -= 1;
    editQ(qi, { options, correctIndex });
  }

  async function save() {
    const problem = validate(title, questions);
    if (problem) return setMsg({ kind: 'err', text: problem });
    setSaving(true);
    try {
      const clean = questions.map((q) => ({
        text: q.text.trim(),
        options: q.options.map((o) => o.trim()),
        correctIndex: q.correctIndex,
        timeLimit: q.timeLimit,
      }));
      await updateDoc(doc(db, 'quizzes', quizId), {
        title: title.trim(),
        questions: clean,
        updatedAt: serverTimestamp(),
      });
      setDirty(false);
      setMsg({ kind: 'ok', text: 'اتحفظت.' });
    } catch (e) {
      setMsg({ kind: 'err', text: friendlyError(e, 'ماقدرناش نحفظ.') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page">
      <header className="page-head sticky-head">
        <Link to="/admin" className="back-link">
          رجوع للمسابقات
        </Link>
        <div className="row">
          {msg && <span className={msg.kind === 'ok' ? 'ok-text' : 'error-inline'}>{msg.text}</span>}
          <button className="btn btn-ink" onClick={save} disabled={saving || !loaded}>
            {saving ? 'بنحفظ…' : dirty ? 'احفظ التغييرات' : 'احفظ'}
          </button>
        </div>
      </header>

      {!loaded ? (
        <p className="muted">{msg?.kind === 'err' ? '' : 'بنحمّل…'}</p>
      ) : (
        <>
          <label className="field">
            <span>اسم المسابقة</span>
            <input
              className="title-input"
              value={title}
              maxLength={80}
              onChange={(e) => {
                setTitle(e.target.value);
                setDirty(true);
              }}
            />
          </label>

          <ol className="q-list">
            {questions.map((q, i) => (
              <li key={i} className="q-card">
                <div className="q-card-head">
                  <span className="q-num-ink">سؤال {i + 1}</span>
                  <div className="row">
                    <label className="time-select">
                      <span>الوقت</span>
                      <select value={q.timeLimit} onChange={(e) => editQ(i, { timeLimit: Number(e.target.value) })}>
                        {TIME_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {t} ثانية
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="طلّع السؤال لفوق">
                      ↑
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => move(i, 1)}
                      disabled={i === questions.length - 1}
                      aria-label="نزّل السؤال لتحت"
                    >
                      ↓
                    </button>
                    <button
                      className="icon-btn danger"
                      onClick={() => edit((qs) => qs.filter((_, j) => j !== i))}
                      aria-label="امسح السؤال"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <textarea
                  className="q-text-input"
                  placeholder="اكتب السؤال هنا"
                  rows={2}
                  maxLength={200}
                  value={q.text}
                  onChange={(e) => editQ(i, { text: e.target.value })}
                />

                <div className="opt-edit-list">
                  {q.options.map((opt, oi) => (
                    <div key={oi} className={`opt-edit opt-edit-${oi} ${q.correctIndex === oi ? 'is-correct' : ''}`}>
                      <span className="opt-edit-shape" aria-hidden="true">
                        {SHAPES[oi]}
                      </span>
                      <input
                        value={opt}
                        maxLength={80}
                        placeholder={`اختيار ${oi + 1}`}
                        onChange={(e) =>
                          editQ(i, { options: q.options.map((o, k) => (k === oi ? e.target.value : o)) })
                        }
                      />
                      <label className="correct-pick">
                        <input
                          type="radio"
                          name={`correct-${i}`}
                          checked={q.correctIndex === oi}
                          onChange={() => editQ(i, { correctIndex: oi })}
                        />
                        <span>الصح</span>
                      </label>
                      {q.options.length > 2 && (
                        <button className="icon-btn" onClick={() => removeOption(i, oi)} aria-label="امسح الاختيار">
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  {q.options.length < 4 && (
                    <button className="btn btn-line btn-small" onClick={() => editQ(i, { options: [...q.options, ''] })}>
                      ضيف اختيار
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <button className="btn btn-ink btn-wide" onClick={() => edit((qs) => [...qs, emptyQuestion()])}>
            ضيف سؤال
          </button>
        </>
      )}
    </main>
  );
}
