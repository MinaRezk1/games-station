import type { Question, QuestionType, Quiz, QuizSettings, SlideType, ThemeId } from '../types';

export const TIME_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
export const MAX_OPTIONS = 6;
export const MAX_ACCEPTED = 5;
export const MAX_POINTS = 5000;
export const MIN_TIME = 5;
export const MAX_TIME = 300;
export const isHttps = (u: string) => /^https:\/\//i.test(u.trim());

export const TYPE_LABELS: Record<SlideType, string> = {
  choice: 'اختيار من متعدد',
  truefalse: 'صح وغلط',
  short: 'إجابة مكتوبة',
  order: 'رتّب الإجابات',
  leaderboard: 'الترتيب',
};

export const TYPE_ICONS: Record<SlideType, string> = {
  choice: '☰',
  truefalse: '✓✗',
  short: '✎',
  order: '⇅',
  leaderboard: '🏆',
};

export const TYPE_HINTS: Record<SlideType, string> = {
  choice: 'علّم على الإجابة الصح. لو علّمت على أكتر من واحدة، اللاعب لازم يختارهم كلهم.',
  truefalse: 'اختار هل الجملة صح ولا غلط.',
  short: 'اللاعب بيكتب الإجابة. ضيف كل الأشكال اللي تتقبل (مش بتفرق الهمزات والتشكيل).',
  order: 'اكتب العناصر بالترتيب الصح، وهي هتظهر للاعبين متلخبطة.',
  leaderboard: 'السلايد ده بيعرض ترتيب اللاعبين ونقطهم لحد اللحظة دي.',
};

export const QUESTION_TYPES: QuestionType[] = ['choice', 'truefalse', 'short', 'order'];
export const SLIDE_TYPES: SlideType[] = [...QUESTION_TYPES, 'leaderboard'];

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'classic', label: 'فاتح' },
  { id: 'midnight', label: 'ليلي' },
  { id: 'sunrise', label: 'شروق' },
  { id: 'garden', label: 'جنينة' },
  { id: 'ruby', label: 'ياقوت' },
  { id: 'custom', label: 'صورة من عندك' },
];

export const DEFAULT_SETTINGS: QuizSettings = { questionType: 'choice', streakBonus: false, theme: 'classic', backgroundUrl: '' };

export function isQuestion(s: Question): s is Question & { type: QuestionType } {
  return s.type !== 'leaderboard';
}

// رقم السؤال من غير ما نعدّ سلايدات الترتيب
export function questionNumber(slides: Question[], index: number): number {
  return slides.slice(0, index + 1).filter(isQuestion).length;
}

export function countQuestions(slides: Question[]): number {
  return slides.filter(isQuestion).length;
}

export function newQuestion(type: SlideType = 'choice'): Question {
  const base = {
    type,
    text: '',
    description: '',
    imageUrl: '',
    optionImages: [] as string[],
    timeLimit: 20,
    points: 1000,
    minPoints: 500,
    speedBonus: true,
    shuffle: false,
    accepted: [] as string[],
  };
  switch (type) {
    case 'truefalse':
      return { ...base, options: ['صح', 'غلط'], correct: [0] };
    case 'short':
      return { ...base, options: [], correct: [], accepted: [''], timeLimit: 30 };
    case 'order':
      return { ...base, options: ['', '', ''], correct: [], timeLimit: 30 };
    case 'leaderboard':
      return { ...base, options: [], correct: [] };
    default:
      return { ...base, options: ['', '', '', ''], correct: [0] };
  }
}

// تغيير نوع السلايد مع الاحتفاظ بالحاجات المشتركة
export function changeType(q: Question, type: SlideType): Question {
  const fresh = newQuestion(type);
  if (type === 'leaderboard') return fresh;
  const kept = {
    text: q.text,
    description: q.description,
    imageUrl: q.imageUrl,
    points: q.points,
    minPoints: q.minPoints,
    speedBonus: q.speedBonus,
  };
  const keepOptions = (q.type === 'choice' || q.type === 'order') && (type === 'choice' || type === 'order');
  return {
    ...fresh,
    ...kept,
    options: keepOptions && q.options.length >= 2 ? [...q.options] : fresh.options,
    optionImages: type === 'choice' && q.type === 'choice' ? [...q.optionImages] : [],
    correct: type === 'choice' ? [0] : fresh.correct,
  };
}

const ALL_TYPES: SlideType[] = SLIDE_TYPES;
const THEME_IDS: ThemeId[] = THEMES.map((t) => t.id);

// بيقرا أي سلايد محفوظ (حتى الأسئلة القديمة) ويحوّله للشكل الجديد
export function normalizeQuestion(raw: unknown): Question {
  const r = (raw ?? {}) as Record<string, unknown>;
  const type = ALL_TYPES.includes(r.type as SlideType) ? (r.type as SlideType) : 'choice';
  const options = Array.isArray(r.options) ? r.options.map((o) => String(o)) : [];
  const correct = Array.isArray(r.correct)
    ? r.correct.filter((n): n is number => typeof n === 'number')
    : typeof r.correctIndex === 'number'
      ? [r.correctIndex]
      : [];
  const points = Number(r.points) || 1000;
  const minPoints = typeof r.minPoints === 'number' ? r.minPoints : Math.round(points / 2);
  const images = Array.isArray(r.optionImages) ? r.optionImages.map((o) => String(o ?? '')) : [];
  return {
    type,
    text: String(r.text ?? ''),
    description: String(r.description ?? ''),
    imageUrl: String(r.imageUrl ?? ''),
    optionImages: type === 'choice' ? options.map((_, i) => images[i] ?? '') : [],
    options: type === 'truefalse' ? ['صح', 'غلط'] : options,
    correct,
    accepted: Array.isArray(r.accepted) ? r.accepted.map((a) => String(a)) : [],
    timeLimit: Number(r.timeLimit) || 20,
    points,
    minPoints: Math.min(points, Math.max(0, minPoints)),
    speedBonus: r.speedBonus !== false,
    shuffle: !!r.shuffle,
  };
}

export function normalizeSettings(raw: unknown, fallbackType: QuestionType = 'choice'): QuizSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    questionType: QUESTION_TYPES.includes(r.questionType as QuestionType) ? (r.questionType as QuestionType) : fallbackType,
    streakBonus: !!r.streakBonus,
    theme: THEME_IDS.includes(r.theme as ThemeId) ? (r.theme as ThemeId) : 'classic',
    backgroundUrl: String(r.backgroundUrl ?? ''),
  };
}

export function normalizeQuiz(id: string, raw: Record<string, unknown>): Quiz {
  let questions = Array.isArray(raw.questions) ? raw.questions.map(normalizeQuestion) : [];
  const rawSettings = (raw.settings ?? {}) as Record<string, unknown>;

  // المسابقات القديمة: كان فيه اختيار "اعرض الترتيب بعد كل سؤال"، نحوّله لسلايدات ترتيب
  if (rawSettings.v !== 3 && rawSettings.showLeaderboard !== false && !questions.some((q) => q.type === 'leaderboard')) {
    questions = questions.flatMap((q) => [q, newQuestion('leaderboard')]);
    if (questions.length) questions.pop();
  }

  return {
    id,
    ownerId: String(raw.ownerId ?? ''),
    title: String(raw.title ?? ''),
    questions,
    settings: normalizeSettings(raw.settings, (questions.find(isQuestion)?.type as QuestionType | undefined) ?? 'choice'),
    updatedAt: (raw.updatedAt as Quiz['updatedAt']) ?? null,
  };
}

export function validateQuestion(q: Question, n: number): string | null {
  if (q.type === 'leaderboard') return null;
  if (!q.text.trim()) return `سؤال ${n} مالوش نص.`;
  if (q.imageUrl.trim() && !isHttps(q.imageUrl)) return `لينك الصورة في سؤال ${n} لازم يبدأ بـ https://`;
  if (q.optionImages.some((u) => u.trim() && !isHttps(u))) return `لينك صورة اختيار في سؤال ${n} لازم يبدأ بـ https://`;
  if (q.timeLimit < MIN_TIME || q.timeLimit > MAX_TIME) return `وقت سؤال ${n} لازم يبقى من ${MIN_TIME} لـ ${MAX_TIME} ثانية.`;
  if (q.minPoints > q.points) return `في سؤال ${n}، أقل نقط أكبر من أقصى نقط.`;
  switch (q.type) {
    case 'choice':
      if (q.options.length < 2) return `سؤال ${n} محتاج اختيارين على الأقل.`;
      if (q.options.some((o) => !o.trim())) return `فيه اختيار فاضي في سؤال ${n}.`;
      if (q.correct.length === 0) return `اختار الإجابة الصح في سؤال ${n}.`;
      return null;
    case 'truefalse':
      if (q.correct.length !== 1) return `اختار صح ولا غلط في سؤال ${n}.`;
      return null;
    case 'short':
      if (!q.accepted.some((a) => a.trim())) return `اكتب إجابة مقبولة واحدة على الأقل في سؤال ${n}.`;
      return null;
    case 'order': {
      if (q.options.length < 2) return `سؤال ${n} محتاج عنصرين على الأقل.`;
      if (q.options.some((o) => !o.trim())) return `فيه عنصر فاضي في سؤال ${n}.`;
      const set = new Set(q.options.map((o) => o.trim()));
      if (set.size !== q.options.length) return `فيه عنصرين زي بعض في سؤال ${n}.`;
      return null;
    }
  }
}

// بيرجّع أول مشكلة في المسابقة ورقم السلايد بتاعها
export function validateQuiz(slides: Question[]): { index: number; message: string } | null {
  if (countQuestions(slides) === 0) return { index: 0, message: 'ضيف سؤال واحد على الأقل.' };
  for (let i = 0; i < slides.length; i++) {
    const problem = validateQuestion(slides[i], questionNumber(slides, i));
    if (problem) return { index: i, message: problem };
  }
  return null;
}

export function cleanQuestion(q: Question): Question {
  if (q.type === 'leaderboard') return newQuestion('leaderboard');
  const points = Math.min(MAX_POINTS, Math.max(0, Math.round(q.points) || 0));
  return {
    ...q,
    text: q.text.trim(),
    description: q.description.trim(),
    imageUrl: q.imageUrl.trim(),
    optionImages: q.type === 'choice' ? q.options.map((_, i) => (q.optionImages[i] ?? '').trim()) : [],
    timeLimit: Math.min(MAX_TIME, Math.max(MIN_TIME, Math.round(q.timeLimit) || 20)),
    options: q.type === 'truefalse' ? ['صح', 'غلط'] : q.type === 'short' ? [] : q.options.map((o) => o.trim()),
    correct:
      q.type === 'choice' || q.type === 'truefalse'
        ? [...new Set(q.correct)]
            .filter((c) => c >= 0 && c < (q.type === 'truefalse' ? 2 : q.options.length))
            .sort((a, b) => a - b)
        : [],
    accepted: q.type === 'short' ? q.accepted.map((a) => a.trim()).filter(Boolean) : [],
    points,
    minPoints: Math.min(points, Math.max(0, Math.round(q.minPoints) || 0)),
    shuffle: q.type === 'choice' ? q.shuffle : false,
  };
}

export function themeStyle(settings: QuizSettings): Record<string, string> | undefined {
  if (settings.theme !== 'custom' || !/^https:\/\//i.test(settings.backgroundUrl)) return undefined;
  const url = settings.backgroundUrl.replace(/["\\()]/g, '');
  return {
    backgroundImage: `linear-gradient(rgba(10, 14, 30, 0.6), rgba(10, 14, 30, 0.6)), url("${url}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
}
