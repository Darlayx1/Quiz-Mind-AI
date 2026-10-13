import type { SupabaseClient } from '@supabase/supabase-js';
import { withSignal } from './request.js';

type Auth = SupabaseClient['auth'];
const callbackKeys = ['code', 'error', 'error_code', 'error_description', 'sb_flow_id'];
const callbackFailure = 'Login belum berhasil. Tautan masuk mungkin kedaluwarsa atau dibuka di browser berbeda. Silakan mulai login kembali.';

export function profileName(metadata?: Record<string, unknown>) {
  for (const field of ['name', 'full_name']) {
    if (typeof metadata?.[field] === 'string' && metadata[field].trim()) return metadata[field] as string;
  }
  return '';
}

export function readAuthCallback(href: string) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const error = url.searchParams.get('error') || hash.get('error');
  const hasError = Boolean(error || url.searchParams.has('error_description') || hash.has('error_description'));
  if (!hasError && !url.searchParams.has('code')) return null;
  return { hasError, message: error === 'access_denied'
    ? 'Login dibatalkan atau izin masuk ditolak. Anda dapat mencoba masuk kembali.'
    : 'Login ditolak oleh penyedia akun. Silakan coba kembali atau gunakan metode masuk lain.' };
}

export function clearAuthCallback(href: string) {
  const url = new URL(href);
  for (const key of callbackKeys) url.searchParams.delete(key);
  const hash = new URLSearchParams(url.hash.slice(1));
  if (callbackKeys.some(key => hash.has(key))) {
    for (const key of callbackKeys) hash.delete(key);
    url.hash = hash.toString();
  }
  return url.toString();
}

// The SDK owns code exchange. initialize() reuses its existing initialization promise.
export async function completeAuthCallback(callback: NonNullable<ReturnType<typeof readAuthCallback>>,
  auth: Pick<Auth, 'initialize'>, currentUrl: () => string, replaceUrl: (url: string) => void,
  signal = AbortSignal.timeout(30000)): Promise<string> {
  let message = '';
  try {
    const { error } = await withSignal(auth.initialize(), signal);
    if (callback.hasError) message = callback.message;
    else if (error || new URL(currentUrl()).searchParams.has('code')) message = callbackFailure;
  } catch {
    message = callback.hasError ? callback.message : callbackFailure;
  }
  // Do not display provider-supplied descriptions or log codes/tokens.
  replaceUrl(clearAuthCallback(currentUrl()));
  return message;
}

export function createGoogleSignIn(auth: Pick<Auth, 'signInWithOAuth'>, redirectTo: () => string,
  navigate: (url: string) => void, signalForRequest = () => AbortSignal.timeout(20000),
  checkProvider?: (signal: AbortSignal) => Promise<void>) {
  let pending: Promise<void> | null = null;
  return function signInWithGoogle(): Promise<void> {
    if (pending) return pending;
    const operation = (async () => {
      const signal = signalForRequest();
      await checkProvider?.(signal);
      if (signal.aborted) throw signal.reason;
      // Defer navigation until the bounded request completes, so a late response
      // after timeout cannot redirect the user unexpectedly.
      const { data, error } = await withSignal(auth.signInWithOAuth({ provider: 'google', options: {
        redirectTo: redirectTo(), skipBrowserRedirect: true, queryParams: { prompt: 'select_account' },
      } }), signal);
      if (error) throw new Error('Login Google belum dapat dimulai. Periksa koneksi dan konfigurasi provider Google di Supabase.');
      if (!data.url) throw new Error('Tautan login Google tidak tersedia. Silakan coba kembali.');
      navigate(data.url);
    })();
    pending = operation.catch(error => {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error('Login Google melewati batas waktu. Periksa koneksi lalu coba kembali.');
      }
      throw error;
    }).finally(() => { pending = null; });
    return pending;
  };
}

export async function verifyGoogleProvider(settingsUrl: string, publishableKey: string, signal: AbortSignal, request = fetch) {
  let enabled: unknown;
  try {
    enabled = await withSignal((async () => {
      const response = await request(settingsUrl, { headers: { apikey: publishableKey }, signal });
      if (!response.ok) throw new Error('Auth settings unavailable');
      const settings = await response.json();
      return settings.external?.google;
    })(), signal);
    if (typeof enabled !== 'boolean') throw new Error('Invalid Auth settings');
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') throw error;
    throw new Error('Layanan login belum dapat dihubungi. Periksa koneksi lalu coba kembali.');
  }
  if (!enabled) throw new Error('Login Google belum tersedia. Silakan gunakan email atau coba kembali nanti.');
}
