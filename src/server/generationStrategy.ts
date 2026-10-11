import type { QuizConfig } from '../types/quiz.js';

export const GENERATION_VARIANTS = ['baseline-high', 'focused-high', 'focused-medium'] as const;
export type GenerationVariant = typeof GENERATION_VARIANTS[number];
export type ThinkingLevel = 'HIGH' | 'MEDIUM';

/** Production stays on the existing contract. Experiments are internal call
 * options, never normalized from quiz config, preferences or an HTTP body. */
export function generationStrategy(model: string, experiment?: GenerationVariant) {
  if (experiment !== undefined && (!GENERATION_VARIANTS.includes(experiment) || model !== 'gemini-3.8-flash')) {
    throw Object.assign(new Error('Eksperimen hanya mendukung varian terverifikasi untuk Gemini 3.8 Flash.'),
      { status: 400, code: 'INVALID_EXPERIMENT' });
  }
  return { variant: experiment ?? 'baseline-high' as GenerationVariant,
    thinkingLevel: (experiment === 'focused-medium' ? 'MEDIUM' : 'HIGH') as ThinkingLevel,
    focused: experiment === 'focused-high' || experiment === 'focused-medium' };
}

/** Expose risks for benchmark coverage, not a shortcut to lowering reasoning.
 * A topic's actual complexity cannot be reliably inferred from a difficulty label. */
export function generationRiskFactors(config: QuizConfig): string[] {
  const text = [config.topic, config.additionalInstructions, config.studyMaterial].filter(Boolean).join('\n');
  const types = Object.entries(config.questionDistribution ?? { [config.questionType ?? 'single_choice']: config.questionCount })
    .filter(([, count]) => Number(count) > 0).map(([type]) => type);
  const risks: string[] = [];
  if (['hard', 'very_hard', 'master', 'grand_master', 'extreme'].includes(config.difficulty)) risks.push('advanced-difficulty');
  if (types.includes('essay')) risks.push('essay-rubric');
  if (types.length > 1) risks.push('mixed-types');
  if (types.some(type => type === 'matching' || type === 'ordering')) risks.push('relational-constraints');
  if (/\b(hitung|perhitungan|bukti|pembuktian|derivasi|calculate|proof|derive|newton|integral|probabilitas)\b/i.test(text)) risks.push('multi-step-reasoning');
  if (/\b(medis|klinis|diagnosis|dosis|obat|medical|clinical|hukum|legal|pajak|investasi)\b/i.test(text)) risks.push('high-stakes-domain');
  if ((config.studyMaterial?.length ?? 0) > 12000) risks.push('long-material');
  if (config.enableGrounding) risks.push('external-evidence');
  if (config.questionCount > 20) risks.push('large-output');
  return risks;
}
