import 'dotenv/config';
import assert from 'node:assert/strict';
import { generateQuizWithGemini } from '../src/server/geminiService.js';

// Uses the local secret; never prints it or writes quiz data to disk.
const key = process.env.GEMINI_API_KEY;
if (!key || key === 'MY_GEMINI_API_KEY') {
  throw new Error('Pasang GEMINI_API_KEY di .env sebelum menjalankan tes API nyata.');
}
try {
  const quiz = await generateQuizWithGemini({
    model: 'gemma-4-31b-it', topic: 'Penjumlahan bilangan', difficulty: 'easy',
    questionCount: 1, timeLimitMinutes: 5, language: 'id', enableGrounding: true,
  }, key);
  assert.equal(quiz.model, 'gemma-4-31b-it');
  assert.equal(quiz.questions.length, 1);
  assert.equal(quiz.usedGrounding, false);
  console.log('PASS: Gemma 4 31B menghasilkan kuis melalui API Google nyata.');
} catch (error) {
  console.error(String(error instanceof Error ? error.message : error).replaceAll(key, '[REDACTED]'));
  process.exitCode = 1;
}
