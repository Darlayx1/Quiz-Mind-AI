import { QUESTION_TYPES, type QuestionType } from './types/quiz.js';

export interface Composition {
  mode: 'single' | 'mixed'; type: QuestionType;
  distribution: Partial<Record<QuestionType, number>>;
  points: Partial<Record<QuestionType, number>>;
  partialCredit: boolean; times?: Partial<Record<QuestionType, number>>;
}
export const defaultComposition: Composition = {
  mode: 'single', type: 'single_choice', distribution: { single_choice: 5, multiple_select: 5 }, points: {}, partialCredit: false,
};
export const activeQuestionTypes = (value: Composition) => QUESTION_TYPES.filter(type =>
  value.mode === 'single' ? type === value.type : (value.distribution[type] ?? 0) > 0);
export const allocatedCount = (value: Composition) => Object.values(value.distribution).reduce((sum, n) => sum + (n ?? 0), 0);
export const effectiveCount = (value: Composition, target: number) => value.mode === 'mixed' ? allocatedCount(value) : target;

// Canonical type order makes remainder allocation stable, regardless of selection order.
export function equalDistribution(types: QuestionType[], total: number): Composition['distribution'] {
  const active = QUESTION_TYPES.filter(type => types.includes(type));
  if (!active.length || !Number.isInteger(total) || total < active.length || total > 100) return {};
  return Object.fromEntries(active.map((type, index) => [type, Math.floor(total / active.length) + (index < total % active.length ? 1 : 0)]));
}
export function compositionError(value: Composition, target: number): string {
  if (!Number.isInteger(target) || target < 1 || target > 100) return 'Masukkan total soal berupa bilangan bulat antara 1–100.';
  if (!QUESTION_TYPES.includes(value.type)) return 'Pilih tipe soal yang tersedia.';
  if (value.mode !== 'mixed') return '';
  if (Object.entries(value.distribution).some(([type, n]) => !QUESTION_TYPES.includes(type as QuestionType) || !Number.isInteger(n) || Number(n) < 0 || Number(n) > 100))
    return 'Jumlah setiap tipe harus bilangan bulat antara 0–100.';
  const total = allocatedCount(value);
  if (!total) return 'Pilih minimal satu tipe soal untuk kuis campuran.';
  if (total > 100) return 'Alokasi melebihi 100 soal. Kurangi jumlah per tipe.';
  if (total !== target) return `Alokasi ${total} dari ${target} soal. Atur jumlah per tipe atau pilih Bagi merata.`;
  return '';
}
