import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { emptyWorkspace, keyPaused } from '../src/workspace/types.js';
import { fixtures } from './assessment-fixtures.js';
import { validateQuestion } from '../src/questionValidation.js';
import { buildResult } from '../src/scoring.js';
import { normalizeQuizConfig } from '../src/quizConfig.js';

// Render the real App with an isolated hook host and deferred provider operations.
const runtime = globalThis as any;
runtime.__buildResult = buildResult;
runtime.__keyPaused = keyPaused;
const slots: any[] = []; let cursor = 0; let effects: (() => void)[] = [];
runtime.__hooks = {
  useState(value: any) { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value;
    return [slots[i], (next: any) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
  useRef(value: any) { const i = cursor++; return slots[i] ??= { current: value }; },
  useCallback(fn: any) { cursor++; return fn; },
  useEffect(fn: any, deps: any[]) { const i = cursor++; if (!slots[i] || deps.some((d, n) => !Object.is(d, slots[i][n]))) effects.push(fn); slots[i] = deps; },
};
runtime.window = { scrollTo() {} };
let updates = 0;
runtime.__workspace = { scope: 'account-fixture', mode: 'account', ready: true, data: emptyWorkspace(), keys: [{}],
  session: { user: { email: 'fixture' } }, repository: { scope: 'account-fixture' },
  update: async () => { updates++; }, refresh: async () => {} };
const pending: any[] = [];
runtime.__generate = (...args: any[]) => new Promise((resolve, reject) => pending.push({ args, resolve, reject }));
const compiled = await build({ entryPoints: ['src/App.tsx'], bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'app-host', setup(p) {
    p.onResolve({ filter: /^(react|react\/jsx-runtime|lucide-react)$|components\/|workspace\/|scoring\.js$/ }, args => ({ path: args.path, namespace: 'host' }));
    p.onLoad({ filter: /.*/, namespace: 'host' }, ({ path }) => {
      let contents = '';
      if (path === 'react') contents = 'export const {useState,useRef,useCallback,useEffect}=globalThis.__hooks;';
      else if (path === 'react/jsx-runtime') contents = 'export const Fragment="Fragment";export const jsx=(type,props)=>({type,props});export const jsxs=jsx;';
      else if (path.includes('useWorkspace')) contents = 'export const useWorkspace=()=>globalThis.__workspace;';
      else if (path.includes('/types.js')) contents = 'export const keyPaused=globalThis.__keyPaused;';
      else if (path.includes('/ai.js')) contents = 'export const availableKeys=()=>[{}];export const generateWorkspaceQuiz=(...a)=>globalThis.__generate(...a);';
      else if (path.includes('supabase')) contents = 'export const accountRpc=async()=>{};';
      else if (path.includes('evaluation')) contents = 'export const evaluateWorkspace=async()=>{};';
      else if (path.includes('scoring')) contents = 'export const buildResult=(...args)=>globalThis.__buildResult(...args);';
      else { const names = path === 'lucide-react' ? ['Settings2','Monitor','Cloud','ArrowRight','RefreshCw'] : [path.split('/').at(-1)!.replace('.js','')];
        contents = names.map(name => `export const ${name}="${name}";`).join(''); }
      return { contents };
    });
  } }] });
const { default: App } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
function render() { cursor = 0; const tree = App(); const run = effects; effects = []; run.forEach(fn => fn()); return tree; }
function find(tree: any, type: string): any { if (!tree) return; if (Array.isArray(tree)) return tree.map(t => find(t, type)).find(Boolean);
  if (tree.type === type) return tree; return find(tree.props?.children, type); }
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
render();
runtime.__workspace.ready = false; runtime.__workspace.storageLoading = true;
assert.ok(JSON.stringify(render()).includes('Memuat penyimpanan akun'), 'Account loading must have a loading screen');
assert.ok(!JSON.stringify(render()).includes('Penyimpanan perlu diperiksa'), 'Loading must not show a storage failure');
runtime.__workspace.storageLoading = false; runtime.__workspace.error = 'Fixture storage failure';
assert.ok(JSON.stringify(render()).includes('Penyimpanan perlu diperiksa'), 'Settled failure has a recovery screen');
runtime.__workspace.mode = 'initializing'; runtime.__workspace.error = 'Fixture startup timeout';
assert.ok(JSON.stringify(render()).includes('Fixture startup timeout'));
assert.ok(!JSON.stringify(render()).includes('Memulihkan ruang penyimpanan'), 'Startup timeout must exit the loading screen');
runtime.__workspace.mode = 'account'; runtime.__workspace.ready = true; runtime.__workspace.error = '';
const firstCreator = find(render(), 'QuizCreator');
firstCreator.props.onNavigate('configuration');
assert.equal(pending.length, 0, 'Entering configuration never calls generation');
firstCreator.props.onGenerate({ topic: 'First', questionCount: 1 });
firstCreator.props.onGenerate({ topic: 'Duplicate click', questionCount: 1 });
assert.equal(pending.length, 1, 'Rapid submissions cannot dispatch a second provider operation');
assert.ok(find(render(), 'GenerationLoader'));
runtime.__workspace.mode = 'reauth_required'; runtime.__workspace.ready = false; render();
assert.equal(pending[0].args[5].aborted, true);
runtime.__workspace.mode = 'account'; runtime.__workspace.ready = true; render();
find(render(), 'QuizCreator').props.onGenerate({ topic: 'Second', questionCount: 1 });
pending[0].reject(new Error('Old operation rejected after session recovery')); await settle();
assert.ok(find(render(), 'GenerationLoader'), 'Old finally must not clear the new operation');
assert.equal(updates, 0, 'Old catch must not record a user cancellation');
assert.equal(pending[1].args[5].aborted, false, 'New operation remains active');
pending[1].resolve({ id: 'second', questions: [] }); await settle();
assert.equal(find(render(), 'QuizPreparation').props.quiz.id, 'second');
assert.equal(find(render(), 'QuizRunner'), undefined, 'Runner and timer are absent until Start');
assert.equal(updates, 1, 'Only current operation saves its result');
find(render(), 'QuizPreparation').props.onStart();
assert.equal(find(render(), 'QuizRunner').props.quiz.id, 'second');
runtime.__generate = (...args: any[]) => new Promise((_resolve, reject) => {
  const signal = args[5] as AbortSignal;
  signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  pending.push({ args });
});
find(render(), 'QuizRunner').props.onQuit();
find(render(), 'QuizCreator').props.onGenerate({ topic: 'Cancel', questionCount: 1 });
const loadingTree = render();
const controls = (function byClass(node: any): any {
  if (!node) return;
  if (Array.isArray(node)) return node.map(byClass).find(Boolean);
  if (node.props?.className === 'generation-controls') return node;
  return byClass(node.props?.children);
})(loadingTree);
assert.ok(controls, 'Cancel controls are shown during generation');
const cancelButton = controls.props.children.find((child: any) => child?.type === 'button');
await cancelButton.props.onClick();
assert.equal(pending[2].args[5].aborted, true, 'Cancel reaches the active provider signal');
assert.ok(find(render(), 'QuizCreator'), 'Cancel returns to the creator');
assert.equal(find(render(), 'GenerationLoader'), undefined);
const toast = (function byToast(node: any): any {
  if (!node) return;
  if (Array.isArray(node)) return node.map(byToast).find(Boolean);
  if (typeof node.props?.className === 'string' && node.props.className.startsWith('app-toast')) return node;
  return byToast(node.props?.children);
})(render());
assert.match(toast.props.children, /berhasil dibatalkan/);
const savedQuiz = { id: 'resume-fixture', title: 'Saved quiz', questions: [validateQuestion({ ...fixtures.single_choice, id: 'q1' }, 0, 'Konsep', [], 'single_choice')!] };
const savedProgress = { quizId: savedQuiz.id, currentIndex: 0, answers: { q1: 0 }, bookmarks: ['q1'], attemptId: 'preserved-attempt', startedAt: 1000, deadline: 901000 };
runtime.__workspace.data.history = [{ quiz: savedQuiz, savedAt: '' }];
runtime.__workspace.data.progress = savedProgress;
const continueSection = find(render(), 'QuizCreator').props.continueLearning;
find(continueSection, 'button').props.onClick();
assert.deepEqual(find(render(), 'QuizRunner').props.initialProgress, savedProgress);
const beforeHome = updates;
find(render(), 'TopBar').props.onNavigate('creator');
assert.equal(updates, beforeHome, 'Go Home performs no destructive workspace update');
assert.deepEqual(runtime.__workspace.data.progress, savedProgress);
assert.ok(find(render(), 'QuizCreator').props.continueLearning);
console.log('PASS: real App configuration without generation, duplicate submission guard, session recovery/cancel, Go Home preservation, Continue Learning answer/bookmark/attempt/deadline restoration. No external calls.');

// Exercise both result actions against the real App and a deferred, simulated provider.
runtime.__workspace.update = async (updater: any) => { updates++; runtime.__workspace.data = updater(runtime.__workspace.data); };
runtime.__generate = (...args: any[]) => new Promise((resolve, reject) => pending.push({ args, resolve, reject }));
const originalPreferences = structuredClone(runtime.__workspace.data.preferences);
const earlierHistoryCount = runtime.__workspace.data.history.length;
const originalConfig = normalizeQuizConfig({ topic: 'Karbohidrat', studyMaterial: 'Materi awal yang harus dipertahankan.', questionCount: 1,
  questionType: 'single_choice', difficulty: 'hard', language: 'en', timeLimitMinutes: 0, model: originalPreferences.model, enableGrounding: originalPreferences.grounding });
const originalQuiz = { id: 'regenerate-original', title: 'Kuis asal', topic: originalConfig.topic, summary: 'Fixture', difficulty: originalConfig.difficulty,
  timeLimitMinutes: 0, createdAt: '2026-10-12T00:00:00Z', questions: [validateQuestion({ ...fixtures.single_choice, id: 'q1' }, 0, 'Konsep', [], 'single_choice')!] };
find(render(), 'QuizCreator').props.onGenerate(originalConfig);
pending.at(-1).resolve(originalQuiz); await settle();
const preparationTree = render();
const firstGenerated = find(preparationTree, 'QuizPreparation').props.quiz;
assert.deepEqual(firstGenerated.generationConfig, originalConfig);
assert.deepEqual(firstGenerated.generationPreferences, originalPreferences);
assert.equal(find(preparationTree, 'QuizRunner'), undefined);
assert.ok(JSON.stringify(preparationTree).includes('Kuis berhasil dibuat.'));
const draftBeforeBack = structuredClone(runtime.__workspace.data.draft);
const progressBeforeBack = structuredClone(runtime.__workspace.data.progress);
find(preparationTree, 'TopBar').props.onBack();
assert.equal(find(render(), 'TopBar').props.activeView, 'configuration');
assert.equal(find(render(), 'QuizPreparation'), undefined);
assert.deepEqual(runtime.__workspace.data.draft, draftBeforeBack);
assert.deepEqual(runtime.__workspace.data.progress, progressBeforeBack);
assert.ok(runtime.__workspace.data.history.some((h: any) => h.quiz.id === firstGenerated.id), 'Back preserves the saved quiz');
find(render(), 'TopBar').props.onNavigate('history');
find(render(), 'QuizHistoryView').props.onSelectQuiz(firstGenerated);
assert.ok(find(render(), 'QuizRunner'), 'History bypasses preparation');
runtime.__workspace.data.preferences = { ...originalPreferences, grounding: !originalPreferences.grounding, keyId: 'changed-key' };
const submission = { quizId: originalQuiz.id, userAnswers: { q1: 0 }, bookmarkedQuestions: [], timeTakenSeconds: 10, completedAt: '2026-10-12T00:01:00Z' };
find(render(), 'QuizRunner').props.onSubmit(submission); await settle();
const beforeRemedial = pending.length;
find(render(), 'QuizResults').props.onRetake(); await settle();
assert.equal(pending.length, beforeRemedial, 'Remedial never calls the generator');
assert.deepEqual(find(render(), 'QuizRunner').props.quiz.questions, originalQuiz.questions);
assert.equal(find(render(), 'QuizRunner').props.initialProgress, null, 'Remedial starts with fresh answers and timer');
find(render(), 'QuizRunner').props.onSubmit({ ...submission, completedAt: '2026-10-12T00:02:00Z' }); await settle();
const resultActions = find(render(), 'QuizResults').props;
resultActions.onRegenerate(); resultActions.onRegenerate();
assert.equal(pending.length, beforeRemedial + 1, 'Duplicate clicks dispatch only one new generation');
assert.deepEqual(pending.at(-1).args[0], originalConfig);
assert.deepEqual(pending.at(-1).args[1], originalPreferences, 'Preferences changed later do not replace the original ones');
pending.at(-1).resolve({ ...originalQuiz, id: 'regenerate-fresh', questions: [{ ...originalQuiz.questions[0], id: 'new-q1', question: 'Soal baru dari provider fixture?' }] }); await settle();
assert.equal(find(render(), 'QuizPreparation').props.quiz.id, 'regenerate-fresh');
assert.equal(find(render(), 'QuizRunner'), undefined, 'Regeneration also waits for Start');
assert.equal(runtime.__workspace.data.progress, null, 'Preparation does not create progress');
find(render(), 'QuizPreparation').props.onStart();
assert.equal(find(render(), 'QuizRunner').props.quiz.id, 'regenerate-fresh');
assert.equal(runtime.__workspace.data.history.length, earlierHistoryCount + 2, 'Original result and earlier unrelated history remain preserved');
assert.equal(runtime.__workspace.data.history.find((h: any) => h.quiz.id === originalQuiz.id).attempts.length, 2);
console.log('PASS: regeneration reuses exact config/preferences with one new provider dispatch; remedial uses identical questions, fresh progress, no provider call, and preserves attempts/history.');
