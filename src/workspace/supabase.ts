import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || 'https://btsvqhlfkkgwkqsezzoq.supabase.co';
export const PUBLISHABLE_KEY = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_0_-VQxC-t2qEMzJTy63SkQ_-BYp-ZQM';
export const supabase = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});
export const authRedirect = () => `${location.origin}${import.meta.env.BASE_URL}`;
export async function accountRpc(owner: string, name: string, args: Record<string, unknown> = {}) {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session || session.user.id !== owner) throw new Error('Identitas akun berubah. Operasi dihentikan.');
  // Pin this request to the original JWT, even when Auth changes before completion.
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) throw accountError(result);
  return result;
}
export function accountError(error: { message?: string; code?: string }) {
  if (/PGRST202|PGRST205|42P01/.test(error.code || '')) return new Error('Penyimpanan akun belum tersedia. Migrasi database Supabase perlu dipasang. Data lokal tetap terpisah.');
  if (error.code === '40001') return new Error('Data akun berubah di perangkat lain. Muat ulang sebelum menyimpan.');
  return new Error(error.message || 'Data akun belum berhasil disimpan.');
}
