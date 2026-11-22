import assert from 'node:assert/strict';
import { sanitizeAndParseJson } from '../src/server/jsonParser.js';

// 1. Valid JSON with standard escapes (\n, \t, \u00b2, \") and already-escaped LaTeX (\\frac) when repair is triggered by trailing comma
const withTrailingCommaAndEscapes = `{
  "title": "Fisika & Matematika",
  "summary": "Baris 1\\nBaris 2\\tPercepatan m/s\\u00b2 dan \\\\frac{1}{2}mv^2",
  "questions": [
    {
      "question": "Hitung \\frac{F}{m} jika \\alpha = 30^\\circ, \\theta = 45^\\circ, \\rightarrow \\beta, \\nabla \\times E",
      "explanation": "Langkah 1:\\nGunakan rumus \\\\frac{a}{b} dan \\sqrt{x^2 + y^2}.",
      "options": ["A", "B", "C", "D", "E",],
    },
  ]
}`;

const parsed1 = sanitizeAndParseJson(withTrailingCommaAndEscapes);
assert.equal(parsed1.title, 'Fisika & Matematika');
assert.ok(parsed1.summary.includes('Baris 1\nBaris 2\tPercepatan m/s²'));
assert.ok(parsed1.summary.includes('\\frac{1}{2}mv^2'), 'Already-escaped \\\\frac must not turn into broken \\\\\\frac');
assert.ok(parsed1.questions[0].question.includes('\\frac{F}{m}'), 'Unescaped \\frac must be preserved instead of turning into form-feed');
assert.ok(parsed1.questions[0].question.includes('\\alpha'));
assert.ok(parsed1.questions[0].question.includes('\\theta'), 'Unescaped \\theta must not turn into tab + heta');
assert.ok(parsed1.questions[0].question.includes('\\rightarrow'), 'Unescaped \\rightarrow must not turn into carriage return');
assert.ok(parsed1.questions[0].question.includes('\\beta'), 'Unescaped \\beta must not turn into backspace');
assert.ok(parsed1.questions[0].question.includes('\\nabla'), 'Unescaped \\nabla must not turn into newline');
assert.ok(parsed1.questions[0].explanation.includes('Langkah 1:\nGunakan'));

// 2. Raw unescaped newlines/tabs inside JSON string literal + markdown code block
const withRawNewlinesInString = '```json\n{\n  "title": "Baris mentah\ndalam string",\n  "questions": []\n}\n```';
const parsed2 = sanitizeAndParseJson(withRawNewlinesInString);
assert.equal(parsed2.title, 'Baris mentah\ndalam string');

// 3. LIFO Stack-based truncation recovery (nested object inside array inside object)
const truncatedNested = '{"title":"Terpotong","questions":[{"question":"Soal 1","options":["Opsi A","Opsi B';
const parsed3 = sanitizeAndParseJson(truncatedNested);
assert.equal(parsed3.title, 'Terpotong');
assert.deepEqual(parsed3.questions[0].options, ['Opsi A', 'Opsi B']);

console.log('PASS: state-machine JSON parser preserves valid escapes, repairs LaTeX macros (\\frac, \\theta, \\rightarrow, \\beta, \\nabla, \\alpha), prevents \\\\frac corruption, and recovers LIFO truncated brackets.');
