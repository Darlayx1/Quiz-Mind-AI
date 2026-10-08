import { defaultSettings, validateCollection, type KeyCollection } from './keyPool.js';
import { unlockPersonalKey, VAULT_STORAGE_KEY } from './personalKeyVault.js';
export const MULTI_VAULT_KEY = 'quizmind_key_vault_v2';
const iterations = 600_000;
const context = new TextEncoder().encode(MULTI_VAULT_KEY);
const encode = (bytes: Uint8Array) => btoa(Array.from(bytes, x => String.fromCharCode(x)).join(''));
const decode = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
type RecordV2 = { version: 2 | 3; iterations: number; salt: string; iv: string; ciphertext: string };
function parse(raw: string): RecordV2 {
  try {
    if (raw.length > 200_000) throw new Error();
    const data = JSON.parse(raw);
    if (![2,3].includes(data.version) || data.iterations !== iterations || typeof data.salt !== 'string' || typeof data.iv !== 'string' ||
        typeof data.ciphertext !== 'string' || decode(data.salt).length !== 16 || decode(data.iv).length !== 12 || decode(data.ciphertext).length < 17) throw new Error();
    return data;
  } catch { throw new Error('Cadangan/vault rusak atau format tidak didukung. Data lama tetap dipertahankan.'); }
}
async function derive(password: string, salt: Uint8Array<ArrayBuffer>) {
  if (!crypto?.subtle) throw new Error('Vault memerlukan HTTPS atau localhost.');
  if (password.length < 12 || password.length > 1024) throw new Error('Kata sandi harus 12–1.024 karakter.');
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']);
}
export async function encryptCollection(collection: KeyCollection, password: string): Promise<string> {
  const plain = JSON.stringify(validateCollection(collection));
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(password, salt);
  const bytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: context }, key, new TextEncoder().encode(plain));
  return JSON.stringify({ version: 3, iterations, salt: encode(salt), iv: encode(iv), ciphertext: encode(new Uint8Array(bytes)) });
}
export async function decryptCollection(raw: string, password: string): Promise<KeyCollection> {
  const data = parse(raw), key = await derive(password, decode(data.salt));
  try {
    const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(data.iv), additionalData: context }, key, decode(data.ciphertext));
    return validateCollection(JSON.parse(new TextDecoder().decode(bytes)));
  } catch { throw new Error('Kata sandi salah atau integritas vault berubah.'); }
}
export function savedVault() { return localStorage.getItem(MULTI_VAULT_KEY) || localStorage.getItem(VAULT_STORAGE_KEY); }
export async function openVault(password: string): Promise<KeyCollection> {
  const raw = localStorage.getItem(MULTI_VAULT_KEY);
  if (!raw) {
    const key = await unlockPersonalKey(password);
    return validateCollection({ keys: [{ id: crypto.randomUUID(), name: 'Key lama', provider: 'gemini', project: '', key, enabled: true, priority: 1 }], settings: { ...defaultSettings } });
  }
  const result = await decryptCollection(raw, password);
  if (localStorage.getItem(MULTI_VAULT_KEY) !== raw) throw new Error('Vault berubah di tab lain. Buka kembali.');
  return result;
}
export async function storeVault(collection: KeyCollection, password: string) {
  const previous = localStorage.getItem(MULTI_VAULT_KEY), legacy = localStorage.getItem(VAULT_STORAGE_KEY);
  const write = async () => {
    const raw = await encryptCollection(collection, password);
    if (localStorage.getItem(MULTI_VAULT_KEY) !== previous || localStorage.getItem(VAULT_STORAGE_KEY) !== legacy) throw new Error('Vault berubah di tab lain. Buka kembali sebelum menyimpan.');
    localStorage.setItem(MULTI_VAULT_KEY, raw);
    // Only retire legacy ciphertext after successful replacement, including on password rotation.
    if (legacy !== null) localStorage.removeItem(VAULT_STORAGE_KEY);
  };
  if (globalThis.navigator?.locks) await navigator.locks.request(MULTI_VAULT_KEY, write);
  else await write();
}
export function deleteVault() { localStorage.removeItem(MULTI_VAULT_KEY); localStorage.removeItem(VAULT_STORAGE_KEY); }
