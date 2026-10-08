import { modelInfo, providerName, type AIProvider } from '../models.js';
import { normalizeQuizConfig } from '../quizConfig.js';
import { type QuizConfig } from '../types/quiz.js';
import { QuizGenerationError } from './generationError.js';
import { generateQuizWithGroq, type GenerationOptions } from './groqService.js';
import { listProviderModels } from './providerClient.js';

export const providerAdapters = {
  gemini: { generate: async (config: QuizConfig, key?: string, options?: GenerationOptions) => (await import('./geminiService.js')).generateQuizWithGemini(config,key,options), listModels: (key: string, signal: AbortSignal) => listProviderModels('gemini',key,signal) },
  groq: { generate: generateQuizWithGroq, listModels: (key: string, signal: AbortSignal) => listProviderModels('groq',key,signal) },
};
export async function generateQuiz(input: QuizConfig, apiKey?: string, options: GenerationOptions = {}) {
  const config = normalizeQuizConfig(input), provider = config.provider!;
  const signal = AbortSignal.any([AbortSignal.timeout(600_000), ...(options.signal ? [options.signal] : [])]);
  const execute = (provider: AIProvider, config: QuizConfig) => providerAdapters[provider].generate(config, apiKey, { ...options, signal });
  try { return await execute(provider,config); }
  catch (error: any) {
    signal.throwIfAborted();
    const settings = options.pool?.collection.settings;
    if (!settings?.allowProviderFallback || settings.fallbackProvider === provider || ['POOL_BUDGET','NETWORK_ERROR','INVALID_JSON','INVALID_QUIZ_STRUCTURE','INCOMPLETE_QUESTION_COUNT'].includes(error.code) || !([401,402,403,404,429,500,502,503,504].includes(error.status))) throw error;
    const fallbackProvider = settings.fallbackProvider!, fallbackModel = settings.fallbackModel!;
    if (!options.pool!.collection.keys.some(key => key.provider === fallbackProvider && key.enabled)) throw error;
    const supportsGrounding = modelInfo(fallbackModel)?.grounding === true;
    if (config.enableGrounding && !supportsGrounding && !settings.allowGroundingFallback) throw new QuizGenerationError('Penyedia cadangan tidak mendukung referensi web yang diminta. Periksa pengaturan cadangan.', 503, 'FALLBACK_CAPABILITY');
    options.onNotice?.(`Beralih dari ${providerName(provider)} ke ${providerName(fallbackProvider)} sesuai pengaturan. Materi dikirim ke penyedia cadangan.${config.enableGrounding && !supportsGrounding ? ' Melanjutkan tanpa pencarian web.' : ''}`);
    const quiz = await execute(fallbackProvider, { ...config, provider: fallbackProvider, model: fallbackModel, enableGrounding: config.enableGrounding && supportsGrounding });
    return { ...quiz, requestedProvider: provider, requestedModel: config.model };
  }
}
