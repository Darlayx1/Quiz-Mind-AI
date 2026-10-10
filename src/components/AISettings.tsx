import { useEffect, useRef, useState } from 'react';
import { UserRound, KeyRound, Sparkles, History, X, Plus, Pencil, Trash2, ArrowUp, ArrowDown, RefreshCw, Check, Search, LogOut, Monitor, Cloud, Download, ChevronLeft } from 'lucide-react';
import { AI_MODELS, modelName } from '../models.js';
import type { AIModel } from '../models.js';
import type { Quiz } from '../types/quiz.js';
import type { WorkspaceController } from '../workspace/useWorkspace.js';
import type { ApiKeyRecord, Preferences } from '../workspace/types.js';
import { supabase, authRedirect, accountRpc } from '../workspace/supabase.js';
import { localImportPayload } from '../workspace/localRepository.js';
import { testKey } from '../workspace/ai.js';
import { AIEvaluationSettings } from './AIEvaluationSettings.js';
import { defaultEvaluationSettings } from '../evaluationSettings.js';

export type SettingsTab = 'account' | 'keys' | 'models' | 'history';
const tabs = [{ id: 'account', label: 'Akun', icon: UserRound }, { id: 'keys', label: 'API key', icon: KeyRound },
  { id: 'models', label: 'Model & penggunaan', icon: Sparkles }, { id: 'history', label: 'Riwayat', icon: History }] as const;
const statusLabel = { untested: 'Belum diuji', available: 'Akses tersedia', invalid: 'Kredensial ditolak', quota: 'Kuota / rate limit', unavailable: 'Layanan belum tersedia' };
const date = (value?: string) => value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export function AISettings({ workspace: w, initialTab = 'account', onClose, onSelectQuiz, accountLocked = false }:
  { workspace: WorkspaceController; initialTab?: SettingsTab; onClose: () => void; onSelectQuiz: (quiz: Quiz) => void; accountLocked?: boolean }) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const [authView, setAuthView] = useState<'login' | 'signup' | 'forgot' | 'reset'>(w.passwordRecovery ? 'reset' : 'login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState(w.session?.user.user_metadata?.name || '');
  const [editing, setEditing] = useState<ApiKeyRecord | 'new' | null>(null); const [label, setLabel] = useState(''); const [secret, setSecret] = useState('');
  const [search, setSearch] = useState(''); const [page, setPage] = useState(0);
  const [importPreview, setImportPreview] = useState<Awaited<ReturnType<typeof localImportPayload>> | null>(null);
  const [selectedImports, setSelectedImports] = useState<string[]>([]); const [importPreferences, setImportPreferences] = useState(false);
  const dialog = useRef<HTMLDivElement>(null); const mounted = useRef(true); const currentScope = useRef(w.scope); currentScope.current = w.scope;
  const titleId = 'ai-settings-title';
  const dirty = Boolean(editing && (label.trim() || secret));
  const close = () => { if (!busy && (!dirty || confirm('Form API key belum disimpan. Tutup pengaturan?'))) onClose(); };
  const closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    mounted.current = true; const prior = document.activeElement as HTMLElement | null; const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], textarea:not(:disabled)') || []).filter(el => el.offsetParent !== null);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { mounted.current = false; document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); prior?.focus(); };
  }, []);
  useEffect(() => { setSecret(''); setEditing(null); setImportPreview(null); setMessage(''); setError(''); setPage(0); setPassword(''); }, [w.scope]);
  const act = async (action: () => Promise<unknown>, success?: string) => {
    if (busy) return; const scope = w.scope; setBusy(true); setMessage(''); setError('');
    try { await action(); if (mounted.current && currentScope.current === scope && success) setMessage(success); }
    catch (e) { if (mounted.current && currentScope.current === scope) setError((e as Error).message || 'Operasi belum berhasil.'); }
    finally { if (mounted.current) setBusy(false); }
  };
  const chooseTab = (next: SettingsTab) => {
    if (busy || (dirty && !confirm('Form API key belum disimpan. Pindah tab?'))) return;
    setTab(next); setEditing(null); setSecret(''); setMessage(''); setError(''); setSearch(''); setPage(0);
  };
  const pref = (patch: Partial<Preferences>) => act(() => w.update(d => ({ ...d, preferences: { ...d.preferences, ...patch } })), 'Pilihan tersimpan.');
  const edit = (key: ApiKeyRecord | 'new') => { setEditing(key); setLabel(key === 'new' ? '' : key.label); setSecret(''); setMessage(''); setError(''); };
  const exportData = () => {
    const blob = new Blob([JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), data: w.data, keys: w.keys.map(({ fingerprint, ...key }) => key) }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'quizmind-riwayat.json'; link.click(); URL.revokeObjectURL(url);
  };
  const filteredKeys = w.keys.filter(k => `${k.label} ${k.suffix} ${statusLabel[k.status]}`.toLowerCase().includes(search.toLowerCase()));
  const filteredHistory = w.data.history.filter(item => `${item.quiz.title} ${item.quiz.topic}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  const scopeLabel = w.mode === 'guest' ? 'Lokal · perangkat ini' : `Akun · ${w.session?.user.email || 'sesi perlu dipulihkan'}`;
  return <div className="settings-overlay">
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="settings-window">
      <header className="settings-header"><div><span className="settings-eyebrow">PREFERENSI & AKSES</span><h2 id={titleId}>Pengaturan AI</h2></div><button className="icon-button" aria-label="Tutup pengaturan AI" disabled={busy} onClick={close}><X size={21} /></button></header>
      <div className="settings-layout">
        <aside className="settings-sidebar"><div className="settings-sidebar-label">PENGATURAN AI</div>
          <div role="tablist" aria-label="Pengaturan AI" className="settings-tabs">{tabs.map(({ id, label: text, icon: Icon }, i) => <button key={id} role="tab" id={`settings-tab-${id}`} aria-controls={`settings-panel-${id}`} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} className={tab === id ? 'active' : ''} onClick={() => chooseTab(id)} onKeyDown={event => {
            if (['ArrowDown','ArrowRight','ArrowUp','ArrowLeft','Home','End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (i + (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : 3)) % 4; chooseTab(tabs[next].id); document.getElementById(`settings-tab-${tabs[next].id}`)?.focus(); }
          }}><Icon size={20} /><span>{text}</span></button>)}</div>
          <div className="settings-storage"><span className="storage-icon">{w.mode === 'guest' ? <Monitor size={17} /> : <Cloud size={17} />}</span><strong>{w.mode === 'guest' ? 'Penyimpanan lokal' : 'Penyimpanan akun'}</strong><p>{w.mode === 'guest' ? 'Data bertahan di browser ini.' : 'Data hanya milik akun aktif.'}</p></div>
        </aside>
        <section id={`settings-panel-${tab}`} role="tabpanel" aria-labelledby={`settings-tab-${tab}`} className="settings-content">
          <div className="settings-scope"><span>{w.mode === 'guest' ? <Monitor size={14} /> : <Cloud size={14} />}{scopeLabel}</span><span role="status">{busy || w.saving ? 'Menyimpan / memproses…' : w.ready ? 'Penyimpanan siap' : 'Penyimpanan belum siap'}</span></div>
          {(error || w.error) && <div role="alert" className="settings-alert error">{error || w.error}<button onClick={() => act(w.refresh)} disabled={busy}>Muat ulang data</button></div>}
          {message && <div role="status" className="settings-alert success"><Check size={16} />{message}</div>}
          {tab === 'account' && <>
            <div className="settings-heading"><h3>Akun</h3><p>Gunakan secara lokal, atau masuk untuk menyimpan data ke akun Anda.</p></div>
            {accountLocked && <div className="settings-alert">Selesaikan atau tinggalkan kuis terlebih dahulu sebelum mengubah akun.</div>}
            {w.session && authView !== 'reset' ? <>
              <div className="settings-card account-card"><span className="account-avatar"><UserRound size={27} /></span><div><strong>{w.session.user.user_metadata?.name || 'Akun Anda'}</strong><p>{w.session.user.email}</p><span className="status-badge available">{w.session.user.email_confirmed_at ? 'Email terverifikasi' : 'Email belum terverifikasi'}</span></div></div>
              <form className="settings-form narrow" onSubmit={e => { e.preventDefault(); void act(async () => { const { error } = await supabase.auth.updateUser({ data: { name: name.trim() } }); if (error) throw error; }, 'Profil diperbarui.'); }}><label htmlFor="profile-name">Nama tampilan</label><input id="profile-name" maxLength={80} value={name} onChange={e => setName(e.target.value)} /><button className="settings-primary" disabled={busy}>Simpan profil</button></form>
              <div className="settings-divider" />
              <h4>Data lokal dan akun tetap terpisah</h4><p className="settings-help">Masuk tidak memindahkan data perangkat. Pilih sendiri data yang ingin diimpor ke akun ini.</p>
              <button className="settings-secondary" disabled={busy || !w.ready || accountLocked} onClick={() => act(async () => { const payload = await localImportPayload(); setImportPreview(payload); setSelectedImports(payload.keys.map(k => k.id)); })}>Pratinjau impor data lokal</button>
              {importPreview && <div className="settings-card import-preview"><h4>Impor ke {w.session.user.email}</h4><p>{importPreview.data.history.length} kuis · {importPreview.data.activity.length} aktivitas · {importPreview.keys.length} API key lokal</p><p className="settings-help">Data lokal tetap disimpan. Key duplikat dilewati; batas akun tetap 100.</p>
                <div className="import-key-list">{importPreview.keys.map(k => <label key={k.id}><input type="checkbox" checked={selectedImports.includes(k.id)} onChange={e => setSelectedImports(ids => e.target.checked ? [...ids, k.id] : ids.filter(id => id !== k.id))} />{k.label} <span>••••{k.suffix}</span></label>)}</div>
                <label className="settings-checkbox"><input type="checkbox" checked={importPreferences} onChange={e => setImportPreferences(e.target.checked)} />Ganti preferensi akun dengan preferensi lokal</label>
                <button className="settings-primary" disabled={busy || accountLocked} onClick={() => act(async () => { const data = await accountRpc(w.scope, 'qm_import_local', { p_payload: { ...importPreview, keys: importPreview.keys.filter(k => selectedImports.includes(k.id)) }, p_import_preferences: importPreferences }); setImportPreview(null); await w.refresh(); return data; }, 'Impor selesai. Data lokal tetap tersimpan.')}>Impor data yang dipilih</button>
              </div>}
              <button className="settings-link logout-link" disabled={busy || accountLocked} onClick={() => act(w.logout)}><LogOut size={16} />Keluar ke mode lokal</button>
            </> : <>
              <div className="settings-card local-account-note"><Monitor size={22} /><div><strong>{w.mode === 'reauth_required' ? 'Sesi perlu dipulihkan' : 'Anda menggunakan mode lokal'}</strong><p>{w.mode === 'reauth_required' ? 'Data akun tetap berada di akun asal.' : 'API key, pengaturan, kuis, dan riwayat tersimpan di perangkat ini tanpa perlu login.'}</p></div></div>
              <form className="settings-form narrow" onSubmit={e => { e.preventDefault(); void act(async () => {
                if (authView === 'forgot') { const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirect() }); if (error) throw error; setMessage('Tautan pemulihan dikirim jika alamat terdaftar.'); return; }
                if (authView === 'reset') { const { error } = await supabase.auth.updateUser({ password }); if (error) throw error; w.finishRecovery(); setAuthView('login'); setPassword(''); setMessage('Kata sandi diperbarui.'); return; }
                const response = authView === 'signup' ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: authRedirect(), data: { name: name.trim() } } }) : await supabase.auth.signInWithPassword({ email, password });
                if (response.error) throw response.error; setPassword(''); if (authView === 'signup' && !response.data.session) setMessage('Periksa email untuk memverifikasi akun sebelum masuk.');
              }); }}>
                <h4>{authView === 'signup' ? 'Buat akun' : authView === 'forgot' ? 'Pulihkan akun' : authView === 'reset' ? 'Kata sandi baru' : 'Masuk ke Quiz Mind AI'}</h4>
                {authView === 'signup' && <><label htmlFor="account-name">Nama tampilan</label><input id="account-name" value={name} maxLength={80} onChange={e => setName(e.target.value)} /></>}
                {authView !== 'reset' && <><label htmlFor="account-email">Email</label><input id="account-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></>}
                {authView !== 'forgot' && <><label htmlFor="account-password">{authView === 'reset' ? 'Kata sandi baru' : 'Kata sandi'}</label><input id="account-password" type="password" required minLength={authView === 'login' ? 1 : 8} autoComplete={authView === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} /></>}
                <button className="settings-primary" disabled={busy || accountLocked}>{authView === 'signup' ? 'Buat akun' : authView === 'forgot' ? 'Kirim tautan pemulihan' : authView === 'reset' ? 'Simpan kata sandi' : 'Masuk'}</button>
                {authView !== 'reset' && <div className="auth-links"><button type="button" className="settings-link" onClick={() => setAuthView(authView === 'login' ? 'signup' : 'login')}>{authView === 'login' ? 'Buat akun' : 'Kembali ke masuk'}</button>{authView === 'login' && <button type="button" className="settings-link" onClick={() => setAuthView('forgot')}>Lupa kata sandi?</button>}</div>}
              </form>
              {w.mode === 'reauth_required' && <button className="settings-secondary" disabled={busy} onClick={() => act(w.logout)}>Keluar ke mode lokal</button>}
              <p className="settings-help">Penyimpanan lokal mengikuti browser dan perangkat ini. Menghapus data situs atau menggunakan mode privat dapat menghapus data lokal.</p>
            </>}
          </>}
          {tab === 'keys' && <>
            <div className="settings-heading"><h3>API key <span className="settings-count">{w.keys.length}/100</span></h3><p>Kelola akses AI tanpa vault atau kata sandi penyimpanan tambahan.</p></div>
            {editing ? <form className="settings-form settings-card" onSubmit={e => { e.preventDefault(); void act(async () => { await w.keyAction(repo => repo.putKey({ id: editing === 'new' ? undefined : editing.id, label, secret: secret || undefined })); setEditing(null); setSecret(''); }, 'API key tersimpan.'); }}>
              <button type="button" className="settings-link" onClick={() => { if (!dirty || confirm('Batalkan perubahan API key?')) { setEditing(null); setSecret(''); } }}><ChevronLeft size={15} />Kembali ke daftar</button><h4>{editing === 'new' ? 'Tambahkan API key' : 'Edit API key'}</h4>
              <label htmlFor="key-label">Nama key</label><input id="key-label" required maxLength={80} placeholder="Contoh: Key utama" value={label} onChange={e => setLabel(e.target.value)} />
              <label htmlFor="key-value">{editing === 'new' ? 'API key Google' : 'Key pengganti (opsional)'}</label><input id="key-value" type="password" autoComplete="off" spellCheck={false} required={editing === 'new'} minLength={8} maxLength={1024} placeholder={editing === 'new' ? 'Masukkan API key' : 'Kosongkan untuk mempertahankan key'} value={secret} onChange={e => setSecret(e.target.value)} />
              <p className="settings-help">Disimpan tanpa enkripsi khusus aplikasi, {w.mode === 'guest' ? 'di browser ini' : 'di penyimpanan privat akun ini'}. Nilai penuh tidak ditampilkan dalam daftar.</p><button className="settings-primary" disabled={busy || !w.ready}>Simpan API key</button>
            </form> : <>
              <div className="settings-toolbar"><button className="settings-primary" disabled={busy || !w.ready || w.keys.length >= 100} onClick={() => edit('new')}><Plus size={17} />Tambahkan API key</button><label className="settings-search"><Search size={16} /><input aria-label="Cari API key" placeholder="Cari key…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /></label></div>
              {!filteredKeys.length && <div className="settings-empty"><KeyRound size={30} /><h4>{search ? 'Key tidak ditemukan' : 'Belum ada API key'}</h4><p>Tambahkan key Google untuk membuat kuis pada ruang ini.</p></div>}
              <div className="key-list">{filteredKeys.slice(page * 10, page * 10 + 10).map(key => <article key={key.id} className={`settings-card key-card ${!key.enabled ? 'disabled-key' : ''}`}><div className="key-card-top"><div><h4>{key.label} <span className="masked-key">••••{key.suffix}</span></h4><p>Google AI · Prioritas {key.priority} · {key.enabled ? 'Aktif' : 'Nonaktif'}</p></div><span className={`status-badge ${key.status}`}>{statusLabel[key.status]}</span></div><div className="key-stats">{key.successes} berhasil · {key.failures} gagal <span>Uji terakhir: {date(key.testedAt)}</span></div>
                <div className="key-actions"><button disabled={busy || !key.enabled || !w.ready} onClick={() => act(async () => { if (!w.repository) return; try { await testKey(w.repository, key.id, w.data.preferences.model); } finally { await w.refresh(); } }, 'Akses model berhasil diuji.')}><RefreshCw size={15} />Uji akses</button><button disabled={busy || !w.ready} onClick={() => edit(key)}><Pencil size={15} />Edit</button><button disabled={busy || !w.ready} onClick={() => act(() => w.keyAction(repo => repo.putKey({ id: key.id, label: key.label, enabled: !key.enabled })), 'Status key tersimpan.')}>{key.enabled ? 'Nonaktifkan' : 'Aktifkan'}</button>
                  <button disabled={busy || !w.ready} aria-label={`Naikkan prioritas ${key.label}`} onClick={() => act(() => w.keyAction(repo => repo.putKey({ id: key.id, label: key.label, priority: Math.max(0, key.priority - 1) })), 'Prioritas tersimpan.')}><ArrowUp size={15} /></button><button disabled={busy || !w.ready} aria-label={`Turunkan prioritas ${key.label}`} onClick={() => act(() => w.keyAction(repo => repo.putKey({ id: key.id, label: key.label, priority: key.priority + 1 })), 'Prioritas tersimpan.')}><ArrowDown size={15} /></button>
                  <button className="danger" disabled={busy || !w.ready} onClick={() => { if (confirm(`Hapus ${key.label} dari ruang ini? Pilihan key spesifik akan kembali ke otomatis jika diperlukan.`)) void act(() => w.keyAction(repo => repo.removeKey(key.id)), 'API key dihapus.'); }}><Trash2 size={15} />Hapus</button></div></article>)}</div>
              {filteredKeys.length > 10 && <div className="settings-pagination"><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>Sebelumnya</button><span>{page + 1} / {Math.ceil(filteredKeys.length / 10)}</span><button disabled={(page + 1) * 10 >= filteredKeys.length} onClick={() => setPage(p => p + 1)}>Berikutnya</button></div>}
              <p className="settings-help">Maksimal 100 key termasuk key nonaktif. Uji akses menggunakan satu permintaan AI kecil dan dapat memakai kuota.</p>
            </>}
          </>}
          {tab === 'models' && <>
            <div className="settings-heading"><h3>Model & penggunaan</h3><p>Tentukan partner AI dan cara memilih key untuk kuis berikutnya.</p></div>
            <fieldset disabled={busy || !w.ready} className="settings-form settings-card"><h4>Pembuat kuis</h4><label htmlFor="settings-model">Model</label><select id="settings-model" value={w.data.preferences.model} onChange={e => void pref({ model: e.target.value as AIModel })}>{AI_MODELS.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</select><p className="settings-help">Ketersediaan mengikuti akses project Google Anda. Gunakan Uji akses untuk memeriksa model yang dipilih.</p>
              <label htmlFor="settings-key">API key</label><select id="settings-key" value={w.data.preferences.keyId || ''} onChange={e => void pref({ keyId: e.target.value || null })}><option value="">Otomatis · ikuti prioritas key</option>{w.keys.filter(k => k.enabled).map(k => <option key={k.id} value={k.id}>{k.label} · ••••{k.suffix}</option>)}</select>
              <label className="settings-checkbox"><input type="checkbox" disabled={w.data.preferences.model === 'gemma-4-31b-it'} checked={w.data.preferences.grounding && w.data.preferences.model !== 'gemma-4-31b-it'} onChange={e => void pref({ grounding: e.target.checked })} />Gunakan referensi web jika model mendukung</label>
              <label className="settings-checkbox"><input type="checkbox" checked={w.data.preferences.allowGroundingFallback !== false} onChange={e => void pref({ allowGroundingFallback: e.target.checked })} />Lanjutkan tanpa referensi web jika kuota pencarian dibatasi</label><p className="settings-help">Menggunakan batas percobaan yang sama. Kuis akan menampilkan pemberitahuan jika dilanjutkan tanpa web.</p>
            </fieldset>
            <fieldset disabled={busy || !w.ready} className="settings-form settings-card"><h4>Penggunaan otomatis</h4><p className="settings-help">Key nonaktif dilewati. Key dari akun lain atau ruang lokal tidak digunakan sebagai cadangan.</p><label htmlFor="settings-attempts">Maksimal percobaan per batch</label><select id="settings-attempts" value={w.data.preferences.maxAttempts} onChange={e => void pref({ maxAttempts: Number(e.target.value) })}>{[1,2,3].map(n => <option key={n} value={n}>{n} percobaan</option>)}</select><label className="settings-checkbox"><input type="checkbox" checked={w.data.preferences.fallback} onChange={e => void pref({ fallback: e.target.checked })} />Izinkan key alternatif saat key spesifik gagal</label><p className="settings-help">Model tetap sesuai pilihan Anda. Perubahan tidak memengaruhi operasi yang sedang berjalan.</p></fieldset>
            <AIEvaluationSettings value={w.data.preferences.evaluation ?? defaultEvaluationSettings} onSave={evaluation => w.update(d=>({...d,preferences:{...d.preferences,evaluation}})).then(()=>{})} />
            <div className="usage-grid"><div><span>Operasi berhasil</span><strong>{w.data.activity.filter(a => a.status === 'success').length}</strong></div><div><span>Operasi gagal</span><strong>{w.data.activity.filter(a => a.status === 'failed').length}</strong></div><div><span>Penggunaan token</span><strong className="usage-unavailable">Tidak tersedia</strong></div></div><p className="settings-help">Ringkasan berasal dari aktivitas ruang ini, bukan sisa kuota atau tagihan Google.</p>
          </>}
          {tab === 'history' && <>
            <div className="settings-heading"><h3>Riwayat</h3><p>Kuis, hasil pengerjaan, dan aktivitas AI pada ruang penyimpanan ini.</p></div><div className="settings-toolbar"><label className="settings-search"><Search size={16} /><input aria-label="Cari riwayat kuis" placeholder="Cari topik atau judul…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /></label><button className="settings-secondary" onClick={exportData}><Download size={16} />Ekspor riwayat</button></div>
            <h4 className="settings-section-label">Riwayat kuis</h4>
            {!filteredHistory.length && <div className="settings-empty"><History size={30} /><h4>{search ? 'Kuis tidak ditemukan' : 'Belum ada kuis tersimpan'}</h4><p>Kuis yang Anda buat akan muncul di sini.</p></div>}
            {filteredHistory.slice(page * 10, page * 10 + 10).map(item => <article className="settings-card history-card" key={item.quiz.id}><div><h4>{item.quiz.title}</h4><p>{item.quiz.questions.length} soal · {modelName(item.quiz.model)} · {date(item.savedAt)}</p>{item.lastResult && <span className="status-badge available">Skor {item.lastResult.score}/100 · {item.attempts?.length || 1} pengerjaan</span>}</div><div className="history-actions"><button className="settings-link" onClick={() => { onSelectQuiz(item.quiz); onClose(); }}>Buka kuis</button><button className="icon-button danger" aria-label={`Hapus ${item.quiz.title}`} disabled={busy || !w.ready} onClick={() => { if (confirm('Hapus kuis dan hasilnya dari ruang ini?')) void act(() => w.update(d => ({ ...d, history: d.history.filter(h => h.quiz.id !== item.quiz.id), progress: d.progress?.quizId === item.quiz.id ? null : d.progress })), 'Kuis dihapus.'); }}><Trash2 size={16} /></button></div></article>)}
            {filteredHistory.length > 10 && <div className="settings-pagination"><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>Sebelumnya</button><span>{page + 1} / {Math.ceil(filteredHistory.length / 10)}</span><button disabled={(page + 1) * 10 >= filteredHistory.length} onClick={() => setPage(p => p + 1)}>Berikutnya</button></div>}
            <div className="settings-divider" /><h4>Aktivitas AI</h4>{!w.data.activity.length ? <p className="settings-help">Belum ada aktivitas AI.</p> : <div className="activity-list">{w.data.activity.slice(0, 30).map(activity => <div key={activity.id} className="activity-row"><span className={`activity-dot ${activity.status}`} /><div><strong>{activity.label}</strong><p>{modelName(activity.model)} · {date(activity.at)} · {(activity.durationMs / 1000).toFixed(1)} detik</p>{activity.detail && <p>{activity.detail}</p>}</div><span>{activity.status === 'success' ? 'Berhasil' : activity.status === 'cancelled' ? 'Dibatalkan' : 'Gagal'}</span></div>)}</div>}
          </>}
        </section>
      </div>
    </div>
  </div>;
}
