import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { emptyWorkspace } from '../src/workspace/types.js';

// Exercise the real hook, account repository and request adapter without real credentials.
const runtime = globalThis as any;
let slots: any[] = [], cursor = 0, effects: (() => void)[] = [];
const same = (a: any[], b: any[]) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
runtime.__workspaceHooks = {
  useState(value: any) { const i = cursor++; if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value;
    return [slots[i], (next: any) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
  useRef(value: any) { const i = cursor++; return slots[i] ??= { current: value }; },
  useCallback(fn: any, deps: any[]) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
  useEffect(fn: any, deps: any[]) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) {
    const previous = slots[i]; slots[i] = { deps, effect: true };
    effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); });
  } },
};
let listener: (event: string, next: any) => void;
let identity: any = null;
let authLookup: () => Promise<any> = async () => ({ data: { session: identity }, error: null });
runtime.__workspaceAuth = {
  getSession: () => authLookup(),
  onAuthStateChange(fn: typeof listener) { listener = fn; return { data: { subscription: { unsubscribe() {} } } }; },
  signOut: async () => { identity = null; listener('SIGNED_OUT', null); return { error: null }; },
};
runtime.__workspaceLocal = { scope: 'guest', load: async () => ({ revision: 0, data: { ...emptyWorkspace(), draft: { topic: 'local' } } }), keys: async () => [] };
const compiled = await build({ stdin: { contents: "export { useWorkspace } from './src/workspace/useWorkspace.js'; export { accountSession } from './src/workspace/supabase.js';", resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'workspace-host', setup(p) {
    p.onResolve({ filter: /^react$|^@supabase\/supabase-js$|localRepository\.js$/ }, args => ({ path: args.path, namespace: 'host' }));
    p.onLoad({ filter: /.*/, namespace: 'host' }, ({ path }) => ({ contents: path === 'react'
      ? 'export const {useState,useRef,useCallback,useEffect}=globalThis.__workspaceHooks;'
      : path === '@supabase/supabase-js' ? 'export const createClient=()=>({auth:globalThis.__workspaceAuth});'
      : 'export const localRepository=globalThis.__workspaceLocal;' }));
  } }] });
const { useWorkspace, accountSession } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const originals = { fetch: globalThis.fetch, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, BroadcastChannel: globalThis.BroadcastChannel };
const timers = new Map<number, { delay: number; fn: () => void }>(); let timerId = 0;
globalThis.setTimeout = ((fn: () => void, delay: number) => { const id = ++timerId; timers.set(id, { delay, fn }); return id; }) as any;
globalThis.clearTimeout = ((id: number) => { timers.delete(id); }) as any;
globalThis.BroadcastChannel = undefined as any;
function tick(delay: number) { for (const [id, timer] of [...timers]) if (timer.delay === delay) { timers.delete(id); timer.fn(); } }
function render() { cursor = 0; const result = useWorkspace(); const pending = effects; effects = []; pending.forEach(fn => fn()); return result; }
async function settle() { for (let i = 0; i < 35; i++) await Promise.resolve(); }
function emit(event: string, owner: string | null) { identity = owner ? { user: { id: owner, email: owner + '@example.org' }, access_token: 'fixture-' + owner } : null; listener(event, identity); tick(0); }
type Pending = { url: string; options: RequestInit; resolve: (value: Response) => void; reject: (error: Error) => void };
const requests: Pending[] = [];
globalThis.fetch = ((url: string, options: RequestInit) => new Promise<Response>((resolve, reject) => requests.push({ url, options, resolve, reject }))) as any;
function reply(request: Pending, data: any, status = 200) { request.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })); }
const snapshot = (topic: string) => ({ revision: 1, data: { ...emptyWorkspace(), draft: { topic } } });
function cleanup() { slots.filter(slot => slot?.effect).forEach(slot => slot.cleanup?.()); slots = []; effects = []; timers.clear(); requests.length = 0; identity = null; }
try {
  render(); emit('INITIAL_SESSION', 'A'); await settle();
  let w = render(); assert.equal(w.storageLoading, true); assert.equal(w.ready, false); assert.equal(w.error, '');
  assert.equal(requests.length, 1); assert.match(requests[0].url, /qm_load_workspace/);
  emit('SIGNED_IN', 'A'); emit('TOKEN_REFRESHED', 'A'); await settle();
  assert.equal(requests.length, 1, 'Same-account auth events must not restart pending storage loads');
  reply(requests[0], snapshot('A')); await settle(); assert.equal(requests.length, 2);
  assert.match(requests[1].url, /qm_api_keys/); reply(requests[1], []); await settle();
  w = render(); assert.equal(w.ready, true, 'An account without keys is ready'); assert.equal(w.storageLoading, false);
  emit('USER_UPDATED', 'A'); await settle(); assert.equal(requests.length, 2);
  const firstRefresh = w.refresh(); const secondRefresh = w.refresh(); await settle();
  assert.equal(requests.length, 3, 'Concurrent refresh clicks share a single load');
  requests[2].reject(new TypeError('Failed to fetch')); await Promise.all([firstRefresh, secondRefresh]);
  w = render(); assert.equal(w.ready, true); assert.equal(w.data.draft.topic, 'A'); assert.match(w.error, /Memuat data penyimpanan/);

  const retry = w.refresh(); await settle(); const old = requests[3];
  emit('SIGNED_IN', 'B'); await settle(); assert.equal(old.options.signal!.aborted, true);
  reply(old, snapshot('old A')); await retry; await settle();
  w = render(); assert.equal(w.ready, false); assert.equal(w.data.draft, null); assert.equal(w.scope, 'B');
  reply(requests[4], snapshot('B')); await settle(); reply(requests[5], { message: 'missing table', code: 'PGRST205' }, 404); await settle();
  w = render(); assert.equal(w.ready, false); assert.equal(w.storageLoading, false); assert.match(w.error, /Memuat daftar API key.*Migrasi/);
  emit('SIGNED_IN', 'B'); await settle(); assert.equal(requests.length, 6, 'Auth events must not loop after a storage failure');
  const recover = w.refresh(); await settle(); reply(requests[6], snapshot('B')); await settle(); reply(requests[7], []); await recover;
  w = render(); assert.equal(w.ready, true); assert.equal(w.data.draft.topic, 'B');

  const expired = w.refresh(); await settle(); reply(requests[8], { message: 'JWT expired' }, 401); await expired;
  w = render(); assert.equal(w.mode, 'reauth_required'); assert.equal(w.session, null); assert.equal(w.ready, false); assert.equal(w.data.draft, null);
  emit('SIGNED_IN', 'B'); await settle(); reply(requests[9], snapshot('B')); await settle(); reply(requests[10], []); await settle();
  w = render(); assert.equal(w.ready, true);
  await w.logout(); tick(0); await settle(); w = render(); assert.equal(w.mode, 'guest'); assert.equal(w.data.draft.topic, 'local');
  cleanup();

  // A session lookup that never completes must exit loading even before fetch starts.
  render(); authLookup = () => new Promise(() => {}); emit('INITIAL_SESSION', 'A'); await settle();
  assert.equal(requests.length, 0); tick(30000); await settle(); w = render();
  assert.equal(w.storageLoading, false); assert.equal(w.ready, false); assert.match(w.error, /batas waktu/);
  cleanup(); authLookup = async () => ({ data: { session: identity }, error: null });

  render(); tick(30000); w = render(); assert.equal(w.mode, 'initializing'); assert.equal(w.storageLoading, false); assert.match(w.error, /batas waktu/);
  identity = { user: { id: 'C' }, access_token: 'fixture-C' }; await w.refresh(); await settle();
  reply(requests[0], snapshot('C')); await settle(); reply(requests[1], []); await settle(); w = render(); assert.equal(w.ready, true);
  // Invalid upstream payloads become meaningful errors rather than a blank screen.
  const invalid = w.refresh(); await settle(); requests[2].resolve(new Response('<html>upstream unavailable</html>', { status: 502 })); await invalid;
  w = render(); assert.match(w.error, /HTTP 502/); assert.equal(w.ready, true);
  const malformed = w.refresh(); await settle(); reply(requests[3], null); await malformed; w = render(); assert.match(w.error, /tidak valid/);
  authLookup = async () => ({ data: { session: null }, error: new Error('Authentication network unavailable') });
  await w.refresh(); w = render(); assert.equal(w.mode, 'account'); assert.equal(w.ready, true); assert.match(w.error, /network unavailable/);
  authLookup = async () => ({ data: { session: { user: { id: 'other' } } }, error: null });
  await assert.rejects(accountSession('C', AbortSignal.timeout(20000)), /Identitas akun berubah/);
  const controller = new AbortController(); authLookup = () => new Promise(() => {});
  const aborted = accountSession('C', controller.signal); controller.abort(new Error('cancelled'));
  await assert.rejects(aborted, /cancelled/);
  console.log('PASS: actual workspace hook/repository: auth deduplication, empty keys, refresh deduplication, retained snapshot, account isolation, abort, missing schema, retry, expired session, re-login, guest isolation, whole-load timeout, startup recovery, malformed responses, session cancellation.');
} finally {
  cleanup(); Object.assign(globalThis, originals);
  delete runtime.__workspaceHooks; delete runtime.__workspaceAuth; delete runtime.__workspaceLocal;
}
