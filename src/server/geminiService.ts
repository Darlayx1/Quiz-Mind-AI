import { GoogleGenAI } from '@google/genai';
import { DEFAULT_MODEL, DIFFICULTIES } from '../models.js';
import { normalizeQuizConfig, quizTimerSeconds, durationLabel } from '../quizConfig.js';
import { Quiz, QuizConfig, Question, GroundingSource } from '../types/quiz.js';
import { sanitizeAndParseJson } from './jsonParser.js';

export class QuizGenerationError extends Error {
  constructor(
    message: string,
    public status: number = 500,
    public code: string = 'GENERATION_ERROR'
  ) {
    super(message);
    this.name = 'QuizGenerationError';
  }
}

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
    },
  });
}

/**
 * Klasifikasi error API Google ke dalam HTTP status code dan pesan yang jelas.
 */
export function classifyApiError(err: any, modelId: string): QuizGenerationError {
  if (err instanceof QuizGenerationError) {
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
    `Gagal membuat kuis dengan ${modelLabel}: ${msg}`,
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
function validateAndSanitizeQuestion(
  q: any,
  idx: number,
  topic: string,
  extractedSources: GroundingSource[]
): Question | null {
  if (!q || typeof q !== 'object') return null;

  const questionText = typeof q.question === 'string' ? q.question.trim() : '';
  if (!questionText || questionText.length < 5) return null;

  // Pastikan tepat 4 opsi
  let rawOptions: string[] = [];
  if (Array.isArray(q.options)) {
    rawOptions = q.options.map((o: any) => String(o ?? '').trim()).filter(Boolean);
  }

  // Jika opsi kurang dari 4 atau duplikat ekstrem, tolak daripada mengarang opsi palsu
  if (rawOptions.length < 4) return null;
  const options = rawOptions.slice(0, 4) as [string, string, string, string];

  // Validasi index jawaban benar
  let correctIndex = Number(q.correctAnswerIndex);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
    return null;
  }

  // Penjelasan faktual
  const explanation =
    typeof q.explanation === 'string' && q.explanation.trim().length > 0
      ? q.explanation.trim()
      : 'Penalaran akademis mendalam terhadap konsep butir soal.';

  // Sumber referensi: HANYA sumber nyata terverifikasi (dari Google Grounding atau rujukan ilmiah spesifik)
  // TIDAK menggunakan URL pencarian palsu atau tautan fiktif!
  const questionSources: GroundingSource[] = [...extractedSources];

  if (Array.isArray(q.groundingReferences)) {
    for (const ref of q.groundingReferences) {
      if (ref?.url && typeof ref.url === 'string' && /^https?:\/\//i.test(ref.url)) {
        questionSources.push({
          title: String(ref.title || 'Referensi Akademis'),
          url: ref.url,
          snippet: String(ref.title || ref.url),
        });
      }
    }
  }

  if (q.referenceTitle && typeof q.referenceTitle === 'string' && q.referenceTitle.trim().length > 0) {
    questionSources.push({
      title: q.referenceTitle.trim(),
      url: '',
      snippet: `Rujukan ilmiah: ${q.referenceTitle.trim()}`,
    });
  }

  return {
    id: `q_${idx + 1}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    question: questionText,
    options,
    correctAnswerIndex: correctIndex,
    explanation,
    groundingSources: questionSources.slice(0, 3),
    topicCategory: q.topicCategory ? String(q.topicCategory).trim() : topic,
  };
}

/**
 * Bangun prompt instruksi kuis
 */
function buildPrompt(
  config: QuizConfig,
  targetCount: number,
  existingQuestions: string[] = []
): { systemInstruction: string; userPrompt: string } {
  const isEn = config.language === 'en';
  const level = DIFFICULTIES.find((item) => item.id === config.difficulty)!;
  const difficultyDesc = `${level.name}: ${level.description}`;

  const langPrompt = isEn
    ? 'All questions, options, explanations, and summaries MUST be written in fluent, academic English.'
    : 'Semua pertanyaan, pilihan jawaban, penjelasan, dan ringkasan WAJIB ditulis dalam Bahasa Indonesia yang baik, lugas, dan akurat.';

  const systemInstruction = `Anda adalah Academic Assessment Engine tingkat tinggi.
Tugas Anda:
1. Menghasilkan butir soal kuis pilihan ganda yang bermutu tinggi, berbobot, presisi, dan terverifikasi secara ilmiah.
2. Setiap butir soal WAJIB memiliki tepat 4 opsi pilihan (A, B, C, D) yang jelas, masuk akal, dan tidak ambigu, dengan 1 kunci jawaban benar dan 3 distractor (pengecoh) realistis.
3. Hindari pertanyaan ambigu atau pilihan ganda dengan jawaban ganda.
4. Terapkan penalaran mendalam pada bagian pembahasan (explanation): jelaskan konsep mengapa kunci jawaban benar dan mengapa opsi pengecoh keliru.
5. ${langPrompt}
6. JANGAN membuat URL tautan internet fiktif atau palsu. Jika ada rujukan akademis nyata (buku teks/jurnal), sebutkan judul/nama rujukan pada "referenceTitle". Jika tidak ada, kosongkan string "".
7. Output WAJIB berupa blok JSON murni yang valid tanpa teks pembuka atau penutup di luar blok JSON.`;

  let userPrompt = `Buatkan kuis pilihan ganda dengan spesifikasi berikut:
- Topik Utama: "${config.topic}"
- Tingkat Kesulitan: ${difficultyDesc}
- Jumlah Soal: ${targetCount} butir soal
- Tampilan: ${config.displayMode === 'sequential' ? 'Satu soal per langkah' : 'Semua soal dengan navigasi bebas'}
- Durasi: ${durationLabel(quizTimerSeconds(config))}${quizTimerSeconds(config) > 0 ? (config.displayMode === 'sequential' ? ' per soal' : ' total kuis') : ''}
- Gaya bahasa: ${config.languageStyle || 'Jelas, baku, dan akademis'}
`;

  if (existingQuestions.length > 0) {
    userPrompt += `\nPENTING: Butir-butir soal berikut sudah dibuat sebelumnya, JANGAN membuat soal yang serupa atau berulang:\n${existingQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n`;
  }

  if (config.additionalInstructions) {
    userPrompt += `\nPreferensi tambahan pengguna (ikuti selama tetap sesuai topik, bahasa, tingkat kesulitan, jumlah soal, akurasi, dan format JSON di atas):\n${config.additionalInstructions}\n`;
  }

  if (config.studyMaterial && config.studyMaterial.trim().length > 0) {
    userPrompt += `\nReferensi Catatan / Materi Bahan Bacaan Khusus:\n"""\n${config.studyMaterial.trim().slice(0, 15000)}\n"""\nGali butir-butir soal utama berdasarkan materi referensi di atas dengan ketat!\n`;
  }

  userPrompt += `
Format respon JSON yang WAJIB dihasilkan:
\`\`\`json
{
  "title": "${isEn ? 'Academic Quiz Title' : 'Judul Kuis yang Menarik dan Akademis'}",
  "topic": "${config.topic}",
  "summary": "${isEn ? 'Brief 1-2 sentence focus summary.' : 'Ringkasan 1-2 kalimat mengenai fokus materi kuis ini.'}",
  "questions": [
    {
      "question": "Kalimat pertanyaan yang jelas, lugas, dan terstruktur?",
      "options": [
        "Pilihan A",
        "Pilihan B",
        "Pilihan C",
        "Pilihan D"
      ],
      "correctAnswerIndex": 0,
      "explanation": "Penalaran mendalam: Mengapa opsi ini benar secara faktual, dan mengapa opsi lainnya keliru atau kurang tepat.",
      "topicCategory": "Sub-kategori topik soal",
      "referenceTitle": ""
    }
  ]
}
\`\`\`
Pastikan index "correctAnswerIndex" adalah angka 0, 1, 2, atau 3. Variasikan posisi kunci jawaban agar seimbang.
Hasilkan tepat ${targetCount} butir soal sekarang.
`;

  return { systemInstruction, userPrompt };
}

/**
 * Bangun prompt instruksi khusus untuk Gemma 4 31B.
 * Menggunakan scaffolding instruksi berbahasa Inggris dengan spesifikasi bahasa konten target,
 * format skema JSON murni tanpa triple backticks dalam prompt.
 * Format ini terbukti 100% kompatibel dan tidak memicu 500 INTERNAL pada serving engine Gemma.
 */
function buildGemmaPrompt(
  config: QuizConfig,
  targetCount: number,
  existingQuestions: string[] = []
): string {
  const isEn = config.language === 'en';
  const level = DIFFICULTIES.find((item) => item.id === config.difficulty)!;
  const difficultyDesc = `${level.name}: ${level.description}`;

  const langInstruction = isEn
    ? 'All questions, options, explanations, and summaries MUST be written in fluent, academic English.'
    : 'All questions, options, explanations, and summaries MUST be written in fluent, grammatically correct Indonesian (Bahasa Indonesia).';

  let prompt = `You are an Academic Assessment Engine.
Create ${targetCount} high-quality multiple choice quiz question(s) about the topic: "${config.topic}".
Language requirement: ${langInstruction}
Difficulty level: ${difficultyDesc}.
Language style: ${config.languageStyle || 'Clear, academic, and structured'}.

Requirements:
1. Provide exactly 4 distinct options per question.
2. Provide a single correct answer with "correctAnswerIndex" (0, 1, 2, or 3). Vary the position of the correct answer.
3. Provide a thorough scientific/conceptual explanation for "explanation", explaining why the correct option is right and others are incorrect.
4. Do NOT generate fake internet links or URLs. If there is a real published academic textbook or paper, provide its title in "referenceTitle", otherwise leave it as "".
`;

  if (existingQuestions.length > 0) {
    prompt += `\nCRITICAL: Do NOT generate questions similar or redundant to these previously generated questions:\n${existingQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n`;
  }

  if (config.additionalInstructions) {
    prompt += `\nAdditional user preferences (follow these while respecting topic, language, and JSON schema):\n${config.additionalInstructions}\n`;
  }

  if (config.studyMaterial && config.studyMaterial.trim().length > 0) {
    prompt += `\nStudy Material Reference:\n"""\n${config.studyMaterial.trim().slice(0, 10000)}\n"""\nBase the assessment questions strictly on the study material provided above.\n`;
  }

  prompt += `
Respond strictly with valid JSON conforming to this schema:
{
  "title": "${isEn ? 'Academic Quiz: ' + config.topic : 'Kuis: ' + config.topic}",
  "topic": "${config.topic}",
  "summary": "${isEn ? 'Brief concept summary of this quiz.' : 'Ringkasan singkat konsep materi kuis ini.'}",
  "questions": [
    {
      "question": "${isEn ? 'Clear question sentence?' : 'Kalimat pertanyaan yang jelas dan terstruktur dalam bahasa Indonesia?'}",
      "options": [
        "Option A",
        "Option B",
        "Option C",
        "Option D"
      ],
      "correctAnswerIndex": 0,
      "explanation": "${isEn ? 'Detailed explanation of why this answer is correct.' : 'Penjelasan detail konsep mengapa opsi ini benar.'}",
      "topicCategory": "${config.topic}",
      "referenceTitle": ""
    }
  ]
}
Return only valid JSON without any markdown formatting or commentary outside the JSON block. Generate exactly ${targetCount} question(s) now.`;

  return prompt;
}

/**
 * Eksekusi generasi kuis dengan Gemma 4 31B atau Gemini
 */
export async function generateQuizWithGemini(config: QuizConfig, apiKey?: string): Promise<Quiz> {
  config = normalizeQuizConfig(config);
  const selectedModel = config.model ?? DEFAULT_MODEL;
  const isGemma = selectedModel === 'gemma-4-31b-it';
  const ai = getGeminiClient(apiKey);

  // Aturan ketat: Pemilihan Gemma 4 31B TIDAK BOLEH dialihkan diam-diam ke Gemini.
  const modelCandidates = isGemma
    ? [selectedModel]
    : [selectedModel, selectedModel === DEFAULT_MODEL ? 'gemini-3.5-flash-lite' : DEFAULT_MODEL, 'gemini-flash-latest'];

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
    const remainingCount = totalNeeded - validQuestions.length;
    const currentBatchCount = Math.min(batchSize, remainingCount);

    let rawResponse: any = null;
    let lastError: any = null;
    const extractedSources: GroundingSource[] = [];

    // Jalur Google Search Grounding (Hanya untuk Gemini yang mendukung, bukan Gemma)
    if (config.enableGrounding && !isGemma && validQuestions.length === 0) {
      const { systemInstruction, userPrompt } = buildPrompt(
        config,
        currentBatchCount,
        validQuestions.map((q) => q.question)
      );
      try {
        rawResponse = await callWithRetry(
          () =>
            ai.models.generateContent({
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
        lastError = err;
        // Lanjut ke percobaan tanpa tool jika kuota/search grounding terkendala
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
          rawResponse = await callWithRetry(
            () =>
              ai.models.generateContent({
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
            rawResponse = await callWithRetry(
              () =>
                ai.models.generateContent({
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
            lastError = err;
          }
        }
      }
    }

    if (!rawResponse || !rawResponse.text) {
      throw classifyApiError(lastError || new Error('Respons model AI kosong.'), usedModelName);
    }

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
        extractedSources
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
    model: usedModelName,
    usedGrounding,
  };

  return resultQuiz;
}

/**
 * Helper untuk mengekstrak dan mem-parse JSON secara defensif dari output LLM
 */
export function extractJsonFromResponse(text: string): any {
  try {
    return sanitizeAndParseJson(text);
  } catch (err: any) {
    throw new QuizGenerationError(
      'Gagal mengekstrak struktur kuis JSON dari respon model AI: ' + (err?.message || String(err)),
      502,
      'INVALID_JSON'
    );
  }
}
