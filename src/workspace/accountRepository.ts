import { accountSession, accountResponse, accountRpc, SUPABASE_URL, PUBLISHABLE_KEY } from './supabase.js';
import { sanitizeWorkspace, type ApiKeyRecord, type WorkspaceRepository } from './types.js';

export function accountRepository(userId: string): WorkspaceRepository {
  return {
    scope: userId,
    async load(signal) {
      const data = await accountRpc(userId, 'qm_load_workspace', {}, signal);
      if (!data || !Number.isSafeInteger(data.revision) || !data.data || typeof data.data !== 'object' || Array.isArray(data.data)) throw new Error('Data penyimpanan akun tidak valid. Muat ulang atau periksa layanan penyimpanan.');
      return { revision: data.revision, data: sanitizeWorkspace(data.data) };
    },
    async save(value, revision) {
      return accountRpc(userId, 'qm_save_workspace', { p_data: value, p_revision: revision });
    },
    async keys(parentSignal) {
      const signal = parentSignal ? AbortSignal.any([parentSignal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);
      const session = await accountSession(userId, signal);
      const response = await fetch(`${SUPABASE_URL}/rest/v1/qm_api_keys?select=*&user_id=eq.${userId}&order=priority.asc,id.asc`, {
        signal, headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` } });
      const data = await accountResponse(response);
      if (!Array.isArray(data)) throw new Error('Daftar API key akun tidak valid. Silakan muat ulang.');
      return data.map((k: Record<string, any>) => ({ id: k.id, provider: k.provider ?? 'gemini', label: k.label, suffix: k.suffix, fingerprint: k.fingerprint,
        enabled: k.enabled, priority: k.priority, status: k.status, testedAt: k.tested_at,
        successes: k.successes, failures: k.failures })) as ApiKeyRecord[];
    },
    async putKey(input) {
      await accountRpc(userId, 'qm_upsert_provider_key', { p_id: input.id || null, p_label: input.label, p_provider: input.provider || null,
        p_secret: input.secret?.trim() || null, p_enabled: input.enabled ?? null, p_priority: input.priority ?? null });
    },
    async removeKey(id) { await accountRpc(userId, 'qm_remove_key', { p_id: id }); },
    async recordKeyOutcome() { /* Account outcomes are written by the verified AI service only. */ },
  };
}
