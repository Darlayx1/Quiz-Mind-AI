import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { presentationTestHost } from './presentation-test-host.js';
import { preparationSummary } from '../src/quizPreparation.js';
import { normalizeQuizConfig } from '../src/quizConfig.js';
import { effectiveLanguageStyle } from '../src/languageStyles.js';
import { defaultEvaluationSettings } from '../src/evaluationSettings.js';
import { QuizPreparation } from '../src/components/QuizPreparation.js';
import { TopBar } from '../src/components/TopBar.js';
import type { Quiz } from '../src/types/quiz.js';

const choice = { id: 'q1', question: 'Satu?', options: ['A', 'B'], correctAnswerIndex: 0, explanation: '', groundingSources: [] };
const essay = { id: 'q2', type: 'essay' as const, question: 'Jelaskan?', referenceAnswer: 'A', rubric: [], maxLength: 100, explanation: '', groundingSources: [] };
const config = normalizeQuizConfig({ topic: 'Astronomi', questionCount: 2, questionDistribution: { single_choice: 1, essay: 1 }, difficulty: 'hard', timeLimitMinutes: 10,
  evaluationSettings: defaultEvaluationSettings, language: 'id', languageStyle: effectiveLanguageStyle('Teknis & presisi') });
const quiz: Quiz = { id: 'prep', title: 'Bersiap menjelajah angkasa', topic: 'Astronomi', summary: '', difficulty: 'hard', timeLimitMinutes: 10, createdAt: '', questions: [choice, essay], generationConfig: config };
const rows = (q: Quiz) => Object.fromEntries(preparationSummary(q).map(({ label, value }) => [label, value]));
assert.deepEqual(rows(quiz), {
  Topik: quiz.title, 'Jumlah soal': '2 soal', 'Jenis soal': '1 pilihan ganda · 1 esai', 'Tingkat kesulitan': 'Sulit', Waktu: '10 menit',
});
const { generationConfig: _config, ...legacy } = quiz;
assert.equal(rows(legacy)['Jenis soal'], '1 pilihan ganda · 1 esai');
assert.equal(rows(quiz).Bahasa, undefined, 'Secondary configuration is omitted from preparation');
assert.equal(rows(quiz)['Penilaian AI'], undefined);
assert.equal(rows(quiz)['Cara mengerjakan'], undefined);
assert.equal(rows({ ...legacy, title: '' }).Topik, 'Astronomi');
assert.equal(rows({ ...legacy, timeLimitMinutes: 0 }).Waktu, 'Tanpa batas waktu');
assert.equal(rows({ ...quiz, generationConfig: { ...config, timeLimitMinutes: 0 } }).Waktu, 'Tanpa batas waktu');
assert.equal(rows({ ...legacy, timeLimitMinutes: undefined as unknown as number }).Waktu, 'Tanpa batas waktu');
const sequential = { ...config, displayMode: 'sequential' as const, timePerQuestionSeconds: 90 };
assert.equal(rows({ ...quiz, generationConfig: sequential }).Waktu, '1 menit 30 detik per soal');
assert.equal(rows({ ...quiz, generationConfig: { ...sequential, timePerQuestionByType: { essay: 0 } } }).Waktu, 'Pilihan ganda: 1 menit 30 detik per soal · Esai: Tanpa batas waktu');
assert.equal(rows({ ...quiz, generationConfig: { ...sequential, timePerQuestionByType: { essay: 0, single_choice: 0 } } }).Waktu, 'Tanpa batas waktu');
assert.equal(rows({ ...legacy, displayMode: 'sequential' }).Waktu, '1 menit per soal', 'Legacy timer agrees with runner default');
assert.equal(rows({ ...quiz, questions: [choice], generationConfig: { ...config, questionDistribution: { single_choice: 5, essay: 2 } } })['Jenis soal'], '5 pilihan ganda · 2 esai');
const header = renderToStaticMarkup(createElement(TopBar, { activeView: 'preparation', pageTitle: 'Persiapan Kuis', isBusy: true, onBack() {}, onNavigate() {}, onOpenSettings() {}, storageLabel: '', isKeyConfigured: false, onNewQuizClick() {} }));
const page = renderToStaticMarkup(createElement(QuizPreparation, { quiz, onStart() {} }));
assert.equal((header.match(/<h1\b/g) ?? []).length, 1);
assert.ok(header.includes('id="preparation-title"'));
assert.ok(header.includes('aria-label="Kembali ke konfigurasi" disabled'));
assert.ok(!header.includes('header-nav'));
assert.ok(page.includes('aria-labelledby="preparation-title"'));
assert.ok(page.includes('class="preparation-visual" aria-hidden="true"'));
assert.ok(!page.includes('<h1'));
assert.equal((page.match(/<li\b/g) ?? []).length, 5);
assert.ok(page.includes('Mulai kuis'));
// Exercise rapid clicks against the real component with a minimal isolated hook host.
const runtime = globalThis as any;
const slots: any[] = []; let cursor = 0;
runtime.__preparationHooks = {
  useRef(value: any) { const i = cursor++; return slots[i] ??= { current: value }; },
  useState(value: any) { const i = cursor++; if (!(i in slots)) slots[i] = value; return [slots[i], (next: any) => { slots[i] = next; }]; },
  useEffect() { cursor++; },
};
const compiled = await build({ entryPoints: ['src/components/QuizPreparation.tsx'], bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [presentationTestHost, { name: 'preparation-hooks', setup(p) {
    p.onResolve({ filter: /^(react|react\/jsx-runtime|lucide-react)$/ }, args => ({ path: args.path, namespace: 'host' }));
    p.onLoad({ filter: /.*/, namespace: 'host' }, ({ path }) => ({ contents: path === 'react'
      ? 'export const {useRef,useState,useEffect}=globalThis.__preparationHooks;'
      : path === 'react/jsx-runtime' ? 'export const jsx=(type,props)=>({type,props});export const jsxs=jsx;'
      : 'export const ArrowRight="ArrowRight",Check="Check",ListChecks="ListChecks";' }));
  } }] });
const isolated = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
let starts = 0;
const render = () => { cursor = 0; return isolated.QuizPreparation({ quiz, onStart: () => { starts++; } }); };
const startButton = render().props.children.find((child: any) => child?.type === 'button');
startButton.props.onClick(); startButton.props.onClick();
assert.equal(starts, 1, 'Rapid clicks start the runner exactly once');
assert.equal(render().props.children.find((child: any) => child?.type === 'button').props.disabled, true);
delete runtime.__preparationHooks;
console.log('PASS: preparation summary/config/legacy/mixed types, total and per-type timers/zero overrides, shared labels, accessible header and page.');
