import { GoogleGenAI } from '@google/genai';
import { DEFAULT_MODEL, DIFFICULTIES, modelInfo } from '../models.js';
import { normalizeQuizConfig, quizTimerSeconds, durationLabel } from '../quizConfig.js';
import { Quiz, QuizConfig, Question, GroundingSource } from '../types/quiz.js';
import { KeyPool, PoolError, errorKind } from '../keyPool.js';
import { geminiQuotaMessage } from '../geminiQuota.js';

import { QuizGenerationError } from './generationError.js';
export { QuizGenerationError, isRetryableGenerationError } from './generationError.js';
import { buildPrompt, validateAndSanitizeQuestion, extractJsonFromResponse, quizSchemaFor } from './quizPipeline.js';
export { buildPrompt, validateAndSanitizeQuestion, extractJsonFromResponse } from './quizPipeline.js';
export { nextQuizBatch } from './quizPipeline.js';

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

/** One bounded provider call; retry/key selection belong to the workspace orchestrator. */
export async function generateQuizBatch(input: QuizConfig, apiKey: string, existing: string[] = [], signal?: AbortSignal): Promise<Quiz> {
  const config = normalizeQuizConfig(input);
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 75000, retryOptions: { attempts: 1 } } });
  const model = config.model ?? DEFAULT_MODEL;
  const gemma = model === 'gemma-4-31b-it';
  const prompt = buildPrompt(config, config.questionCount, existing);
  const structured = modelInfo(model)?.structured === true;
  const schema = quizSchemaFor(config.questionType);
  try {
    const response = await ai.models.generateContent({ model,
      contents: gemma ? buildGemmaPrompt(config, config.questionCount, existing) : prompt.userPrompt,
      config: { abortSignal: signal, ...(gemma ? {} : { systemInstruction: prompt.systemInstruction }),
        ...(structured ? { responseMimeType: 'application/json', responseJsonSchema: {
          ...schema, properties: { ...schema.properties, questions: {
            ...schema.properties.questions, minItems: config.questionCount, maxItems: config.questionCount,
          } },
        } } : {}),
        maxOutputTokens: 8192,
        ...(!gemma && config.enableGrounding ? { tools: [{ googleSearch: {} }] } : {}) },
    });
    signal?.throwIfAborted();
    const candidate = response.candidates?.[0];
    if (candidate?.finishReason === 'MAX_TOKENS') throw new QuizGenerationError('Respons AI terpotong sebelum kuis selesai. Kurangi jumlah soal per permintaan atau panjang materi.', 502, 'INCOMPLETE_RESPONSE');
    if (response.promptFeedback?.blockReason || candidate?.finishReason && candidate.finishReason !== 'STOP') {
      throw new QuizGenerationError('Respons kuis dihentikan oleh penyedia AI. Sesuaikan topik atau materi sebelum mencoba kembali.', 422, 'RESPONSE_BLOCKED');
    }
    if (!response.text?.trim()) throw new QuizGenerationError('Model AI mengembalikan respons kosong. Kuis belum dapat dibuat.', 502, 'EMPTY_RESPONSE');
    const parsed = extractJsonFromResponse(response.text || '');
    const sources: GroundingSource[] = (response.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
      .filter(chunk => chunk.web?.uri).map(chunk => ({ title: chunk.web!.title || 'Referensi', url: chunk.web!.uri! }));
    const previous = new Set(existing.map(q => q.trim().toLowerCase()));
    const questions: Question[] = [];
    for (const raw of Array.isArray(parsed.questions) ? parsed.questions : []) {
      const question = validateAndSanitizeQuestion(raw, questions.length, config.topic, sources, config.questionType);
      if (question && !previous.has(question.question.trim().toLowerCase())) {
        question.id = crypto.randomUUID(); question.maxPoints = config.pointsByType?.[config.questionType!] ?? 1;
        if (question.type === 'multiple_select' || question.type === 'ordering') question.scoringMode = config.partialCredit ? 'partial' : 'exact';
        questions.push(question); previous.add(question.question.trim().toLowerCase());
      }
    }
    if (questions.length !== config.questionCount) throw new QuizGenerationError('Jumlah soal valid belum sesuai. Batch dihentikan untuk mencegah hasil tidak lengkap.', 502, 'INCOMPLETE_QUESTION_COUNT');
    return { id: crypto.randomUUID(), title: String(parsed.title || `Kuis: ${config.topic}`), summary: String(parsed.summary || ''),
      ...config, schemaVersion: 2, createdAt: new Date().toISOString(), questions, requestedModel: model, model,
      usedGrounding: !gemma && config.enableGrounding, groundingQueriesUsed: response.candidates?.[0]?.groundingMetadata?.webSearchQueries || [] };
  } catch (error) {
    if (signal?.aborted) {
      if (signal.reason?.name === 'TimeoutError') throw classifyApiError(signal.reason, model);
      signal.throwIfAborted();
    }
    throw classifyApiError(error, model);
  }
}

/**
 * Klasifikasi error API Google ke dalam HTTP status code dan pesan yang jelas.
 */
export function classifyApiError(err: any, modelId: string): QuizGenerationError {
  if (err instanceof QuizGenerationError || err instanceof PoolError) {
    return err;
  }

  const msg = String(err?.message || err);
  const status = Number(err?.status ?? err?.error?.code ?? (typeof err?.code === 'number' ? err.code : undefined)
    ?? /\b(400|401|403|404|429|500|502|503|504)\b/.exec(msg)?.[1]);
  const code = String(err?.code ?? err?.error?.status ?? '');
  const isGemma = modelId === 'gemma-4-31b-it';
  const modelLabel = isGemma ? 'Gemma 4 31B' : 'Gemini';

  // Use the HTTP status first: numbers inside quota values are not status codes.
  if (errorKind(err).kind === 'quota') {
    return new QuizGenerationError(geminiQuotaMessage(err, modelId), 429, 'RATE_LIMIT_EXCEEDED');
  }

  if (status === 400 || /INVALID_ARGUMENT/.test(msg + code)) {
    return new QuizGenerationError(`Permintaan ke ${modelLabel} tidak valid. Periksa materi dan pengaturan kuis.`, 400, 'INVALID_ARGUMENT');
  }

  // 401 Unauthorized
  if (status === 401 || /API_KEY_INVALID|API key not valid|UNAUTHENTICATED/i.test(msg + code)) {
    return new QuizGenerationError(
      `API key tidak diterima atau tidak valid untuk ${modelLabel}. Periksa API key Anda di Google AI Studio.`,
      401,
      'UNAUTHORIZED'
    );
  }

  // 403 Forbidden
  if (status === 403 || /PERMISSION_DENIED/i.test(msg + code)) {
    return new QuizGenerationError(
      `Akses ke model ${modelLabel} ditolak (403 Forbidden). Pastikan API key Anda memiliki izin akses untuk model ini di Google AI Studio.`,
      403,
      'FORBIDDEN'
    );
  }

  // 404 Not Found
  if (status === 404 || /NOT_FOUND|is not found|is no longer available/i.test(msg + code)) {
    return new QuizGenerationError(
      `Model ${modelLabel} (${modelId}) tidak ditemukan atau tidak tersedia untuk akun/wilayah proyek Anda (404 Not Found).`,
      404,
      'MODEL_NOT_FOUND'
    );
  }

  // 503 High Demand / Service Unavailable
  if (status === 503 || /UNAVAILABLE|high demand|overloaded/i.test(msg + code)) {
    return new QuizGenerationError(
      `Layanan ${modelLabel} sedang mengalami lonjakan permintaan (503 Service Unavailable). Silakan klik "Coba Lagi" dalam beberapa detik.`,
      503,
      'HIGH_DEMAND'
    );
  }

  // 504 Deadline Exceeded / Timeout
  if (status === 504 || err?.name === 'TimeoutError' || /DEADLINE_EXCEEDED|timeout|ETIMEDOUT|UND_ERR_HEADERS_TIMEOUT/i.test(msg + code)) {
    return new QuizGenerationError(
      `Permintaan pembuatan kuis dengan ${modelLabel} melebihi batas waktu eksekusi (504 Gateway Timeout). Silakan coba lagi.`,
      504,
      'TIMEOUT'
    );
  }

  // 500 Internal Error
  if (status === 500 || /INTERNAL/i.test(msg + code)) {
    return new QuizGenerationError(
      `Terjadi kesalahan internal pada server Google AI saat memproses permintaan ${modelLabel} (500 Internal Server Error). Silakan coba lagi.`,
      500,
      'PROVIDER_INTERNAL_ERROR'
    );
  }

  // Network connection error
  if (/failed to fetch|fetch failed|load failed|NetworkError|ECONNRESET|ENOTFOUND|network/i.test(msg + code)) {
    return new QuizGenerationError(
      `Gagal terhubung ke server Google AI saat memanggil ${modelLabel}. Periksa koneksi internet dan apakah browser, VPN, atau ekstensi memblokir permintaan ke Google AI.`,
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
    }, { signal, provider: 'gemini', model: String(params.model) + (params.config?.tools?.length ? ':grounding' : ''), onNotice: options.onNotice, allowKeyFallback: params.config?.tools?.length ? false : undefined, maxAttempts:Math.max(1,Math.min(params.config?.tools?.length ? 2 : modelCandidates.length > 1 && String(params.model) === selectedModel ? 2 : 3,3-(options.attemptBudget?.calls??0))) });
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
    let batchGrounded = false;
    const extractedSources: GroundingSource[] = [];

    if (options.pool) {
      const grounded = config.enableGrounding && !isGemma;
      const prompt = buildPrompt(config, currentBatchCount, validQuestions.map(q => q.question));
      const contents = isGemma ? buildGemmaPrompt(config, currentBatchCount, validQuestions.map(q => q.question)) : prompt.userPrompt;
      const allowWithoutWeb = options.pool.collection.settings.allowGroundingFallback;
      const candidates = modelCandidates.flatMap(model => !grounded || modelInfo(model)?.grounding === true
        ? [{ model, tools: grounded }]
        : allowWithoutWeb ? [{ model, tools: false }] : []);
      if (grounded && allowWithoutWeb) {
        for (const model of modelCandidates) if (!candidates.some(candidate => candidate.model === model && !candidate.tools)) candidates.push({ model, tools: false });
      }
      const send = (model: string, tools: boolean) => requestContent({ model,
        contents: model.startsWith('gemma') ? buildGemmaPrompt(config, currentBatchCount, validQuestions.map(q => q.question)) : contents,
        config: model.startsWith('gemma') ? {} : { systemInstruction: prompt.systemInstruction, ...(tools ? { tools: [{ googleSearch: {} }] } : {}) } });
      for (const [index, { model, tools }] of candidates.entries()) {
        try {
          rawResponse = await send(model, tools);
          usedModelName = model; batchGrounded = tools; lastError = null; break;
        } catch (error: any) {
          signal.throwIfAborted(); lastError = error;
          const modelTransient = errorKind(lastError).kind === 'temporary' || (lastError?.code === 'POOL_UNAVAILABLE' && [...options.pool.health.values()].some(h => h.scope === model + (tools ? ':grounding' : '') && h.reason === 'Layanan sementara bermasalah'));
          const quotaLimited = lastError?.code === 'POOL_QUOTA' || lastError?.status === 429;
          const next = candidates[index + 1];
          if (!next || batchCalls >= 3 || (lastError?.status !== 404 && lastError?.code !== 'POOL_MODEL_ACCESS' && !modelTransient && !quotaLimited)) throw classifyApiError(lastError,model);
          options.onNotice?.(next.tools || !grounded
            ? quotaLimited ? 'Kuota model pilihan sedang dibatasi. Mencoba model cadangan sesuai pengaturan Anda.' : 'Model pilihan belum tersedia. Mencoba model cadangan sesuai pengaturan Anda.'
            : 'Referensi web belum tersedia. Mencoba melanjutkan tanpa referensi web sesuai pengaturan Anda.');
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
        batchGrounded = true;
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

    if (rawResponse.candidates?.[0]?.finishReason === 'MAX_TOKENS') throw new QuizGenerationError('Respons Gemini terpotong sebelum selesai.', 502, batchGrounded ? 'WEB_SEARCH_TRUNCATED' : 'INCOMPLETE_RESPONSE');
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

    if (batchGrounded) {
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
