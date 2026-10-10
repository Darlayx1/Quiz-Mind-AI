import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { localRepository, localCredential, localImportPayload } from '../src/workspace/localRepository.js';
import { emptyWorkspace, availableKeys } from '../src/workspace/types.js';

// Disposable in-memory browser database. No Supabase/Google calls or real keys.
const snapshot = await localRepository.load();
assert.equal(snapshot.data.history.length, 0);
await localRepository.putKey({ label: 'Utama', secret: 'fixture-key-000' });
let keys = await localRepository.keys();
assert.equal(keys.length, 1); assert.ok(!JSON.stringify(keys).includes('fixture-key-000'));
assert.equal(await localCredential(keys[0].id), 'fixture-key-000');
await assert.rejects(localRepository.putKey({ label: 'Duplikat', secret: 'fixture-key-000' }), /sudah tersimpan/);
await localRepository.putKey({ id: keys[0].id, label: 'Baru', enabled: false });
assert.equal(await localCredential(keys[0].id), 'fixture-key-000');
assert.equal(availableKeys(await localRepository.keys(), emptyWorkspace().preferences).length, 0);
await localRepository.putKey({ id: keys[0].id, label: 'Baru', enabled: true });
const changed = { ...snapshot.data, preferences: { ...snapshot.data.preferences, keyId: keys[0].id }, draft: { topic: 'Persisten' } };
const revision = await localRepository.save(changed, snapshot.revision);
assert.equal((await localRepository.load()).data.draft?.topic, 'Persisten');
await assert.rejects(localRepository.save(emptyWorkspace(), snapshot.revision), /berubah di tab lain/);
for (let i = 1; i < 99; i++) await localRepository.putKey({ label: `Key ${i}`, secret: `fixture-key-${String(i).padStart(3,'0')}` });
const concurrent = await Promise.allSettled([
  localRepository.putKey({ label: 'Serentak A', secret: 'fixture-concurrent-A' }),
  localRepository.putKey({ label: 'Serentak B', secret: 'fixture-concurrent-B' }),
]);
assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1);
assert.equal((await localRepository.keys()).length, 100);
await assert.rejects(localRepository.putKey({ label: '101', secret: 'fixture-over-limit' }), /100/);
await localRepository.removeKey(keys[0].id);
assert.equal((await localRepository.load()).data.preferences.keyId, null);
assert.equal((await localRepository.load()).revision, revision + 1);
await assert.rejects(localCredential(keys[0].id), /tidak ditemukan/);
assert.equal((await localImportPayload()).keys.length, 99);
assert.equal((await localRepository.load()).data.draft?.topic, 'Persisten');
console.log('PASS: local persistence, secret masking, duplicate detection, disabled keys, CAS conflicts, concurrent 100-key limit, key deletion and import payload.');
