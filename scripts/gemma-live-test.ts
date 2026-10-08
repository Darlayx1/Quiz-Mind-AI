import 'dotenv/config';
import assert from 'node:assert/strict';
import { generateQuizWithGemini } from '../src/server/geminiService.js';
import { GoogleGenAI } from '@google/genai';

// Batas waktu global untuk seluruh test suite (maksimal 600 detik / 10 menit)
const SUITE_TIMEOUT_MS = 600000;
const suiteTimer = setTimeout(() => {
  console.error('\n[TIMEOUT] Test suite melebihi batas waktu maksimal 600 detik. Menghentikan proses.');
  process.exit(1);
}, SUITE_TIMEOUT_MS);
suiteTimer.unref();

const key = process.env.GEMINI_API_KEY;
if (!key || key === 'MY_GEMINI_API_KEY') {
  console.error('[FAILED] GEMINI_API_KEY belum dikonfigurasi di .env.');
  process.exit(1);
}

function sanitize(msg: unknown): string {
  return String(msg instanceof Error ? msg.stack || msg.message : msg).replaceAll(key ?? '', '[REDACTED_API_KEY]');
}

async function withStepTimeout<T>(promise: Promise<T>, timeoutMs: number, stepName: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`[TIMEOUT] Langkah "${stepName}" melebihi batas waktu ${timeoutMs / 1000} detik.`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function retryStep<T>(fn: () => Promise<T>, maxRetries = 2, delayMs = 3000): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err);
      const isTransient = /500|502|503|504|INTERNAL|UNAVAILABLE|DEADLINE_EXCEEDED|fetch failed|ECONNRESET/i.test(msg);
      if (attempt < maxRetries && isTransient) {
        console.log(`       [INFO] Menghadapi error transient (${msg.slice(0, 50)}...). Mencoba ulang dalam ${delayMs}ms (percobaan ${attempt + 1}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function runLiveTests() {
  console.log('=================================================================');
  console.log('PENGUJIAN API GOOGLE NYATA — MODEL: gemma-4-31b-it');
  console.log('=================================================================\n');

  const ai = new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 90000 } });

  // 1. Verifikasi model resmi
  console.log('LANGKAH 1: Memeriksa ketersediaan model gemma-4-31b-it...');
  const t0 = Date.now();
  const modelInfo = await retryStep(() =>
    withStepTimeout(
      ai.models.get({ model: 'gemma-4-31b-it' }),
      30000,
      'Model discovery'
    )
  );
  assert.equal(modelInfo.name, 'models/gemma-4-31b-it', 'Model ID tidak cocok!');
  console.log(`[PASS] Model resmi terverifikasi (${Date.now() - t0}ms):`);
  console.log(`       Nama: ${modelInfo.displayName}`);
  console.log(`       Max Output: ${modelInfo.outputTokenLimit} tokens`);

  // Cooldown singkat antar langkah
  await new Promise(r => setTimeout(r, 2000));

  // 2. Permintaan teks minimal
  console.log('\nLANGKAH 2: Menguji inferensi teks minimal (Hitung 7 + 8)...');
  const t1 = Date.now();
  const minimalRes = await retryStep(() =>
    withStepTimeout(
      ai.models.generateContent({
        model: 'gemma-4-31b-it',
        contents: 'Berapakah 7 + 8? Jawab hanya angkanya.',
      }),
      90000,
      'Minimal text inference'
    )
  );
  assert.ok(minimalRes.text && minimalRes.text.length > 0, 'Respons model kosong');
  console.log(`[PASS] Respons teks diterima dalam ${Date.now() - t1}ms: "${minimalRes.text.trim()}"`);

  // Cooldown singkat antar langkah
  await new Promise(r => setTimeout(r, 2000));

  // 3. Generasi 1 butir soal kuis terstruktur
  console.log('\nLANGKAH 3: Menguji pembuatan 1 butir soal kuis terstruktur dengan Gemma 4 31B...');
  const t2 = Date.now();
  const quiz1 = await withStepTimeout(
    generateQuizWithGemini({
      model: 'gemma-4-31b-it',
      topic: 'Hukum Kekekalan Energi',
      difficulty: 'moderate',
      questionCount: 1,
      timeLimitMinutes: 5,
      language: 'id',
      enableGrounding: true, // Pastikan Gemma menolak grounding tool dan menggunakan pengetahuan internal
    }, key),
    180000,
    'Quiz generation 1 question'
  );

  assert.equal(quiz1.model, 'gemma-4-31b-it', 'Model yang digunakan harus gemma-4-31b-it');
  assert.equal(quiz1.requestedModel, 'gemma-4-31b-it');
  assert.equal(quiz1.usedGrounding, false, 'Gemma tidak boleh mengklaim menggunakan Google Grounding');
  assert.equal(quiz1.questions.length, 1, 'Harus tepat 1 soal');

  const q1 = quiz1.questions[0];
  assert.ok(q1.type===undefined||q1.type==='single_choice');
  assert.ok(q1.question.trim().length >= 10, 'Pertanyaan harus berbobot');
  assert.equal(q1.options.length, 5, 'Harus tepat 5 pilihan jawaban');
  assert.ok(Number.isInteger(q1.correctAnswerIndex) && q1.correctAnswerIndex >= 0 && q1.correctAnswerIndex <= 4, 'Index benar harus 0-4');
  assert.ok(q1.explanation.trim().length >= 15, 'Pembahasan harus komprehensif');
  assert.ok(!q1.groundingSources.some(s => s.url.includes('google.com/search')), 'Tidak boleh ada tautan pencarian palsu');

  console.log(`[PASS] Kuis 1 soal selesai dalam ${Date.now() - t2}ms:`);
  console.log(`       Judul: "${quiz1.title}"`);
  console.log(`       Soal: ${q1.question}`);
  console.log(`       Kunci: [${q1.correctAnswerIndex}] ${q1.options[q1.correctAnswerIndex]}`);
  console.log(`       Pembahasan: ${q1.explanation.slice(0, 100)}...`);

  // Cooldown sebelum langkah berikutnya untuk mencegah rate limit
  console.log('\nPendinginkan koneksi selama 3 detik sebelum langkah 4...');
  await new Promise(r => setTimeout(r, 3000));

  // 4. Generasi kuis multi-soal (2 butir soal)
  console.log('LANGKAH 4: Menguji pembuatan kuis multi-soal (2 butir soal)...');
  const t3 = Date.now();
  const quiz2 = await withStepTimeout(
    generateQuizWithGemini({
      model: 'gemma-4-31b-it',
      topic: 'Fotosintesis pada Tumbuhan',
      difficulty: 'intermediate',
      questionCount: 2,
      timeLimitMinutes: 10,
      language: 'id',
      enableGrounding: false,
    }, key),
    180000,
    'Quiz generation 2 questions'
  );

  assert.equal(quiz2.model, 'gemma-4-31b-it');
  assert.equal(quiz2.questions.length, 2, 'Harus tepat 2 butir soal');
  quiz2.questions.forEach((q, i) => {
    assert.ok(q.type===undefined||q.type==='single_choice');
    assert.ok(q.question.length >= 10, `Soal ${i + 1} terlalu pendek`);
    assert.equal(q.options.length, 5, `Soal ${i + 1} harus punya 5 opsi`);
    assert.ok(Number.isInteger(q.correctAnswerIndex) && q.correctAnswerIndex >= 0 && q.correctAnswerIndex <= 3);
    assert.ok(q.explanation.length >= 10, `Pembahasan ${i + 1} terlalu pendek`);
  });
  console.log(`[PASS] Kuis multi-soal selesai dalam ${Date.now() - t3}ms:`);
  console.log(`       Judul: "${quiz2.title}"`);
  quiz2.questions.forEach((q, i) => {
    console.log(`       [Soal ${i + 1}] ${q.question.slice(0, 70)}... (Kunci: ${q.correctAnswerIndex})`);
  });

  console.log('\n=================================================================');
  console.log('STATUS AKHIR: PASS (100% Pengujian API Google Nyata Berhasil)');
  console.log('Model gemma-4-31b-it terbukti berfungsi end-to-end tanpa fallback!');
  console.log('=================================================================');
}

runLiveTests()
  .then(() => {
    clearTimeout(suiteTimer);
    process.exit(0);
  })
  .catch((err) => {
    clearTimeout(suiteTimer);
    console.error('\n[STATUS AKHIR: FAILED]');
    console.error(sanitize(err));
    process.exit(1);
  });
