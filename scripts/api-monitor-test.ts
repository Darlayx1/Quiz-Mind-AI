import assert from 'node:assert/strict';
import { KeyPool, defaultSettings } from '../src/keyPool.js';
const keys = [
  { id: 'a', name: 'Utama', project: 'one', key: 'fake-private-a', enabled: true, priority: 1 },
  { id: 'b', name: 'Bersama', project: 'one', key: 'fake-private-b', enabled: true, priority: 2 },
  { id: 'c', name: 'Cadangan', project: 'two', key: 'fake-private-c', enabled: true, priority: 3 },
];
const pool = new KeyPool({ keys, settings: defaultSettings });
const calls: string[] = [];
await pool.run(async key => {
  calls.push(key);
  assert.equal(pool.monitoring().activeKeyIds.length, 1);
  if (key === keys[0].key) throw Object.assign(new Error('quota ' + key), { status: 429, retryAfterMs: 5000 });
  return { usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 5, thoughtsTokenCount: 3, totalTokenCount: 20 } };
}, { model: 'model' });
assert.deepEqual(calls, [keys[0].key, keys[2].key]);
assert.equal(pool.status('b', 'model').state, 'waiting');
let snapshot = pool.monitoring();
assert.deepEqual(snapshot.activeKeyIds, []);
assert.equal(snapshot.usage.a.failures, 1);
assert.equal(snapshot.usage.c.totalTokens, 20);
assert.equal(snapshot.usage.c.measuredResponses, 1);
assert.ok(snapshot.events.some(event => event.type === 'fallback' && event.keyId === 'a' && event.targetId === 'c'));
for (const entry of keys) assert.equal(JSON.stringify(snapshot).includes(entry.key), false);
snapshot.usage.c.calls = 999; snapshot.events[0].reason = 'mutated';
assert.equal(pool.monitoring().usage.c.calls, 1);
assert.notEqual(pool.monitoring().events[0].reason, 'mutated');
pool.reset('a');
await pool.run(async key => {
  if (key === keys[0].key) throw Object.assign(new Error('API key not valid'), { status: 400 });
  pool.recordUsage(key, { promptTokenCount: 7, totalTokenCount: 7 });
  return 'evaluation';
});
assert.equal(pool.status('a').state, 'invalid');
assert.equal(pool.monitoring().usage.b.inputTokens, 7);
calls.length = 0;
await pool.run(async key => { calls.push(key); return {}; });
assert.equal(calls.includes(keys[0].key), false);
const budget = new KeyPool({ keys, settings: defaultSettings });
let attempts = 0;
await assert.rejects(budget.run(async () => { attempts++; throw Object.assign(new Error('API key not valid'), { status: 401 }); }, { maxAttempts: 100 }));
assert.equal(attempts, 3);
const stopped = new KeyPool({ keys, settings: defaultSettings });
attempts = 0;
await assert.rejects(stopped.run(async () => { attempts++; throw Object.assign(new Error('Bad input'), { status: 400 }); }));
assert.equal(attempts, 1);
for (let i = 0; i < 110; i++) await stopped.run(async () => ({}));
assert.equal(stopped.monitoring().events.length, 100);
pool.lock(); assert.equal(pool.monitoring().events.length, 0); assert.deepEqual(pool.monitoring().usage, {});
console.log('PASS API monitoring: token accounting, quota groups, quarantine, fallback history, no secrets, snapshot isolation, 3-attempt cap, no retry on invalid input, bounded history. No external API calls.');
