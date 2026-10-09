import { type AIProvider } from '../models.js';
import { KeyPool, defaultSettings, type KeyEntry } from '../keyPool.js';

export class ProviderError extends Error {
  constructor(message: string, public status: number, public code: string, public headers?: Headers) { super(message); }
}
export async function listProviderModels(_provider: AIProvider, key: string, signal: AbortSignal): Promise<string[]> {
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 15_000, retryOptions: { attempts: 1 } } });
  const models = await client.models.list({ config: { abortSignal: signal, pageSize: 100 } });
  const ids: string[] = [];
  for await (const model of models) {
    signal.throwIfAborted();
    const actions = model.supportedActions ?? (model as any).supportedGenerationMethods;
    if (!actions || actions.includes('generateContent')) ids.push((model.name ?? '').replace(/^models\//, ''));
  }
  return ids.filter(Boolean);
}
export async function probeKey(entry: KeyEntry, signal = AbortSignal.timeout(15_000)) {
  const probe = new KeyPool({ keys: [{ ...entry, enabled: true }], settings: { ...defaultSettings } });
  try { return await probe.run((key, callSignal) => listProviderModels(entry.provider ?? 'gemini', key, callSignal), { signal, provider: entry.provider ?? 'gemini', maxAttempts: 1 }); }
  finally { probe.lock(); }
}
