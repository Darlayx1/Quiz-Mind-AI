import { DIFFICULTIES } from './models.js';
import { defaultComposition, type Composition } from './questionComposition.js';
import type { DifficultyLevel, QuizDisplayMode } from './types/quiz.js';
import type { DraftAttachment } from './materialIngestion.js';

export interface ComposerDraft extends Record<string, unknown> {
  topic: string; studyMaterial: string; attachments: DraftAttachment[];
  difficulty: DifficultyLevel; countChoice: number | 'custom'; customCount: string;
  displayMode: QuizDisplayMode; totalMinutes: string; perQuestionSeconds: string; unlimited: boolean;
  language: 'id' | 'en'; languageStyle: string; additionalInstructions: string; composition: Composition;
  preset?: string;
}
export function restoreComposerDraft(saved?: Record<string, unknown> | null): ComposerDraft {
  const text = (key: string, fallback = '') => typeof saved?.[key] === 'string' ? saved[key] as string : fallback;
  const legacy = ({ beginner: 'easy', advanced: 'hard', expert: 'master' } as Record<string, string>)[text('difficulty')] || text('difficulty');
  return { ...saved, topic: text('topic'), studyMaterial: text('studyMaterial'),
    attachments: Array.isArray(saved?.attachments) ? saved.attachments.filter(a => a && typeof a.id === 'string' && typeof a.name === 'string').map(a => {
      if (a.status === 'processing') return { ...a, status: 'error', error: 'Pembacaan terputus. Hapus dan pilih kembali file ini.' };
      if (a.status === 'ready' && typeof a.text !== 'string') return { ...a, status: 'error', error: 'Isi lampiran tersimpan tidak valid. Hapus dan unggah kembali.' };
      if (!['ready', 'error'].includes(a.status)) return { ...a, status: 'error', error: 'Status lampiran tidak valid. Hapus dan unggah kembali.' };
      if (a.status === 'error' && typeof a.error !== 'string') return { ...a, error: 'Lampiran belum dapat dibaca. Hapus dan unggah kembali.' };
      return a;
    }) : [],
    difficulty: DIFFICULTIES.find(d => d.id === legacy)?.id ?? 'moderate',
    countChoice: [5, 10, 15, 20, 'custom'].includes(saved?.countChoice as number) ? saved!.countChoice as ComposerDraft['countChoice'] : 10,
    customCount: text('customCount', '25'), displayMode: saved?.displayMode === 'sequential' ? 'sequential' : 'non_sequential',
    totalMinutes: text('totalMinutes', '15'), perQuestionSeconds: text('perQuestionSeconds', '60'), unlimited: saved?.unlimited === true,
    language: saved?.language === 'en' ? 'en' : 'id', languageStyle: text('languageStyle'), additionalInstructions: text('additionalInstructions'),
    composition: validComposition(saved?.composition) ? saved.composition as Composition : structuredClone(defaultComposition),
  };
}
function validComposition(value: unknown): value is Composition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const composition = value as Composition;
  return ['single', 'mixed'].includes(composition.mode) && typeof composition.type === 'string' && !!composition.distribution && typeof composition.distribution === 'object'
    && !Array.isArray(composition.distribution) && !!composition.points && typeof composition.points === 'object' && !Array.isArray(composition.points);
}
export const QUICK_STARTS = [
  { id: 'quick', label: 'Latihan Cepat', description: '5 soal · 5 menit', difficulty: 'easy', count: 5, minutes: '5', type: 'single_choice' },
  { id: 'exam', label: 'Persiapan Ujian', description: '20 soal · 30 menit', difficulty: 'hard', count: 20, minutes: '30', type: 'single_choice' },
  { id: 'concept', label: 'Pendalaman Konsep', description: '10 soal · tanpa timer', difficulty: 'moderate', count: 10, minutes: '15', type: 'short_answer' },
] as const;
export function applyQuickStart(draft: ComposerDraft, id: string): ComposerDraft {
  const preset = QUICK_STARTS.find(p => p.id === id);
  if (!preset) return draft;
  return { ...draft, preset: id, difficulty: preset.difficulty, countChoice: preset.count, totalMinutes: preset.minutes,
    perQuestionSeconds: '60', unlimited: id === 'concept', displayMode: 'non_sequential',
    composition: { ...draft.composition, mode: 'single', type: preset.type } };
}
// Preserve source boundaries within the existing textual generation contract.
export function composerSources(draft: ComposerDraft) {
  const sections: string[] = [];
  if (draft.topic.trim().length > 300) sections.push('[Instruksi utama lengkap]\n' + draft.topic.trim());
  if (draft.studyMaterial.trim()) sections.push('[Konteks materi]\n' + draft.studyMaterial.trim());
  for (const file of draft.attachments) if (file.status === 'ready' && file.text?.trim()) {
    sections.push('[Lampiran: ' + file.name + (file.kind === 'image' ? ' · teks hasil OCR' : '') + ']\n' + file.text.trim());
  }
  const material = sections.join('\n\n');
  const pending = draft.attachments.some(a => a.status === 'processing');
  const failed = draft.attachments.some(a => a.status === 'error');
  const usable = !!(draft.topic.trim() || draft.studyMaterial.trim() || draft.attachments.some(a => a.status === 'ready' && a.text?.trim()));
  return { topic: draft.topic.trim().slice(0, 300) || draft.attachments.find(a => a.status === 'ready')?.name.replace(/\.[^.]+$/, '').slice(0, 300) || 'Kuis dari materi belajar',
    material, usable, error: pending ? 'Tunggu hingga lampiran selesai dibaca.' : failed ? 'Hapus atau pilih ulang lampiran yang gagal dibaca.'
      : material.length > 15000 ? 'Gabungan materi melebihi 15.000 karakter. Kurangi konteks atau lampiran.' : !usable ? 'Tulis topik, tambahkan konteks, atau unggah materi terlebih dahulu.' : '' };
}
