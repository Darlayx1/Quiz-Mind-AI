import { type AIProvider } from '../models.js';
import { KeyPool, defaultSettings, type KeyEntry } from '../keyPool.js';

export class ProviderError extends Error {
  constructor(message: string, public status: number, public code: string, public headers?: Headers) { super(message); }
}
export async function groqRequest(path: 'models' | 'chat/completions', key: string, signal: AbortSignal, body?: unknown) {
  let response: Response;
  try {
    response = await fetch(`https://api.groq.com/openai/v1/${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal, ...(body ? { body: JSON.stringify(body) } : {}) });
  } catch {
    signal.throwIfAborted();
    throw new ProviderError('Tidak dapat terhubung ke Groq. Periksa koneksi internet dan izin koneksi browser; gunakan vault server jika akses langsung tidak tersedia.', 504, 'NETWORK_ERROR');
  }
  if (!response.ok) {
    // Do not include provider response text: it may echo credentials or user material.
    const messages: Record<number, string> = { 400: 'Konfigurasi atau format permintaan ditolak Groq. Periksa kemampuan model.', 401: 'API key Groq ditolak. Periksa atau ganti key.', 402: 'Saldo atau billing Groq perlu diperiksa.', 403: 'Akses Groq ditolak. Periksa izin model dan akun.', 404: 'Model Groq tidak ditemukan. Pilih model lain atau periksa ID model.', 429: 'Batas kuota Groq tercapai. Tunggu sesuai jeda layanan.', 500: 'Layanan Groq sedang bermasalah.', 502: 'Layanan Groq sementara tidak tersedia.', 503: 'Layanan Groq sedang sibuk.', 504: 'Groq melewati batas waktu.' };
    throw new ProviderError(messages[response.status] ?? 'Permintaan Groq gagal. Periksa koneksi dan konfigurasi.', response.status, response.status === 429 ? 'RATE_LIMIT' : response.status === 404 ? 'MODEL_NOT_FOUND' : 'PROVIDER_ERROR', response.headers);
  }
  try { return await response.json(); } catch { throw new ProviderError('Respons Groq bukan JSON yang valid.', 502, 'INVALID_JSON'); }
}
export async function listProviderModels(provider: AIProvider, key: string, signal: AbortSignal): Promise<string[]> {
  if (provider === 'groq') {
    const data = await groqRequest('models', key, signal);
    if (!Array.isArray(data.data)) throw new ProviderError('Daftar model Groq tidak valid.', 502, 'INVALID_RESPONSE');
    return data.data.map((model: { id?: string }) => model.id).filter((id: unknown): id is string => typeof id === 'string');
  }
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 15_000, retryOptions: { attempts: 1 } } });
  const models = await client.models.list({ config: { abortSignal: signal, pageSize: 100 } });
  const ids: string[] = [];
  for await (const model of models) {
    signal.throwIfAborted();
    if (model.supportedActions?.includes('generateContent')) ids.push((model.name ?? '').replace(/^models\//, ''));
  }
  return ids.filter(Boolean);
}
export async function probeKey(entry: KeyEntry, signal = AbortSignal.timeout(15_000)) {
  const probe = new KeyPool({ keys: [{ ...entry, enabled: true }], settings: { ...defaultSettings } });
  try { return await probe.run((key, callSignal) => listProviderModels(entry.provider ?? 'gemini', key, callSignal), { signal, provider: entry.provider ?? 'gemini', maxAttempts: 1 }); }
  finally { probe.lock(); }
}
