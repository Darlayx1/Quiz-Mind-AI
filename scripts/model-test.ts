import assert from "node:assert/strict";
import { qualityReviewFixture } from './quality-review-fixture.js';
import { generateQuizWithGemini, generateQuizBatch } from "../src/server/geminiService.js";
import { AI_MODELS, DEFAULT_MODEL, DIFFICULTIES } from "../src/models.js";
import { normalizeQuizConfig, quizTimerSeconds } from "../src/quizConfig.js";
import type { QuizConfig } from "../src/types/quiz.js";

const modelFromRequest = (url: string) => decodeURIComponent(url.match(/models\/([^:]+):/)?.[1] || "");
const originalFetch = globalThis.fetch;
const calls: Array<{ model: string; grounded: boolean }> = [];
let failFirst = false;
let failAlways = false;
let lastPrompt = "";
let responseCount = 1;

const config: QuizConfig = {
  topic: "Aljabar",
  difficulty: "intermediate",
  questionCount: 1,
  timeLimitMinutes: 5,
  language: "id",
  enableGrounding: false,
};

globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const body = await request.json();
  // Difficulty guidance may live in the system instruction; inspect all model context.
  lastPrompt = JSON.stringify({ contents: body.contents, systemInstruction: body.systemInstruction });
  const audit = qualityReviewFixture(body.contents.map((c: any) => c.parts.map((p: any) => p.text || '').join('\n')).join('\n'));
  if (audit) {
    calls.push({ model: modelFromRequest(request.url), grounded: false });
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: JSON.stringify(audit) }] } }] });
  }
  if (modelFromRequest(request.url) === "gemma-4-31b-it") {
    assert.equal(body.systemInstruction, undefined);
    assert.equal(body.tools, undefined);
    assert.equal(body.generationConfig?.thinkingConfig?.thinkingLevel, "HIGH");
    assert.ok(lastPrompt.includes("Academic Assessment Engine"));
  }
  const model = decodeURIComponent(
    request.url.match(/models\/([^:]+):/)?.[1] || "",
  );
  calls.push({ model, grounded: Boolean(body.tools?.length) });
  if (failAlways || (failFirst && calls.length === 1)) {
    return Response.json(
      { error: { code: 503, message: "Unavailable", status: "UNAVAILABLE" } },
      { status: 503 },
    );
  }
  return Response.json({
    candidates: [
      {
        content: {
          role: "model",
          parts: [
            {
              text: JSON.stringify({
                title: "Aljabar",
                summary: "Latihan konsep dasar.",
                questions: Array.from({ length: responseCount }, (_, idx) => ({
                  question: `Pertanyaan nomor ${idx + 1}: berapa 2 + ${idx}?`,
                  options: ["4", "3", "5", "6", "7"],
                  correctAnswerIndex: 0,
                  explanation: "Dua ditambah dua sama dengan empat.",
                })),
              }),
            },
          ],
        },
        ...(body.tools?.length
          ? { groundingMetadata: { webSearchQueries: ["aljabar"], groundingChunks: [{ web: { uri: "https://example.org/algebra", title: "Aljabar" } }] } }
          : {}),
      },
    ],
  });
};

try {
  for (const { id: model } of AI_MODELS.filter(model => model.provider === 'gemini')) {
    calls.length = 0;
    const quiz = await generateQuizWithGemini({ ...config, model }, "test-key");
    assert.equal(calls[0].model, model);
    assert.equal(quiz.model, model);
    assert.equal(quiz.requestedModel, model);
    assert.equal(quiz.usedGrounding, false);
    assert.deepEqual(quiz.groundingQueriesUsed, []);
    calls.length = 0;
    if (model === 'gemma-4-31b-it') {
      await assert.rejects(generateQuizWithGemini({...config,model,enableGrounding:true},'test-key'),(e:any)=>e.code==='FALLBACK_CAPABILITY');
      assert.equal(calls.length,0);continue;
    }
    const grounded = await generateQuizWithGemini(
      { ...config, model, enableGrounding: true },
      "test-key",
    );
    assert.equal(calls[0].model, model);
    assert.equal(calls[0].grounded, true);
    assert.equal(grounded.usedGrounding, true);
  }

  calls.length = 0;
  assert.equal(
    (await generateQuizWithGemini(config, "test-key")).model,
    DEFAULT_MODEL,
  );

  calls.length = 0;
  failFirst = true;
  await assert.rejects(
    generateQuizWithGemini(
      { ...config, model: "gemini-3.5-flash-lite" },
      "test-key",
    ),
    /503|UNAVAILABLE|lonjakan permintaan/i,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "gemini-3.5-flash-lite");
  failFirst = false;

  calls.length = 0;
  await assert.rejects(
    generateQuizWithGemini({ ...config, model: "invalid" as any }, "test-key"),
    /tidak didukung/,
  );
  assert.equal(calls.length, 0);

  calls.length = 0;
  failAlways = true;
  await assert.rejects(
    generateQuizWithGemini({ ...config, model: "gemma-4-31b-it" }, "test-key"),
    /lonjakan permintaan|503|UNAVAILABLE/i,
  );
  // Pastikan Gemma tidak fallback ke model lain
  assert.ok(calls.length > 0);
  assert.ok(calls.every(c => c.model === "gemma-4-31b-it"));
  failAlways = false;

  for (const difficulty of DIFFICULTIES) {
    const quiz = await generateQuizWithGemini(
      {
        ...config,
        difficulty: difficulty.id,
        language: "en",
        languageStyle: "Santai",
        additionalInstructions: "Gunakan studi kasus",
        displayMode: "sequential",
        timePerQuestionSeconds: 45,
      },
      "test-key",
    );
    assert.equal(quiz.difficulty, difficulty.id);
    assert.equal(quiz.displayMode, "sequential");
    assert.equal(quiz.timePerQuestionSeconds, 45);
    assert.equal(quiz.languageStyle, "Santai");
    assert.equal(quiz.additionalInstructions, "Gunakan studi kasus");
    assert.ok(lastPrompt.includes(difficulty.description));
    assert.ok(lastPrompt.includes("Santai"));
    assert.ok(lastPrompt.includes("Gunakan studi kasus"));
    assert.ok(lastPrompt.includes("45 detik per soal"));
  }

  responseCount = 25;
  const custom = await generateQuizWithGemini(
    { ...config, questionCount: 25, timeLimitMinutes: 0 },
    "test-key",
  );
  assert.equal(custom.questions.length, 25);
  assert.equal(quizTimerSeconds(custom), 0);
  assert.ok(lastPrompt.includes("Tanpa batas"));

  assert.equal(
    quizTimerSeconds(
      normalizeQuizConfig({
        ...config,
        displayMode: "sequential",
        timeLimitMinutes: 0,
        timePerQuestionSeconds: 0,
      }),
    ),
    0,
  );
  assert.equal(
    quizTimerSeconds(
      normalizeQuizConfig({
        ...config,
        displayMode: "non_sequential",
        timeLimitMinutes: 15,
        timePerQuestionSeconds: 45,
      }),
    ),
    900,
  );
  assert.equal(
    normalizeQuizConfig({ ...config, difficulty: "expert" }).difficulty,
    "master",
  );

  responseCount = 1;
  await assert.rejects(
    generateQuizWithGemini({ ...config, questionCount: 5 }, "test-key"),
    (e: any) => e.code === "INCOMPLETE_QUESTION_COUNT",
  );
  // One generation attempt with single call; no secondary audit call.
  calls.length = 0;
  const batch = await generateQuizBatch({ ...config, model: DEFAULT_MODEL }, "test-key");
  assert.equal(batch.questions.length, 1);
  assert.equal(calls.length, 1);
  calls.length = 0;
  failAlways = true;
  await assert.rejects(generateQuizBatch({ ...config, model: DEFAULT_MODEL }, "test-key"));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, DEFAULT_MODEL);
  failAlways = false;
  calls.length = 0;
  await assert.rejects(
    generateQuizBatch({ ...config, questionCount: 5 }, "test-key"),
    (e: any) => e.code === "INCOMPLETE_QUESTION_COUNT",
  );
  assert.equal(calls.length, 1, "Incomplete count rejects without secondary call");
  console.log(
    "PASS: enam model, sembilan level, grounding, fallback, prompt personal, custom 25 soal, timer per mode, tanpa batas, konfigurasi lama, validasi jumlah hasil. Tidak ada panggilan API eksternal.",
  );
} finally {
  globalThis.fetch = originalFetch;
}
