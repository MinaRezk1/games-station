import type { Timestamp } from 'firebase/firestore';

export type QuestionType = 'choice' | 'truefalse' | 'short' | 'order';
export type SlideType = QuestionType | 'leaderboard';
export type TeamScoring = 'sum' | 'avg';
export type ThemeId = 'classic' | 'midnight' | 'sunrise' | 'garden' | 'ruby' | 'custom';

// كل سلايد في المسابقة: سؤال أو سلايد ترتيب
export interface Question {
  type: SlideType;
  text: string;
  description: string; // وصف أطول تحت السؤال (اختياري)
  imageUrl: string;
  optionImages: string[]; // صورة لكل اختيار (نفس ترتيب options)
  // choice / truefalse: الاختيارات. order: العناصر بالترتيب الصح. short: فاضية
  options: string[];
  // choice / truefalse: أرقام الإجابات الصح
  correct: number[];
  // short: الإجابات المقبولة
  accepted: string[];
  timeLimit: number; // بالثواني
  points: number; // أقصى نقط للسؤال
  minPoints: number; // أقل نقط لو جاوب صح في آخر ثانية
  speedBonus: boolean; // النقط بتقل مع الوقت
  double: boolean; // نقط دابل ×2
  shuffle: boolean; // خلط ترتيب الاختيارات
}

export interface QuizSettings {
  questionType: QuestionType; // نوع الأسئلة في المسابقة كلها
  streakBonus: boolean;
  teamsEnabled: boolean;
  teams: string[];
  teamScoring: TeamScoring;
  theme: ThemeId;
  backgroundUrl: string;
}

export interface Quiz {
  id: string;
  ownerId: string;
  title: string;
  questions: Question[];
  settings: QuizSettings;
  updatedAt?: Timestamp | null;
}

export type RoomStatus = 'lobby' | 'question' | 'reveal' | 'leaderboard' | 'ended';

// السؤال زي ما اللاعبين بيشوفوه: من غير الإجابة الصح، والاختيارات بترتيب العرض
export interface PublicQuestion {
  type: QuestionType;
  number: number; // رقم السؤال (من غير سلايدات الترتيب)
  text: string;
  description: string;
  imageUrl: string;
  options: string[];
  optionImages: string[];
  timeLimit: number;
  points: number;
  double: boolean;
  multi: boolean;
}

export interface RevealData {
  correct: number[]; // choice/truefalse: أرقام الإجابات الصح بترتيب العرض. order: الترتيب الصح بأرقام العرض
  counts: number[]; // choice/truefalse: عدد اللي اختار كل اختيار
  accepted: string[]; // short
  topAnswers: { text: string; count: number; correct: boolean }[]; // short
  correctCount: number;
  answerCount: number;
}

export interface Room {
  hostId: string;
  quizId: string;
  title: string;
  status: RoomStatus;
  currentIndex: number;
  totalQuestions: number;
  question: PublicQuestion | null;
  questionStartedAt: Timestamp | null;
  questionEndsAt: Timestamp | null;
  reveal: RevealData | null;
  teams?: string[];
  teamScoring?: TeamScoring;
}

export interface Player {
  id: string;
  name: string;
  score: number;
  lastPoints?: number;
  lastBonus?: number;
  lastCorrect?: boolean;
  lastQ?: number;
  streak?: number;
  team?: number;
}
