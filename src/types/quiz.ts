import type { AIModel } from "../models.js";
export type DifficultyLevel =
  (typeof import("../models.js").DIFFICULTIES)[number]["id"];
export type QuizDisplayMode = "non_sequential" | "sequential";

export interface GroundingSource {
  title: string;
  url: string;
  snippet?: string;
}

export interface Question {
  id: string;
  question: string;
  options: [string, string, string, string] | string[];
  correctAnswerIndex: number;
  explanation: string;
  groundingSources: GroundingSource[];
  topicCategory?: string;
}

export interface Quiz {
  id: string;
  title: string;
  topic: string;
  summary: string;
  difficulty: DifficultyLevel;
  timeLimitMinutes: number;
  displayMode?: QuizDisplayMode;
  timePerQuestionSeconds?: number;
  languageStyle?: string;
  additionalInstructions?: string;
  createdAt: string;
  questions: Question[];
  groundingQueriesUsed?: string[];
  requestedModel?: AIModel;
  model?: string;
  usedGrounding?: boolean;
}

export interface QuizConfig {
  model?: AIModel;
  topic: string;
  studyMaterial?: string;
  difficulty: DifficultyLevel;
  questionCount: number;
  timeLimitMinutes: number;
  displayMode?: QuizDisplayMode;
  timePerQuestionSeconds?: number;
  languageStyle?: string;
  additionalInstructions?: string;
  language: "id" | "en";
  enableGrounding: boolean;
}

export interface QuizSubmission {
  quizId: string;
  userAnswers: Record<string, number>; // questionId -> chosen index (0-3 or -1 if not answered)
  bookmarkedQuestions: string[];
  timeTakenSeconds: number;
  completedAt: string;
}

export interface QuizResult {
  quiz: Quiz;
  submission: QuizSubmission;
  score: number; // 0-100
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  accuracyPercentage: number;
  evaluationAnalysis: string;
}
