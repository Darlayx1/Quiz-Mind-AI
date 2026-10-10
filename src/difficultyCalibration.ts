import { difficultyName, DIFFICULTIES } from './models.js';
import { questionType } from './questionState.js';
import type { Quiz, QuizResult, QuestionType } from './types/quiz.js';

export interface CalibrationRow {
  topic: string; audience: string; difficulty: string; target: string; mode: string; model: string; type: QuestionType;
  quizCount: number; assessed: number; correct: number; unanswered: number; pending: number; observedCorrectPercent: number | null;
}
/** First submission per quiz limits practice inflation. Raw success includes guessing; never infer population mastery. */
export function difficultyCalibration(history: { quiz: Quiz; lastResult?: QuizResult; attempts?: QuizResult[]; results?: QuizResult[] }[]): CalibrationRow[] {
  const groups = new Map<string, CalibrationRow>();
  const quizzes = new Set<string>();
  for (const item of history) {
    if (quizzes.has(item.quiz.id)) continue;
    quizzes.add(item.quiz.id);
    const submissions = new Map<string, QuizResult>();
    for (const result of [...(item.results || []), ...(item.attempts || []), ...(item.lastResult ? [item.lastResult] : [])]) {
      if (result.quiz.id === item.quiz.id) submissions.set(result.submission.completedAt, result);
    }
    const result = [...submissions.values()].sort((a, b) => a.submission.completedAt.localeCompare(b.submission.completedAt))[0];
    if (!result?.evaluations) continue;
    const q = item.quiz;
    const identity = { topic: q.topic, audience: q.targetAudience || 'Tidak tercatat (kuis lama)', difficulty: difficultyName(q.difficulty),
      target: DIFFICULTIES.find(d => d.id === q.difficulty)?.successLabel || 'Tidak tercatat',
      mode: q.usedGrounding ? q.searchProvider || 'google' : q.groundingFallbackUsed ? 'tanpa web (fallback)' : 'tanpa web', model: q.model || 'Tidak tercatat' };
    const visited = new Set<string>();
    for (const question of q.questions) {
      const type = questionType(question), key = JSON.stringify({ ...identity, type });
      const row = groups.get(key) || { ...identity, type, quizCount: 0, assessed: 0, correct: 0, unanswered: 0, pending: 0, observedCorrectPercent: null };
      if (!visited.has(key)) { row.quizCount++; visited.add(key); }
      const evaluation = result.evaluations[question.id];
      if (!evaluation || !['graded', 'unanswered'].includes(evaluation.status) || evaluation.earnedPoints === null) row.pending++;
      else {
        row.assessed++;
        if (evaluation.status === 'unanswered') row.unanswered++;
        else if (evaluation.earnedPoints === evaluation.maxPoints) row.correct++;
      }
      row.observedCorrectPercent = row.assessed ? Math.round(row.correct / row.assessed * 10000) / 100 : null;
      groups.set(key, row);
    }
  }
  return [...groups.values()];
}
