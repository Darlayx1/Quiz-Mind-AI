import assert from 'node:assert/strict';
import { deletePersonalKey, hasSavedKey, savePersonalKey, unlockPersonalKey, VAULT_STORAGE_KEY } from '../src/personalKeyVault.js';

const records = new Map<string, string>();
let failWrites = false;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => records.get(key) ?? null,
  setItem: (key: string, value: string) => {
    if (failWrites) throw new DOMException('Storage full', 'QuotaExceededError');
    records.set(key, value);
  },
  removeItem: (key: string) => records.delete(key),
} });
const password = 'a strong test passphrase';
const first = 'test-key-first-not-a-real-credential';
const second = 'test-key-second-not-a-real-credential';
assert.equal(hasSavedKey(), false);
await assert.rejects(unlockPersonalKey(password), /Belum ada/);
await assert.rejects(savePersonalKey(first, 'short'), /12/);
await assert.rejects(savePersonalKey('key with spaces', password), /tanpa spasi/);
await savePersonalKey(first, password);
assert.equal(hasSavedKey(), true);
const initial = records.get(VAULT_STORAGE_KEY)!;
assert.equal(initial.includes(first), false);
assert.equal(initial.includes(password), false);
assert.equal(await unlockPersonalKey(password), first);
await assert.rejects(unlockPersonalKey('incorrect password'), /Kata sandi salah/);
assert.equal(records.get(VAULT_STORAGE_KEY), initial);

await savePersonalKey(first, password);
const repeated = JSON.parse(records.get(VAULT_STORAGE_KEY)!);
const original = JSON.parse(initial);
assert.notEqual(repeated.iv, original.iv);
assert.notEqual(repeated.salt, original.salt);
assert.notEqual(repeated.ciphertext, original.ciphertext);

const intact = records.get(VAULT_STORAGE_KEY)!;
const tampered = JSON.parse(intact);
const bytes = Buffer.from(tampered.ciphertext, 'base64');
bytes[0] ^= 1;
tampered.ciphertext = bytes.toString('base64');
records.set(VAULT_STORAGE_KEY, JSON.stringify(tampered));
await assert.rejects(unlockPersonalKey(password), /data vault telah berubah/);
records.set(VAULT_STORAGE_KEY, JSON.stringify({ ...tampered, iterations: 1_000_000_000 }));
await assert.rejects(unlockPersonalKey(password), /formatnya tidak didukung/);
records.set(VAULT_STORAGE_KEY, intact);
const unlocking = unlockPersonalKey(password);
records.delete(VAULT_STORAGE_KEY);
await assert.rejects(unlocking, /data vault telah berubah/);
records.set(VAULT_STORAGE_KEY, intact);
const saving = savePersonalKey(second, password);
records.set(VAULT_STORAGE_KEY, initial);
await assert.rejects(saving, /Vault berubah di tab lain/);
assert.equal(records.get(VAULT_STORAGE_KEY), initial);
records.set(VAULT_STORAGE_KEY, intact);
failWrites = true;
await assert.rejects(savePersonalKey(second, password), /Storage full/);
assert.equal(records.get(VAULT_STORAGE_KEY), intact);
assert.equal(await unlockPersonalKey(password), first);
failWrites = false;
await savePersonalKey(second, 'a new strong passphrase');
assert.equal(await unlockPersonalKey('a new strong passphrase'), second);
await assert.rejects(unlockPersonalKey(password), /Kata sandi salah/);
deletePersonalKey();
assert.equal(hasSavedKey(), false);
await assert.rejects(unlockPersonalKey(password), /Belum ada/);
console.log('Vault checks passed: encryption, unlock, wrong password, tampering, fresh randomness, failed writes, replacement and deletion.');
