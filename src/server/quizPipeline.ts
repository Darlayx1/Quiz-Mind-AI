import { DIFFICULTIES } from '../models.js';
import { quizTimerSeconds, durationLabel } from '../quizConfig.js';
import type { QuizConfig, Question, GroundingSource } from '../types/quiz.js';
import { sanitizeAndParseJson } from './jsonParser.js';
import { QuizGenerationError } from './generationError.js';

const questionProperties = { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 }, correctAnswerIndex: { type: 'integer', minimum: 0, maximum: 3 }, explanation: { type: 'string' }, topicCategory: { type: 'string' }, referenceTitle: { type: 'string' } };
export const quizJsonSchema = { type: 'object', additionalProperties: false, required: ['title','topic','summary','questions'], properties: { title: { type: 'string' }, topic: { type: 'string' }, summary: { type: 'string' }, questions: { type: 'array', items: { type: 'object', additionalProperties: false, properties: questionProperties, required: Object.keys(questionProperties) } } } };

export function validateAndSanitizeQuestion(
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
  if (rawOptions.length !== 4 || new Set(rawOptions.map(option => option.toLocaleLowerCase())).size !== 4) return null;
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
export function buildPrompt(
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

export function extractJsonFromResponse(text: string): any {
  try {
    const parsed = sanitizeAndParseJson(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Respons harus berupa objek kuis.');
    return parsed;
  } catch {
    throw new QuizGenerationError(
      'Gagal membaca struktur kuis JSON dari respons AI. Coba kembali atau pilih model lain.',
      502,
      'INVALID_JSON'
    );
  }
}
