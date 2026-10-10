import { DEFAULT_MODEL, type AIModel } from '../models.js';
import type { Quiz, QuizConfig, QuizResult, Question, StoredAnswer, EvaluationSettings } from '../types/quiz.js';
import { defaultEvaluationSettings } from '../evaluationSettings.js';

export type KeyStatus = 'untested' | 'available' | 'invalid' | 'quota' | 'unavailable';
export interface ApiKeyRecord {
  id: string; label: string; suffix: string; fingerprint: string; enabled: boolean;
  priority: number; status: KeyStatus; testedAt?: string; successes: number; failures: number;
}
export interface Preferences {
  allowGroundingFallback?: boolean;
  model: AIModel; keyId: string | null; grounding: boolean; maxAttempts: number; fallback: boolean;
  evaluation?: EvaluationSettings;
}
export interface HistoryItem { quiz: Quiz; lastResult?: QuizResult; attempts?: QuizResult[]; savedAt: string }
export interface QuizProgress {
  quizId: string; currentIndex: number; answers: Record<string, StoredAnswer>; bookmarks: string[]; attemptId?: string;
  startedAt: number; deadline: number;
}
export interface Activity {
  id: string; at: string; label: string; model: string; status: 'success' | 'failed' | 'cancelled';
  durationMs: number; keyId?: string; detail?: string;
}
export interface GenerationJob {
  id: string; config: QuizConfig; preferences: Preferences; questions: Question[];
  quiz?: Quiz; status: 'running' | 'interrupted' | 'completed' | 'cancelled'; createdAt: string;
}
export interface WorkspaceData {
  preferences: Preferences; history: HistoryItem[]; activity: Activity[];
  progress: QuizProgress | null; draft: Record<string, unknown> | null; job: GenerationJob | null;
}
export const emptyWorkspace = (): WorkspaceData => ({
  preferences: { model: DEFAULT_MODEL, keyId: null, grounding: true, allowGroundingFallback: false, maxAttempts: 3, fallback: false, evaluation: { ...defaultEvaluationSettings } },
  history: [], activity: [], progress: null, draft: null, job: null,
});
export function sanitizeWorkspace(value: Partial<WorkspaceData> | null): WorkspaceData {
  const defaults = emptyWorkspace();
  return { ...defaults, ...value, preferences: { ...defaults.preferences, ...value?.preferences },
    history: Array.isArray(value?.history) ? value.history : [],
    activity: Array.isArray(value?.activity) ? value.activity : [] };
}
export interface WorkspaceSnapshot { revision: number; data: WorkspaceData }
export interface WorkspaceRepository {
  scope: string;
  load(): Promise<WorkspaceSnapshot>;
  save(data: WorkspaceData, revision: number): Promise<number>;
  keys(): Promise<ApiKeyRecord[]>;
  putKey(input: { id?: string; label: string; secret?: string; enabled?: boolean; priority?: number }): Promise<void>;
  removeKey(id: string): Promise<void>;
  recordKeyOutcome(id: string, status: KeyStatus): Promise<void>;
}
export function keyStatus(error: unknown): KeyStatus {
  const status = Number((error as { status?: number })?.status);
  const message = String((error as Error)?.message || error);
  if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid/i.test(message)) return 'invalid';
  if (status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(message)) return 'quota';
  return 'unavailable';
}
export function availableKeys(keys: ApiKeyRecord[], preferences: Preferences) {
  const sorted = keys.filter(k => k.enabled).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  if (!preferences.keyId) return sorted;
  const selected = sorted.find(k => k.id === preferences.keyId);
  return selected ? [selected, ...(preferences.fallback ? sorted.filter(k => k.id !== selected.id) : [])] : [];
}
