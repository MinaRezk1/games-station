import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db, isAdminEmail } from '../firebase';
import { useAuthUser } from '../hooks/useAuthUser';
import { friendlyError } from '../lib/errors';
import { createRoom } from '../lib/game';
import {
  changeType,
  cleanQuestion,
  countQuestions,
  DEFAULT_SETTINGS,
  isQuestion,
  MAX_ACCEPTED,
  MAX_OPTIONS,
  MAX_POINTS,
  newQuestion,
  normalizeQuiz,
  questionNumber,
  SLIDE_TYPES,
  THEMES,
  TIME_OPTIONS,
  TYPE_HINTS,
  TYPE_ICONS,
  TYPE_LABELS,
  validateQuiz,
} from '../lib/quiz';
import { SHAPES } from '../components/OptionTile';
import { SlidePreview } from '../components/SlidePreview';
import type { Question, QuizSettings, SlideType } from '../types';

type SaveState = 'saved' | 'pending' | 'saving' | 'error';

export default function QuizEditor() {
  const { quizId = '' } = useParams();
  const nav = useNavigate();
  const { user, loading } = useAuthUser();
  const [title, setTitle] = useState('');
  const [slides, setSlides] = useState<Question[]>([]);
  const [settings, setSettings] = useState<QuizSettings>(DEFAULT_SETTINGS);
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<'slide' | 'show'>('slide');
  const [addOpen, setAddOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [version, setVersion] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [problem, setProblem] = useState('');
  const [launching, setLaunching] = useState(false);
  const savedVersion = useRef(0);

  const isAdmin = !!user && !user.isAnonymous && isAdminEmail(user.email);

  useEffect(() => {
    if (!isAdmin) return;
    getDoc(doc(db, 'quizzes', quizId))
      .then((s) => {
        if (!s.exists()) return setLoadError('المسابقة دي مش موجودة.');
        const quiz = normalizeQuiz(s.id, s.data());
        setTitle(quiz.title);
        setSlides(quiz.questions.length ? quiz.questions : [newQuestion('choice')]);
        setSettings(quiz.settings);
        setLoaded(true);
      })
      .catch((e) => setLoadError(friendlyError(e, 'ماقدرناش نفتح المسابقة.')));
  }, [isAdmin, quizId]);

  async function persist(v: number): Promise<boolean> {
    setSaveState('saving');
    try {
      await updateDoc(doc(db, 'quizzes', quizId), {
        title: title.trim() || 'مسابقة من غير اسم',
        questions: slides.map(cleanQuestion),
        settings: { ...settings, v: 3 },
        updatedAt: serverTimestamp(),
      });
      savedVersion.current = Math.max(savedVersion.current, v);
      setSaveState((st) => (savedVersion.current >= v ? 'saved' : st));
      return true;
    } catch {
      setSaveState('error');
      return false;
    }
  }

  // حفظ تلقائي بعد ما تبطّل كتابة بثانية
  useEffect(() => {
    if (!loaded || version === 0) return;
    setSaveState('pending');
    const t = setTimeout(() => void persist(version), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, loaded]);

  useEffect(() => {
    if (saveState === 'saved') return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveState]);

  if (!loading && !isAdmin) return <Navigate to="/admin" replace />;
  if (loadError)
    return (
      <main className="page">
        <p className="error">{loadError}</p>
        <Link to="/admin">رجوع</Link>
      </main>
    );
  if (!loaded)
    return (
      <main className="page">
        <p className="muted">بنحمّل…</p>
      </main>
    );

  const bump = () => {
    setVersion((v) => v + 1);
    setProblem('');
  };

  const current = slides[Math.min(selected, slides.length - 1)];
  const sel = Math.min(selected, slides.length - 1);
  const total = countQuestions(slides);

  function setSlidesAnd(fn: (s: Question[]) => Question[]) {
    setSlides(fn);
    bump();
  }

  function editCurrent(patch: Partial<Question>) {
    setSlidesAnd((s) => s.map((q, i) => (i === sel ? { ...q, ...patch } : q)));
  }

  function addSlide(type: SlideType) {
    const at = sel + 1;
    setSlidesAnd((s) => [...s.slice(0, at), newQuestion(type), ...s.slice(at)]);
    setSelected(at);
    setAddOpen(false);
    setTab('slide');
  }

  function moveSlide(dir: -1 | 1) {
    const j = sel + dir;
    if (j < 0 || j >= slides.length) return;
    setSlidesAnd((s) => {
      const c = [...s];
      [c[sel], c[j]] = [c[j], c[sel]];
      return c;
    });
    setSelected(j);
  }

  function duplicateSlide() {
    setSlidesAnd((s) => [...s.slice(0, sel + 1), { ...s[sel], options: [...s[sel].options], correct: [...s[sel].correct], accepted: [...s[sel].accepted] }, ...s.slice(sel + 1)]);
    setSelected(sel + 1);
  }

  function deleteSlide() {
    if (slides.length <= 1) return;
    if (!window.confirm('تمسح السلايد ده؟')) return;
    setSlidesAnd((s) => s.filter((_, i) => i !== sel));
    setSelected(Math.max(0, sel - 1));
  }

  function setOption(oi: number, value: string) {
    editCurrent({ options: current.options.map((o, k) => (k === oi ? value : o)) });
  }

  function moveOption(oi: number, dir: -1 | 1) {
    const j = oi + dir;
    if (j < 0 || j >= current.options.length) return;
    const options = [...current.options];
    [options[oi], options[j]] = [options[j], options[oi]];
    const correct = current.correct.map((c) => (c === oi ? j : c === j ? oi : c));
    editCurrent({ options, correct });
  }

  function removeOption(oi: number) {
    if (current.options.length <= 2) return;
    const options = current.options.filter((_, k) => k !== oi);
    const correct = current.correct.filter((c) => c !== oi).map((c) => (c > oi ? c - 1 : c));
    editCurrent({ options, correct: current.type === 'choice' && correct.length === 0 ? [0] : correct });
  }

  function toggleCorrect(oi: number) {
    if (current.type === 'truefalse') return editCurrent({ correct: [oi] });
    const has = current.correct.includes(oi);
    if (has && current.correct.length === 1) return;
    editCurrent({ correct: has ? current.correct.filter((c) => c !== oi) : [...current.correct, oi].sort((a, b) => a - b) });
  }

  function setSetting(patch: Partial<QuizSettings>) {
    setSettings((st) => ({ ...st, ...patch }));
    bump();
  }

  async function goLive() {
    if (!user) return;
    const issue = validateQuiz(slides);
    if (issue) {
      setSelected(issue.index);
      setTab('slide');
      setProblem(issue.message);
      return;
    }
    setLaunching(true);
    const ok = await persist(version);
    if (!ok) {
      setLaunching(false);
      setProblem('ماقدرناش نحفظ المسابقة، اتأكد من النت وجرّب تاني.');
      return;
    }
    try {
      const code = await createRoom(
        { id: quizId, ownerId: user.uid, title: title.trim() || 'مسابقة', questions: slides.map(cleanQuestion), settings },
        user.uid,
      );
      nav(`/host/${code}`);
    } catch (e) {
      setProblem(friendlyError(e, 'ماقدرناش نفتح غرفة جديدة.'));
      setLaunching(false);
    }
  }

  const saveLabel =
    saveState === 'saved' ? 'اتحفظ' : saveState === 'saving' ? 'بيتحفظ…' : saveState === 'pending' ? 'فيه تغييرات' : 'ماتحفظش!';

  return (
    <div className="editor">
      <header className="editor-bar">
        <Link to="/admin" className="icon-btn" aria-label="رجوع للمسابقات">
          →
        </Link>
        <input
          className="editor-title"
          value={title}
          maxLength={80}
          placeholder="اسم المسابقة"
          aria-label="اسم المسابقة"
          onChange={(e) => {
            setTitle(e.target.value);
            bump();
          }}
        />
        <span className={`save-state is-${saveState}`}>{saveLabel}</span>
        {saveState === 'error' && (
          <button className="btn btn-line btn-small" onClick={() => void persist(version)}>
            جرّب تاني
          </button>
        )}
        <button className="btn btn-brand" onClick={goLive} disabled={launching}>
          {launching ? 'بنفتح…' : '▶ ابدأ لايف'}
        </button>
      </header>

      {problem && (
        <p className="error editor-problem" role="alert">
          {problem}
        </p>
      )}

      <div className="editor-body">
        {/* لستة السلايدات */}
        <aside className="slide-list">
          <div className="slide-add">
            <button className="btn btn-brand btn-wide" onClick={() => setAddOpen((o) => !o)} aria-expanded={addOpen}>
              + سلايد جديد
            </button>
            {addOpen && (
              <div className="add-menu" role="menu">
                {SLIDE_TYPES.map((t) => (
                  <button key={t} role="menuitem" onClick={() => addSlide(t)}>
                    <span className="add-icon" aria-hidden="true">
                      {TYPE_ICONS[t]}
                    </span>
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ol className="thumbs">
            {slides.map((s, i) => (
              <li key={i}>
                <span className="thumb-num">{i + 1}</span>
                <button
                  className={`thumb ${i === sel ? 'is-on' : ''} ${s.type === 'leaderboard' ? 'is-board' : ''}`}
                  onClick={() => {
                    setSelected(i);
                    setTab('slide');
                  }}
                >
                  <span className="thumb-type">
                    <span aria-hidden="true">{TYPE_ICONS[s.type]}</span> {TYPE_LABELS[s.type]}
                  </span>
                  {isQuestion(s) && <span className="thumb-text">{s.text.trim() || 'سؤال فاضي'}</span>}
                </button>
              </li>
            ))}
          </ol>
        </aside>

        {/* المعاينة */}
        <section className="editor-stage">
          <SlidePreview slide={current} settings={settings} number={questionNumber(slides, sel)} total={total} />
          <div className="stage-tools">
            <button className="icon-btn" onClick={() => moveSlide(-1)} disabled={sel === 0} aria-label="طلّع السلايد لفوق" title="لفوق">
              ↑
            </button>
            <button className="icon-btn" onClick={() => moveSlide(1)} disabled={sel === slides.length - 1} aria-label="نزّل السلايد لتحت" title="لتحت">
              ↓
            </button>
            <button className="icon-btn" onClick={duplicateSlide} aria-label="كرّر السلايد" title="كرّر">
              ⧉
            </button>
            <button className="icon-btn danger" onClick={deleteSlide} disabled={slides.length <= 1} aria-label="امسح السلايد" title="امسح">
              ✕
            </button>
            <span className="muted small">سلايد {sel + 1} من {slides.length}</span>
          </div>
        </section>

        {/* لوحة الإعدادات */}
        <aside className="panel">
          <div className="panel-tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'slide'} className={tab === 'slide' ? 'is-on' : ''} onClick={() => setTab('slide')}>
              المحتوى
            </button>
            <button role="tab" aria-selected={tab === 'show'} className={tab === 'show' ? 'is-on' : ''} onClick={() => setTab('show')}>
              شكل العرض
            </button>
          </div>

          {tab === 'show' ? (
            <div className="panel-body">
              <div className="panel-section">
                <h3>الخلفية</h3>
                <div className="theme-grid">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      className={`theme-swatch theme-${t.id} ${settings.theme === t.id ? 'is-on' : ''}`}
                      onClick={() => setSetting({ theme: t.id })}
                      aria-pressed={settings.theme === t.id}
                    >
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
                {settings.theme === 'custom' && (
                  <label className="panel-field">
                    <span>لينك الصورة</span>
                    <input
                      dir="ltr"
                      placeholder="https://..."
                      value={settings.backgroundUrl}
                      onChange={(e) => setSetting({ backgroundUrl: e.target.value })}
                    />
                  </label>
                )}
              </div>
              <div className="panel-section">
                <Toggle
                  label="نقط زيادة للإجابات الصح ورا بعض"
                  hint="100 نقطة زيادة عن كل إجابة صح متتالية، لحد 500."
                  checked={settings.streakBonus}
                  onChange={(v) => setSetting({ streakBonus: v })}
                />
              </div>
            </div>
          ) : (
            <div className="panel-body">
              <label className="panel-field">
                <span>نوع السلايد</span>
                <select value={current.type} onChange={(e) => editCurrent(changeType(current, e.target.value as SlideType))}>
                  {SLIDE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted small">{TYPE_HINTS[current.type]}</p>

              {isQuestion(current) && (
                <>
                  <label className="panel-field">
                    <span>
                      السؤال <small className="muted">{current.text.length}/250</small>
                    </span>
                    <textarea
                      rows={3}
                      maxLength={250}
                      value={current.text}
                      placeholder="اكتب السؤال هنا"
                      onChange={(e) => editCurrent({ text: e.target.value })}
                    />
                  </label>

                  <label className="panel-field">
                    <span>صورة (اختياري)</span>
                    <input
                      dir="ltr"
                      placeholder="https://..."
                      value={current.imageUrl}
                      onChange={(e) => editCurrent({ imageUrl: e.target.value })}
                    />
                    <small className="muted">كليك يمين على أي صورة في النت ← Copy image address، وحطه هنا.</small>
                  </label>

                  {(current.type === 'choice' || current.type === 'truefalse') && (
                    <div className="panel-section">
                      <h3>الاختيارات</h3>
                      {current.options.map((opt, oi) => (
                        <div key={oi} className={`opt-row ${current.correct.includes(oi) ? 'is-correct' : ''}`}>
                          <button
                            className="correct-btn"
                            onClick={() => toggleCorrect(oi)}
                            aria-pressed={current.correct.includes(oi)}
                            aria-label={current.correct.includes(oi) ? 'دي إجابة صح' : 'علّمها إجابة صح'}
                            title="الإجابة الصح"
                          >
                            ✓
                          </button>
                          <span className={`opt-dot opt-dot-${oi}`} aria-hidden="true">
                            {SHAPES[oi]}
                          </span>
                          {current.type === 'truefalse' ? (
                            <span className="opt-fixed">{opt}</span>
                          ) : (
                            <input value={opt} maxLength={100} placeholder={`اختيار ${oi + 1}`} onChange={(e) => setOption(oi, e.target.value)} />
                          )}
                          {current.type === 'choice' && (
                            <span className="opt-row-tools">
                              <button onClick={() => moveOption(oi, -1)} disabled={oi === 0} aria-label="لفوق">
                                ↑
                              </button>
                              <button onClick={() => removeOption(oi)} disabled={current.options.length <= 2} aria-label="امسح">
                                ✕
                              </button>
                            </span>
                          )}
                        </div>
                      ))}
                      {current.type === 'choice' && current.options.length < MAX_OPTIONS && (
                        <button className="btn btn-line btn-small btn-wide" onClick={() => editCurrent({ options: [...current.options, ''] })}>
                          + ضيف اختيار
                        </button>
                      )}
                    </div>
                  )}

                  {current.type === 'order' && (
                    <div className="panel-section">
                      <h3>العناصر بالترتيب الصح</h3>
                      {current.options.map((opt, oi) => (
                        <div key={oi} className="opt-row">
                          <span className="order-num">{oi + 1}</span>
                          <input value={opt} maxLength={100} placeholder={`العنصر ${oi + 1}`} onChange={(e) => setOption(oi, e.target.value)} />
                          <span className="opt-row-tools">
                            <button onClick={() => moveOption(oi, -1)} disabled={oi === 0} aria-label="لفوق">
                              ↑
                            </button>
                            <button onClick={() => removeOption(oi)} disabled={current.options.length <= 2} aria-label="امسح">
                              ✕
                            </button>
                          </span>
                        </div>
                      ))}
                      {current.options.length < MAX_OPTIONS && (
                        <button className="btn btn-line btn-small btn-wide" onClick={() => editCurrent({ options: [...current.options, ''] })}>
                          + ضيف عنصر
                        </button>
                      )}
                    </div>
                  )}

                  {current.type === 'short' && (
                    <div className="panel-section">
                      <h3>الإجابات المقبولة</h3>
                      {current.accepted.map((a, ai) => (
                        <div key={ai} className="opt-row is-correct">
                          <span className="order-num">✓</span>
                          <input
                            value={a}
                            maxLength={100}
                            placeholder={ai === 0 ? 'الإجابة الصح' : 'شكل تاني مقبول'}
                            onChange={(e) => editCurrent({ accepted: current.accepted.map((x, k) => (k === ai ? e.target.value : x)) })}
                          />
                          {current.accepted.length > 1 && (
                            <span className="opt-row-tools">
                              <button onClick={() => editCurrent({ accepted: current.accepted.filter((_, k) => k !== ai) })} aria-label="امسح">
                                ✕
                              </button>
                            </span>
                          )}
                        </div>
                      ))}
                      {current.accepted.length < MAX_ACCEPTED && (
                        <button className="btn btn-line btn-small btn-wide" onClick={() => editCurrent({ accepted: [...current.accepted, ''] })}>
                          + ضيف إجابة مقبولة
                        </button>
                      )}
                    </div>
                  )}

                  <div className="panel-section">
                    <h3>النقط</h3>
                    <div className="points-row">
                      <label>
                        <span>أقصى</span>
                        <input
                          type="number"
                          min={0}
                          max={MAX_POINTS}
                          step={50}
                          value={current.points}
                          onChange={(e) => editCurrent({ points: Number(e.target.value) })}
                        />
                      </label>
                      <label>
                        <span>أقل</span>
                        <input
                          type="number"
                          min={0}
                          max={current.points}
                          step={50}
                          value={current.minPoints}
                          disabled={!current.speedBonus}
                          onChange={(e) => editCurrent({ minPoints: Number(e.target.value) })}
                        />
                      </label>
                    </div>
                    <Toggle
                      label="الأسرع ياخد نقط أكتر"
                      hint="النقط بتنزل من الأقصى للأقل على حسب وقت الإجابة."
                      checked={current.speedBonus}
                      onChange={(v) => editCurrent({ speedBonus: v })}
                    />
                  </div>

                  <div className="panel-section">
                    <label className="panel-field panel-inline">
                      <span>الوقت</span>
                      <select value={current.timeLimit} onChange={(e) => editCurrent({ timeLimit: Number(e.target.value) })}>
                        {TIME_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {t} ثانية
                          </option>
                        ))}
                      </select>
                    </label>
                    {current.type === 'choice' && (
                      <Toggle
                        label="اخلط ترتيب الاختيارات"
                        hint="كل مرة تعرض السؤال الاختيارات هتظهر بترتيب مختلف."
                        checked={current.shuffle}
                        onChange={(v) => editCurrent({ shuffle: v })}
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
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
