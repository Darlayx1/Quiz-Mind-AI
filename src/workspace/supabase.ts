import { createClient } from '@supabase/supabase-js';
import { withSignal } from './request.js';
import { completeAuthCallback, createGoogleSignIn, readAuthCallback, verifyGoogleProvider } from './googleAuth.js';

export const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL || 'https://btsvqhlfkkgwkqsezzoq.supabase.co';
export const PUBLISHABLE_KEY = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_0_-VQxC-t2qEMzJTy63SkQ_-BYp-ZQM';
const callback = typeof location === 'undefined' ? null : readAuthCallback(location.href);
export const supabase = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});
export const authRedirect = () => `${location.origin}${import.meta.env.BASE_URL}`;
export const signInWithGoogle = createGoogleSignIn(supabase.auth, authRedirect, url => location.assign(url),
  () => AbortSignal.timeout(20000), signal => verifyGoogleProvider(`${SUPABASE_URL}/auth/v1/settings`, PUBLISHABLE_KEY, signal));
export const authCallbackResult = callback ? completeAuthCallback(callback, supabase.auth,
  () => location.href, url => history.replaceState(history.state, '', url)) : null;
export class AccountSessionError extends Error {
  constructor() { super('Sesi akun perlu dipulihkan. Silakan masuk kembali.'); this.name = 'AccountSessionError'; }
}
export async function accountSession(owner: string, signal: AbortSignal) {
  let result: Awaited<ReturnType<typeof supabase.auth.getSession>>;
  try {
    result = await withSignal(supabase.auth.getSession(), signal);
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      console.warn('[QuizMind storage]', { phase: 'session', outcome: 'timeout' });
      throw new Error('Pemulihan sesi akun tidak merespons. Muat ulang halaman lalu coba kembali.');
    }
    throw error;
  }
  const { data, error } = result;
  if (error) {
    if (error.status === 401 || error.status === 403) throw new AccountSessionError();
    throw error;
  }
  if (!data.session) throw new AccountSessionError();
  if (data.session.user.id !== owner) throw new Error('Identitas akun berubah. Operasi dihentikan.');
  return data.session;
}
export async function accountResponse(response: Response) {
  if (response.status === 401) throw new AccountSessionError();
  const text = await response.text();
  let result: any = null;
  try { result = text ? JSON.parse(text) : null; }
  catch { throw new Error(`Respons penyimpanan tidak valid (HTTP ${response.status}). Periksa koneksi lalu muat ulang.`); }
  if (!response.ok) {
    throw accountError(result || {});
  }
  return result;
}
export async function accountRpc(owner: string, name: string, args: Record<string, unknown> = {}, parentSignal?: AbortSignal) {
  const signal = parentSignal ? AbortSignal.any([parentSignal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);
  const session = await accountSession(owner, signal);
  // Pin this request to the original JWT, even when Auth changes before completion.
  const started = Date.now();
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, { method: 'POST', signal,
      headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    return await accountResponse(response);
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      console.warn('[QuizMind storage]', { phase: 'database', operation: name, outcome: 'timeout', elapsedMs: Date.now() - started });
      throw new Error('Layanan database akun tidak merespons. Sesi Anda tersedia, tetapi data akun belum dapat dibuka. Coba lagi setelah layanan pulih.');
    }
    throw error;
  }
}
export function accountError(error: { message?: string; code?: string }) {
  if (/PGRST202|PGRST205|42P01/.test(error.code || '')) return new Error('Penyimpanan akun belum tersedia. Migrasi database Supabase perlu dipasang. Data lokal tetap terpisah.');
  if (error.code === 'PT409' || error.code === '40001') return new Error('Data akun berubah di perangkat lain. Muat ulang sebelum menyimpan.');
  return new Error(error.message || 'Data akun belum berhasil disimpan.');
}
