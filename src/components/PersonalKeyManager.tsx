import React, { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { deletePersonalKey, hasSavedKey, savePersonalKey, unlockPersonalKey, VAULT_STORAGE_KEY } from '../personalKeyVault.js';

export function PersonalKeyManager({ apiKey, onApiKeyChange }: { apiKey: string; onApiKeyChange: (value: string) => void }) {
  const [draft, setDraft] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    const refresh = () => {
      try { setSaved(hasSavedKey()); }
      catch { setError('Penyimpanan browser tidak tersedia. Anda masih dapat memakai key untuk sesi ini.'); }
    };
    refresh();
    const sync = (event: StorageEvent) => {
      if (event.key === VAULT_STORAGE_KEY || event.key === null) {
        refresh(); onApiKeyChange(''); setDraft(''); setPassword(''); setConfirmation('');
        setMessage('Vault berubah di tab lain. Buka kembali untuk memakai key terbaru.');
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [onApiKeyChange]);
  useEffect(() => {
    if (!apiKey) { setDraft(''); setShowKey(false); }
  }, [apiKey]);
  const clearFields = () => { setDraft(''); setPassword(''); setConfirmation(''); setShowKey(false); };
  const run = async (action: 'save' | 'unlock') => {
    setBusy(true); setMessage(''); setError('');
    try {
      if (action === 'save') {
        if (password !== confirmation) throw new Error('Konfirmasi kata sandi belum cocok.');
        await savePersonalKey(draft, password);
        setSaved(true); onApiKeyChange(draft.trim());
        setMessage('Key tersimpan terenkripsi dan aktif. Penggantian tidak memerlukan build ulang.');
      } else {
        const key = await unlockPersonalKey(password);
        onApiKeyChange(key); setMessage('Vault terbuka. Key aktif untuk sesi ini.');
      }
      clearFields();
    } catch (err) {
      setPassword(''); setConfirmation('');
      setError(err instanceof Error && err.name !== 'QuotaExceededError' && err.name !== 'SecurityError'
        ? err.message : 'Penyimpanan gagal. Key tersimpan sebelumnya tetap dipertahankan.');
    } finally { setBusy(false); }
  };
  const remove = () => {
    try {
      deletePersonalKey(); setSaved(false); onApiKeyChange(''); clearFields(); setConfirmDelete(false);
      setError(''); setMessage('Key tersimpan dan key aktif telah dihapus.');
    } catch { setError('Vault belum dapat dihapus. Periksa izin penyimpanan browser.'); }
  };
  return <div aria-busy={busy} onKeyDown={event => {
    // Credential inputs live inside the quiz form; Enter must not generate a quiz.
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault();
  }}>
    <p className="field-help" role="status">{apiKey ? 'Key pribadi aktif' : saved ? 'Vault terkunci · buka dengan kata sandi' : 'Belum ada key pribadi'}{saved && apiKey ? ' · salinan terenkripsi tersimpan' : ''}</p>
    <label htmlFor="personal-api-key" className="field-label mt-3">{saved ? 'API key pengganti' : 'API key Google AI Studio'}</label>
    <div className="flex gap-2">
      <input id="personal-api-key" type={showKey ? 'text' : 'password'} className="field-input min-w-0 flex-1" value={draft} onChange={e => setDraft(e.target.value)} maxLength={1024} autoComplete="off" spellCheck={false} placeholder={apiKey ? 'Masukkan key baru untuk mengganti' : 'Masukkan API key Anda'} disabled={busy} aria-describedby="api-help" />
      <button type="button" className="icon-button" aria-label={showKey ? 'Sembunyikan API key' : 'Tampilkan API key'} aria-pressed={showKey} onClick={() => setShowKey(!showKey)} disabled={busy}>{showKey ? <EyeOff size={18} /> : <Eye size={18} />}</button>
    </div>
    <p id="api-help" className="field-help">Key dikirim langsung ke Google. Simpan dengan kata sandi agar dapat digunakan kembali setelah reload, atau gunakan hanya untuk sesi ini.</p>
    <label htmlFor="vault-password" className="field-label mt-3">Kata sandi vault</label>
    <input id="vault-password" type="password" className="field-input" value={password} onChange={e => setPassword(e.target.value)} maxLength={1024} autoComplete={draft ? 'new-password' : 'current-password'} disabled={busy} placeholder={draft ? 'Minimal 12 karakter untuk menyimpan' : 'Kata sandi saat menyimpan key'} />
    {draft && <><label htmlFor="vault-confirmation" className="field-label mt-3">Ulangi kata sandi</label><input id="vault-confirmation" type="password" className="field-input" value={confirmation} onChange={e => setConfirmation(e.target.value)} maxLength={1024} autoComplete="new-password" disabled={busy} /></>}
    <p className="field-help">Kata sandi tidak disimpan dan tidak dapat dipulihkan. Vault terkunci setelah reload atau 15 menit tanpa aktivitas. Gunakan kata sandi unik yang kuat.</p>
    <div className="flex flex-wrap gap-2 mt-3">
      <button type="button" className="topic-chip" disabled={busy || !draft.trim() || password.length < 12 || password !== confirmation} onClick={() => void run('save')}>{busy ? 'Memproses…' : saved ? 'Simpan key pengganti' : 'Simpan terenkripsi'}</button>
      {saved && <button type="button" className="topic-chip" disabled={busy || !password || Boolean(draft)} onClick={() => void run('unlock')}>Buka vault</button>}
      {draft && <button type="button" className="topic-chip" disabled={busy} onClick={() => { onApiKeyChange(draft.trim()); clearFields(); setError(''); setMessage('Key aktif hanya untuk sesi ini. Salinan vault tidak berubah.'); }}>Gunakan tanpa menyimpan</button>}
      {apiKey && <button type="button" className="topic-chip" disabled={busy} onClick={() => { onApiKeyChange(''); clearFields(); setMessage('Key aktif dikosongkan. Salinan terenkripsi tetap tersimpan jika tersedia.'); }}>Kunci / kosongkan sesi</button>}
      {saved && <button type="button" className="topic-chip" disabled={busy} onClick={() => setConfirmDelete(true)}>Hapus key tersimpan</button>}
    </div>
    {confirmDelete && <div className="mt-3" role="group" aria-label="Konfirmasi hapus vault"><p className="field-help">Hapus permanen key tersimpan di browser ini?</p><button type="button" className="topic-chip" disabled={busy} onClick={remove}>Ya, hapus</button> <button type="button" className="topic-chip" onClick={() => setConfirmDelete(false)}>Batal</button></div>}
    {error && <p role="alert" className="field-help text-red-600">{error}</p>}
    {message && <p role="status" className="field-help">{message}</p>}
    <div className="menu-api-links"><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Buat API key di Google AI Studio</a></div>
  </div>;
}
