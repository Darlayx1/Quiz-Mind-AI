import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, AccountSessionError } from './supabase.js';
import { withSignal, storageError } from './request.js';
import { localRepository } from './localRepository.js';
import { accountRepository } from './accountRepository.js';
import { emptyWorkspace, type ApiKeyRecord, type WorkspaceData, type WorkspaceRepository } from './types.js';

export function useWorkspace() {
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<'initializing' | 'guest' | 'account' | 'reauth_required'>('initializing');
  const [data, setData] = useState<WorkspaceData>(emptyWorkspace);
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false); const [ready, setReady] = useState(false);
  const [storageLoading, setStorageLoading] = useState(true);
  const context = useRef<{ epoch: number; repository: WorkspaceRepository; revision: number; data: WorkspaceData } | null>(null);
  const epoch = useRef(0); const queue = useRef<Promise<unknown>>(Promise.resolve()); const scope = useRef<string | null>(null);
  const recovery = useRef(false); const [passwordRecovery, setPasswordRecovery] = useState(false);
  const explicitLogout = useRef(false);
  const requiresAuth = useRef(false);
  const inFlight = useRef<{ epoch: number; controller: AbortController; promise: Promise<void> } | null>(null);
  const load = useCallback((repository: WorkspaceRepository, expected: number) => {
    if (inFlight.current?.epoch === expected) return inFlight.current.promise;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('Storage timeout', 'TimeoutError')), 30000);
    setStorageLoading(true); setError('');
    let stage = 'Memuat data penyimpanan';
    const promise = (async () => {
      try {
        const snapshot = await withSignal(repository.load(controller.signal), controller.signal);
        stage = 'Memuat daftar API key';
        const storedKeys = await withSignal(repository.keys(controller.signal), controller.signal);
        if (epoch.current !== expected) return;
        context.current = { epoch: expected, repository, ...snapshot }; setData(snapshot.data); setKeys(storedKeys); setReady(true); setError('');
      } catch (e) {
        if (epoch.current !== expected) return;
        if (e instanceof AccountSessionError) {
          requiresAuth.current = true; context.current = null; setSession(null); setData(emptyWorkspace()); setKeys([]); setReady(false); setMode('reauth_required');
        } else setReady(Boolean(context.current));
        setError(`${stage}: ${storageError(e)}`);
        controller.abort();
      } finally {
        clearTimeout(timer);
        if (inFlight.current?.controller === controller) inFlight.current = null;
        if (epoch.current === expected) setStorageLoading(false);
      }
    })();
    inFlight.current = { epoch: expected, controller, promise };
    return promise;
  }, []);
  const transition = useCallback((next: Session | null, signedOut = false) => {
    const nextScope = next?.user.id ?? 'guest';
    if (scope.current === nextScope && !requiresAuth.current) { setSession(next); return; }
    if (!next && scope.current && scope.current !== 'guest' && !signedOut) {
      epoch.current++; inFlight.current?.controller.abort(); inFlight.current = null; requiresAuth.current = true; context.current = null; setSession(null); setData(emptyWorkspace()); setKeys([]); setReady(false); setStorageLoading(false); setMode('reauth_required'); setError('Sesi perlu dipulihkan. Masuk kembali atau pilih Keluar ke mode lokal.'); return;
    }
    const nextEpoch = ++epoch.current; scope.current = nextScope; context.current = null;
    inFlight.current?.controller.abort(); inFlight.current = null; requiresAuth.current = false;
    setSession(next); setMode(next ? 'account' : 'guest'); setData(emptyWorkspace()); setKeys([]); setReady(false); setSaving(false); setError('');
    void load(next ? accountRepository(next.user.id) : localRepository, nextEpoch);
  }, [load]);
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => { if (alive) { setStorageLoading(false); setError('Pemulihan sesi melewati batas waktu. Silakan muat ulang data.'); } }, 30000);
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      clearTimeout(timer);
      if (event === 'PASSWORD_RECOVERY') { recovery.current = true; setPasswordRecovery(true); }
      // Defer database work outside the Auth callback lock.
      const signedOut = event === 'SIGNED_OUT' && explicitLogout.current;
      setTimeout(() => { if (alive) transition(next, signedOut); }, 0);
    });
    return () => { alive = false; clearTimeout(timer); listener.subscription.unsubscribe(); epoch.current++; inFlight.current?.controller.abort(); inFlight.current = null; context.current = null; scope.current = null; };
  }, [transition]);
  const refresh = useCallback(async () => {
    const expected = epoch.current;
    if (mode === 'reauth_required') return;
    if (mode === 'initializing') {
      setStorageLoading(true); setError('');
      try {
        const result = await withSignal(supabase.auth.getSession(), AbortSignal.timeout(20000));
        if (epoch.current !== expected) return;
        if (result.error) throw result.error;
        transition(result.data.session);
      } catch (e) { if (epoch.current === expected) { setStorageLoading(false); setError(storageError(e)); } }
      return;
    }
    await queue.current.catch(() => {});
    if (epoch.current !== expected) return;
    const current = context.current;
    const repository = current?.repository ?? (session ? accountRepository(session.user.id) : localRepository);
    await load(repository, expected);
  }, [load, mode, session, transition]);
  useEffect(() => {
    if (mode !== 'guest' || typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('quizmind:guest:changes'); channel.onmessage = () => { void refresh(); }; return () => channel.close();
  }, [mode, refresh]);
  const update = useCallback((change: (current: WorkspaceData) => WorkspaceData, expectedScope?: string) => {
    const captured = context.current;
    if (!captured || (expectedScope && captured.repository.scope !== expectedScope)) return Promise.reject(new Error('Ruang penyimpanan berubah. Operasi dihentikan.'));
    const operation = queue.current.catch(() => {}).then(async () => {
      if (context.current !== captured) throw new Error('Sesi penyimpanan berubah.');
      setSaving(true);
      try {
        const next = change(structuredClone(captured.data));
        const revision = await captured.repository.save(next, captured.revision);
        if (context.current !== captured) return;
        captured.data = next; captured.revision = revision; setData(next); setError('');
      } catch (e) { if (context.current === captured) setError((e as Error).message); throw e; }
      finally { if (context.current === captured) setSaving(false); }
    });
    queue.current = operation; return operation;
  }, []);
  const keyAction = useCallback(async (action: (repository: WorkspaceRepository) => Promise<void>) => {
    const captured = context.current; if (!captured) throw new Error('Penyimpanan belum siap.');
    await queue.current.catch(() => {});
    if (captured !== context.current) throw new Error('Ruang penyimpanan berubah.');
    await action(captured.repository);
    if (captured === context.current) await load(captured.repository, captured.epoch);
  }, [load]);
  return { session, mode, scope: mode === 'guest' ? 'guest' : session?.user.id ?? '', data, keys, error, saving, ready, storageLoading, update,
    keyAction, refresh, repository: context.current?.repository, passwordRecovery,
    finishRecovery: () => { recovery.current = false; setPasswordRecovery(false); },
    logout: async () => { explicitLogout.current = true; const { error: authError } = await supabase.auth.signOut({ scope: 'local' }); if (authError) { explicitLogout.current = false; throw authError; } transition(null, true); explicitLogout.current = false; },
  };
}
export type WorkspaceController = ReturnType<typeof useWorkspace>;
