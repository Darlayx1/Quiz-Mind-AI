import assert from 'node:assert/strict';
import { KeyPool, defaultSettings, validateCollection, type KeyCollection } from '../src/keyPool.js';
import {
  CLIENT_STORAGE_KEY,
  hasStoredClientKeys,
  loadStoredClientKeys,
  saveStoredClientKeys,
  deleteStoredClientKeys
} from '../src/clientKeyStorage.js';

// Setup mock localStorage in Node.js
const storageMap = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => storageMap.get(k) ?? null,
    setItem: (k: string, v: string) => storageMap.set(k, v),
    removeItem: (k: string) => storageMap.delete(k),
    clear: () => storageMap.clear(),
  }
});

// Test 1: Initially no stored keys
assert.equal(hasStoredClientKeys(), false);
assert.equal(loadStoredClientKeys(), null);

// Test 2: Save valid collection
const sampleCollection: KeyCollection = validateCollection({
  settings: { ...defaultSettings, preferredProvider: 'gemini', preferredModel: 'gemini-3.8-flash' },
  keys: [
    { id: 'key-1', name: 'Gemini Primary', project: 'my-proj', key: 'test-gemini-secret-1234', enabled: true, priority: 1, provider: 'gemini' },
    { id: 'key-2', name: 'Gemini Secondary', project: '', key: 'test-gemini-secret-5678', enabled: true, priority: 2, provider: 'gemini' }
  ]
});

saveStoredClientKeys(sampleCollection);
assert.equal(hasStoredClientKeys(), true);
const loaded = loadStoredClientKeys();
assert.ok(loaded);
assert.equal(loaded.keys.length, 2);
assert.equal(loaded.keys[0].name, 'Gemini Primary');
assert.equal(loaded.keys[0].key, 'test-gemini-secret-1234');
assert.equal(loaded.keys[1].provider, 'gemini');
assert.equal(loaded.settings.preferredProvider, 'gemini');

// Test 2b: Migration of legacy Groq keys in storage
storageMap.set(CLIENT_STORAGE_KEY, JSON.stringify({
  settings: { ...defaultSettings, preferredProvider: 'groq', fallbackProvider: 'groq' },
  keys: [
    { id: 'gem-1', name: 'Gemini Key', project: '', key: 'AIzaSy_ValidGeminiKey', enabled: true, priority: 1, provider: 'gemini' },
    { id: 'grq-1', name: 'Legacy Groq', project: '', key: 'gsk_legacy_secret', enabled: true, priority: 2, provider: 'groq' }
  ]
}));
const migrated = loadStoredClientKeys();
assert.ok(migrated);
assert.equal(migrated.keys.length, 1);
assert.equal(migrated.keys[0].id, 'gem-1');
assert.equal(migrated.settings.preferredProvider, 'gemini');
assert.equal(migrated.settings.fallbackProvider, 'gemini');

// Test 3: Initialize KeyPool with loaded collection (simulating page reload / startup)
const pool = new KeyPool(loaded);
assert.equal(pool.collection.keys.length, 2);
assert.equal(pool.status('key-1').state, 'untested');

// Test 4: Modify collection and save updated
const updatedCollection: KeyCollection = {
  ...loaded,
  keys: loaded.keys.filter(k => k.id !== 'key-1')
};
saveStoredClientKeys(updatedCollection);
const reloaded = loadStoredClientKeys();
assert.ok(reloaded);
assert.equal(reloaded.keys.length, 1);
assert.equal(reloaded.keys[0].id, 'key-2');

// Test 5: Delete stored keys
deleteStoredClientKeys();
assert.equal(hasStoredClientKeys(), false);
assert.equal(loadStoredClientKeys(), null);

// Test 6: Handle corrupt JSON in localStorage gracefully without crashing
storageMap.set(CLIENT_STORAGE_KEY, '{invalid json-corrupted');
assert.equal(hasStoredClientKeys(), false);
assert.equal(loadStoredClientKeys(), null);

storageMap.set(CLIENT_STORAGE_KEY, JSON.stringify({ keys: 'not an array' }));
assert.equal(hasStoredClientKeys(), false);
assert.equal(loadStoredClientKeys(), null);

// Clean up
storageMap.clear();

console.log('PASS client-storage-test: persistence, auto-load on reload simulation, updates, deletions, and fail-safe corrupted handling.');

// Corrupt JSON parser messages may echo key fragments. Logs must contain no raw errors.
const originalWarn=console.warn, originalError=console.error;
const diagnostics:unknown[][]=[];
console.warn=(...args)=>{diagnostics.push(args);};console.error=(...args)=>{diagnostics.push(args);};
try {
 storageMap.set(CLIENT_STORAGE_KEY,'gsk_corrupted_sensitive_secret');
 assert.equal(loadStoredClientKeys(),null);
 saveStoredClientKeys({keys:'gsk_corrupted_sensitive_secret'} as any);
 assert.equal(JSON.stringify(diagnostics).includes('gsk_corrupted_sensitive_secret'),false);
 assert.ok(diagnostics.every(args=>args.length===1));
} finally {console.warn=originalWarn;console.error=originalError;storageMap.clear();}
console.log('PASS client-storage diagnostics: no corrupt JSON/key fragments or raw errors logged.');
