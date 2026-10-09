import { isProvider, modelInfo, validModelId, type AIProvider, DEFAULT_MODEL, normalizeModelId } from './models.js';
import { normalizeEvaluationSettings } from './evaluationSettings.js';
import { geminiQuotaDetails, geminiQuotaMessage } from './geminiQuota.js';
import type { EvaluationSettings } from './types/quiz.js';
export type KeyEntry = { id: string; name: string; project: string; key: string; enabled: boolean; priority: number; provider?: AIProvider };
export type PoolSettings = { mode: 'priority' | 'balanced'; allowModelFallback: boolean; allowGroundingFallback: boolean; allowKeyFallback?: boolean; allowProviderFallback?: boolean; preferredProvider?: AIProvider; preferredModel?: string; fallbackProvider?: AIProvider; fallbackModel?: string; modelFallbacks?: Partial<Record<AIProvider, string>>; evaluation?:EvaluationSettings };
export type KeyCollection = { schemaVersion?: 3; keys: KeyEntry[]; settings: PoolSettings };
export const defaultSettings: PoolSettings = { mode: 'priority', allowModelFallback: false, allowGroundingFallback: false, allowKeyFallback: true, allowProviderFallback: false, preferredProvider: 'gemini', preferredModel: DEFAULT_MODEL, fallbackProvider: 'gemini', fallbackModel: 'gemini-3.5-flash-lite', modelFallbacks: { gemini: 'gemini-3.5-flash-lite' } };
export type KeyHealth = { state: 'untested' | 'ready' | 'waiting' | 'invalid' | 'restricted'; until?: number; scope?: string; lastSuccess?: number; reason?: string; successes: number; failures: number };
export type KeyUsage = { calls: number; successes: number; failures: number; inputTokens: number; outputTokens: number; thinkingTokens: number; totalTokens: number; measuredResponses: number; durationMs: number; lastModel?: string; lastCall?: number };
export type PoolEvent = { at: number; keyId: string; model?: string; type: 'success' | 'failure' | 'fallback' | 'reset'; reason: string; targetId?: string };
export type PoolMonitoring = { since: number; updatedAt: number; activeKeyIds: string[]; usage: Record<string, KeyUsage>; events: PoolEvent[] };
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
  const rawSettings = data.settings as any;
  const settings: PoolSettings = {
    ...defaultSettings,
    ...data.settings,
    preferredProvider: 'gemini',
    preferredModel: modelInfo(rawSettings?.preferredModel)?.provider === 'gemini' ? rawSettings.preferredModel : DEFAULT_MODEL,
    fallbackProvider: 'gemini',
    fallbackModel: modelInfo(rawSettings?.fallbackModel)?.provider === 'gemini' ? rawSettings.fallbackModel : 'gemini-3.5-flash-lite',
    modelFallbacks: { gemini: rawSettings?.modelFallbacks?.gemini || 'gemini-3.5-flash-lite' }
  };
  if (data.settings.evaluation !== undefined) settings.evaluation = normalizeEvaluationSettings(data.settings.evaluation);
  if (![settings.allowKeyFallback, settings.allowProviderFallback].every(value => typeof value === 'boolean') || !isProvider(settings.preferredProvider) || !isProvider(settings.fallbackProvider)) throw new Error('Pengaturan penyedia tidak valid.');
  for (const [provider, model] of [[settings.preferredProvider,settings.preferredModel], [settings.fallbackProvider,settings.fallbackModel], ...Object.entries(settings.modelFallbacks || {})] as [AIProvider,string][]) {
    const norm = normalizeModelId(model);
    if (!isProvider(provider) || !validModelId(norm) || (modelInfo(norm) && modelInfo(norm)!.provider !== provider)) throw new Error('Model tidak sesuai dengan penyedia.');
  }
  const rawList = data.keys.filter(item => item && (item as any).provider !== 'groq');
  const keys = rawList.map(item => {
    if (!item || (item.provider !== undefined && !isProvider(item.provider)) || typeof item.id !== 'string' || !/^[\w-]{1,80}$/.test(item.id) || ids.has(item.id) ||
        typeof item.name !== 'string' || !item.name.trim() || item.name.length > 80 ||
        typeof item.project !== 'string' || item.project.length > 100 ||
        typeof item.key !== 'string' || !item.key || item.key.length > 1024 || /\s/.test(item.key) || secrets.has(item.key) ||
        typeof item.enabled !== 'boolean' || !Number.isInteger(item.priority) || item.priority < 1 || item.priority > 100)
      throw new Error('Data key tidak valid atau terdapat duplikat. Isi nama, key tanpa spasi, dan prioritas 1–100.');
    ids.add(item.id); secrets.add(item.key);
    return { id: item.id, provider: 'gemini' as const, name: item.name.trim(), project: item.project.trim(), key: item.key, enabled: item.enabled, priority: item.priority };
  });
  return { schemaVersion: 3, keys, settings };
}
export function errorKind(error: any): { kind: 'invalid' | 'restricted' | 'quota' | 'temporary' | 'network' | 'stop'; retryMs: number } {
  const msg = String(error?.message || error), code = String(error?.code || error?.error?.status || '');
  const status = Number(error?.status || error?.error?.code || /\b(400|401|402|403|404|408|429|500|502|503|504)\b/.exec(msg)?.[1]);
  let retry = Number(error?.retryAfterMs);
  if (!Number.isFinite(retry)) {
    const delay = geminiQuotaDetails(error).retryMs;
    const header = error?.headers?.get?.('retry-after');
    retry = delay ?? (header ? (Number.isFinite(Number(header)) ? Number(header) * 1000 : Date.parse(header) - Date.now()) : NaN);
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
  private quotaMessages = new Map<string, string>();
  private restrictions = new Set<string>();
  private cursor = 0;
  private locked = false;
  private controller = new AbortController();
  private since = Date.now();
  private usage = new Map<string, KeyUsage>();
  private events: PoolEvent[] = [];
  private active = new Set<string>();
  private event(event: Omit<PoolEvent, 'at'>) { this.events.unshift({ ...event, at: Date.now() }); this.events.length = Math.min(this.events.length, 100); }
  monitoring(): PoolMonitoring {
    return { since: this.since, updatedAt: Date.now(), activeKeyIds: [...this.active], usage: Object.fromEntries([...this.usage].map(([id, value]) => [id, { ...value }])), events: this.events.map(event => ({ ...event })) };
  }
  recordUsage(key: string, metadata: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; totalTokenCount?: number } | undefined) {
    const entry = this.collection.keys.find(entry => entry.key === key), usage = entry && this.usage.get(entry.id);
    if (!usage || !metadata) return;
    const count = (value?: number) => Number.isFinite(value) && value! >= 0 ? value! : 0;
    usage.inputTokens += count(metadata.promptTokenCount); usage.outputTokens += count(metadata.candidatesTokenCount);
    usage.thinkingTokens += count(metadata.thoughtsTokenCount); usage.totalTokens += count(metadata.totalTokenCount);
    usage.measuredResponses++; this.changed();
  }
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
        this.usage.delete(previous.id); this.events = this.events.filter(event => event.keyId !== previous.id && event.targetId !== previous.id);
      }
    }
    this.collection = next; this.changed();
  }
  private group(key: KeyEntry) { return `${key.provider ?? 'gemini'}:${key.project || '__unknown__'}`; }
  private quotaGroup(key: KeyEntry, model = '*') { return `${this.group(key)}\0${model}`; }
  lock() { this.locked = true; this.controller.abort(); this.collection = { keys: [], settings: defaultSettings }; this.health.clear(); this.cooldown.clear(); this.quotaMessages.clear(); this.usage.clear(); this.events = []; this.active.clear(); this.changed(); }
  status(id: string, scope?: string): KeyHealth {
    const key = this.collection.keys.find(k => k.id === id);
    const base = this.health.get(id) || { state: 'untested', successes: 0, failures: 0 };
    const until = key ? Math.max(!scope || !base.scope || base.scope === scope ? base.until || 0 : 0,
      this.cooldown.get(this.quotaGroup(key)) || 0,
      scope ? this.cooldown.get(this.quotaGroup(key, scope)) || 0 : 0) : 0;
    return { ...base, state: until > Date.now() && !['invalid','restricted'].includes(base.state) ? 'waiting' : base.state === 'waiting' && until <= Date.now() ? 'untested' : base.state, until };
  }
  reset(id: string) { const key = this.collection.keys.find(k => k.id === id); this.health.delete(id); for (const scope of this.restrictions) if (scope.startsWith(id + ':')) this.restrictions.delete(scope); if (key) { for (const scope of this.cooldown.keys()) if (scope.startsWith(this.group(key) + '\0')) { this.cooldown.delete(scope); this.quotaMessages.delete(scope); } this.event({ keyId: id, type: 'reset', reason: 'Karantina dan jeda kelompok direset oleh pengguna' }); } this.changed(); }
  async run<T>(fn: (key: string, signal: AbortSignal) => Promise<T>, options: { signal?: AbortSignal; onNotice?: (message: string) => void; maxAttempts?: number; allowKeyFallback?: boolean; model?: string; provider?: AIProvider } = {}): Promise<T> {
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(600_000), ...(options.signal ? [options.signal] : [])]);
    const seen = new Set<string>();
    let attempts = 0, transientRetries = 0;
    const maxAttempts = Math.max(1, Math.min(3, Math.floor(options.maxAttempts || 3)));
    let previousId: string | undefined;
    const started = Date.now();
    while (attempts < maxAttempts) {
      signal.throwIfAborted();
      if (this.locked) throw new PoolError('Vault terkunci.', 401, 'POOL_LOCKED');
      const ordered = this.collection.keys.filter(k => k.enabled && k.provider === (options.provider ?? 'gemini')).sort((a,b) => a.priority - b.priority);
      const eligible = ordered.filter(k => !seen.has(k.id) && !['invalid','waiting'].includes(this.status(k.id,options.model).state) &&
        !this.restrictions.has(k.id + ':*') && !this.restrictions.has(k.id + ':' + (options.model || '*')));
      let available = eligible.filter(k => !(this.busy.get(this.group(k)) || 0));
      if (!available.length && eligible.length && Date.now() - started < 30_000) { await pause(100, signal); continue; }
      if (!available.length) {
        const quotaWait = ordered.some(k => (this.cooldown.get(this.quotaGroup(k)) || 0) > Date.now() || (this.cooldown.get(this.quotaGroup(k, options.model)) || 0) > Date.now());
        if (quotaWait) {
          const key = ordered.find(k => (this.cooldown.get(this.quotaGroup(k)) || 0) > Date.now() || (this.cooldown.get(this.quotaGroup(k, options.model)) || 0) > Date.now())!;
          const scope = (this.cooldown.get(this.quotaGroup(key)) || 0) > Date.now() ? this.quotaGroup(key) : this.quotaGroup(key, options.model);
          throw new PoolError(this.quotaMessages.get(scope) || 'Permintaan dijeda setelah Google merespons 429. Periksa Koneksi AI → Pemantauan.', 429, 'POOL_QUOTA');
        }
        throw new PoolError('Semua key yang sesuai sedang menunggu, perlu diperbaiki, atau batas percobaan tercapai. Pengaturan kuis tetap tersimpan.', 503,
          ordered.some(k => this.restrictions.has(k.id + ':' + options.model)) ? 'POOL_MODEL_ACCESS' : 'POOL_UNAVAILABLE');
      }
      const entry = this.collection.settings.mode === 'balanced' ? available[this.cursor++ % available.length] : available[0];
      const group = this.group(entry);
      if (previousId && previousId !== entry.id) this.event({ keyId: previousId, targetId: entry.id, model: options.model, type: 'fallback', reason: 'Beralih ke key cadangan yang memenuhi syarat' });
      previousId = entry.id;
      const callStarted = Date.now();
      const usage = this.usage.get(entry.id) || { calls: 0, successes: 0, failures: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0, measuredResponses: 0, durationMs: 0 };
      usage.calls++; usage.lastCall = callStarted; usage.lastModel = options.model; this.usage.set(entry.id, usage); this.active.add(entry.id); this.changed();
      this.busy.set(group, 1); attempts++;
      const old = this.health.get(entry.id) || { state: 'untested' as const, successes: 0, failures: 0 };
      try {
        const result = await fn(entry.key, signal);
        signal.throwIfAborted();
        usage.successes++;
        this.recordUsage(entry.key, (result as any)?.usageMetadata);
        this.event({ keyId: entry.id, model: options.model, type: 'success', reason: 'Panggilan penyedia berhasil; validasi hasil dilakukan oleh aplikasi' });
        this.health.set(entry.id, { state: 'ready', lastSuccess: Date.now(), successes: old.successes + 1, failures: old.failures });
        this.changed(); return result;
      } catch (error: any) {
        usage.failures++;
        if (signal.aborted) this.event({ keyId: entry.id, model: options.model, type: 'failure', reason: 'Panggilan dibatalkan atau batas waktu tercapai' });
        signal.throwIfAborted();
        const { kind, retryMs } = errorKind(error);
        const reasons = { invalid: 'Key tidak valid atau dicabut; dikarantina otomatis', restricted: 'Akses model atau billing perlu diperiksa', quota: 'Kuota model pada proyek tercapai; kelompok dijeda', temporary: 'Gangguan sementara pada layanan', network: 'Koneksi jaringan gagal; rotasi dihentikan', stop: 'Permintaan gagal; rotasi dihentikan' };
        this.event({ keyId: entry.id, model: options.model, type: 'failure', reason: kind === 'quota' ? geminiQuotaDetails(error).reason : reasons[kind] });
        const health: KeyHealth = { ...old, scope: options.model, failures: old.failures + 1 };
        if (kind === 'invalid') { health.state = 'invalid'; health.reason = 'Key tidak valid atau dicabut'; seen.add(entry.id); }
        else if (kind === 'restricted') {
          health.state = 'restricted'; health.reason = 'Periksa izin, model, atau billing'; seen.add(entry.id);
          const billing = /402|billing|prepay|credits/i.test(String(error?.status || '') + String(error?.message));
          this.restrictions.add(entry.id + ':' + (!billing && options.model ? options.model : '*'));
        }
        else if (kind === 'quota') {
          const { daily, projectWide, reason } = geminiQuotaDetails(error);
          health.state = 'waiting';
          health.until = entry.provider === 'gemini' && daily ? Math.max(nextPacificMidnight() + 1000, Date.now() + retryMs) : Date.now() + retryMs;
          health.reason = reason;
          const scope = this.quotaGroup(entry, projectWide ? '*' : options.model);
          this.cooldown.set(scope, health.until);
          this.quotaMessages.set(scope, geminiQuotaMessage(error, options.model || 'pilihan'));
          seen.add(entry.id);
        } else if (kind === 'temporary') {
          health.reason = 'Layanan sementara bermasalah';
          if (transientRetries++ < 1 && attempts < maxAttempts) {
            this.health.set(entry.id, health); this.changed();
            options.onNotice?.('Layanan AI sedang bermasalah. Mencoba kembali dengan jeda.');
            await pause(1000 + Math.random() * 500, signal); continue;
          }
          health.state = 'waiting'; health.until = Date.now() + 30_000; seen.add(entry.id);
        } else { this.health.set(entry.id, health); this.changed(); throw error; }
        this.health.set(entry.id, health); this.changed();
        if (!(options.allowKeyFallback ?? this.collection.settings.allowKeyFallback)) throw error;
        options.onNotice?.(`${entry.name}: ${health.reason}. Mencoba key cadangan yang tersedia.`);
      } finally { this.busy.delete(group); this.active.delete(entry.id); usage.durationMs += Date.now() - callStarted; this.changed(); }
    }
    throw new PoolError('Batas percobaan tercapai. Coba kembali setelah jeda atau perbaiki key di pengelola.');
  }
}
