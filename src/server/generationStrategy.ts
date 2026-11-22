import { DEFAULT_EFFORT, normalizeEffort, resolveApiThinkingLevel, type ApiThinkingLevel, type ThinkingEffort } from '../models.js';
import type { QuizConfig } from '../types/quiz.js';

export const GENERATION_VARIANTS = ['baseline-high', 'focused-high', 'focused-medium'] as const;
export type GenerationVariant = typeof GENERATION_VARIANTS[number];
export type ThinkingLevel = ApiThinkingLevel;

export function computeMaxOutputTokens(
  structured: boolean,
  questionCount: number,
  thinkingLevel?: ApiThinkingLevel,
  purpose: 'generate' | 'evaluate' | 'probe' = 'generate'
): number {
  if (purpose === 'probe') return 1024;
  if (thinkingLevel === 'XHIGH') return 65536;
  if (structured) {
    if (thinkingLevel === 'LOW' || thinkingLevel === 'MINIMAL') {
      return Math.max(16384, Math.min(65536, questionCount * 900 + 8192));
    }
    if (thinkingLevel === 'MEDIUM') {
      return Math.max(24576, Math.min(65536, questionCount * 1100 + 12288));
    }
    return Math.max(32768, Math.min(65536, questionCount * 1200 + 16384));
  }
  if (thinkingLevel === 'MINIMAL' || thinkingLevel === 'LOW') {
    return Math.max(8192, Math.min(32768, questionCount * 800 + 4096));
  }
  return Math.max(24576, Math.min(32768, questionCount * 1200 + 16384));
}

/** Production honors user-configured effort (defaulting to 'high') with safe per-model mapping.
 * Internal benchmark experiments remain isolated to Gemini 3.8 Flash. */
export function generationStrategy(
  model: string,
  experiment?: GenerationVariant,
  effort: ThinkingEffort = DEFAULT_EFFORT,
  purpose: 'generate' | 'evaluate' | 'probe' = 'generate'
) {
  if (experiment !== undefined && (!GENERATION_VARIANTS.includes(experiment) || model !== 'gemini-3.8-flash')) {
    throw Object.assign(new Error('Eksperimen hanya mendukung varian terverifikasi untuk Gemini 3.8 Flash.'),
      { status: 400, code: 'INVALID_EXPERIMENT' });
  }
  if (experiment !== undefined) {
    return {
      variant: experiment,
      effort: (experiment === 'focused-medium' ? 'medium' : 'high') as ThinkingEffort,
      thinkingLevel: (experiment === 'focused-medium' ? 'MEDIUM' : 'HIGH') as ThinkingLevel,
      focused: experiment === 'focused-high' || experiment === 'focused-medium',
    };
  }
  const normalizedEffort = normalizeEffort(effort, model);
  const thinkingLevel = resolveApiThinkingLevel(model, normalizedEffort, purpose);
  return {
    variant: 'baseline-high' as GenerationVariant,
    effort: normalizedEffort,
    thinkingLevel,
    focused: true,
  };
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
