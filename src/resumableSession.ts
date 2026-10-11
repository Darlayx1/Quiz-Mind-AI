import type { HistoryItem, QuizProgress } from './workspace/types.js';
import { validateAnswer } from './questionState.js';

export function resumableQuiz(history: HistoryItem[], progress: QuizProgress | null) {
  if (!progress) return null;
  const quiz = history.find(item => item?.quiz?.id === progress.quizId)?.quiz;
  if (!quiz || !Array.isArray(quiz.questions) || !quiz.questions.length || !Number.isInteger(progress.currentIndex) || progress.currentIndex < 0 || progress.currentIndex >= quiz.questions.length
    || !Number.isFinite(progress.startedAt) || !Number.isFinite(progress.deadline) || !Array.isArray(progress.bookmarks)
    || !progress.answers || typeof progress.answers !== 'object' || Array.isArray(progress.answers)) return null;
  if (Object.keys(progress.answers).some(id => !quiz.questions.some(q => q.id === id)) || quiz.questions.some(q => !validateAnswer(q, progress.answers[q.id]))) return null;
  return quiz;
}
