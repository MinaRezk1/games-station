import type { Timestamp } from 'firebase/firestore';

export interface Question {
  text: string;
  options: string[];
  correctIndex: number;
  timeLimit: number; // بالثواني
}

export interface Quiz {
  id: string;
  ownerId: string;
  title: string;
  questions: Question[];
  updatedAt?: Timestamp | null;
}

export type RoomStatus = 'lobby' | 'question' | 'reveal' | 'leaderboard' | 'ended';

// السؤال زي ما اللاعبين بيشوفوه: من غير الإجابة الصح
export interface PublicQuestion {
  text: string;
  options: string[];
  timeLimit: number;
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
  correctIndex: number | null;
  answerCounts: number[] | null;
}

export interface Player {
  id: string;
  name: string;
  score: number;
  lastPoints?: number;
  lastCorrect?: boolean;
  lastQ?: number;
}
