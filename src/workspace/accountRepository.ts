import { supabase, accountError, accountRpc, SUPABASE_URL, PUBLISHABLE_KEY } from './supabase.js';
import { sanitizeWorkspace, type ApiKeyRecord, type WorkspaceRepository } from './types.js';

export function accountRepository(userId: string): WorkspaceRepository {
  return {
    scope: userId,
    async load() {
      const data = await accountRpc(userId, 'qm_load_workspace');
      return { revision: data.revision, data: sanitizeWorkspace(data.data) };
    },
    async save(value, revision) {
      return accountRpc(userId, 'qm_save_workspace', { p_data: value, p_revision: revision });
    },
    async keys() {
      const { data: identity } = await supabase.auth.getSession();
      if (identity.session?.user.id !== userId) throw new Error('Identitas akun berubah.');
      const response = await fetch(`${SUPABASE_URL}/rest/v1/qm_api_keys?select=*&user_id=eq.${userId}&order=priority.asc,id.asc`, {
        signal: AbortSignal.timeout(20000), headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${identity.session.access_token}` } });
      const data = await response.json(); if (!response.ok) throw accountError(data);
      return (data || []).map((k: Record<string, any>) => ({ id: k.id, label: k.label, suffix: k.suffix, fingerprint: k.fingerprint,
        enabled: k.enabled, priority: k.priority, status: k.status, testedAt: k.tested_at,
        successes: k.successes, failures: k.failures })) as ApiKeyRecord[];
    },
    async putKey(input) {
      await accountRpc(userId, 'qm_upsert_key', { p_id: input.id || null, p_label: input.label,
        p_secret: input.secret?.trim() || null, p_enabled: input.enabled ?? null, p_priority: input.priority ?? null });
    },
    async removeKey(id) { await accountRpc(userId, 'qm_remove_key', { p_id: id }); },
    async recordKeyOutcome() { /* Account outcomes are written by the verified AI service only. */ },
  };
}
