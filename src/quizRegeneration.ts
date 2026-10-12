import type { Quiz, QuizConfig, QuestionType } from './types/quiz.js';
import type { Preferences } from './workspace/types.js';
import { normalizeQuizConfig } from './quizConfig.js';
import { questionType } from './questionState.js';

export function quizRegeneration(quiz: Quiz, current: Preferences): { config: QuizConfig; preferences: Preferences; exact: boolean } {
  if (quiz.generationConfig) return { config: structuredClone(quiz.generationConfig), preferences: structuredClone(quiz.generationPreferences ?? { ...current, model: quiz.generationConfig.model ?? current.model, grounding: quiz.generationConfig.enableGrounding }), exact: true };
  // Legacy guest quizzes retain config fields on the quiz; older account quizzes may not.
  const old = quiz as Quiz & Partial<QuizConfig>;
  const distribution: Partial<Record<QuestionType, number>> = {}, points: Partial<Record<QuestionType, number>> = {};
  for (const q of quiz.questions) { const type = questionType(q); distribution[type] = (distribution[type] ?? 0) + 1; points[type] ??= q.maxPoints ?? 1; }
  const config = normalizeQuizConfig({
    topic: quiz.topic, studyMaterial: old.studyMaterial, difficulty: quiz.difficulty, questionCount: quiz.questions.length,
    questionType: old.questionType ?? questionType(quiz.questions[0]), questionDistribution: old.questionDistribution ?? distribution,
    pointsByType: old.pointsByType ?? points, partialCredit: old.partialCredit ?? quiz.questions.some(q => (q.type === 'multiple_select' || q.type === 'ordering') && q.scoringMode === 'partial'),
    displayMode: quiz.displayMode, timeLimitMinutes: quiz.timeLimitMinutes, timePerQuestionSeconds: quiz.timePerQuestionSeconds,
    timePerQuestionByType: quiz.timePerQuestionByType, language: old.language ?? 'id', languageStyle: quiz.languageStyle,
    additionalInstructions: quiz.additionalInstructions, evaluationSettings: quiz.evaluationSettings,
    model: quiz.requestedModel ?? quiz.model ?? current.model, provider: quiz.requestedProvider ?? quiz.provider ?? 'gemini',
    enableGrounding: old.enableGrounding ?? quiz.usedGrounding ?? current.grounding,
  });
  return { config, preferences: { ...structuredClone(current), model: config.model!, grounding: config.enableGrounding, searchProvider: quiz.searchProvider ?? current.searchProvider, evaluation: config.evaluationSettings ?? current.evaluation }, exact: false };
}
