import type { Question, QuestionType, Quiz, QuizSettings } from '../types';

export const TIME_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
export const POINT_OPTIONS = [100, 500, 1000, 2000];
export const MAX_OPTIONS = 6;
export const MAX_ACCEPTED = 5;

export const TYPE_LABELS: Record<QuestionType, string> = {
  choice: 'اختيار من متعدد',
  truefalse: 'صح وغلط',
  short: 'إجابة مكتوبة',
  order: 'رتّب الإجابات',
};

export const TYPE_HINTS: Record<QuestionType, string> = {
  choice: 'اختار إجابة صح واحدة أو أكتر. لو اخترت أكتر من واحدة، اللاعب لازم يختارهم كلهم.',
  truefalse: 'اختار هل الجملة صح ولا غلط.',
  short: 'اللاعب بيكتب الإجابة. ضيف كل الأشكال اللي تتقبل (مش بتفرق الهمزات والتشكيل).',
  order: 'اكتب العناصر بالترتيب الصح، وهي هتظهر للاعبين متلخبطة.',
};

export const DEFAULT_SETTINGS: QuizSettings = { streakBonus: false, showLeaderboard: true };

const TYPES: QuestionType[] = ['choice', 'truefalse', 'short', 'order'];

export function newQuestion(type: QuestionType = 'choice'): Question {
  const base = {
    type,
    text: '',
    imageUrl: '',
    timeLimit: 20,
    points: 1000,
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
    default:
      return { ...base, options: ['', '', '', ''], correct: [0] };
  }
}

// تغيير نوع السؤال مع الاحتفاظ بالحاجات المشتركة
export function changeType(q: Question, type: QuestionType): Question {
  const fresh = newQuestion(type);
  const kept = { text: q.text, imageUrl: q.imageUrl, points: q.points, speedBonus: q.speedBonus };
  const keepOptions = (q.type === 'choice' || q.type === 'order') && (type === 'choice' || type === 'order');
  return {
    ...fresh,
    ...kept,
    options: keepOptions && q.options.length >= 2 ? [...q.options] : fresh.options,
    correct: type === 'choice' ? [0] : fresh.correct,
  };
}

// بيقرا أي سؤال محفوظ (حتى الأسئلة القديمة) ويحوّله للشكل الجديد
export function normalizeQuestion(raw: unknown): Question {
  const r = (raw ?? {}) as Record<string, unknown>;
  const type = TYPES.includes(r.type as QuestionType) ? (r.type as QuestionType) : 'choice';
  const options = Array.isArray(r.options) ? r.options.map((o) => String(o)) : [];
  const correct = Array.isArray(r.correct)
    ? r.correct.filter((n): n is number => typeof n === 'number')
    : typeof r.correctIndex === 'number'
      ? [r.correctIndex]
      : [];
  return {
    type,
    text: String(r.text ?? ''),
    imageUrl: String(r.imageUrl ?? ''),
    options: type === 'truefalse' ? ['صح', 'غلط'] : options,
    correct,
    accepted: Array.isArray(r.accepted) ? r.accepted.map((a) => String(a)) : [],
    timeLimit: Number(r.timeLimit) || 20,
    points: Number(r.points) || 1000,
    speedBonus: r.speedBonus !== false,
    shuffle: !!r.shuffle,
  };
}

export function normalizeSettings(raw: unknown): QuizSettings {
  const r = (raw ?? {}) as Record<string, unknown>;
  return { streakBonus: !!r.streakBonus, showLeaderboard: r.showLeaderboard !== false };
}

export function normalizeQuiz(id: string, raw: Record<string, unknown>): Quiz {
  return {
    id,
    ownerId: String(raw.ownerId ?? ''),
    title: String(raw.title ?? ''),
    questions: Array.isArray(raw.questions) ? raw.questions.map(normalizeQuestion) : [],
    settings: normalizeSettings(raw.settings),
    updatedAt: (raw.updatedAt as Quiz['updatedAt']) ?? null,
  };
}

export function validateQuestion(q: Question, n: number): string | null {
  if (!q.text.trim()) return `سؤال ${n} مالوش نص.`;
  if (q.imageUrl.trim() && !/^https:\/\//i.test(q.imageUrl.trim())) return `لينك الصورة في سؤال ${n} لازم يبدأ بـ https://`;
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

export function cleanQuestion(q: Question): Question {
  return {
    ...q,
    text: q.text.trim(),
    imageUrl: q.imageUrl.trim(),
    options: q.type === 'truefalse' ? ['صح', 'غلط'] : q.type === 'short' ? [] : q.options.map((o) => o.trim()),
    correct:
      q.type === 'choice' || q.type === 'truefalse'
        ? [...new Set(q.correct)].filter((c) => c >= 0 && c < (q.type === 'truefalse' ? 2 : q.options.length)).sort((a, b) => a - b)
        : [],
    accepted: q.type === 'short' ? q.accepted.map((a) => a.trim()).filter(Boolean) : [],
    shuffle: q.type === 'choice' ? q.shuffle : false,
  };
}
