import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { presentationTestHost } from './presentation-test-host.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuestionInput, stableShuffle } from '../src/components/QuestionInput.js';
import { evaluateAnswerCompleteness, emptyQuestionAnswer } from '../src/components/QuizRunner.js';
import { answerProgress, validateAnswer } from '../src/questionState.js';
import { validateQuestion } from '../src/questionValidation.js';
import { QUESTION_TYPES, type Quiz, type StoredAnswer } from '../src/types/quiz.js';
import { fixtures } from './assessment-fixtures.js';

const questions = QUESTION_TYPES.map((type, i) => validateQuestion({ ...fixtures[type], id: 'q' + i }, i, 'Konsep', [], type)!);
for (const question of questions) {
  const markup = renderToStaticMarkup(createElement(QuestionInput, { question, disabled: true, onChange() {} }));
  assert.ok(markup.includes('disabled'), question.type + ' supports read-only inputs');
  assert.ok(!markup.includes('Hapus jawaban'), 'Reset belongs to the card footer');
  const cleared = emptyQuestionAnswer(question, 'seed');
  assert.ok(validateAnswer(question, cleared), 'Reset preserves the answer contract');
  assert.equal(answerProgress(question, cleared), 'unanswered');
}
assert.equal(evaluateAnswerCompleteness(questions[0], 0), 'answered', 'Legacy numeric choices remain supported');
assert.equal(evaluateAnswerCompleteness(questions[2], { type: 'true_false', value: false }), 'answered');
assert.equal(evaluateAnswerCompleteness(questions[4], { type: 'essay', text: 'Awal jawaban' }), 'partial');
assert.equal(evaluateAnswerCompleteness(questions[4], { type: 'essay', text: 'Penjelasan konsep yang lengkap dengan alasan serta contoh pendukung.' }), 'answered');
assert.equal(evaluateAnswerCompleteness(questions[5], { type: 'matching', pairs: { l1: 'r1' } }), 'partial');
assert.equal(evaluateAnswerCompleteness(questions[6], { type: 'ordering', orderedItemIds: ['i1','i2','i3'], confirmed: false }), 'unanswered');
const ordering = questions[6];
if (ordering.type === 'ordering') {
  assert.deepEqual(stableShuffle(ordering.items, 'stable'), stableShuffle(ordering.items, 'stable'));
  assert.deepEqual(stableShuffle(ordering.items, 'stable').map(i => i.id).sort(), ordering.items.map(i => i.id).sort());
}

// Execute the actual runner with isolated hooks and clocks; no server, provider, or persisted history.
const runtime = globalThis as any;
let slots: any[] = [], cursor = 0, effects: (() => void | (() => void))[] = [], cleanups: (() => void)[] = [];
runtime.__runnerHooks = {
  useState(value: any) { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value;
    return [slots[i], (next: any) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
  useRef(value: any) { const i = cursor++; return slots[i] ??= { current: value }; },
  useEffect(fn: any, deps: any[]) { const i = cursor++; if (!slots[i] || deps.some((d, n) => !Object.is(d, slots[i][n]))) effects.push(fn); slots[i] = deps; },
};
const compiled = await build({ entryPoints: ['src/components/QuizRunner.tsx'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [presentationTestHost, { name: 'runner-host', setup(p) {
  p.onResolve({ filter: /^(react|react\/jsx-runtime|lucide-react)$|\/(Button|ConfirmModal|Select)\.js$/ }, args => ({ path: args.path, namespace: 'host' }));
  p.onLoad({ filter: /.*/, namespace: 'host' }, ({ path }) => {
    const names = ['Clock','Bookmark','ChevronRight','Send','Infinity','ChevronLeft','Download','X','LogOut','LockKeyhole','Check','ArrowRight','ArrowUp','ArrowDown'];
    return { contents: path === 'react' ? 'export const {useState,useRef,useEffect}=globalThis.__runnerHooks;export default {};' : path === 'react/jsx-runtime' ? 'export const jsx=(type,props)=>({type,props});export const jsxs=jsx;' : path === 'lucide-react' ? names.map(n => `export const ${n}="${n}";`).join('') : `export const ${path.split('/').at(-1)!.replace('.js','')}="${path.split('/').at(-1)!.replace('.js','')}";` };
  });
} }] });
const { QuizRunner: Runner } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
function findAll(tree: any, predicate: (node: any) => boolean): any[] {
  if (!tree) return [];
  if (Array.isArray(tree)) return tree.flatMap(t => findAll(t, predicate));
  return [...(predicate(tree) ? [tree] : []), ...findAll(tree.props?.children, predicate)];
}
const byText = (tree: any, text: string) => findAll(tree, n => n.type === 'button' && JSON.stringify(n.props.children).includes(text))[0];
const findInput = (tree: any) => findAll(tree, n => n.type?.name === 'QuestionInput')[0];
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const originalNow = Date.now, originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
let now = 100000, held = false, leaseRequests = 0;
const intervals = new Map<number, () => void>();
Date.now = () => now;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { async request(_key: string, _opts: any, fn: any) {
  leaseRequests++;
  if (held) return fn(null);
  held = true;
  try { return await fn({ name: 'fixture-lease' }); } finally { held = false; }
} } } });
runtime.document = { hidden: false, addEventListener() {}, removeEventListener() {}, getElementById() { return null; } };
runtime.window = { setInterval(fn: () => void) { const id = intervals.size + 1; intervals.set(id, fn); return id; }, addEventListener() {}, removeEventListener() {}, scrollTo() {}, matchMedia() { return { matches: true }; } };
const baseQuiz: Quiz = { id: 'runner-fixture', title: 'Fixture', topic: 'Konsep', summary: '', difficulty: 'easy', timeLimitMinutes: 0, createdAt: '', questions, displayMode: 'sequential', timePerQuestionSeconds: 0 };
let props: any, submissions: any[] = [], saved: any[] = [];
const render = () => { cursor = 0; const tree = Runner(props); const pending = effects; effects = []; for (const fn of pending) { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); } return tree; };
const stop = async () => { for (const cleanup of cleanups) cleanup(); cleanups = []; await settle(); slots = []; effects = []; intervals.clear(); };
const start = async (quiz: Quiz, initialProgress?: any, strict = false) => {
  submissions = []; saved = [];
  props = { quiz, initialProgress, onSubmit: (s: any) => submissions.push(s), onQuit() {}, onProgress: (p: any) => saved.push(p) };
  if (strict) {
    cursor = 0; Runner(props); const mountEffects = [...effects]; effects = [];
    const firstCleanups = mountEffects.map(fn => fn()).filter(Boolean) as (() => void)[];
    firstCleanups.forEach(fn => fn());
    for (const fn of mountEffects) { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); }
  } else render();
  await settle();
  return render();
};
try {
  let tree = await start(baseQuiz, undefined, true);
  assert.equal(leaseRequests, 1, 'StrictMode acquires one lease after cancelling the stale mount');
  assert.equal(findInput(tree).props.disabled, false, 'StrictMode must not create a false tab conflict');
  findInput(tree).props.onChange({ type: 'single_choice', selectedOptionId: 'o0' });
  byText(render(), 'Berikutnya').props.onClick();
  tree = render(); assert.equal(findInput(tree).props.question.id, 'q1');
  byText(tree, 'Sebelumnya').props.onClick();
  tree = render(); assert.equal(findInput(tree).props.value.selectedOptionId, 'o0', 'Untimed previous/next retains answers');
  byText(tree, 'Reset jawaban').props.onClick();
  assert.equal(findInput(render()).props.value.selectedOptionId, null);
  byText(render(), 'Kumpulkan kuis').props.onClick();
  const confirm = findAll(render(), n => n.type === 'ConfirmModal' && n.props.confirmLabel === 'Ya, kumpulkan kuis')[0];
  confirm.props.onConfirm(); confirm.props.onConfirm(); await settle();
  assert.equal(submissions.length, 1, 'Rapid confirmation submits once');
  await stop();

  now = 200000;
  tree = await start({ ...baseQuiz, timePerQuestionSeconds: 5, timePerQuestionByType: { multiple_select: 0 } });
  findInput(tree).props.onChange({ type: 'single_choice', selectedOptionId: 'o0' });
  now += 5100; for (const tick of intervals.values()) tick();
  tree = render(); assert.equal(findInput(tree).props.question.id, 'q1');
  assert.equal(byText(tree, 'Sebelumnya').props.disabled, true, 'Timed sequence locks earlier questions even when next type is untimed');
  assert.equal(saved.at(-1).deadline, 0, 'Explicit zero per-type limit remains untimed');
  const oldAnswer = saved.at(-1).answers.q0;
  findInput(tree).props.onChange({ type: 'multiple_select', selectedOptionIds: ['o0'] });
  byText(render(), 'Berikutnya').props.onClick(); render();
  assert.deepEqual(saved.at(-1).answers.q0, oldAnswer, 'Timed advance preserves earlier answers');
  assert.equal(saved.at(-1).deadline, now + 5000);
  await stop();

  now = 300000;
  const restored = { quizId: baseQuiz.id, currentIndex: 0, answers: { q2: { type: 'true_false', value: false } }, bookmarks: ['q2'], startedAt: now - 2000, deadline: now + 1000, attemptId: 'original-attempt' };
  tree = await start({ ...baseQuiz, displayMode: 'non_sequential', timeLimitMinutes: 1 }, restored);
  assert.equal(findAll(tree, n => n.props?.role === 'progressbar')[0].props['aria-valuenow'], 14);
  now += 1100; for (const tick of intervals.values()) tick(); await settle();
  assert.equal(submissions.length, 1); assert.equal(submissions[0].submitReason, 'timer');
  assert.equal(submissions[0].attemptId, 'original-attempt');
  assert.equal(submissions[0].userAnswers.q2.value, false);
  assert.deepEqual(submissions[0].bookmarkedQuestions, ['q2']);
  assert.equal(submissions[0].timeTakenSeconds, 3, 'Restored deadline is not reset');
  await stop();

  held = true;
  tree = await start(baseQuiz);
  assert.equal(findInput(tree).props.disabled, true, 'An actual other-tab lease prevents editing');
  assert.equal(byText(tree, 'Kumpulkan kuis').props.disabled, true);
  await stop(); held = false;
  console.log('PASS: seven inputs/reset contracts, false/legacy answers, essay/matching readiness, stable ordering, StrictMode leases, untimed previous/next, timed locking/type overrides, restored deadline, duplicate submit, actual tab conflict. No external calls.');
} finally {
  await stop(); Date.now = originalNow;
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator); else delete runtime.navigator;
  delete runtime.__runnerHooks; delete runtime.window; delete runtime.document;
}
