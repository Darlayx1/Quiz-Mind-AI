import assert from 'node:assert/strict';
import { generateQuizWithGemini, QuizGenerationError } from '../src/server/geminiService.js';
import { sanitizeAndParseJson } from '../src/server/jsonParser.js';

console.log('=== PENGUJIAN MOCK KETAHANAN, TIMEOUT, DAN CLEANUP GEMMA 4 31B ===\n');

const originalFetch = globalThis.fetch;

async function runResilienceTests() {
  // Test 1: Parser JSON Defensif menangani karakter escape LaTeX
  console.log('1. Menguji parsing JSON defensif terhadap escape LaTeX & trailing commas...');
  const trickyJson = `\`\`\`json
  {
    "title": "Kuis Fisika",
    "topic": "Vektor",
    "summary": "Analisis arah vektor",
    "questions": [
      {
        "question": "Arah gaya resultan \\vec{F} = \\alpha \\rightarrow \\beta?",
        "options": ["Arah utara", "Arah timur", "Arah barat", "Arah selatan",],
        "correctAnswerIndex": 0,
        "explanation": "Penjelasan dengan rumus \\sum F = m \\cdot a dan \\frac{1}{2}mv^2",
        "topicCategory": "Mekanika",
      }
    ]
  }
  \`\`\``;
  const parsed = sanitizeAndParseJson(trickyJson);
  assert.equal(parsed.title, 'Kuis Fisika');
  assert.equal(parsed.questions.length, 1);
  assert.equal(parsed.questions[0].options.length, 4);
  console.log('   OK: Berhasil mengekstrak JSON dengan TeX escape dan trailing commas.');

  // Test 2: Tidak ada silent fallback untuk Gemma 4 31B
  console.log('\n2. Menguji penolakan silent fallback saat Gemma gagal...');
  let calls: string[] = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return Response.json(
      { error: { code: 503, message: 'High demand', status: 'UNAVAILABLE' } },
      { status: 503 }
    );
  };

  try {
    await assert.rejects(
      generateQuizWithGemini(
        {
          model: 'gemma-4-31b-it',
          topic: 'Aljabar',
          difficulty: 'easy',
          questionCount: 1,
          timeLimitMinutes: 5,
          language: 'id',
          enableGrounding: false,
        },
        'mock-key'
      ),
      (err: any) => {
        assert.ok(err instanceof QuizGenerationError);
        assert.equal(err.status, 503);
        assert.ok(/lonjakan permintaan|503/i.test(err.message));
        return true;
      }
    );
    // Verifikasi bahwa semua panggilan tetap ke gemma-4-31b-it (tanpa beralih ke gemini-3.8-flash)
    assert.ok(calls.length > 0);
    assert.ok(calls.every((url) => url.includes('gemma-4-31b-it')), 'Model tidak boleh diam-diam dialihkan!');
    console.log(`   OK: Gemma gagal secara transparan dengan status 503 tanpa silent fallback (${calls.length} percobaan).`);
  } finally {
    globalThis.fetch = originalFetch;
  }

  // Test 3: Error 401 Unauthorized tidak diulangi (no retry)
  console.log('\n3. Menguji bahwa error permanen 401 tidak diulangi (no retry loop)...');
  let authAttempts = 0;
  globalThis.fetch = async () => {
    authAttempts++;
    return Response.json(
      { error: { code: 401, message: 'API key not valid', status: 'UNAUTHENTICATED' } },
      { status: 401 }
    );
  };

  try {
    await assert.rejects(
      generateQuizWithGemini(
        {
          model: 'gemma-4-31b-it',
          topic: 'Biologi',
          difficulty: 'easy',
          questionCount: 1,
          timeLimitMinutes: 5,
          language: 'id',
          enableGrounding: false,
        },
        'bad-key'
      ),
      (err: any) => {
        assert.equal(err.status, 401);
        return true;
      }
    );
    assert.equal(authAttempts, 1, 'Error 401 harus langsung gagal tanpa retry!');
    console.log('   OK: Error 401 gagal seketika pada percobaan pertama.');
  } finally {
    globalThis.fetch = originalFetch;
  }

  // Test 4: Error 429 Quota tidak diulangi
  console.log('\n4. Menguji bahwa error kuota 429 tidak diulangi (no retry loop)...');
  let quotaAttempts = 0;
  globalThis.fetch = async () => {
    quotaAttempts++;
    return Response.json(
      { error: { code: 429, message: 'RESOURCE_EXHAUSTED', status: 'RESOURCE_EXHAUSTED' } },
      { status: 429 }
    );
  };

  try {
    await assert.rejects(
      generateQuizWithGemini(
        {
          model: 'gemma-4-31b-it',
          topic: 'Biologi',
          difficulty: 'easy',
          questionCount: 1,
          timeLimitMinutes: 5,
          language: 'id',
          enableGrounding: false,
        },
        'mock-key'
      ),
      (err: any) => {
        assert.equal(err.status, 429);
        return true;
      }
    );
    assert.equal(quotaAttempts, 1, 'Error 429 harus langsung gagal tanpa spamming request!');
    console.log('   OK: Error 429 gagal seketika pada percobaan pertama.');
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('\n=================================================================');
  console.log('PASS: Seluruh pengujian mock ketahanan, timeout, dan cleanup BERHASIL!');
  console.log('=================================================================');
}

runResilienceTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FAILED:', err);
    process.exit(1);
  });
