import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { PersonalKeyManager } from './PersonalKeyManager.js';
import type { AIProvider } from '../models.js';

export function AIConnectionsModal({ open, onClose, apiKey, onApiKeyChange, serverProviders }: { open: boolean; onClose: () => void; apiKey: string; onApiKeyChange: (value: string) => void; serverProviders?: AIProvider[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state,setState] = useState({ dirty: false, busy: false });
  const [confirmClose,setConfirmClose] = useState(false);
  const [mounted,setMounted] = useState(false);
  const handleState = useCallback((value: typeof state) => setState(value),[]);
  useEffect(() => {
    if (open) { setMounted(true); dialog.current?.showModal(); }
    else { dialog.current?.close(); setConfirmClose(false); }
    const previous = document.body.style.overflow;
    if (open) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  const close = () => { if (state.busy) return; if (state.dirty) setConfirmClose(true); else onClose(); };
  return <dialog ref={dialog} className="connection-window" aria-labelledby="connection-window-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="connection-window-shell">
      <header className="connection-window-header"><span className="connection-window-icon"><KeyRound size={22}/></span><div><h2 id="connection-window-title">Koneksi AI</h2><p>Gemini & Groq · key, model, dan penyimpanan terpadu</p></div><button type="button" className="icon-button" disabled={state.busy} onClick={close} aria-label="Tutup Koneksi AI" autoFocus><X size={21}/></button></header>
      {confirmClose && <div className="connection-close-confirm" role="alert"><p>Perubahan belum disimpan. Menutup jendela tetap mempertahankan sesi, tetapi perubahan dapat hilang setelah reload.</p><div className="key-actions"><button type="button" className="topic-chip" onClick={() => setConfirmClose(false)}>Kembali untuk menyimpan</button><button type="button" className="topic-chip" onClick={onClose}>Tutup · pertahankan sesi</button></div></div>}
      {mounted && <PersonalKeyManager apiKey={apiKey} onApiKeyChange={onApiKeyChange} onStateChange={handleState} serverProviders={serverProviders}/>}
    </div>
  </dialog>;
}
