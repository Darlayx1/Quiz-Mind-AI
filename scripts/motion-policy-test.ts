import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Exercise real presentation policies with deterministic media/visibility and animation promises.
// Domain regression suites exercise the real creator, runner and App separately.
const runtime = globalThis as any;
const media = Object.assign(new EventTarget(), { matches: false });
const mediaQueries: EventTarget[] = [];
const mediaChange = () => mediaQueries.forEach(query => query.dispatchEvent(new Event('change')));
const doc = Object.assign(new EventTarget(), { hidden: false });
const originalWindow = runtime.window, originalDocument = runtime.document;
let cleanups: (() => void)[] = [], updates = 0;
runtime.window = { matchMedia: () => {
  const query = Object.defineProperty(new EventTarget(), 'matches', { get: () => media.matches });
  mediaQueries.push(query); return query;
} };
runtime.document = doc;
runtime.__motionPolicyHooks = {
  useRef: (current: unknown) => ({ current }),
  useEffect: (effect: () => void | (() => void)) => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
  useLayoutEffect: (effect: () => void | (() => void)) => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
  useSyncExternalStore: (subscribe: (listener: () => void) => () => void, snapshot: () => number) => {
    cleanups.push(subscribe(() => updates++)); return snapshot();
  },
};
const compiled = await build({ entryPoints: ['src/ui/motion.ts'], bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'motion-hook-host', setup(build) {
    build.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'motion-hook-host' }));
    build.onLoad({ filter: /.*/, namespace: 'motion-hook-host' }, () => ({ contents: 'export const {useRef,useEffect,useLayoutEffect,useSyncExternalStore}=globalThis.__motionPolicyHooks;' }));
  } }],
});
const policy = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const cleanup = () => { cleanups.reverse().forEach(fn => fn()); cleanups = []; };
function animatedElement() {
  let resolve!: () => void, reject!: (reason?: unknown) => void;
  const animation = { finished: new Promise<void>((yes, no) => { resolve = yes; reject = no; }), cancel: () => { reject(new Error('cancelled')); } };
  // Entrance animations do not observe finished; suppress a cancellation in this fake only.
  void animation.finished.catch(() => {});
  let calls = 0;
  const element = { dataset: {} as Record<string, string>, animate: () => { calls++; return animation; } };
  return { ref: { current: element }, resolve, calls: () => calls };
}
try {
  assert.deepEqual(policy.useMotionPreferences(), { reduced: false, paused: false, hidden: false });
  policy.toggleAmbientMotion();
  assert.equal(updates, 1, 'Pause immediately notifies subscribers');
  assert.equal(policy.useMotionPreferences().paused, true);
  policy.toggleAmbientMotion();
  media.matches = true; mediaChange();
  assert.equal(policy.useMotionPreferences().reduced, true, 'Live OS preference updates are observed');
  doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(policy.useMotionPreferences().hidden, true);
  cleanup();
  const updatesAfterCleanup = updates;
  mediaChange(); doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(updates, updatesAfterCleanup, 'Last subscriber removes global listeners');

  let closed = 0;
  const reduced = animatedElement();
  policy.useAnimatedDismiss(reduced.ref, () => closed++)();
  assert.equal(closed, 1); assert.equal(reduced.calls(), 0, 'Reduced motion dismisses without waiting');
  cleanup(); media.matches = false; doc.hidden = false;

  const normal = animatedElement();
  const dismiss = policy.useAnimatedDismiss(normal.ref, () => closed++);
  dismiss(); dismiss();
  assert.equal(normal.calls(), 1, 'Rapid Escape/click cannot start two dismissals');
  assert.equal(closed, 1, 'Callback waits for presentation completion');
  normal.resolve(); await Promise.resolve();
  assert.equal(closed, 2); cleanup();

  const unmounted = animatedElement();
  policy.useAnimatedDismiss(unmounted.ref, () => closed++)();
  cleanup(); unmounted.resolve(); await Promise.resolve();
  assert.equal(closed, 2, 'Unmount cancels fallback and cannot call stale business callbacks');

  const entrance = animatedElement();
  policy.useVisualTransition(entrance.ref, 'configuration');
  assert.equal(entrance.calls(), 1); cleanup();
  media.matches = true;
  policy.useVisualTransition(entrance.ref, 'history');
  assert.equal(entrance.calls(), 1, 'Reduced motion does not create an entrance animation');
  cleanup();
  console.log('PASS: live reduced motion, user pause, document visibility, listener cleanup, immediate reduced dismissal, duplicate dismissal guard, unmount cancellation and entrance policy.');
} finally {
  cleanup(); runtime.window = originalWindow; runtime.document = originalDocument; delete runtime.__motionPolicyHooks;
}
