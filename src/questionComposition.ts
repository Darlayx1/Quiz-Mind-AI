import { QUESTION_TYPES, type QuestionType } from './types/quiz.js';

export interface Composition {
  mode: 'single' | 'mixed'; type: QuestionType;
  distribution: Partial<Record<QuestionType, number>>;
  points: Partial<Record<QuestionType, number>>;
  partialCredit: boolean; times?: Partial<Record<QuestionType, number>>;
  singleCounts?: Partial<Record<QuestionType, number>>;
}
export const defaultComposition: Composition = {
  mode: 'single', type: 'single_choice', distribution: { single_choice: 5, multiple_select: 5 }, points: {}, partialCredit: false,
};
export const activeQuestionTypes = (value: Composition) => QUESTION_TYPES.filter(type =>
  value.mode === 'single' ? type === value.type : (value.distribution[type] ?? 0) > 0);
export const allocatedCount = (value: Composition) => Object.values(value.distribution).reduce((sum, n) => sum + (n ?? 0), 0);
export const effectiveCount = (value: Composition, target: number) => value.mode === 'mixed' ? allocatedCount(value) : value.singleCounts?.[value.type] ?? target;
export const maximumPoints = (value: Composition, target: number) => activeQuestionTypes(value).reduce((sum, type) =>
  sum + (value.mode === 'single' ? effectiveCount(value, target) : value.distribution[type] ?? 0) * (value.points[type] ?? 1), 0);
export function typeSettingsError(value: Composition, type: QuestionType, timed: boolean): string {
  const points = value.points[type] ?? 1, seconds = value.times?.[type];
  if (!Number.isInteger(points) || points < 1 || points > 20) return 'Bobot harus bilangan bulat antara 1–20 poin.';
  if (timed && seconds !== undefined && (!Number.isInteger(seconds) || seconds < 0 || seconds > 600)) return 'Waktu harus bilangan bulat antara 0–600 detik; kosong mengikuti waktu umum.';
  return '';
}

// Canonical type order makes remainder allocation stable, regardless of selection order.
export function equalDistribution(types: QuestionType[], total: number): Composition['distribution'] {
  const active = QUESTION_TYPES.filter(type => types.includes(type));
  if (!active.length || !Number.isInteger(total) || total < active.length || total > 100) return {};
  return Object.fromEntries(active.map((type, index) => [type, Math.floor(total / active.length) + (index < total % active.length ? 1 : 0)]));
}
export function compositionError(value: Composition, target: number): string {
  if (!QUESTION_TYPES.includes(value.type)) return 'Pilih tipe soal yang tersedia.';
  if (value.mode !== 'mixed') {
    const count = effectiveCount(value, target);
    return !Number.isInteger(count) || count < 1 || count > 100 ? 'Masukkan jumlah soal berupa bilangan bulat antara 1–100.' : '';
  }
  if (Object.entries(value.distribution).some(([type, n]) => !QUESTION_TYPES.includes(type as QuestionType) || !Number.isInteger(n) || Number(n) < 0 || Number(n) > 100))
    return 'Jumlah setiap tipe harus bilangan bulat antara 0–100.';
  const total = allocatedCount(value);
  if (!total) return 'Isi jumlah lebih dari nol pada minimal satu tipe soal.';
  if (total > 100) return 'Alokasi melebihi 100 soal. Kurangi jumlah per tipe.';
  return '';
}
