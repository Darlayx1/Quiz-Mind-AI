import { GoogleGenAI } from '@google/genai';
import { Quiz, QuizConfig, Question, GroundingSource } from '../types/quiz.js';

/**
 * Inisialisasi client Gemini menggunakan SDK resmi @google/genai.
 * Menggunakan default API key dari runtime AI Studio Build (process.env.GEMINI_API_KEY).
 */
function getGeminiClient(apiKey = process.env.GEMINI_API_KEY): GoogleGenAI {
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY belum dikonfigurasi di lingkungan server runtime.');
  }

  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      timeout: 60000,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Menghasilkan kuis menggunakan model Gemini (prioritas gemini-3.8-flash)
 * dengan penalaran mendalam dan integrasi Google Search Grounding.
 * Dilengkapi strategi multi-level retry & fallback agar selalu berhasil dengan default API key.
 */
export async function generateQuizWithGemini(config: QuizConfig, apiKey?: string): Promise<Quiz> {
  const ai = getGeminiClient(apiKey);

  const languagePrompt = config.language === 'en'
    ? 'All questions, options, explanations, and summaries MUST be written in fluent English.'
    : 'Semua pertanyaan, pilihan jawaban, penjelasan, dan ringkasan WAJIB ditulis dalam Bahasa Indonesia yang baku dan akademis.';

  const difficultyDesc = {
    beginner: 'Tingkat Pemula: Menguji pemahaman konsep dasar dan fakta fundamental.',
    intermediate: 'Tingkat Menengah: Menguji pemahaman konseptual, analisis terapan, dan diferensiasi ide.',
    advanced: 'Tingkat Mahir: Menguji penalaran analitis mendalam, studi kasus kompleks, dan pemecahan masalah multidimensi.',
    expert: 'Tingkat Olimpiade / Pakar: Soal berstandar kompetisi tingkat tinggi, penalaran logis abstrak, dan sintesis kritis.',
  }[config.difficulty];

  const systemInstruction = `Anda adalah Academic Assessment Engine tingkat tinggi.
Tugas Anda:
1. Menghasilkan soal kuis pilihan ganda yang bermutu tinggi, menantang, presisi, dan terverifikasi faktual.
2. Setiap butir soal WAJIB memiliki tepat 4 opsi pilihan (A, B, C, D) dengan satu jawaban benar dan 3 distractor yang realistis.
3. Terapkan PENALARAN MENDALAM (Deep Thinking): sebelum menentukan kunci jawaban, bedah konsep secara kritis, hindari ambiguitas.
4. Sertakan sumber rujukan fakta atau sitasi ilmiah yang dapat diverifikasi untuk setiap pembahasan soal.
5. ${languagePrompt}
6. Output WAJIB berupa blok JSON murni yang valid tanpa teks pembuka atau penutup di luar blok JSON.`;

  let userPrompt = `Buatkan kuis pilihan ganda dengan spesifikasi berikut:
- Topik Utama: "${config.topic}"
- Tingkat Kesulitan: ${difficultyDesc}
- Jumlah Soal: ${config.questionCount} butir soal
- Durasi Rekomendasi: ${config.timeLimitMinutes} menit
`;

  if (config.studyMaterial && config.studyMaterial.trim().length > 0) {
    userPrompt += `\nReferensi Catatan / Materi Bahan Bacaan Khusus:\n"""\n${config.studyMaterial.trim().slice(0, 15000)}\n"""\nGali butir-butir soal utama berdasarkan materi referensi di atas dengan ketat!\n`;
  }

  userPrompt += `
Format respon JSON yang WAJIB dihasilkan:
\`\`\`json
{
  "title": "Judul Kuis yang Menarik dan Akademis",
  "topic": "${config.topic}",
  "summary": "Ringkasan 1-2 kalimat mengenai fokus materi kuis ini.",
  "questions": [
    {
      "question": "Kalimat pertanyaan yang jelas, lugas, dan terstruktur",
      "options": [
        "Pilihan A",
        "Pilihan B",
        "Pilihan C",
        "Pilihan D"
      ],
      "correctAnswerIndex": 0,
      "explanation": "Penalaran mendalam: Mengapa opsi ini benar secara faktual, dan mengapa opsi lainnya keliru atau kurang tepat.",
      "topicCategory": "Sub-kategori topik soal",
      "groundingReferences": [
        {
          "title": "Nama Referensi / Ensiklopedia / Sumber Fakta Terverifikasi",
          "url": "https://id.wikipedia.org/wiki/${encodeURIComponent(config.topic)}"
        }
      ]
    }
  ]
}
\`\`\`
Pastikan index "correctAnswerIndex" adalah angka 0, 1, 2, atau 3. Variasikan posisi kunci jawaban agar seimbang.
`;

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 1, baseDelayMs = 800): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err);

      // Jika terjadi lonjakan permintaan (503) atau batas kuota (429), langsung alihkan ke model cadangan tanpa menunggu
      const isDemandOrQuota =
        msg.includes('503') ||
        msg.includes('429') ||
        msg.includes('high demand') ||
        msg.includes('RESOURCE_EXHAUSTED');

      if (isDemandOrQuota) {
        throw err;
      }

      // Hanya ulangi jika murni kesalahan koneksi soket sesaat
      const isNetworkTransient =
        msg.includes('fetch failed') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('Headers Timeout') ||
        msg.includes('UND_ERR_HEADERS_TIMEOUT');

      if (attempt < maxRetries && isNetworkTransient) {
        await new Promise((r) => setTimeout(r, baseDelayMs));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

  // Pipeline model: Coba gemini-3.8-flash terlebih dahulu, jika demand spike (503/429) beralih mulus ke model flash lainnya
  const modelCandidates = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];

  let rawResponse: any = null;
  let usedModelName = 'gemini-3.8-flash';
  let usedGrounding = false;
  let lastError: any = null;

  // Percobaan 1: Dengan model utama dan Google Search Grounding jika diaktifkan
  if (config.enableGrounding) {
    try {
      rawResponse = await callWithRetry(
        () =>
          ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: userPrompt,
            config: {
              systemInstruction,
              tools: [{ googleSearch: {} }],
            },
          }),
        0 // jangan buang waktu jika grounding kuota habis/demand spike
      );
      usedGrounding = true;
      usedModelName = 'gemini-3.8-flash';
    } catch (err: any) {
      lastError = err;
      // Lanjut otomatis ke percobaan tanpa tool pencarian agar tidak terhambat kuota grounding
    }
  }

  // Percobaan 2: Iterasi model tanpa tool pencarian jika Percobaan 1 belum berhasil
  if (!rawResponse) {
    for (const model of modelCandidates) {
      try {
        rawResponse = await callWithRetry(
          () =>
            ai.models.generateContent({
              model: model,
              contents: userPrompt,
              config: {
                systemInstruction,
              },
            }),
          0 // failover instan ke model berikutnya jika model ini sedang 503
        );
        usedModelName = model;
        lastError = null;
        break;
      } catch (err: any) {
        lastError = err;
        // Lanjut ke kandidat model berikutnya tanpa jeda
      }
    }
  }

  if (!rawResponse || !rawResponse.text) {
    throw new Error(
      lastError?.message || 'Model AI sedang mengalami lonjakan permintaan sementara. Silakan coba kembali.'
    );
  }

  const rawText = rawResponse.text || '';

  // Ekstrak metadata Google Search Grounding dari candidates jika ada
  const candidate = rawResponse.candidates?.[0];
  const groundingMetadata = candidate?.groundingMetadata;
  const webQueries: string[] = groundingMetadata?.webSearchQueries || [];
  
  const extractedSources: GroundingSource[] = [];
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

  // Parse JSON respon
  const parsedData = extractJsonFromResponse(rawText);

  // Buat objek Quiz tervalidasi
  const quizId = 'quiz_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  
  const questions: Question[] = (parsedData.questions || []).map((q: any, idx: number) => {
    let options = Array.isArray(q.options) ? q.options.map(String) : [];
    if (options.length < 4) {
      while (options.length < 4) {
        options.push(`Pilihan cadangan ${options.length + 1}`);
      }
    } else if (options.length > 4) {
      options = options.slice(0, 4);
    }

    let correctIndex = Number(q.correctAnswerIndex);
    if (isNaN(correctIndex) || correctIndex < 0 || correctIndex > 3) {
      correctIndex = 0;
    }

    // Gabungkan sumber rujukan dari grounding nyata atau sitasi terverifikasi
    const questionSources: GroundingSource[] = [...extractedSources];

    if (Array.isArray(q.groundingReferences)) {
      for (const ref of q.groundingReferences) {
        if (ref?.url && ref?.title) {
          questionSources.push({
            title: String(ref.title),
            url: String(ref.url),
            snippet: String(ref.title),
          });
        }
      }
    }

    // Fallback sumber ensiklopedia jika belum ada sitasi
    if (questionSources.length === 0) {
      questionSources.push({
        title: `Verifikasi Fakta: ${config.topic}`,
        url: `https://www.google.com/search?q=${encodeURIComponent(config.topic)}`,
        snippet: `Penelusuran konsep terverifikasi terkait ${config.topic}`,
      });
    }

    return {
      id: `q_${idx + 1}_${Date.now()}`,
      question: String(q.question || `Pertanyaan nomor ${idx + 1}`),
      options: options as [string, string, string, string],
      correctAnswerIndex: correctIndex,
      explanation: String(q.explanation || 'Pembahasan penalaran mendalam terverifikasi secara saintifik.'),
      groundingSources: questionSources.slice(0, 3),
      topicCategory: q.topicCategory ? String(q.topicCategory) : config.topic,
    };
  });

  if (questions.length === 0) {
    throw new Error('Format butir soal dari model AI tidak terbaca dengan benar.');
  }

  const resultQuiz: Quiz = {
    id: quizId,
    title: String(parsedData.title || `Kuis: ${config.topic}`),
    topic: config.topic,
    summary: String(parsedData.summary || `Kuis evaluasi topik ${config.topic} tingkat ${config.difficulty}.`),
    difficulty: config.difficulty,
    timeLimitMinutes: config.timeLimitMinutes,
    createdAt: new Date().toISOString(),
    questions,
    groundingQueriesUsed: webQueries.length > 0 ? webQueries : [`Fakta materi ${config.topic}`],
  };

  return resultQuiz;
}

/**
 * Helper untuk mengekstrak dan mem-parse JSON secara defensif dari output LLM
 */
function extractJsonFromResponse(text: string): any {
  // 1. Coba regex untuk blok ```json ... ```
  const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    try {
      return JSON.parse(jsonBlockMatch[1]);
    } catch {
      // lanjut ke langkah berikutnya
    }
  }

  // 2. Cari kurung kurawal pertama { hingga terakhir }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = text.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      const sanitized = candidate.replace(/,\s*([}\]])/g, '$1');
      try {
        return JSON.parse(sanitized);
      } catch (err) {
        console.error('Gagal parsing kandidat JSON:', err);
      }
    }
  }

  // 3. Fallback direct parse
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error('Ekstraksi JSON gagal total. Teks mentah:', text);
    throw new Error('Gagal mengekstrak struktur kuis JSON dari respon model AI.');
  }
}
