import type { AIModel, AIProvider } from "../models.js";
export type DifficultyLevel =
  (typeof import("../models.js").DIFFICULTIES)[number]["id"];
export type QuizDisplayMode = "non_sequential" | "sequential";

export interface GroundingSource {
  title: string;
  url: string;
  snippet?: string;
}

export type QuestionType = 'single_choice' | 'multiple_select' | 'true_false' | 'short_answer' | 'essay' | 'matching' | 'ordering';
export const QUESTION_TYPES: QuestionType[] = ['single_choice','multiple_select','true_false','short_answer','essay','matching','ordering'];
export interface Item { id: string; text: string }
export interface RubricCriterion { id: string; description: string; weight: number; anchors: string[] }
export interface EvaluationSettings {
  enabled: boolean; followGenerator: boolean; provider: AIProvider; model: string;
  shortAnswerMode: 'hybrid' | 'ai'; allowKeyFallback: boolean; allowModelFallback: boolean;
  fallbackModel: string; allowProviderFallback: boolean; fallbackProvider: AIProvider; fallbackProviderModel: string; reviewFlagged: boolean;
}
interface BaseQuestion {
  id: string;
  question: string;
  options?: string[];
  correctAnswerIndex?: number;
  explanation: string;
  groundingSources: GroundingSource[];
  topicCategory?: string;
  maxPoints?: number;
}
interface Choice extends BaseQuestion { options: string[]; optionIds?: string[]; correctAnswerIndex: number }
export interface SingleChoiceQuestion extends Choice { type?: 'single_choice' }
export interface MultipleSelectQuestion extends Choice { type: 'multiple_select'; correctOptionIds: string[]; scoringMode: 'exact' | 'partial' }
export interface TrueFalseQuestion extends BaseQuestion { type: 'true_false'; correctValue: boolean }
export interface ShortAnswerQuestion extends BaseQuestion { type: 'short_answer'; acceptedAnswers: string[]; referenceAnswer: string; requiredConcepts: string[]; maxLength: number; caseSensitive: boolean; allowPartial: boolean }
export interface EssayQuestion extends BaseQuestion { type: 'essay'; referenceAnswer: string; rubric: RubricCriterion[]; maxLength: number }
export interface MatchingQuestion extends BaseQuestion { type: 'matching'; leftItems: Item[]; rightItems: Item[]; correctPairs: Record<string,string> }
export interface OrderingQuestion extends BaseQuestion { type: 'ordering'; items: Item[]; correctOrder: string[]; scoringMode: 'exact' | 'partial' }
export type Question = SingleChoiceQuestion | MultipleSelectQuestion | TrueFalseQuestion | ShortAnswerQuestion | EssayQuestion | MatchingQuestion | OrderingQuestion;
export type AnswerValue =
 | { type:'single_choice'; selectedOptionId:string|null }
 | { type:'multiple_select'; selectedOptionIds:string[] }
 | { type:'true_false'; value:boolean|null }
 | { type:'short_answer'|'essay'; text:string }
 | { type:'matching'; pairs:Record<string,string> }
 | { type:'ordering'; orderedItemIds:string[]; confirmed:boolean };
export type StoredAnswer = AnswerValue | number;
export interface QuestionEvaluation {
 questionId:string; status:'unanswered'|'pending'|'evaluating'|'graded'|'needs_review'|'failed'|'cancelled';
 method:'deterministic'|'ai'|'manual'; earnedPoints:number|null; maxPoints:number; feedback:string;
 criteria?:{criterionId:string;level:number;evidence:string;feedback:string}[]; reviewFlags?:string[];
 proposedPoints?:number; provider?:AIProvider; model?:string; requestedProvider?:AIProvider; requestedModel?:string;
 usage?:{inputTokens:number;outputTokens:number}; evaluatedAt?:string; attemptCount?:number; errorCode?:string; manualReason?:string;
 previous?:Omit<QuestionEvaluation,'previous'>[]; revision?:number;
}

export interface Quiz {
  webCheckedAt?: string;
  groundingFallbackUsed?: boolean;
  generationWarnings?: string[];
  generationBatches?: {provider?:AIProvider;model?:string;questionIds:string[]}[];
  schemaVersion?: 2;
  evaluationSettings?: EvaluationSettings;
  timePerQuestionByType?: Partial<Record<QuestionType,number>>;
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
  requestedProvider?: AIProvider;
  provider?: AIProvider;
  model?: string;
  usedGrounding?: boolean;
}

export interface QuizConfig {
  questionType?: QuestionType;
  questionDistribution?: Partial<Record<QuestionType,number>>;
  pointsByType?: Partial<Record<QuestionType,number>>;
  partialCredit?: boolean;
  timePerQuestionByType?: Partial<Record<QuestionType,number>>;
  evaluationSettings?: EvaluationSettings;
  provider?: AIProvider;
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
  userAnswers: Record<string, StoredAnswer>;
  attemptId?: string; submissionId?: string; schemaVersion?: 2; startedAt?: string; submitReason?: 'manual'|'timer';
  bookmarkedQuestions: string[];
  timeTakenSeconds: number;
  completedAt: string;
}

export interface QuizResult {
  evaluations?: Record<string,QuestionEvaluation>;
  finalScore?: number|null; partialCount?:number; pendingCount?:number; earnedPoints?:number; totalPoints?:number;
  status?:'completed'|'partial'|'evaluating'; evaluationSettings?:EvaluationSettings;
  quiz: Quiz;
  submission: QuizSubmission;
  score: number; // 0-100
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  accuracyPercentage: number;
  evaluationAnalysis: string;
}
