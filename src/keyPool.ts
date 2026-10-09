import { isProvider, modelInfo, validModelId, type AIProvider, DEFAULT_MODEL, normalizeModelId } from './models.js';
import { normalizeEvaluationSettings } from './evaluationSettings.js';
import type { EvaluationSettings } from './types/quiz.js';
export type KeyEntry = { id: string; name: string; project: string; key: string; enabled: boolean; priority: number; provider?: AIProvider };
export type PoolSettings = { mode: 'priority' | 'balanced'; allowModelFallback: boolean; allowGroundingFallback: boolean; allowKeyFallback?: boolean; allowProviderFallback?: boolean; preferredProvider?: AIProvider; preferredModel?: string; fallbackProvider?: AIProvider; fallbackModel?: string; modelFallbacks?: Partial<Record<AIProvider, string>>; evaluation?:EvaluationSettings };
export type KeyCollection = { schemaVersion?: 3; keys: KeyEntry[]; settings: PoolSettings };
export const defaultSettings: PoolSettings = { mode: 'priority', allowModelFallback: false, allowGroundingFallback: false, allowKeyFallback: true, allowProviderFallback: false, preferredProvider: 'gemini', preferredModel: DEFAULT_MODEL, fallbackProvider: 'groq', fallbackModel: 'qwen/qwen3.8-27b', modelFallbacks: { gemini: 'gemini-3.5-flash-lite', groq: 'openai/gpt-oss-120b' } };
export type KeyHealth = { state: 'untested' | 'ready' | 'waiting' | 'invalid' | 'restricted'; until?: number; scope?: string; lastSuccess?: number; reason?: string; successes: number; failures: number };
export class PoolError extends Error {
  constructor(message: string, public status = 503, public code = 'POOL_UNAVAILABLE') { super(message); }
}
export function validateCollection(value: unknown): KeyCollection {
  const data = value as KeyCollection;
  if (data?.schemaVersion !== undefined && data.schemaVersion !== 3) throw new Error('Versi koleksi tidak didukung.');
  if (!data || !Array.isArray(data.keys) || data.keys.length > 100 || !data.settings ||
      !['priority', 'balanced'].includes(data.settings.mode) || typeof data.settings.allowModelFallback !== 'boolean' ||
      typeof data.settings.allowGroundingFallback !== 'boolean') throw new Error('Format koleksi key tidak valid (maksimal 100 key).');
  const ids = new Set<string>(), secrets = new Set<string>();
  const settings = { ...defaultSettings, ...data.settings, modelFallbacks: { ...defaultSettings.modelFallbacks, ...data.settings.modelFallbacks } };
  if (data.settings.evaluation !== undefined) settings.evaluation = normalizeEvaluationSettings(data.settings.evaluation);
  if (![settings.allowKeyFallback, settings.allowProviderFallback].every(value => typeof value === 'boolean') || !isProvider(settings.preferredProvider) || !isProvider(settings.fallbackProvider)) throw new Error('Pengaturan penyedia tidak valid.');
  for (const [provider, model] of [[settings.preferredProvider,settings.preferredModel], [settings.fallbackProvider,settings.fallbackModel], ...Object.entries(settings.modelFallbacks)] as [AIProvider,string][]) {
    const norm = normalizeModelId(model);
    if (!isProvider(provider) || !validModelId(norm) || (modelInfo(norm) && modelInfo(norm)!.provider !== provider)) throw new Error('Model tidak sesuai dengan penyedia.');
  }
  const keys = data.keys.map(item => {
    if (!item || (item.provider !== undefined && !isProvider(item.provider)) || typeof item.id !== 'string' || !/^[\w-]{1,80}$/.test(item.id) || ids.has(item.id) ||
        typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80 ||
        typeof item.project !== 'string' || item.project.length > 100 ||
        typeof item.key !== 'string' || !item.key || item.key.length > 1024 || /\s/.test(item.key) || secrets.has(item.key) ||
        typeof item.enabled !== 'boolean' || !Number.isInteger(item.priority) || item.priority < 1 || item.priority > 100)
      throw new Error('Data key tidak valid atau terdapat duplikat. Isi nama, key tanpa spasi, dan prioritas 1–100.');
    ids.add(item.id); secrets.add(item.key);
    return { id: item.id, provider: item.provider ?? 'gemini', name: item.name.trim(), project: item.project.trim(), key: item.key, enabled: item.enabled, priority: item.priority };
  });
  return { schemaVersion: 3, keys, settings };
}
export function errorKind(error: any): { kind: 'invalid' | 'restricted' | 'quota' | 'temporary' | 'network' | 'stop'; retryMs: number } {
  const msg = String(error?.message || error), code = String(error?.code || error?.error?.status || '');
  const status = Number(error?.status || error?.error?.code || /\b(400|401|402|403|404|408|429|500|502|503|504)\b/.exec(msg)?.[1]);
  let retry = Number(error?.retryAfterMs);
  if (!Number.isFinite(retry)) {
    const delay = /"retryDelay"\s*:\s*"([\d.]+)s"/.exec(msg)?.[1];
    const header = error?.headers?.get?.('retry-after');
    retry = delay ? Number(delay) * 1000 : header ? (Number.isFinite(Number(header)) ? Number(header) * 1000 : Date.parse(header) - Date.now()) : NaN;
  }
  const retryMs = Number.isFinite(retry) && retry > 0 ? Math.min(retry, 86_400_000) : 60_000;
  if (['WEB_SEARCH_EMPTY','WEB_SEARCH_TRUNCATED','WEB_SEARCH_UNAVAILABLE'].includes(code)) return { kind: 'stop', retryMs };
  if (error?.name === 'AbortError' || /DEADLINE|POOL_|CANCELLED/.test(code)) return { kind: 'stop', retryMs };
  if (/API_KEY_INVALID|API key not valid|UNAUTHENTICATED|UNAUTHORIZED/.test(msg + code) || status === 401) return { kind: 'invalid', retryMs };
  if (status === 403 || /PERMISSION_DENIED|FORBIDDEN/.test(code)) return { kind: 'restricted', retryMs };
  if (status === 429 || /RESOURCE_EXHAUSTED|RATE_LIMIT/.test(code)) return { kind: 'quota', retryMs };
  if (status === 402 || /billing|prepay|credits/i.test(msg)) return { kind: 'restricted', retryMs };
  if (/ENOTFOUND|offline|Failed to fetch|NETWORK_ERROR/i.test(msg + code) || (globalThis.navigator && navigator.onLine === false)) return { kind: 'network', retryMs };
  if ([408,500,502,503,504].includes(status) || /INTERNAL|UNAVAILABLE|TIMEOUT|ECONNRESET|ETIMEDOUT/i.test(code + msg)) return { kind: 'temporary', retryMs };
  return { kind: 'stop', retryMs };
}
const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  signal?.throwIfAborted();
  const abort = () => { clearTimeout(timer); reject(signal?.reason || new DOMException('Dibatalkan', 'AbortError')); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
  signal?.addEventListener('abort', abort, { once: true });
});
export function nextPacificMidnight(now = Date.now()) {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
  const parts = (time: number) => Object.fromEntries(formatter.formatToParts(time).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
  const current = parts(now), target = Date.UTC(current.year, current.month - 1, current.day + 1);
  let guessed = target + 8 * 3_600_000;
  for (let i = 0; i < 3; i++) { const p = parts(guessed); guessed += target - Date.UTC(p.year,p.month - 1,p.day,p.hour,p.minute,p.second); }
  return guessed;
}
/** One shared pool owns project permits, cooldowns and health across requests. */
export class KeyPool {
  collection: KeyCollection;
  health = new Map<string, KeyHealth>();
  private busy = new Map<string, number>();
  private cooldown = new Map<string, number>();
  private restrictions = new Set<string>();
  private cursor = 0;
  private locked = false;
  private controller = new AbortController();
  constructor(collection: KeyCollection, private changed: () => void = () => {}) { this.collection = validateCollection(collection); }
  update(collection: KeyCollection) {
    const next = validateCollection(collection);
    const {evaluation:oldEvaluation,...oldSettings}=this.collection.settings;
    const {evaluation:nextEvaluation,...nextSettings}=next.settings;
    if(JSON.stringify(this.collection.keys)!==JSON.stringify(next.keys)||JSON.stringify(oldSettings)!==JSON.stringify(nextSettings)){this.controller.abort();this.controller=new AbortController();}
    for (const previous of this.collection.keys) {
      const replacement = next.keys.find(k => k.id === previous.id);
      if (!replacement || replacement.key !== previous.key || replacement.project !== previous.project || replacement.provider !== previous.provider) {
        this.health.delete(previous.id); for (const scope of this.restrictions) if (scope.startsWith(previous.id + ':')) this.restrictions.delete(scope);
      }
    }
    this.collection = next; this.changed();
  }
  private group(key: KeyEntry) { return `${key.provider ?? 'gemini'}:${key.project || '__unknown__'}`; }
  lock() { this.locked = true; this.controller.abort(); this.collection = { keys: [], settings: defaultSettings }; this.health.clear(); this.changed(); }
  status(id: string, scope?: string): KeyHealth {
    const key = this.collection.keys.find(k => k.id === id);
    const base = this.health.get(id) || { state: 'untested', successes: 0, failures: 0 };
    const until = key ? Math.max(!scope || !base.scope || base.scope === scope ? base.until || 0 : 0, this.cooldown.get(this.group(key)) || 0) : 0;
    return { ...base, state: until > Date.now() && !['invalid','restricted'].includes(base.state) ? 'waiting' : base.state === 'waiting' && until <= Date.now() ? 'untested' : base.state, until };
  }
  reset(id: string) { const key = this.collection.keys.find(k => k.id === id); this.health.delete(id); for (const scope of this.restrictions) if (scope.startsWith(id + ':')) this.restrictions.delete(scope); if (key) this.cooldown.delete(this.group(key)); this.changed(); }
  async run<T>(fn: (key: string, signal: AbortSignal) => Promise<T>, options: { signal?: AbortSignal; onNotice?: (message: string) => void; maxAttempts?: number; allowKeyFallback?: boolean; model?: string; provider?: AIProvider } = {}): Promise<T> {
    const signal = AbortSignal.any([this.controller.signal, ...(options.signal ? [options.signal] : [])]);
    const seen = new Set<string>();
    let attempts = 0, transientRetries = 0;
    const started = Date.now();
    while (attempts < (options.maxAttempts ?? 3)) {
      signal.throwIfAborted();
      if (this.locked) throw new PoolError('Vault terkunci.', 401, 'POOL_LOCKED');
      const ordered = this.collection.keys.filter(k => k.enabled && k.provider === (options.provider ?? 'gemini')).sort((a,b) => a.priority - b.priority);
      const eligible = ordered.filter(k => !seen.has(k.id) && !['invalid','waiting'].includes(this.status(k.id,options.model).state) &&
        !this.restrictions.has(k.id + ':*') && !this.restrictions.has(k.id + ':' + (options.model || '*')));
      let available = eligible.filter(k => !(this.busy.get(this.group(k)) || 0));
      if (!available.length && eligible.length && Date.now() - started < 30_000) { await pause(100, signal); continue; }
      if (!available.length) throw new PoolError('Semua key yang sesuai sedang menunggu, perlu diperbaiki, atau batas percobaan tercapai. Pengaturan kuis tetap tersimpan.', 503,
        ordered.some(k => this.restrictions.has(k.id + ':' + options.model)) ? 'POOL_MODEL_ACCESS' : 'POOL_UNAVAILABLE');
      const entry = this.collection.settings.mode === 'balanced' ? available[this.cursor++ % available.length] : available[0];
      const group = this.group(entry);
      this.busy.set(group, 1); attempts++;
      const old = this.health.get(entry.id) || { state: 'untested' as const, successes: 0, failures: 0 };
      try {
        const result = await fn(entry.key, signal);
        signal.throwIfAborted();
        this.health.set(entry.id, { state: 'ready', lastSuccess: Date.now(), successes: old.successes + 1, failures: old.failures });
        this.changed(); return result;
      } catch (error: any) {
        signal.throwIfAborted();
        const { kind, retryMs } = errorKind(error);
        const health: KeyHealth = { ...old, scope: options.model, failures: old.failures + 1 };
        if (kind === 'invalid') { health.state = 'invalid'; health.reason = 'Key tidak valid atau dicabut'; seen.add(entry.id); }
        else if (kind === 'restricted') {
          health.state = 'restricted'; health.reason = 'Periksa izin, model, atau billing'; seen.add(entry.id);
          const billing = /402|billing|prepay|credits/i.test(String(error?.status || '') + String(error?.message));
          this.restrictions.add(entry.id + ':' + (!billing && options.model ? options.model : '*'));
        }
        else if (kind === 'quota') {
          const daily = /per.?day|daily|requestsperday/i.test(String(error?.message));
          health.state = 'waiting';
          health.until = entry.provider === 'gemini' && daily && retryMs === 60_000 ? nextPacificMidnight() + 1000 : Date.now() + retryMs;
          health.reason = daily ? 'Kuota harian tercapai; periksa konsol penyedia' : 'Batas kuota kelompok tercapai';
          this.cooldown.set(group, health.until); seen.add(entry.id);
        } else if (kind === 'temporary') {
          health.reason = 'Layanan sementara bermasalah';
          if (transientRetries++ < 1 && attempts < (options.maxAttempts ?? 3)) {
            this.health.set(entry.id, health); this.changed();
            options.onNotice?.('Layanan AI sedang bermasalah. Mencoba kembali dengan jeda.');
            await pause(1000 + Math.random() * 500, signal); continue;
          }
          health.state = 'waiting'; health.until = Date.now() + 30_000; seen.add(entry.id);
        } else { this.health.set(entry.id, health); this.changed(); throw error; }
        this.health.set(entry.id, health); this.changed();
        if (!(options.allowKeyFallback ?? this.collection.settings.allowKeyFallback)) throw error;
        options.onNotice?.(`${entry.name}: ${health.reason}. Mencoba key cadangan yang tersedia.`);
      } finally { this.busy.delete(group); }
    }
    throw new PoolError('Batas percobaan tercapai. Coba kembali setelah jeda atau perbaiki key di pengelola.');
  }
}
