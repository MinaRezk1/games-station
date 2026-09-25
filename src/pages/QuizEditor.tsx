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
  MAX_TEAMS,
  MAX_TIME,
  MIN_TIME,
  newQuestion,
  normalizeQuiz,
  QUESTION_TYPES,
  questionNumber,
  THEMES,
  TYPE_HINTS,
  TYPE_ICONS,
  TYPE_LABELS,
  validateQuiz,
  validateSettings,
} from '../lib/quiz';
import { SHAPES } from '../components/OptionTile';
import { SlidePreview } from '../components/SlidePreview';
import type { Question, QuestionType, QuizSettings } from '../types';

type SaveState = 'saved' | 'pending' | 'saving' | 'error';

export default function QuizEditor() {
  const { quizId = '' } = useParams();
  const nav = useNavigate();
  const { user, loading } = useAuthUser();
  const [title, setTitle] = useState('');
  const [slides, setSlides] = useState<Question[]>([]);
  const [settings, setSettings] = useState<QuizSettings>(DEFAULT_SETTINGS);
  const [selected, setSelected] = useState(0);
  const [quizSettingsOpen, setQuizSettingsOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [version, setVersion] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [problem, setProblem] = useState('');
  const [launching, setLaunching] = useState(false);
  const [imgOpen, setImgOpen] = useState<number | null>(null);
  const [qImgOpen, setQImgOpen] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const savedVersion = useRef(0);

  const isAdmin = !!user && !user.isAnonymous && isAdminEmail(user.email);

  useEffect(() => {
    if (!isAdmin) return;
    getDoc(doc(db, 'quizzes', quizId))
      .then((s) => {
        if (!s.exists()) return setLoadError('المسابقة دي مش موجودة.');
        const quiz = normalizeQuiz(s.id, s.data());
        setTitle(quiz.title);
        setSettings(quiz.settings);
        setSlides(quiz.questions.length ? quiz.questions : [newQuestion(quiz.settings.questionType), newQuestion('leaderboard')]);
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

  const sel = Math.min(selected, slides.length - 1);
  const current = slides[sel];
  const total = countQuestions(slides);
  const hasBoardAfter = slides[sel + 1]?.type === 'leaderboard';

  function select(i: number) {
    setSelected(i);
    setImgOpen(null);
    setQImgOpen(false);
    setQuizSettingsOpen(false);
  }

  function setSlidesAnd(fn: (s: Question[]) => Question[]) {
    setSlides(fn);
    bump();
  }

  function editCurrent(patch: Partial<Question>) {
    setSlidesAnd((s) => s.map((q, i) => (i === sel ? { ...q, ...patch } : q)));
  }

  // سؤال جديد (بنفس نوع المسابقة) وبعده سلايد ترتيب
  function addQuestion() {
    const at = slides[sel + 1]?.type === 'leaderboard' ? sel + 2 : sel + 1;
    setSlidesAnd((s) => [...s.slice(0, at), newQuestion(settings.questionType), newQuestion('leaderboard'), ...s.slice(at)]);
    select(at);
  }

  function toggleBoardAfter(on: boolean) {
    if (on && !hasBoardAfter) setSlidesAnd((s) => [...s.slice(0, sel + 1), newQuestion('leaderboard'), ...s.slice(sel + 1)]);
    if (!on && hasBoardAfter) setSlidesAnd((s) => s.filter((_, i) => i !== sel + 1));
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
    const copy = { ...current, options: [...current.options], correct: [...current.correct], accepted: [...current.accepted], optionImages: [...current.optionImages] };
    const extra = isQuestion(current) && hasBoardAfter ? [copy, newQuestion('leaderboard')] : [copy];
    const at = isQuestion(current) && hasBoardAfter ? sel + 2 : sel + 1;
    setSlidesAnd((s) => [...s.slice(0, at), ...extra, ...s.slice(at)]);
    select(at);
  }

  function deleteSlide() {
    if (isQuestion(current) && total <= 1) return;
    if (!window.confirm(isQuestion(current) ? 'تمسح السؤال ده؟' : 'تمسح سلايد الترتيب ده؟')) return;
    const removeBoard = isQuestion(current) && hasBoardAfter;
    setSlidesAnd((s) => s.filter((_, i) => i !== sel && !(removeBoard && i === sel + 1)));
    select(Math.max(0, sel - 1));
  }

  function setOption(oi: number, value: string) {
    editCurrent({ options: current.options.map((o, k) => (k === oi ? value : o)) });
  }

  function moveOptionTo(from: number, to: number) {
    if (from === to || to < 0 || to >= current.options.length) return;
    const order = current.options.map((_, k) => k);
    order.splice(to, 0, order.splice(from, 1)[0]);
    editCurrent({
      options: order.map((k) => current.options[k]),
      optionImages: current.type === 'choice' ? order.map((k) => current.optionImages[k] ?? '') : [],
      correct: current.correct.map((c) => order.indexOf(c)).sort((a, b) => a - b),
    });
    setImgOpen(null);
  }

  function removeOption(oi: number) {
    if (current.options.length <= 2) return;
    const options = current.options.filter((_, k) => k !== oi);
    const optionImages = current.options.map((_, k) => current.optionImages[k] ?? '').filter((_, k) => k !== oi);
    const correct = current.correct.filter((c) => c !== oi).map((c) => (c > oi ? c - 1 : c));
    editCurrent({
      options,
      optionImages: current.type === 'choice' ? optionImages : [],
      correct: current.type === 'choice' && correct.length === 0 ? [0] : correct,
    });
    setImgOpen(null);
  }

  function setOptionImage(oi: number, url: string) {
    editCurrent({ optionImages: current.options.map((_, k) => (k === oi ? url : current.optionImages[k] ?? '')) });
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

  function changeQuizType(type: QuestionType) {
    if (type === settings.questionType) return;
    if (!window.confirm(`تغيّر نوع كل الأسئلة لـ "${TYPE_LABELS[type]}"؟ الاختيارات والإجابات الصح ممكن تتمسح.`)) return;
    setSettings((st) => ({ ...st, questionType: type }));
    setSlidesAnd((s) => s.map((q) => (isQuestion(q) ? changeType(q, type) : q)));
  }

  async function goLive() {
    if (!user) return;
    const settingsIssue = validateSettings(settings);
    if (settingsIssue) {
      setQuizSettingsOpen(true);
      setProblem(settingsIssue);
      return;
    }
    const issue = validateQuiz(slides);
    if (issue) {
      select(issue.index);
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
            <button className="btn btn-brand btn-wide" onClick={addQuestion}>
              + سؤال جديد
            </button>
          </div>
          <ol className="thumbs">
            {slides.map((s, i) => (
              <li key={i}>
                <span className="thumb-num">{i + 1}</span>
                <button className={`thumb ${i === sel ? 'is-on' : ''} ${s.type === 'leaderboard' ? 'is-board' : ''}`} onClick={() => select(i)}>
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
            {isQuestion(current) && (
              <button className="icon-btn" onClick={duplicateSlide} aria-label="كرّر السؤال" title="كرّر">
                ⧉
              </button>
            )}
            <button
              className="icon-btn danger"
              onClick={deleteSlide}
              disabled={isQuestion(current) && total <= 1}
              aria-label="امسح السلايد"
              title="امسح"
            >
              ✕
            </button>
            <span className="muted small">
              سلايد {sel + 1} من {slides.length}
            </span>
          </div>
        </section>

        {/* لوحة الإعدادات */}
        <aside className="panel">
          <div className="panel-head">
            <span className="panel-head-icon" aria-hidden="true">
              {TYPE_ICONS[current.type]}
            </span>
            <b>{TYPE_LABELS[current.type]}</b>
            {isQuestion(current) && <span className="muted small">سؤال {questionNumber(slides, sel)}</span>}
          </div>

          <div className="panel-body">
            {!isQuestion(current) ? (
              <div className="panel-block">
                <p className="muted">{TYPE_HINTS.leaderboard}</p>
                <button className="btn btn-danger-line" onClick={deleteSlide}>
                  امسح سلايد الترتيب
                </button>
              </div>
            ) : (
              <>
                {/* السؤال */}
                <div className="panel-block">
                  <Label text="السؤال" help={TYPE_HINTS[current.type]} />
                  <div className="q-box">
                    <textarea
                      rows={3}
                      maxLength={250}
                      value={current.text}
                      placeholder="اكتب السؤال هنا"
                      aria-label="السؤال"
                      onChange={(e) => editCurrent({ text: e.target.value })}
                    />
                    <div className="q-box-foot">
                      <button
                        className={`q-box-btn ${current.imageUrl ? 'has-img' : ''}`}
                        onClick={() => setQImgOpen((o) => !o)}
                        aria-expanded={qImgOpen}
                        title="صورة مع السؤال"
                      >
                        🖼 صورة
                      </button>
                      <span className="muted small">{250 - current.text.length}</span>
                    </div>
                    {qImgOpen && (
                      <input
                        className="q-box-img"
                        dir="ltr"
                        autoFocus
                        placeholder="لينك الصورة https://..."
                        value={current.imageUrl}
                        onChange={(e) => editCurrent({ imageUrl: e.target.value })}
                      />
                    )}
                  </div>
                </div>

                {/* الاختيارات */}
                {(current.type === 'choice' || current.type === 'truefalse' || current.type === 'order') && (
                  <div className="panel-block">
                    <Label
                      text={current.type === 'order' ? 'العناصر بالترتيب الصح' : 'الاختيارات'}
                      help={current.type === 'order' ? 'هتظهر للاعبين متلخبطة.' : 'دوس على الدايرة عشان تعلّم الإجابة الصح.'}
                    />
                    <div className="opt-grid">
                      {current.options.map((opt, oi) => (
                        <div
                          key={oi}
                          className={`opt-line ${current.type !== 'order' && current.correct.includes(oi) ? 'is-correct' : ''} ${dragFrom === oi ? 'is-dragging' : ''}`}
                          onDragOver={(e) => current.type !== 'truefalse' && e.preventDefault()}
                          onDrop={() => {
                            if (dragFrom !== null) moveOptionTo(dragFrom, oi);
                            setDragFrom(null);
                          }}
                        >
                          {current.type !== 'truefalse' && (
                            <span
                              className="opt-handle"
                              draggable
                              onDragStart={() => setDragFrom(oi)}
                              onDragEnd={() => setDragFrom(null)}
                              title="اسحب عشان ترتّب"
                              aria-hidden="true"
                            >
                              ⋮⋮
                            </span>
                          )}
                          {current.type === 'order' ? (
                            <span className="opt-cell-num">{oi + 1}</span>
                          ) : (
                            <button
                              className="correct-btn"
                              onClick={() => toggleCorrect(oi)}
                              aria-pressed={current.correct.includes(oi)}
                              aria-label={current.correct.includes(oi) ? 'دي إجابة صح' : 'علّمها إجابة صح'}
                            >
                              ✓
                            </button>
                          )}
                          <span className={`opt-dot opt-dot-${oi}`} aria-hidden="true">
                            {current.type === 'order' ? '' : SHAPES[oi]}
                          </span>
                          {current.type === 'truefalse' ? (
                            <span className="opt-fixed">{opt}</span>
                          ) : (
                            <input
                              value={opt}
                              maxLength={100}
                              placeholder={current.type === 'order' ? `العنصر ${oi + 1}` : `اختيار ${oi + 1}`}
                              onChange={(e) => setOption(oi, e.target.value)}
                              aria-label={`اختيار ${oi + 1}`}
                            />
                          )}
                          {current.type === 'choice' && (
                            <button
                              className={`opt-cell-btn ${current.optionImages[oi] ? 'has-img' : ''}`}
                              onClick={() => setImgOpen(imgOpen === oi ? null : oi)}
                              aria-expanded={imgOpen === oi}
                              aria-label="صورة للاختيار"
                              title="صورة للاختيار"
                            >
                              🖼
                            </button>
                          )}
                          {current.type !== 'truefalse' && (
                            <button
                              className="opt-cell-btn"
                              onClick={() => removeOption(oi)}
                              disabled={current.options.length <= 2}
                              aria-label="امسح"
                              title="امسح"
                            >
                              🗑
                            </button>
                          )}
                          {current.type === 'choice' && imgOpen === oi && (
                            <input
                              className="opt-img-input"
                              dir="ltr"
                              autoFocus
                              placeholder="لينك صورة الاختيار https://..."
                              value={current.optionImages[oi] ?? ''}
                              onChange={(e) => setOptionImage(oi, e.target.value)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    {current.type !== 'truefalse' && current.options.length < MAX_OPTIONS && (
                      <button className="btn btn-line btn-wide" onClick={() => editCurrent({ options: [...current.options, ''] })}>
                        + ضيف
                      </button>
                    )}
                  </div>
                )}

                {current.type === 'short' && (
                  <div className="panel-block">
                    <Label text="الإجابات المقبولة" help="مش بتفرق الهمزات والتشكيل والحروف الكبيرة والصغيرة." />
                    <div className="opt-grid">
                      {current.accepted.map((a, ai) => (
                        <div key={ai} className="opt-line is-correct">
                          <span className="opt-cell-num">✓</span>
                          <input
                            value={a}
                            maxLength={100}
                            placeholder={ai === 0 ? 'الإجابة الصح' : 'شكل تاني مقبول'}
                            onChange={(e) => editCurrent({ accepted: current.accepted.map((x, k) => (k === ai ? e.target.value : x)) })}
                          />
                          <button
                            className="opt-cell-btn"
                            onClick={() => editCurrent({ accepted: current.accepted.filter((_, k) => k !== ai) })}
                            disabled={current.accepted.length <= 1}
                            aria-label="امسح"
                          >
                            🗑
                          </button>
                        </div>
                      ))}
                    </div>
                    {current.accepted.length < MAX_ACCEPTED && (
                      <button className="btn btn-line btn-wide" onClick={() => editCurrent({ accepted: [...current.accepted, ''] })}>
                        + ضيف
                      </button>
                    )}
                  </div>
                )}

                {/* النقط */}
                <div className="panel-block with-line">
                  <div className="setting-row">
                    <Label text="النقط" help="النقط اللي بياخدها اللي يجاوب صح." icon="★" />
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
                  </div>
                  <Switch
                    label="الأسرع ياخد نقط أكتر"
                    help="النقط بتنزل من الأقصى للأقل على حسب وقت الإجابة."
                    checked={current.speedBonus}
                    onChange={(v) => editCurrent({ speedBonus: v })}
                    indent
                  />
                  <Switch
                    label="نقط دابل ×2"
                    help="اللي يجاوب صح ياخد ضعف النقط، وبيظهر للكل إن السؤال ده دابل."
                    checked={current.double}
                    onChange={(v) => editCurrent({ double: v })}
                    indent
                  />
                </div>

                {/* الوقت */}
                <div className="panel-block with-line">
                  <div className="setting-row">
                    <Label text="الوقت" help={`من ${MIN_TIME} لـ ${MAX_TIME} ثانية.`} icon="⏱" />
                    <span className="time-input">
                      <input
                        type="number"
                        min={MIN_TIME}
                        max={MAX_TIME}
                        value={current.timeLimit}
                        onChange={(e) => editCurrent({ timeLimit: Number(e.target.value) })}
                        aria-label="الوقت بالثواني"
                      />
                      ثانية
                    </span>
                  </div>
                  {current.type === 'choice' && (
                    <Switch
                      label="اخلط ترتيب الاختيارات"
                      help="الاختيارات هتظهر بترتيب مختلف كل مرة."
                      checked={current.shuffle}
                      onChange={(v) => editCurrent({ shuffle: v })}
                      indent
                    />
                  )}
                </div>

                {/* الترتيب */}
                <div className="panel-block with-line">
                  <Switch
                    label="الترتيب"
                    help="اعرض ترتيب اللاعبين بعد السؤال ده."
                    icon="🏆"
                    checked={hasBoardAfter}
                    onChange={toggleBoardAfter}
                  />
                </div>
              </>
            )}

            {/* إعدادات المسابقة */}
            <div className="panel-block with-line">
              <button className="settings-link" onClick={() => setQuizSettingsOpen((o) => !o)} aria-expanded={quizSettingsOpen}>
                <span aria-hidden="true">⚙</span>
                <b>إعدادات المسابقة</b>
                <span className="settings-caret" aria-hidden="true">
                  {quizSettingsOpen ? '⌃' : '‹'}
                </span>
              </button>
              {quizSettingsOpen && (
                <div className="quiz-settings">
                  <label className="panel-field">
                    <span>نوع الأسئلة</span>
                    <select value={settings.questionType} onChange={(e) => changeQuizType(e.target.value as QuestionType)}>
                      {QUESTION_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="panel-field">
                    <span>الخلفية</span>
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
                  </div>
                  {settings.theme === 'custom' && (
                    <label className="panel-field">
                      <span>لينك صورة الخلفية</span>
                      <input
                        dir="ltr"
                        placeholder="https://..."
                        value={settings.backgroundUrl}
                        onChange={(e) => setSetting({ backgroundUrl: e.target.value })}
                      />
                    </label>
                  )}
                  <Switch
                    label="العب كفرق"
                    help="كل لاعب بيختار فريقه وهو داخل، والترتيب بيبقى للفرق."
                    checked={settings.teamsEnabled}
                    onChange={(v) => setSetting({ teamsEnabled: v })}
                  />
                  {settings.teamsEnabled && (
                    <div className="teams-edit">
                      {settings.teams.map((t, ti) => (
                        <div key={ti} className="opt-line">
                          <span className={`opt-cell-num team-dot-${ti}`}>{ti + 1}</span>
                          <input
                            value={t}
                            maxLength={30}
                            placeholder={`فريق ${ti + 1}`}
                            aria-label={`اسم فريق ${ti + 1}`}
                            onChange={(e) => setSetting({ teams: settings.teams.map((x, k) => (k === ti ? e.target.value : x)) })}
                          />
                          <button
                            className="opt-cell-btn"
                            disabled={settings.teams.length <= 2}
                            onClick={() => setSetting({ teams: settings.teams.filter((_, k) => k !== ti) })}
                            aria-label="امسح الفريق"
                          >
                            🗑
                          </button>
                        </div>
                      ))}
                      {settings.teams.length < MAX_TEAMS && (
                        <button className="btn btn-line btn-small" onClick={() => setSetting({ teams: [...settings.teams, ''] })}>
                          + ضيف فريق
                        </button>
                      )}
                      <label className="panel-field panel-inline">
                        <span>نقط الفريق</span>
                        <select
                          value={settings.teamScoring}
                          onChange={(e) => setSetting({ teamScoring: e.target.value === 'sum' ? 'sum' : 'avg' })}
                        >
                          <option value="avg">متوسط نقط اللاعبين</option>
                          <option value="sum">مجموع نقط اللاعبين</option>
                        </select>
                      </label>
                    </div>
                  )}
                  <Switch
                    label="نقط زيادة للإجابات الصح ورا بعض"
                    help="100 نقطة زيادة عن كل إجابة صح متتالية، لحد 500."
                    checked={settings.streakBonus}
                    onChange={(v) => setSetting({ streakBonus: v })}
                  />
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Label({ text, help, icon }: { text: string; help: string; icon?: string }) {
  return (
    <span className="panel-label">
      {icon && (
        <span className="panel-label-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <b>{text}</b>
      <span className="help" title={help} aria-label={help} tabIndex={0}>
        ?
      </span>
    </span>
  );
}

function Switch({
  label,
  help,
  icon,
  checked,
  onChange,
  indent,
}: {
  label: string;
  help: string;
  icon?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  indent?: boolean;
}) {
  return (
    <label className={`switch-row ${indent ? 'is-indent' : ''}`}>
      <Label text={label} help={help} icon={icon} />
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
    </label>
  );
}
