import { useEffect, useRef, useState } from 'react';
import { restoreComposerDraft, type ComposerDraft } from '../composerDraft.js';

export function useComposerDraft(initial: Record<string, unknown> | null | undefined, onSave: (draft: Record<string, unknown>) => Promise<unknown> | void) {
  const [draft, setDraft] = useState(() => restoreComposerDraft(initial));
  const latest = useRef(draft), revision = useRef(0), savedRevision = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const save = useRef(onSave); save.current = onSave;
  const active = useRef(true);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const inFlight = useRef<Promise<unknown> | null>(null);
  const flush = async () => {
    clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    if (savedRevision.current === revision.current) return;
    const next = latest.current, version = revision.current;
    if (active.current) { setSaving(true); setSaveError(''); }
    const operation = Promise.resolve().then(() => save.current(next)); inFlight.current = operation;
    try { await operation; savedRevision.current = version; }
    catch (e) { if (active.current) setSaveError('Draft belum tersimpan: ' + (e as Error).message); throw e; }
    finally { if (inFlight.current === operation) inFlight.current = null; if (active.current) setSaving(false); }
    if (revision.current !== version) await flush();
  };
  const flushRef = useRef(flush); flushRef.current = flush;
  const patch = (change: Partial<ComposerDraft> | ((current: ComposerDraft) => ComposerDraft)) => {
    latest.current = typeof change === 'function' ? change(latest.current) : { ...latest.current, ...change };
    revision.current++; setDraft(latest.current); clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current().catch(() => {}), 300);
  };
  useEffect(() => {
    active.current = true;
    const persist = () => { void flushRef.current().catch(() => {}); };
    const hide = () => { if (document.hidden) persist(); };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (savedRevision.current !== revision.current) { persist(); event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('pagehide', persist); window.addEventListener('beforeunload', beforeUnload); document.addEventListener('visibilitychange', hide);
    return () => { active.current = false; persist(); window.removeEventListener('pagehide', persist); window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('visibilitychange', hide); };
  }, []);
  return { draft, patch, flush, saveError, saving, pending: savedRevision.current !== revision.current, latest };
}
