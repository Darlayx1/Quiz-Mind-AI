import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { emptyWorkspace } from '../src/workspace/types.js';

// Render the real App with an isolated hook host and deferred provider operations.
const runtime = globalThis as any;
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
      else if (path.includes('/ai.js')) contents = 'export const availableKeys=()=>[{}];export const generateWorkspaceQuiz=(...a)=>globalThis.__generate(...a);';
      else if (path.includes('supabase')) contents = 'export const accountRpc=async()=>{};';
      else if (path.includes('evaluation')) contents = 'export const evaluateWorkspace=async()=>{};';
      else if (path.includes('scoring')) contents = 'export const buildResult=()=>{};';
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
find(render(), 'QuizCreator').props.onGenerate({ topic: 'First', questionCount: 1 });
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
assert.equal(find(render(), 'QuizRunner').props.quiz.id, 'second');
assert.equal(updates, 1, 'Only current operation saves its result');
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
console.log('PASS: real App session recovery and cancel action aborts generation and returns to creator. No external calls.');
