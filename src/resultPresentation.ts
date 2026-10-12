import type { Question, QuestionEvaluation } from './types/quiz.js';

export type ReviewStatus = 'correct' | 'partial' | 'incorrect' | 'unanswered' | 'pending';
export type ReviewFilter = 'all' | ReviewStatus;
export const reviewFilters: { id: ReviewFilter; label: string }[] = [
  { id: 'all', label: 'Semua' }, { id: 'correct', label: 'Benar' },
  { id: 'partial', label: 'Sebagian benar' }, { id: 'incorrect', label: 'Salah' },
  { id: 'unanswered', label: 'Belum dijawab' }, { id: 'pending', label: 'Belum final' },
];
// Presentation only: final values and totals remain owned by scoring.ts.
export function reviewStatus(e: QuestionEvaluation): ReviewStatus {
  if (e.status === 'unanswered') return 'unanswered';
  if (e.status !== 'graded' || e.earnedPoints === null) return 'pending';
  if (e.earnedPoints === e.maxPoints) return 'correct';
  return e.earnedPoints === 0 ? 'incorrect' : 'partial';
}
export function reviewStatusLabel(e: QuestionEvaluation): string {
  if (e.status === 'needs_review') return 'Perlu tinjauan';
  if (e.status === 'failed') return 'Evaluasi gagal';
  if (e.status === 'cancelled') return 'Evaluasi dibatalkan';
  if (e.status === 'evaluating') return 'Sedang dievaluasi';
  const status = reviewStatus(e);
  return status === 'pending' ? 'Menunggu evaluasi' : reviewFilters.find(f => f.id === status)!.label;
}
export function matchesReviewFilter(e: QuestionEvaluation, filter: ReviewFilter): boolean {
  return filter === 'all' || reviewStatus(e) === filter;
}

export function questionScore(value: number | null, maxPoints: number): number | null {
  return value === null || maxPoints <= 0 ? null : Math.round(value / maxPoints * 10000) / 100;
}

export function questionStatusLabel(q: Question, e: QuestionEvaluation): string {
  const binary = q.type === undefined || q.type === 'single_choice' || q.type === 'true_false'
    || (q.type === 'multiple_select' || q.type === 'ordering') && q.scoringMode === 'exact'
    || q.type === 'short_answer' && !q.allowPartial;
  return reviewStatusLabel(e) + (binary ? '' : ` · ${questionScore(e.earnedPoints, e.maxPoints) ?? '—'}/100`);
}
