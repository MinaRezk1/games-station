import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, isAdminEmail } from '../firebase';
import { useAuthUser } from '../hooks/useAuthUser';
import { friendlyError } from '../lib/errors';
import {
  changeType,
  cleanQuestion,
  DEFAULT_SETTINGS,
  MAX_ACCEPTED,
  MAX_OPTIONS,
  newQuestion,
  normalizeQuiz,
  POINT_OPTIONS,
  TIME_OPTIONS,
  TYPE_HINTS,
  TYPE_LABELS,
  validateQuestion,
} from '../lib/quiz';
import { SHAPES } from '../components/OptionTile';
import type { Question, QuestionType, QuizSettings } from '../types';

const TYPE_ORDER: QuestionType[] = ['choice', 'truefalse', 'short', 'order'];

export default function QuizEditor() {
  const { quizId = '' } = useParams();
  const { user, loading } = useAuthUser();
  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [settings, setSettings] = useState<QuizSettings>(DEFAULT_SETTINGS);
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
        const quiz = normalizeQuiz(s.id, s.data());
        setTitle(quiz.title);
        setQuestions(quiz.questions);
        setSettings(quiz.settings);
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

  function touch() {
    setDirty(true);
    setMsg(null);
  }

  function edit(fn: (qs: Question[]) => Question[]) {
    setQuestions((qs) => fn(qs));
    touch();
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
    const correct = q.correct.filter((c) => c !== oi).map((c) => (c > oi ? c - 1 : c));
    editQ(qi, { options, correct: q.type === 'choice' && correct.length === 0 ? [0] : correct });
  }

  function toggleCorrect(qi: number, oi: number) {
    const q = questions[qi];
    if (q.type === 'truefalse') return editQ(qi, { correct: [oi] });
    const has = q.correct.includes(oi);
    if (has && q.correct.length === 1) return;
    editQ(qi, { correct: has ? q.correct.filter((c) => c !== oi) : [...q.correct, oi].sort((a, b) => a - b) });
  }

  async function save() {
    if (!title.trim()) return setMsg({ kind: 'err', text: 'اكتب اسم للمسابقة.' });
    for (let i = 0; i < questions.length; i++) {
      const problem = validateQuestion(questions[i], i + 1);
      if (problem) return setMsg({ kind: 'err', text: problem });
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'quizzes', quizId), {
        title: title.trim(),
        questions: questions.map(cleanQuestion),
        settings,
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
          <button className="btn btn-brand" onClick={save} disabled={saving || !loaded}>
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
                touch();
              }}
            />
          </label>

          <section className="settings-card">
            <h2>إعدادات المسابقة</h2>
            <Toggle
              label="نقط زيادة للإجابات الصح ورا بعض"
              hint="100 نقطة زيادة عن كل إجابة صح متتالية، لحد 500."
              checked={settings.streakBonus}
              onChange={(v) => {
                setSettings({ ...settings, streakBonus: v });
                touch();
              }}
            />
            <Toggle
              label="اعرض الترتيب بعد كل سؤال"
              hint="لو قفلتها، هتروح للسؤال اللي بعده على طول بعد الإجابة الصح."
              checked={settings.showLeaderboard}
              onChange={(v) => {
                setSettings({ ...settings, showLeaderboard: v });
                touch();
              }}
            />
          </section>

          <ol className="q-list">
            {questions.map((q, i) => (
              <li key={i} className="q-card">
                <div className="q-card-head">
                  <span className="q-num-ink">سؤال {i + 1}</span>
                  <div className="row">
                    <button
                      className="icon-btn"
                      onClick={() => edit((qs) => [...qs.slice(0, i + 1), { ...qs[i] }, ...qs.slice(i + 1)])}
                      aria-label="كرّر السؤال"
                      title="كرّر السؤال"
                    >
                      ⧉
                    </button>
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
                      onClick={() => window.confirm('تمسح السؤال ده؟') && edit((qs) => qs.filter((_, j) => j !== i))}
                      aria-label="امسح السؤال"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="type-picker" role="radiogroup" aria-label="نوع السؤال">
                  {TYPE_ORDER.map((t) => (
                    <button
                      key={t}
                      role="radio"
                      aria-checked={q.type === t}
                      className={q.type === t ? 'is-on' : ''}
                      onClick={() => q.type !== t && editQ(i, changeType(q, t))}
                    >
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
                <p className="muted small">{TYPE_HINTS[q.type]}</p>

                <textarea
                  className="q-text-input"
                  placeholder="اكتب السؤال هنا"
                  rows={2}
                  maxLength={250}
                  value={q.text}
                  onChange={(e) => editQ(i, { text: e.target.value })}
                />

                <details className="image-field" open={!!q.imageUrl}>
                  <summary>صورة مع السؤال</summary>
                  <input
                    dir="ltr"
                    placeholder="https://..."
                    value={q.imageUrl}
                    onChange={(e) => editQ(i, { imageUrl: e.target.value })}
                  />
                  <p className="muted small">
                    انسخ لينك الصورة من النت (كليك يمين على الصورة ← Copy image address) وحطه هنا.
                  </p>
                  {q.imageUrl.startsWith('https://') && (
                    <img className="image-preview" src={q.imageUrl} alt="" referrerPolicy="no-referrer" />
                  )}
                </details>

                {(q.type === 'choice' || q.type === 'truefalse') && (
                  <div className="opt-edit-list">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className={`opt-edit opt-edit-${oi} ${q.correct.includes(oi) ? 'is-correct' : ''}`}>
                        <span className="opt-edit-shape" aria-hidden="true">
                          {SHAPES[oi]}
                        </span>
                        {q.type === 'truefalse' ? (
                          <span className="opt-edit-fixed">{opt}</span>
                        ) : (
                          <input
                            value={opt}
                            maxLength={100}
                            placeholder={`اختيار ${oi + 1}`}
                            onChange={(e) =>
                              editQ(i, { options: q.options.map((o, k) => (k === oi ? e.target.value : o)) })
                            }
                          />
                        )}
                        <label className="correct-pick">
                          <input
                            type={q.type === 'truefalse' ? 'radio' : 'checkbox'}
                            name={`correct-${i}`}
                            checked={q.correct.includes(oi)}
                            onChange={() => toggleCorrect(i, oi)}
                          />
                          <span>صح</span>
                        </label>
                        {q.type === 'choice' && q.options.length > 2 && (
                          <button className="icon-btn" onClick={() => removeOption(i, oi)} aria-label="امسح الاختيار">
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    {q.type === 'choice' && q.options.length < MAX_OPTIONS && (
                      <button className="btn btn-line btn-small" onClick={() => editQ(i, { options: [...q.options, ''] })}>
                        ضيف اختيار
                      </button>
                    )}
                  </div>
                )}

                {q.type === 'order' && (
                  <div className="opt-edit-list">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="opt-edit">
                        <span className="order-num">{oi + 1}</span>
                        <input
                          value={opt}
                          maxLength={100}
                          placeholder={`العنصر رقم ${oi + 1}`}
                          onChange={(e) =>
                            editQ(i, { options: q.options.map((o, k) => (k === oi ? e.target.value : o)) })
                          }
                        />
                        {q.options.length > 2 && (
                          <button className="icon-btn" onClick={() => removeOption(i, oi)} aria-label="امسح العنصر">
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    {q.options.length < MAX_OPTIONS && (
                      <button className="btn btn-line btn-small" onClick={() => editQ(i, { options: [...q.options, ''] })}>
                        ضيف عنصر
                      </button>
                    )}
                  </div>
                )}

                {q.type === 'short' && (
                  <div className="opt-edit-list">
                    {q.accepted.map((a, ai) => (
                      <div key={ai} className="opt-edit is-correct">
                        <span className="order-num">✓</span>
                        <input
                          value={a}
                          maxLength={100}
                          placeholder={ai === 0 ? 'الإجابة الصح' : 'شكل تاني مقبول للإجابة'}
                          onChange={(e) =>
                            editQ(i, { accepted: q.accepted.map((x, k) => (k === ai ? e.target.value : x)) })
                          }
                        />
                        {q.accepted.length > 1 && (
                          <button
                            className="icon-btn"
                            onClick={() => editQ(i, { accepted: q.accepted.filter((_, k) => k !== ai) })}
                            aria-label="امسح الإجابة"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    {q.accepted.length < MAX_ACCEPTED && (
                      <button className="btn btn-line btn-small" onClick={() => editQ(i, { accepted: [...q.accepted, ''] })}>
                        ضيف إجابة مقبولة
                      </button>
                    )}
                  </div>
                )}

                <div className="q-settings">
                  <label className="mini-select">
                    <span>الوقت</span>
                    <select value={q.timeLimit} onChange={(e) => editQ(i, { timeLimit: Number(e.target.value) })}>
                      {TIME_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t} ثانية
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mini-select">
                    <span>النقط</span>
                    <select value={q.points} onChange={(e) => editQ(i, { points: Number(e.target.value) })}>
                      {POINT_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mini-check">
                    <input type="checkbox" checked={q.speedBonus} onChange={(e) => editQ(i, { speedBonus: e.target.checked })} />
                    <span>الأسرع ياخد نقط أكتر</span>
                  </label>
                  {q.type === 'choice' && (
                    <label className="mini-check">
                      <input type="checkbox" checked={q.shuffle} onChange={(e) => editQ(i, { shuffle: e.target.checked })} />
                      <span>اخلط ترتيب الاختيارات</span>
                    </label>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <div className="add-row">
            <span className="muted">ضيف سؤال:</span>
            {TYPE_ORDER.map((t) => (
              <button key={t} className="btn btn-line" onClick={() => edit((qs) => [...qs, newQuestion(t)])}>
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
      <span className="toggle-text">
        <b>{label}</b>
        <small>{hint}</small>
      </span>
    </label>
  );
}
