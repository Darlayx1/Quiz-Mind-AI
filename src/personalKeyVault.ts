// Only encrypted records are persisted. Neither passwords nor derived keys are stored.
export const VAULT_STORAGE_KEY = 'quizmind_personal_key_v1';
const ITERATIONS = 600_000;
const context = new TextEncoder().encode(VAULT_STORAGE_KEY);
type VaultRecord = { version: 1; iterations: number; salt: string; iv: string; ciphertext: string };

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}
function parse(raw: string): VaultRecord {
  try {
    if (raw.length > 8192) throw new Error();
    const record = JSON.parse(raw);
    if (record.version !== 1 || record.iterations !== ITERATIONS ||
        typeof record.salt !== 'string' || typeof record.iv !== 'string' ||
        typeof record.ciphertext !== 'string' || record.ciphertext.length > 4096 ||
        record.salt.length !== 24 || record.iv.length !== 16 ||
        decode(record.salt).length !== 16 || decode(record.iv).length !== 12 ||
        decode(record.ciphertext).length < 17) throw new Error();
    return record;
  } catch {
    throw new Error('Vault rusak atau formatnya tidak didukung. Hapus vault untuk menyimpan key baru.');
  }
}
async function derive(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) throw new Error('Vault memerlukan HTTPS atau localhost dan browser yang mendukung Web Crypto.');
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, material,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export function hasSavedKey(): boolean {
  return localStorage.getItem(VAULT_STORAGE_KEY) !== null;
}
export async function savePersonalKey(apiKey: string, password: string): Promise<void> {
  const value = apiKey.trim();
  if (!value || value.length > 1024 || /\s/.test(value)) throw new Error('API key harus diisi, tanpa spasi, maksimal 1.024 karakter.');
  if (password.length < 12 || password.length > 1024) throw new Error('Gunakan kata sandi 12–1.024 karakter.');
  if (!globalThis.crypto?.subtle) throw new Error('Vault memerlukan HTTPS atau localhost dan browser yang mendukung Web Crypto.');
  const previous = localStorage.getItem(VAULT_STORAGE_KEY);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(password, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: context }, key, new TextEncoder().encode(value));
  const record: VaultRecord = { version: 1, iterations: ITERATIONS, salt: encode(salt), iv: encode(iv), ciphertext: encode(new Uint8Array(encrypted)) };
  if (localStorage.getItem(VAULT_STORAGE_KEY) !== previous) throw new Error('Vault berubah di tab lain. Ulangi penyimpanan untuk mengganti key terbaru.');
  // Atomic replacement: a failure leaves the previous encrypted record intact.
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(record));
}
export async function unlockPersonalKey(password: string): Promise<string> {
  const raw = localStorage.getItem(VAULT_STORAGE_KEY);
  if (!raw) throw new Error('Belum ada key tersimpan.');
  const record = parse(raw);
  const key = await derive(password, decode(record.salt));
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(record.iv), additionalData: context }, key, decode(record.ciphertext));
    if (localStorage.getItem(VAULT_STORAGE_KEY) !== raw) throw new Error();
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error('Kata sandi salah atau data vault telah berubah. Key tersimpan tetap dipertahankan.');
  }
}
export function deletePersonalKey(): void {
  localStorage.removeItem(VAULT_STORAGE_KEY);
}
