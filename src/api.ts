import { QuizConfigError } from "./quizConfig.js";
import { KeyPool, defaultSettings, type KeyCollection } from './keyPool.js';
import { readGenerationStream } from './generationStream.js';
import type { AIProvider } from './models.js';

const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
export const standalonePages = !apiBase && import.meta.env.BASE_URL !== "/";
let personalApiKey = "";
let pool: KeyPool | undefined;
let cloud = false;
let cloudKeyCount = 0;
let cloudProviders: AIProvider[] = [];
let cloudSettings = { ...defaultSettings };
let csrf = '';
let activeGeneration = false;
let revision = 0;
const listeners = new Set<() => void>();
const notify = () => { revision++; listeners.forEach(fn => fn()); };
export const refreshKeyStatus = () => notify();
export const subscribeKeys = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const keyRevision = () => revision;
export const getKeyPool = () => pool;
export function activateCollection(value: KeyCollection) { if (pool) pool.update(value); else pool = new KeyPool(value, notify); personalApiKey = ''; cloud = false; notify(); }
export function lockKeys() { pool?.lock(); pool = undefined; personalApiKey = ''; cloud = false; cloudKeyCount = 0; cloudProviders = []; cloudSettings = { ...defaultSettings }; csrf = ''; notify(); }
export async function cloudApi(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(apiBase + '/api/keys/' + path, { method, credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-Vault-CSRF': csrf } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Permintaan vault server gagal.');
  if (data.csrf) csrf = data.csrf;
  return data;
}
export function activateCloud(count = 0, providers: AIProvider[] = ['gemini'], settings = defaultSettings) { pool?.lock(); pool = undefined; personalApiKey = ''; cloud = true; cloudKeyCount = count; cloudProviders = providers; cloudSettings = settings; notify(); }
export const isCloudActive = () => cloud;
export const hasSessionKeys = (provider?: AIProvider) => Boolean(pool?.collection.keys.some(k => k.enabled && (!provider || k.provider === provider)) || (cloud && cloudKeyCount > 0 && (!provider || cloudProviders.includes(provider))));
export const connectionSettings = () => cloud ? cloudSettings : pool?.collection.settings ?? defaultSettings;
export async function logoutCloud() { try { if (cloud) await cloudApi('logout',{}); } finally { lockKeys(); } }
export function keyNotice(message: string) { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('key-notice', { detail: message })); }

export function setPersonalApiKey(value: string) {
  if (value === '__pool__' || value === '__cloud__') return;
  if (!value) { lockKeys(); return; }
  personalApiKey = value.trim();
  activateCollection({ keys: [{ id: 'session', name: 'Key sesi', project: '', key: personalApiKey, enabled: true, priority: 1 }], settings: { ...defaultSettings } });
}

export async function fetchApi(
  pathname: string,
  options?: RequestInit,
): Promise<Response> {
  const key = personalApiKey;
  if (pool || key || (standalonePages && !cloud)) {
    if (pathname === "/api/health")
      return Response.json({
        security: {
          hasApiKey: Boolean(pool?.collection.keys.some(k => k.enabled) || key),
          maskedKey: pool ? `${pool.collection.keys.filter(k => k.enabled).length} key aktif untuk sesi ini` : "Belum diisi",
        },
      });
    if (pathname === "/api/generate-quiz") {
      if (!pool && !key)
        return Response.json(
          {
            success: false,
            error:
              "Isi API key Anda pada kolom API Key Pribadi sebelum membuat kuis.",
          },
          { status: 400 },
        );
      if (activeGeneration) return Response.json({ success: false, error: 'Pembuatan kuis masih berjalan.' }, { status: 409 });
      activeGeneration = true;
      const requestPool = pool;
      try {
        const { generateQuiz } = await import(
          "./server/aiService.js"
        );
        const config = JSON.parse(String(options?.body));
        options?.signal?.throwIfAborted();
        const quiz = await generateQuiz(config, key || undefined, { pool: requestPool, signal: options?.signal || undefined, onNotice: keyNotice });
        return Response.json({ success: true, quiz });
      } catch (error: any) {
        if (error instanceof QuizConfigError) {
          return Response.json(
            { success: false, error: error.message },
            { status: 400 },
          );
        }

        const status = typeof error?.status === "number" ? error.status : 502;
        const message = error?.name === 'AbortError' ? 'Pembuatan kuis dibatalkan.' : error?.name === 'TimeoutError' ? 'Batas waktu pembuatan kuis tercapai.' : safeError(error);

        return Response.json(
          {
            success: false,
            error: message,
          },
          { status: status >= 400 && status < 600 ? status : 502 },
        );
      } finally { activeGeneration = false; }
    }
    throw new Error(
      "Fitur ini membutuhkan backend server. Kuis dengan API key pribadi dapat digunakan langsung di browser.",
    );
  }
  let response = await fetch(apiBase + pathname, { ...options, credentials: 'include', headers: { ...Object.fromEntries(new Headers(options?.headers)), ...(csrf ? { 'X-Vault-CSRF': csrf } : {}), ...(cloud && pathname === '/api/generate-quiz' ? { Accept: 'application/x-ndjson' } : {}) } });
  if (cloud && pathname === '/api/generate-quiz') response = await readGenerationStream(response,keyNotice);
  if (cloud && pathname === '/api/generate-quiz') { notify(); if (response.status === 401) { lockKeys(); keyNotice('Sesi vault server berakhir. Masuk kembali.'); } }
  return response;
}
export function safeError(error: unknown) {
  let message = error instanceof Error ? error.message : String(error);
  for (const item of pool?.collection.keys || []) message = message.replaceAll(item.key, '[key disamarkan]');
  return message.replace(/AIza[\w-]+|gsk_[\w-]+/g, '[key disamarkan]');
}
