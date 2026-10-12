import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { zipSync, strToU8 } from 'fflate';
import { restoreComposerDraft, composerSources, applyQuickStart, QUICK_STARTS } from '../src/composerDraft.js';
import { checkedText, ingestAttachment, openXmlEntries, validateAttachment } from '../src/materialIngestion.js';
import { emptyWorkspace } from '../src/workspace/types.js';
import { localRepository } from '../src/workspace/localRepository.js';
import { resumableQuiz } from '../src/resumableSession.js';
import { fixtures } from './assessment-fixtures.js';
import { validateQuestion } from '../src/questionValidation.js';
import { activeQuestionTypes, compositionError, equalDistribution, type Composition } from '../src/questionComposition.js';
import { QUESTION_TYPES } from '../src/types/quiz.js';

const legacy = restoreComposerDraft({ inputMode: 'material', topic: 'Legacy', studyMaterial: 'Catatan lama', difficulty: 'advanced', unknownField: 'preserve' });
assert.equal(legacy.difficulty, 'hard'); assert.equal(legacy.unknownField, 'preserve');
const attached = { id: 'f1', name: 'notes.txt', size: 12, fingerprint: 'hash', kind: 'text' as const, status: 'ready' as const, text: 'Materi file.' };
const draft = { ...legacy, attachments: [attached] };
for (const preset of QUICK_STARTS) {
  const next = applyQuickStart(draft, preset.id);
  assert.equal(next.topic, draft.topic); assert.equal(next.studyMaterial, draft.studyMaterial); assert.deepEqual(next.attachments, draft.attachments);
  assert.ok(Number(next.countChoice) >= 1 && Number(next.countChoice) <= 100);
}
const sources = composerSources(draft);
assert.ok(sources.material.includes('[Konteks materi]\nCatatan lama'));
assert.ok(sources.material.includes('[Lampiran: notes.txt]\nMateri file.'));
assert.equal(composerSources({ ...draft, topic: '', studyMaterial: '' }).usable, true);
assert.equal(composerSources({ ...draft, topic: '', attachments: [] }).usable, true);
assert.equal(composerSources({ ...draft, topic: '', studyMaterial: '', attachments: [] }).usable, false);
assert.match(composerSources({ ...draft, studyMaterial: 'x'.repeat(15000) }).error, /15.000/);
assert.match(composerSources({ ...draft, attachments: [{ ...attached, status: 'error' }] }).error, /gagal/);
assert.equal(restoreComposerDraft({ attachments: [{ ...attached, status: 'processing' }] }).attachments[0].status, 'error');
assert.throws(() => validateAttachment({ name: 'a.doc', size: 20 }), /DOCX/);
assert.throws(() => validateAttachment({ name: 'a.pdf', size: 6 * 1024 * 1024 }), /5 MB/);
assert.throws(() => validateAttachment({ name: 'unknown.exe', size: 2 }), /belum didukung/);
assert.throws(() => checkedText(''), /Tidak ada teks/);
assert.throws(() => checkedText('x'.repeat(12001)), /12.000/);
const signal = new AbortController().signal;
assert.equal(await ingestAttachment(new File(['Fotosintesis membutuhkan cahaya.'], 'notes.txt'), signal), 'Fotosintesis membutuhkan cahaya.');
await assert.rejects(ingestAttachment(new File([new Uint8Array([0, 1, 2])], 'binary.txt'), signal), /biner/);
await assert.rejects(ingestAttachment(new File(['{broken'], 'broken.json'), signal), /JSON tidak valid/);
await assert.rejects(ingestAttachment(new File(['not a pdf'], 'fake.pdf'), signal), /PDF yang valid/);
assert.throws(() => openXmlEntries(zipSync({ 'word/document.xml': strToU8('<x/>') }), 'docx'), /valid/);
assert.throws(() => openXmlEntries(zipSync({ '[Content_Types].xml': strToU8('<x/>'), 'word/document.xml': new Uint8Array(21 * 1024 * 1024) }), 'docx'), /terlalu besar/);
const snapshot = await localRepository.load();
await localRepository.save({ ...snapshot.data, draft }, snapshot.revision);
assert.deepEqual((await localRepository.load()).data.draft, draft, 'Guest draft persists extracted contents without File objects or schema changes');
const question = validateQuestion({ ...fixtures.single_choice, id: 'q1' }, 0, 'Konsep', [], 'single_choice')!;
const quiz = { id: 'quiz1', title: 'Fixture', topic: 'Konsep', summary: '', difficulty: 'easy' as const, timeLimitMinutes: 15, createdAt: new Date().toISOString(), questions: [question] };
const progress = { quizId: 'quiz1', currentIndex: 0, answers: { q1: 0 }, bookmarks: ['q1'], attemptId: 'original-attempt', startedAt: 100, deadline: 900100 };
assert.equal(resumableQuiz([{ quiz, savedAt: '' }], progress), quiz);
assert.equal(resumableQuiz([], progress), null);
assert.equal(resumableQuiz([{ quiz, savedAt: '' }], { ...progress, currentIndex: 10 }), null);
assert.equal(progress.deadline, 900100); assert.equal(progress.attemptId, 'original-attempt');

// Exercise the real creator + draft hook. Only rendering dependencies are stubbed.
const runtime = globalThis as any;
const slots: any[] = []; let cursor = 0; let effects: (() => void)[] = [];
const timers = new Map<number, () => void>(); let timerId = 0;
const originals = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
runtime.__composerHooks = {
  useState(value: any) { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value; return [slots[i], (next: any) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
  useRef(value: any) { const i = cursor++; return slots[i] ??= { current: value }; },
  useEffect(fn: any, deps: any[]) { const i = cursor++; if (!slots[i] || deps.some((d, n) => !Object.is(d, slots[i].deps[n]))) { const prior = slots[i]; slots[i] = { deps }; effects.push(() => { prior?.cleanup?.(); slots[i].cleanup = fn(); }); } },
};
runtime.window = { addEventListener() {}, removeEventListener() {} }; runtime.document = { addEventListener() {}, removeEventListener() {}, hidden: false };
globalThis.setTimeout = ((fn: () => void) => { const id = ++timerId; timers.set(id, fn); return id; }) as any;
globalThis.clearTimeout = ((id: number) => { timers.delete(id); }) as any;
try {
  const compiled = await build({ entryPoints: ['src/components/QuizCreator.tsx'], bundle: true, write: false, platform: 'node', format: 'esm',
    plugins: [{ name: 'creator-host', setup(p) {
      p.onResolve({ filter: /^(react|react\/jsx-runtime|lucide-react)$|\/Button\.js$|\/QuizComposer\.js$|\/QuestionComposition\.js$|\/QuestionScoring\.js$|\/LanguageStyleSelector\.js$|\/DurationControl\.js$/ }, args => ({ path: args.path, namespace: 'host' }));
      p.onLoad({ filter: /.*/, namespace: 'host' }, ({ path }) => {
        let contents = '';
        if (path === 'react') contents = 'export const {useState,useRef,useEffect}=globalThis.__composerHooks;export default {};';
        else if (path === 'react/jsx-runtime') contents = 'export const Fragment="Fragment";export const jsx=(type,props)=>({type,props});export const jsxs=jsx;';
        else if (path === 'lucide-react') contents = ['ArrowLeft','ArrowRight','BrainCircuit','Check','ChevronLeft','ChevronRight','ShieldCheck','Sparkles','Zap','GraduationCap','Lightbulb'].map(n => `export const ${n}="${n}";`).join('');
        else if (path.includes('QuestionComposition')) contents = 'export const QuestionComposition="QuestionComposition";export const defaultComposition={mode:"single",type:"single_choice",distribution:{single_choice:5,multiple_select:5},points:{},partialCredit:false};';
        else { const name = path.split('/').at(-1)!.replace('.js', ''); contents = `export const ${name}="${name}";`; }
        return { contents };
      });
    } }] });
  const { QuizCreator } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
  let stage = 'creator', generates = 0, config: any, stored: any, rejectSave = false;
  let deferred: (() => void) | null = null;
  const props = { preferences: emptyWorkspace().preferences, hasApiKey: true, storageLabel: 'Fixture', isLoading: false, errorMessage: null,
    initialDraft: draft, onOpenSettings() {}, onNavigate(next: string) { stage = next; }, onGenerate(next: any) { generates++; config = next; },
    onDraft: async (next: any) => { if (rejectSave) throw new Error('Fixture disk failure'); if (deferred) await new Promise<void>(resolve => { deferred = resolve; }); stored = structuredClone(next); } };
  function render() { cursor = 0; const tree = QuizCreator({ ...props, stage }); const pending = effects; effects = []; pending.forEach(fn => fn()); return tree; }
  function find(tree: any, predicate: (n: any) => boolean): any { if (!tree) return; if (Array.isArray(tree)) return tree.map(n => find(n, predicate)).find(Boolean); if (predicate(tree)) return tree; return find(tree.props?.children, predicate); }
  const component = (tree: any, type: string) => find(tree, n => n.type === type);
  const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
  let tree = render();
  component(tree, 'QuizComposer').props.patch({ topic: 'Last edit', studyMaterial: 'Last context' });
  tree = render(); deferred = () => {};
  component(tree, 'QuizComposer').props.onContinue(); await settle();
  assert.equal(stage, 'creator', 'Navigation awaits last edit persistence'); assert.equal(generates, 0);
  deferred!(); deferred = null; await settle(); tree = render();
  assert.equal(stage, 'configuration'); assert.equal(stored.topic, 'Last edit'); assert.equal(stored.studyMaterial, 'Last context');
  find(tree, n => n.type === 'input' && n.props?.name === 'quiz-language' && n.props.value === 'en').props.onChange();
  tree = render();
  find(tree, n => n.props?.className === 'configuration-back').props.onClick(); await settle(); tree = render();
  assert.equal(component(tree, 'QuizComposer').props.draft.language, 'en'); assert.deepEqual(component(tree, 'QuizComposer').props.draft.attachments, [attached]);
  component(tree, 'QuizComposer').props.onContinue(); await settle(); tree = render();
  const form = find(tree, n => n.type === 'form');
  const event = { preventDefault() {} };
  await Promise.all([form.props.onSubmit(event), form.props.onSubmit(event)]);
  assert.equal(generates, 1, 'Concurrent Mulai submissions invoke generation once');
  assert.equal(config.language, 'en'); assert.ok(config.studyMaterial.includes('Last context')); assert.ok(config.studyMaterial.includes('Materi file.'));
  assert.equal(config.topic, 'Last edit');
  component(tree, 'DurationControl').props.onChange('20'); tree = render();
  find(tree, n => n.type === 'input' && n.props?.name === 'display-mode' && n.props.value === 'sequential').props.onChange(); tree = render();
  assert.equal(component(tree, 'DurationControl').props.value, '60');
  component(tree, 'DurationControl').props.onChange('90'); tree = render();
  component(tree, 'DurationControl').props.onUnlimitedChange(true); tree = render();
  assert.equal(component(tree, 'DurationControl').props.unlimited, true);
  component(tree, 'DurationControl').props.onUnlimitedChange(false); tree = render();
  assert.equal(component(tree, 'DurationControl').props.value, '90');
  find(tree, n => n.type === 'input' && n.props?.name === 'display-mode' && n.props.value === 'non_sequential').props.onChange(); tree = render();
  assert.equal(component(tree, 'DurationControl').props.value, '20', 'Duration component callbacks retain both mode units independently');
  // Exercise the real creator's payload wiring for all seven types and mixed allocation.
  for (const type of QUESTION_TYPES) {
    const gallery = component(tree, 'QuestionComposition');
    gallery.props.onChange({ ...gallery.props.value, mode: 'single', type }); tree = render();
    await find(tree, n => n.type === 'form').props.onSubmit(event); tree = render();
    assert.equal(config.questionType, type); assert.deepEqual(config.questionDistribution, { [type]: 10 });
  }
  const mixed: Composition = { ...component(tree, 'QuestionComposition').props.value, mode: 'mixed', distribution: equalDistribution(QUESTION_TYPES, 11), points: { essay: 4 }, times: { essay: 0 }, partialCredit: true };
  component(tree, 'QuestionComposition').props.onChange(mixed);
  tree = render();
  find(tree, n => n.type === 'input' && n.props?.name === 'display-mode' && n.props.value === 'sequential').props.onChange(); tree = render();
  await find(tree, n => n.type === 'form').props.onSubmit(event); tree = render();
  assert.equal(config.questionCount, 11); assert.deepEqual(config.questionDistribution, mixed.distribution);
  assert.equal(config.pointsByType.essay, 4); assert.equal(config.timePerQuestionByType.essay, 0); assert.equal(config.partialCredit, true);
  const beforeInvalid = generates;
  component(tree, 'QuestionComposition').props.onChange({ ...mixed, distribution: {} }); tree = render();
  await find(tree, n => n.type === 'form').props.onSubmit(event); assert.equal(generates, beforeInvalid, 'Empty mixed composition blocks generation');
  assert.match(compositionError(component(tree, 'QuestionComposition').props.value, 12), /minimal satu/);
  component(tree, 'QuestionComposition').props.onChange(mixed); tree = render();
  assert.equal(compositionError(mixed, 12), '', 'Universal target no longer conflicts with mixed totals');
  const gallery = component(tree, 'QuestionComposition'); gallery.props.onChange({ ...gallery.props.value, mode: 'single' }); tree = render();
  component(tree, 'QuestionComposition').props.onChange({ ...component(tree, 'QuestionComposition').props.value, mode: 'mixed' }); tree = render();
  const preserved = component(tree, 'QuestionComposition').props.value;
  assert.deepEqual(preserved.distribution, mixed.distribution); assert.deepEqual(preserved.points, mixed.points); assert.deepEqual(preserved.times, mixed.times);
  await find(tree, n => n.type === 'form').props.onSubmit(event); tree = render();
  assert.deepEqual(restoreComposerDraft(stored).composition, preserved, 'Saved draft restores full mixed and single configuration');
  assert.equal(activeQuestionTypes(mixed).length, 7);
  stage = 'creator'; tree = render(); component(tree, 'QuizComposer').props.patch({ topic: 'Unsaved' }); tree = render(); rejectSave = true;
  component(tree, 'QuizComposer').props.onContinue(); await settle(); tree = render();
  assert.equal(stage, 'creator'); assert.match(component(tree, 'QuizComposer').props.saveError, /Fixture disk failure/);
  rejectSave = false;
  deferred = () => {};
  component(tree, 'QuizComposer').props.onContinue(); await settle();
  for (const slot of slots) slot?.cleanup?.(); await settle();
  deferred!(); deferred = null; await settle();
  assert.equal(stage, 'creator', 'An unmounted workspace cannot finish a stale navigation');
  console.log('PASS: actual composer workflow, immediate navigation flush, no homepage generation, single Start, Back preservation, extracted draft persistence, legacy drafts, presets, bounded/invalid uploads, session validation, save failure recovery.');
} finally { Object.assign(globalThis, originals); delete runtime.__composerHooks; }
