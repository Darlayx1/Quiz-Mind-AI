import { openDB, type DBSchema } from 'idb';
import { readData, migrateHistory } from '../quizStorage.js';
import { validateCollection } from '../keyPool.js';
import { emptyWorkspace, sanitizeWorkspace, type ApiKeyRecord, type WorkspaceData, type WorkspaceRepository, type WorkspaceSnapshot, type KeyStatus } from './types.js';

interface LocalDatabase extends DBSchema {
  workspace: { key: string; value: WorkspaceSnapshot };
  keys: { key: string; value: ApiKeyRecord };
  credentials: { key: string; value: string };
}
const dbPromise = () => openDB<LocalDatabase>('quizmind:guest:v2', 1, {
  upgrade(db) { db.createObjectStore('workspace'); db.createObjectStore('keys', { keyPath: 'id' }); db.createObjectStore('credentials'); },
});
export const localChanges = () => {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel('quizmind:guest:changes'); channel.postMessage('changed'); channel.close();
};
export async function fingerprint(secret: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret.trim()));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
}
export const localRepository: WorkspaceRepository = {
  scope: 'guest',
  async load() {
    const db = await dbPromise();
    let record = await db.get('workspace', 'active');
    if (!record) {
      const data = emptyWorkspace();
      const migrated: { metadata: ApiKeyRecord; secret: string }[] = [];
      // The legacy source remains intact. Concurrent first loads share one transaction.
      try {
        const old = globalThis.localStorage?.getItem('quizmind_ai_history_v1');
        if (old) data.history = sanitizeWorkspace({ history: JSON.parse(old) }).history.filter(item => item?.quiz?.id && Array.isArray(item.quiz.questions));
      } catch { /* Corrupt legacy data is not deleted. */ }
      const legacyHistory = await readData<unknown>('history').catch(() => undefined);
      if (legacyHistory !== undefined) data.history = migrateHistory(legacyHistory).map(h => ({ ...h, attempts: h.results ?? (h.lastResult ? [h.lastResult] : []) }));
      const plain = globalThis.localStorage?.getItem('quizmind_client_keys_v1');
      if (plain) {
        const collection = validateCollection(JSON.parse(plain));
        data.preferences = { ...data.preferences, model: collection.settings.preferredModel ?? data.preferences.model, evaluation: collection.settings.evaluation ?? data.preferences.evaluation };
        for (const key of collection.keys) migrated.push({ metadata: { id:key.id,label:key.name,suffix:key.key.slice(-4),fingerprint:await fingerprint(key.key),enabled:key.enabled,priority:key.priority,status:'untested',successes:0,failures:0 },secret:key.key });
      }
      const tx = db.transaction(['workspace','keys','credentials'], 'readwrite');
      record = await tx.objectStore('workspace').get('active');
      if (!record) {
        record = { revision: 0, data }; await tx.objectStore('workspace').put(record, 'active');
        for (const key of migrated) { await tx.objectStore('keys').put(key.metadata); await tx.objectStore('credentials').put(key.secret,key.metadata.id); }
      }
      await tx.done;
    }
    return { ...record, data: sanitizeWorkspace(record.data) };
  },
  async save(data, revision) {
    const db = await dbPromise(); const tx = db.transaction('workspace', 'readwrite');
    const current = await tx.store.get('active');
    if ((current?.revision ?? 0) !== revision) { tx.abort(); await tx.done.catch(() => {}); throw new Error('Data lokal berubah di tab lain. Muat ulang data sebelum menyimpan.'); }
    await tx.store.put({ revision: revision + 1, data: structuredClone(data) }, 'active'); await tx.done; localChanges(); return revision + 1;
  },
  async keys() { return (await (await dbPromise()).getAll('keys')).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id)); },
  async putKey(input) {
    const secret = input.secret?.trim();
    if (!input.label.trim() || input.label.length > 80) throw new Error('Nama key wajib diisi, maksimal 80 karakter.');
    if (secret && (secret.length < 8 || secret.length > 1024)) throw new Error('API key harus berisi 8–1024 karakter.');
    const digest = secret ? await fingerprint(secret) : null;
    const db = await dbPromise(); const tx = db.transaction(['keys', 'credentials'], 'readwrite');
    const existing = input.id ? await tx.objectStore('keys').get(input.id) : undefined;
    const all = await tx.objectStore('keys').getAll();
    const fail = async (message: string) => { tx.abort(); await tx.done.catch(() => {}); throw new Error(message); };
    if (input.id && !existing) return fail('Key tidak ditemukan.');
    if (!existing && all.length >= 100) return fail('Maksimal 100 API key untuk ruang lokal.');
    if (!existing && !secret) return fail('Masukkan API key.');
    if (digest && all.some(k => k.fingerprint === digest && k.id !== input.id)) return fail('API key ini sudah tersimpan di ruang lokal.');
    const id = existing?.id ?? crypto.randomUUID();
    await tx.objectStore('keys').put({ id, label: input.label.trim(), suffix: secret ? secret.slice(-4) : existing!.suffix,
      fingerprint: digest ?? existing!.fingerprint, enabled: input.enabled ?? existing?.enabled ?? true,
      priority: input.priority ?? existing?.priority ?? (Math.max(0, ...all.map(k => k.priority)) + 1),
      status: secret ? 'untested' : existing!.status, testedAt: secret ? undefined : existing?.testedAt,
      successes: existing?.successes ?? 0, failures: existing?.failures ?? 0 });
    if (secret) await tx.objectStore('credentials').put(secret, id);
    await tx.done; localChanges();
  },
  async removeKey(id) {
    const db = await dbPromise(); const tx = db.transaction(['keys', 'credentials', 'workspace'], 'readwrite');
    await tx.objectStore('keys').delete(id); await tx.objectStore('credentials').delete(id);
    const saved = await tx.objectStore('workspace').get('active');
    if (saved?.data.preferences.keyId === id) { saved.data.preferences.keyId = null; saved.revision++; await tx.objectStore('workspace').put(saved, 'active'); }
    await tx.done; localChanges();
  },
  async recordKeyOutcome(id, status: KeyStatus) {
    const db = await dbPromise(); const tx = db.transaction('keys', 'readwrite'); const key = await tx.store.get(id);
    if (key) { key.status = status; key.testedAt = new Date().toISOString(); if (status === 'available') key.successes++; else key.failures++; await tx.store.put(key); }
    await tx.done; localChanges();
  },
};
export async function localCredential(id: string) {
  const value = await (await dbPromise()).get('credentials', id); if (!value) throw new Error('API key lokal tidak ditemukan.'); return value;
}
export async function localImportPayload() {
  const snapshot = await localRepository.load(); const keys = await localRepository.keys();
  return { data: snapshot.data, keys: await Promise.all(keys.map(async key => ({ ...key, secret: await localCredential(key.id) }))) };
}
