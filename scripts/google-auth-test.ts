import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AISettings } from '../src/components/AISettings.js';
import { completeAuthCallback, createGoogleSignIn, profileName, readAuthCallback, verifyGoogleProvider } from '../src/workspace/googleAuth.js';
import { emptyWorkspace } from '../src/workspace/types.js';
import type { WorkspaceController } from '../src/workspace/useWorkspace.js';

const origin = 'https://example.invalid/Quiz-Mind-AI/';
let calls = 0, navigations: string[] = [], options: any;
let resolveLogin: (result: any) => void;
const deferred = new Promise<any>(resolve => { resolveLogin = resolve; });
const start = createGoogleSignIn({ signInWithOAuth: async input => { calls++; options = input; return deferred; } },
  () => origin, url => navigations.push(url));
const first = start();
assert.equal(start(), first, 'Rapid clicks share one OAuth operation');
await Promise.resolve();
assert.equal(calls, 1);
assert.equal(options.provider, 'google');
assert.equal(options.options.redirectTo, origin, 'Redirect retains deployment base path');
assert.equal(options.options.skipBrowserRedirect, true, 'Only completed bounded requests may navigate');
resolveLogin!({ data: { url: 'https://auth.example.invalid/authorize' }, error: null });
await first;
assert.deepEqual(navigations, ['https://auth.example.invalid/authorize']);

const controller = new AbortController();
let lateReply: (result: any) => void;
const timeoutStart = createGoogleSignIn({ signInWithOAuth: () => new Promise<any>(resolve => { lateReply = resolve; }) },
  () => origin, url => navigations.push(url), () => controller.signal);
const timedOut = timeoutStart();
await Promise.resolve();
controller.abort(new DOMException('Timed out', 'TimeoutError'));
await assert.rejects(timedOut, /batas waktu/);
lateReply!({ data: { url: 'https://late.example.invalid' }, error: null });
await Promise.resolve();
assert.equal(navigations.length, 1, 'A response after timeout must never redirect');

let settingRequests = 0;
const settingsRequest: typeof fetch = async (_input, init) => {
  settingRequests++;
  assert.equal(new Headers(init?.headers).get('apikey'), 'public-fixture-key');
  return Response.json({ external: { google: false } });
};
const disabledProvider = createGoogleSignIn({ signInWithOAuth: async () => assert.fail('Disabled provider must not start OAuth') },
  () => origin, () => assert.fail('Disabled provider must not navigate'), () => AbortSignal.timeout(20000),
  signal => verifyGoogleProvider('https://auth.example.invalid/settings', 'public-fixture-key', signal, settingsRequest));
await assert.rejects(disabledProvider(), /Login Google belum tersedia/);
assert.equal(settingRequests, 1);
await verifyGoogleProvider('https://auth.example.invalid/settings', 'fixture', AbortSignal.timeout(20000),
  async () => Response.json({ external: { google: true } }));
await assert.rejects(verifyGoogleProvider('https://auth.example.invalid/settings', 'fixture', AbortSignal.timeout(20000),
  async () => Response.json({ external: {} })), /belum dapat dihubungi/);

let attempts = 0;
const retry = createGoogleSignIn({ signInWithOAuth: async () => {
  attempts++;
  return attempts === 1 ? { data: { provider: 'google', url: null }, error: { message: 'private provider detail' } } as any
    : { data: { provider: 'google', url: 'https://auth.example.invalid/retry' }, error: null };
} }, () => origin, url => navigations.push(url));
await assert.rejects(retry(), /konfigurasi provider/);
assert.equal(attempts, 1, 'No automatic retries on provider failure');
await retry();
assert.equal(attempts, 2, 'Manual retry works after a failed operation');
await assert.rejects(createGoogleSignIn({ signInWithOAuth: async () => ({ data: { provider: 'google', url: '' }, error: null }) },
  () => origin, () => assert.fail('Missing URL cannot navigate'))(), /tidak tersedia/);

assert.equal(readAuthCallback(origin + '?topic=biology#chapter-1'), null);
let current = origin + '?code=fixture&topic=biology#chapter-1';
const callback = readAuthCallback(current)!;
let initializations = 0;
const success = await completeAuthCallback(callback, { initialize: async () => {
  initializations++;
  // The real SDK consumes the code; the app must not exchange it again.
  current = origin + '?topic=biology#chapter-1';
  return { error: null };
} }, () => current, url => { current = url; });
assert.equal(success, '');
assert.equal(initializations, 1);
assert.equal(current, origin + '?topic=biology#chapter-1');

for (const href of [origin + '?error=access_denied&error_description=untrusted&topic=biology',
  origin + '?topic=biology#error=access_denied&error_description=untrusted&tab=account']) {
  current = href;
  const message = await completeAuthCallback(readAuthCallback(href)!, { initialize: async () => ({ error: null }) },
    () => current, url => { current = url; });
  assert.match(message, /dibatalkan/);
  assert.ok(!message.includes('untrusted'));
  assert.equal(new URL(current).searchParams.get('topic'), 'biology');
  assert.ok(!current.includes('error='));
  if (href.includes('#')) assert.equal(new URLSearchParams(new URL(current).hash.slice(1)).get('tab'), 'account');
}
current = origin + '?code=expired&topic=biology#chapter-1';
const unchangedCode = await completeAuthCallback(readAuthCallback(current)!, { initialize: async () => ({ error: null }) },
  () => current, url => { current = url; });
assert.match(unchangedCode, /kedaluwarsa/);
assert.equal(current, origin + '?topic=biology#chapter-1', 'Failed codes cannot loop on page refresh');
current = origin + '?code=broken';
const failedCode = await completeAuthCallback(readAuthCallback(current)!, { initialize: async () => ({ error: new Error('secret internal detail') as any }) },
  () => current, url => { current = url; });
assert.match(failedCode, /Login belum berhasil/);
assert.ok(!failedCode.includes('secret'));
const abort = new AbortController();
current = origin + '?code=hanging';
const pendingCallback = completeAuthCallback(readAuthCallback(current)!, { initialize: () => new Promise(() => {}) },
  () => current, url => { current = url; }, abort.signal);
abort.abort(new DOMException('Timed out', 'TimeoutError'));
assert.match(await pendingCallback, /Login belum berhasil/);
assert.equal(current, origin);

assert.equal(profileName({ name: 'Edited name', full_name: 'Google name' }), 'Edited name');
assert.equal(profileName({ full_name: 'Google name' }), 'Google name');
assert.equal(profileName({ name: 42, full_name: '' }), '');

const workspace = { scope: 'guest', mode: 'guest', data: emptyWorkspace(), keys: [], session: null,
  passwordRecovery: false, storageLoading: false, ready: true, error: '', authError: '', dismissAuthError() {} } as unknown as WorkspaceController;
const render = (locked = false) => renderToStaticMarkup(createElement(AISettings,
  { workspace, accountLocked: locked, onClose() {}, onSelectQuiz() {} }));
assert.match(render(), /Masuk dengan Google/);
assert.match(render(), /type="button" class="settings-secondary google-signin"/);
assert.match(render(true), /google-signin" disabled=""/);
workspace.mode = 'initializing';
assert.match(render(), /google-signin" disabled=""/);
workspace.passwordRecovery = true;
assert.ok(!render().includes('Masuk dengan Google'), 'Password recovery remains separate');
workspace.passwordRecovery = false;
workspace.authError = 'Login dibatalkan';
assert.match(render(), /role="alert"[^>]*>Login dibatalkan/);
console.log('PASS: Google OAuth redirect/base path, duplicate clicks, timeout/late response, manual retry, callback success/cancellation/errors/timeout, URL cleanup, profile metadata, and real account UI states.');
