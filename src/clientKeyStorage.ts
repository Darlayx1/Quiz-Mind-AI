import { validateCollection, type KeyCollection } from './keyPool.js';

export const CLIENT_STORAGE_KEY = 'quizmind_client_keys_v1';

export function hasStoredClientKeys(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(CLIENT_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return Array.isArray(data?.keys) && data.keys.length > 0;
  } catch {
    return false;
  }
}

export function loadStoredClientKeys(): KeyCollection | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CLIENT_STORAGE_KEY);
    if (!raw) return null;
    return validateCollection(JSON.parse(raw));
  } catch (err) {
    console.warn('Gagal memuat API key tersimpan dari perangkat:', err);
    return null;
  }
}

export function saveStoredClientKeys(collection: KeyCollection): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const validated = validateCollection(collection);
    localStorage.setItem(CLIENT_STORAGE_KEY, JSON.stringify(validated));
  } catch (err) {
    console.error('Gagal menyimpan API key ke perangkat:', err);
  }
}

export function deleteStoredClientKeys(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(CLIENT_STORAGE_KEY);
  } catch (err) {
    console.error('Gagal menghapus API key dari perangkat:', err);
  }
}
