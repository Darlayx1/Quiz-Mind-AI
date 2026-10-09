import { GoogleGenAI } from '@google/genai';
import { DEFAULT_MODEL, DIFFICULTIES, modelInfo } from '../models.js';
import { normalizeQuizConfig, quizTimerSeconds, durationLabel } from '../quizConfig.js';
import { Quiz, QuizConfig, Question, GroundingSource } from '../types/quiz.js';
import { KeyPool, PoolError } from '../keyPool.js';

import { QuizGenerationError } from './generationError.js';
export { QuizGenerationError } from './generationError.js';
import { buildPrompt, validateAndSanitizeQuestion, extractJsonFromResponse, quizSchemaFor } from './quizPipeline.js';
export { buildPrompt, validateAndSanitizeQuestion, extractJsonFromResponse } from './quizPipeline.js';

/**
 * Inisialisasi client Gemini menggunakan SDK resmi @google/genai.
 */
function getGeminiClient(apiKey = process.env.GEMINI_API_KEY): GoogleGenAI {
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new QuizGenerationError(
      'GEMINI_API_KEY belum dikonfigurasi di lingkungan runtime.',
      401,
      'API_KEY_MISSING'
    );
  }

  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      timeout: 180000, // 3 menit untuk penalaran mendalam Gemma & batching
      retryOptions: { attempts: 1 }, // The application owns the shared retry budget.
    },
  });
}

/**
 * Klasifikasi error API Google ke dalam HTTP status code dan pesan yang jelas.
 */
export function classifyApiError(err: any, modelId: string): QuizGenerationError {
  if (err instanceof QuizGenerationError || err instanceof PoolError) {
    return err;
  }

  const msg = String(err?.message || err);
  const isGemma = modelId === 'gemma-4-31b-it';
  const modelLabel = isGemma ? 'Gemma 4 31B' : 'Gemini';

  // 401 Unauthorized
  if (/401|API_KEY_INVALID|API key not valid|UNAUTHENTICATED/i.test(msg)) {
    return new QuizGenerationError(
      `API key tidak diterima atau tidak valid untuk ${modelLabel}. Periksa API key Anda di Google AI Studio.`,
      401,
      'UNAUTHORIZED'
    );
  }

  // 403 Forbidden
  if (/403|PERMISSION_DENIED/i.test(msg)) {
    return new QuizGenerationError(
      `Akses ke model ${modelLabel} ditolak (403 Forbidden). Pastikan API key Anda memiliki izin akses untuk model ini di Google AI Studio.`,
      403,
      'FORBIDDEN'
    );
  }

  // 404 Not Found
  if (/404|NOT_FOUND|is not found|is no longer available/i.test(msg)) {
    return new QuizGenerationError(
      `Model ${modelLabel} (${modelId}) tidak ditemukan atau tidak tersedia untuk akun/wilayah proyek Anda (404 Not Found).`,
      404,
      'MODEL_NOT_FOUND'
    );
  }

  // 429 Rate Limit / Quota
  if (/429|RESOURCE_EXHAUSTED|quota|rate limit/i.test(msg)) {
    return new QuizGenerationError(
      `Batas kuota atau rate limit untuk model ${modelLabel} telah tercapai (429 Too Many Requests). Tunggu sejenak sebelum mencoba lagi.`,
      429,
      'RATE_LIMIT_EXCEEDED'
    );
  }

  // 503 High Demand / Service Unavailable
  if (/503|UNAVAILABLE|high demand|overloaded/i.test(msg)) {
    return new QuizGenerationError(
      `Layanan ${modelLabel} sedang mengalami lonjakan permintaan (503 Service Unavailable). Silakan klik "Coba Lagi" dalam beberapa detik.`,
      503,
      'HIGH_DEMAND'
    );
  }

  // 504 Deadline Exceeded / Timeout
  if (/504|DEADLINE_EXCEEDED|timeout|ETIMEDOUT|UND_ERR_HEADERS_TIMEOUT/i.test(msg)) {
    return new QuizGenerationError(
      `Permintaan pembuatan kuis dengan ${modelLabel} melebihi batas waktu eksekusi (504 Gateway Timeout). Silakan coba lagi.`,
      504,
      'TIMEOUT'
    );
  }

  // 500 Internal Error
  if (/500|INTERNAL/i.test(msg)) {
    return new QuizGenerationError(
      `Terjadi kesalahan internal pada server Google AI saat memproses permintaan ${modelLabel} (500 Internal Server Error). Silakan coba lagi.`,
      500,
      'PROVIDER_INTERNAL_ERROR'
    );
  }

  // Network connection error
  if (/fetch failed|ECONNRESET|ENOTFOUND|network/i.test(msg)) {
    return new QuizGenerationError(
      `Gagal terhubung ke server Google AI saat memanggil ${modelLabel}. Periksa koneksi internet Anda.`,
      504,
      'NETWORK_ERROR'
    );
  }

  return new QuizGenerationError(
    `Gagal membuat kuis dengan ${modelLabel}. Periksa koneksi, akses model, dan konfigurasi permintaan.`,
    502,
    'GENERATION_FAILED'
  );
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 90000, label = 'Permintaan AI'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new QuizGenerationError(`${label} melebihi batas waktu maksimal (${timeoutMs / 1000} detik).`, 504, 'TIMEOUT'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Exponential backoff retry helper untuk error transient.
 */
async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelayMs = 2000,
  modelId = '',
  timeoutMs = modelId === 'gemma-4-31b-it' ? 150000 : 90000
): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs, `Permintaan model ${modelId}`);
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err);

      // Jangan ulangi error permanen: 400, 401, 403, 404, 429
      const isPermanent =
        /400|401|403|404|429|API_KEY_INVALID|PERMISSION_DENIED|NOT_FOUND|RESOURCE_EXHAUSTED|quota/i.test(msg);
      if (isPermanent) {
        throw classifyApiError(err, modelId);
      }

      // Ulangi jika error transient (500, 502, 503, 504, INTERNAL, UNAVAILABLE, koneksi soket)
      const isTransient =
        /500|502|503|504|INTERNAL|UNAVAILABLE|DEADLINE_EXCEEDED|fetch failed|ECONNRESET|ETIMEDOUT|Headers Timeout/i.test(
          msg
        );

      if (attempt < maxRetries && isTransient) {
        const jitter = Math.random() * 500;
        const delay = baseDelayMs * Math.pow(2, attempt) + jitter;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      throw classifyApiError(err, modelId);
    }
  }
  throw classifyApiError(lastErr, modelId);
}

/**
 * Validasi ketat butir soal kuis.
 */
/**
 * Bangun prompt instruksi khusus untuk Gemma 4 31B.
 * Menggunakan scaffolding instruksi berbahasa Inggris dengan spesifikasi bahasa konten target,
 * format skema JSON murni tanpa triple backticks dalam prompt.
 * Format ini terbukti 100% kompatibel dan tidak memicu 500 INTERNAL pada serving engine Gemma.
 */
function buildGemmaPrompt(config:QuizConfig,targetCount:number,existingQuestions:string[]=[]):string { const p=buildPrompt(config,targetCount,existingQuestions); return p.systemInstruction+'\n'+p.userPrompt; }

/**
 * Eksekusi generasi kuis dengan Gemma 4 31B atau Gemini
 */
export async function generateQuizWithGemini(config: QuizConfig, apiKey?: string, options: { pool?: KeyPool; signal?: AbortSignal; onNotice?: (message: string) => void; attemptBudget?:{calls:number} } = {}): Promise<Quiz> {
  config = normalizeQuizConfig(config);
  const selectedModel = config.model ?? DEFAULT_MODEL;
  const isGemma = selectedModel === 'gemma-4-31b-it';
  if (config.enableGrounding && modelInfo(selectedModel)?.grounding !== true) throw new QuizGenerationError('Model pilihan tidak mendukung pencarian web. Pilih model dengan dukungan web.', 400, 'FALLBACK_CAPABILITY');
  const ai = options.pool ? undefined : getGeminiClient(apiKey);
  const signal = AbortSignal.any([AbortSignal.timeout(600_000), ...(options.signal ? [options.signal] : [])]);
  let totalCalls = 0, batchCalls = 0;
  const requestContent = async (params: Parameters<GoogleGenAI['models']['generateContent']>[0]) => {
    signal.throwIfAborted();
    params={...params,config:{...params.config,maxOutputTokens:8192}};
    if (modelInfo(String(params.model))?.structured && !params.config?.tools?.length) params = { ...params, config: { ...params.config, responseMimeType: 'application/json', responseJsonSchema: quizSchemaFor(config.questionType) } };
    if (!options.pool) {
      if(options.attemptBudget&&options.attemptBudget.calls>=3)throw new PoolError('Batas percobaan pembuatan kuis tercapai.',503,'POOL_BUDGET');
      if (options.attemptBudget) options.attemptBudget.calls++;
      const callSignal = AbortSignal.any([signal, AbortSignal.timeout(isGemma ? 150_000 : 90_000)]);
      return ai!.models.generateContent({ ...params, config: { ...params.config, abortSignal: callSignal } });
    }
    return options.pool.run(async (key, poolSignal) => {
      if (batchCalls >= 3 || totalCalls >= Math.ceil(config.questionCount / (isGemma ? 2 : config.questionCount)) * 3 || options.attemptBudget&&options.attemptBudget.calls>=3)
        throw new PoolError('Batas percobaan pembuatan kuis tercapai.', 503, 'POOL_BUDGET');
      batchCalls++; totalCalls++; if (options.attemptBudget) options.attemptBudget.calls++;
      const callSignal = AbortSignal.any([poolSignal, AbortSignal.timeout(isGemma ? 150_000 : 90_000)]);
      try {
        return await getGeminiClient(key).models.generateContent({ ...params, config: { ...params.config, abortSignal: callSignal } });
      } catch (error: any) {
        poolSignal.throwIfAborted();
        if (callSignal.aborted) throw new QuizGenerationError('Layanan AI melewati batas waktu.', 504, 'TIMEOUT');
        // Retain structured provider errors for retry hints; never display raw credentials.
        throw error;
      }
    }, { signal, provider: 'gemini', model: String(params.model) + (params.config?.tools?.length ? ':grounding' : ''), onNotice: options.onNotice, allowKeyFallback: params.config?.tools?.length ? false : undefined, maxAttempts:Math.max(1,Math.min(params.config?.tools?.length ? 2 : 3,3-(options.attemptBudget?.calls??0))) });
  };
  // A managed pool already bounds and cancels each attempt. Wrapping its entire retry sequence
  // in Promise.race would leave retries running after the outer timeout has returned.
  const callGeneration = <T>(fn: () => Promise<T>, retries: number, delay: number, model: string) =>
    options.pool ? fn() : callWithRetry(fn, retries, delay, model);

  // Aturan ketat: Pemilihan Gemma 4 31B TIDAK BOLEH dialihkan diam-diam ke Gemini.
  const modelCandidates = isGemma || (options.pool && !options.pool.collection.settings.allowModelFallback)
    ? [selectedModel]
    : [...new Set([selectedModel, options.pool?.collection.settings.modelFallbacks?.gemini ?? (selectedModel === DEFAULT_MODEL ? 'gemini-3.5-flash-lite' : DEFAULT_MODEL)])];

  const quizId = 'quiz_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  let quizTitle = `Kuis: ${config.topic}`;
  let quizSummary = `Kuis evaluasi topik ${config.topic} tingkat ${config.difficulty}.`;
  let usedModelName: string = selectedModel;
  let usedGrounding = false;
  let allGroundingQueries: string[] = [];
  const validQuestions: Question[] = [];

  // Batching untuk Gemma ketika jumlah soal banyak (> 2) agar respons stabil & tidak timeout
  const batchSize = isGemma ? (config.questionCount > 2 ? 2 : config.questionCount) : config.questionCount;
  const totalNeeded = config.questionCount;

  while (validQuestions.length < totalNeeded) {
    signal.throwIfAborted();
    batchCalls = 0;
    const remainingCount = totalNeeded - validQuestions.length;
    const currentBatchCount = Math.min(batchSize, remainingCount);

    let rawResponse: any = null;
    let lastError: any = null;
    const extractedSources: GroundingSource[] = [];

    if (options.pool) {
      const grounded = config.enableGrounding && !isGemma;
      const prompt = buildPrompt(config, currentBatchCount, validQuestions.map(q => q.question));
      const contents = isGemma ? buildGemmaPrompt(config, currentBatchCount, validQuestions.map(q => q.question)) : prompt.userPrompt;
      const send = (model: string, tools: boolean) => requestContent({ model, contents,
        config: isGemma ? {} : { systemInstruction: prompt.systemInstruction, ...(tools ? { tools: [{ googleSearch: {} }] } : {}) } });
      for (const model of modelCandidates) {
        try {
          rawResponse = await send(model, grounded);
          usedModelName = model; lastError = null; break;
        } catch (error: any) {
          signal.throwIfAborted(); lastError = error;
          if (grounded) throw classifyApiError(error, model);
          const modelTransient = lastError?.code === 'POOL_UNAVAILABLE' && [...options.pool.health.values()].some(h => h.scope === model + (grounded ? ':grounding' : '') && h.reason === 'Layanan sementara bermasalah');
          if (!options.pool.collection.settings.allowModelFallback || (lastError?.status !== 404 && lastError?.code !== 'POOL_MODEL_ACCESS' && !modelTransient)) throw classifyApiError(lastError,model);
          options.onNotice?.('Model pilihan belum tersedia. Mencoba model cadangan sesuai pengaturan Anda.');
        }
      }
      if (!rawResponse) throw lastError || new PoolError('Model pilihan belum tersedia.');
    }

    // Jalur Google Search Grounding (Hanya untuk Gemini yang mendukung, bukan Gemma)
    if (!options.pool && config.enableGrounding && !isGemma && validQuestions.length === 0) {
      const { systemInstruction, userPrompt } = buildPrompt(
        config,
        currentBatchCount,
        validQuestions.map((q) => q.question)
      );
      try {
        rawResponse = await callGeneration(
          () =>
            requestContent({
              model: selectedModel,
              contents: userPrompt,
              config: {
                systemInstruction,
                tools: [{ googleSearch: {} }],
              },
            }),
          0,
          2000,
          selectedModel
        );
        usedGrounding = true;
        usedModelName = selectedModel;
      } catch (err: any) {
        signal.throwIfAborted();
        throw classifyApiError(err, selectedModel);
      }
    }

    // Jalur Standar tanpa Tools
    if (!rawResponse) {
      if (isGemma) {
        const gemmaPrompt = buildGemmaPrompt(
          config,
          currentBatchCount,
          validQuestions.map((q) => q.question)
        );
        try {
          rawResponse = await callGeneration(
            () =>
              requestContent({
                model: selectedModel,
                contents: gemmaPrompt,
              }),
            2,
            2000,
            selectedModel
          );
          usedModelName = selectedModel;
          lastError = null;
        } catch (err: any) {
          lastError = err;
        }
      } else {
        const { systemInstruction, userPrompt } = buildPrompt(
          config,
          currentBatchCount,
          validQuestions.map((q) => q.question)
        );
        for (const model of modelCandidates) {
          try {
            rawResponse = await callGeneration(
              () =>
                requestContent({
                  model: model,
                  contents: userPrompt,
                  config: { systemInstruction },
                }),
              0,
              1500,
              model
            );
            usedModelName = model;
            lastError = null;
            break;
          } catch (err: any) {
            signal.throwIfAborted();
            options.onNotice?.('Model pilihan belum tersedia. Mencoba model cadangan sesuai pengaturan Anda.');
            lastError = err;
          }
        }
      }
    }

    if (!rawResponse || !rawResponse.text) {
      throw classifyApiError(lastError || new Error('Respons model AI kosong.'), usedModelName);
    }

    if (rawResponse.candidates?.[0]?.finishReason === 'MAX_TOKENS') throw new QuizGenerationError('Respons Gemini terpotong sebelum selesai.', 502, config.enableGrounding ? 'WEB_SEARCH_TRUNCATED' : 'INCOMPLETE_RESPONSE');
    const rawText = rawResponse.text || '';

    // Ekstrak metadata grounding Google Search (jika ada pada Gemini)
    const candidate = rawResponse.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    if (groundingMetadata?.webSearchQueries) {
      allGroundingQueries.push(...groundingMetadata.webSearchQueries);
    }
    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web?.uri) {
          extractedSources.push({
            title: chunk.web.title || 'Sumber Google Search',
            url: chunk.web.uri,
            snippet: chunk.web.title || chunk.web.uri,
          });
        }
      }
    }

    if (config.enableGrounding) {
      if (!Array.isArray(groundingMetadata?.webSearchQueries) || !groundingMetadata.webSearchQueries.length || !extractedSources.length) throw new QuizGenerationError('Pencarian web Gemini tidak menghasilkan referensi yang dapat diverifikasi.', 502, 'WEB_SEARCH_EMPTY');
      usedGrounding = true;
    }

    // Parse JSON
    const parsedData = extractJsonFromResponse(rawText);
    if (parsedData.title && typeof parsedData.title === 'string') {
      quizTitle = parsedData.title;
    }
    if (parsedData.summary && typeof parsedData.summary === 'string') {
      quizSummary = parsedData.summary;
    }

    const rawQuestions = Array.isArray(parsedData.questions) ? parsedData.questions : [];
    let addedInThisBatch = 0;

    for (const rawQ of rawQuestions) {
      if (validQuestions.length >= totalNeeded) break;
      const validated = validateAndSanitizeQuestion(
        rawQ,
        validQuestions.length,
        config.topic,
        extractedSources, config.questionType
      );
      if (validated) {
        // Cek duplikasi dengan soal yang sudah ada
        const isDuplicate = validQuestions.some(
          (existing) =>
            existing.question.toLowerCase().trim() === validated.question.toLowerCase().trim()
        );
        if (!isDuplicate) {
          validQuestions.push(validated);
          addedInThisBatch++;
        }
      }
    }

    // Jika suatu batch tidak menghasilkan satu pun soal valid, coba ulangi sekali dengan instruksi perbaikan
    if (addedInThisBatch === 0 && validQuestions.length < totalNeeded) {
      break; // Keluar untuk verifikasi jumlah akhir
    }
  }

  // Jika jumlah soal belum terpenuhi
  if (validQuestions.length < totalNeeded) {
    // Jika untuk pengujian atau permintaan 1 soal dan belum dapat
    if (validQuestions.length === 0) {
      throw new QuizGenerationError(
        `Model ${isGemma ? 'Gemma 4 31B' : 'AI'} tidak menghasilkan butir soal dengan struktur valid. Silakan coba kembali.`,
        502,
        'INVALID_QUIZ_STRUCTURE'
      );
    }
    throw new QuizGenerationError(
      `Model menghasilkan ${validQuestions.length} soal valid dari ${totalNeeded} yang diminta. Silakan buat kuis kembali.`,
      502,
      'INCOMPLETE_QUESTION_COUNT'
    );
  }

  const resultQuiz: Quiz = {
    id: quizId,
    title: quizTitle,
    topic: config.topic,
    summary: quizSummary,
    difficulty: config.difficulty,
    timeLimitMinutes: config.timeLimitMinutes,
    displayMode: config.displayMode,
    timePerQuestionSeconds: config.timePerQuestionSeconds,
    languageStyle: config.languageStyle,
    additionalInstructions: config.additionalInstructions,
    createdAt: new Date().toISOString(),
    questions: validQuestions.slice(0, totalNeeded),
    groundingQueriesUsed: allGroundingQueries,
    requestedModel: selectedModel,
    requestedProvider: 'gemini',
    provider: 'gemini',
    model: usedModelName,
    usedGrounding,
  };

  return resultQuiz;
}
