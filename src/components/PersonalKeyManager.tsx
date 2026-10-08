import { AIEvaluationSettings } from './AIEvaluationSettings.js';
import { loadEvaluationPreferences, normalizeEvaluationSettings } from '../evaluationSettings.js';
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Eye, EyeOff, KeyRound, CheckCircle2, ArrowRight, ShieldCheck } from 'lucide-react';
import { activateCloud, activateCollection, cloudApi, getKeyPool, isCloudActive, keyRevision, lockKeys, subscribeKeys, safeError, refreshKeyStatus } from '../api.js';
import { AI_MODELS, defaultProviderModel, providerName, type AIProvider } from '../models.js';
import { probeKey } from '../server/providerClient.js';
import { defaultSettings, KeyPool, type KeyEntry, type KeyHealth, type PoolSettings } from '../keyPool.js';
import { decryptCollection, deleteVault, encryptCollection, MULTI_VAULT_KEY, openVault, savedVault, storeVault } from '../multiKeyVault.js';
import { VAULT_STORAGE_KEY } from '../personalKeyVault.js';
import { hasStoredClientKeys, CLIENT_STORAGE_KEY, deleteStoredClientKeys } from '../clientKeyStorage.js';
type Row = Omit<KeyEntry,'key'> & { masked: string; health: KeyHealth };
type CloudData = { revision: number; settings: PoolSettings; keys: Row[] };
const statuses = { untested: 'Belum diuji', ready: 'Siap digunakan', waiting: 'Menunggu', invalid: 'Perlu mengganti key', restricted: 'Perlu memperbaiki akses' };
export function PersonalKeyManager({ apiKey, onApiKeyChange, onStateChange, serverProviders = [],initialSection='overview' }: { initialSection?:'overview'|'evaluation';apiKey: string; onApiKeyChange: (value: string) => void; onStateChange?: (state: { dirty: boolean; busy: boolean }) => void; serverProviders?: AIProvider[] }) {
  const revision = useSyncExternalStore(subscribeKeys, keyRevision);
  const pool = getKeyPool();
  const [mode,setMode] = useState<'local'|'server'>(isCloudActive() ? 'server' : 'local');
  const [tab,setTab] = useState<'overview'|'keys'|'models'|'evaluation'|'storage'>(initialSection);
  useEffect(()=>setTab(initialSection),[initialSection]);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [tab]);
  const [provider,setProvider] = useState<AIProvider>('gemini');
  const [filter,setFilter] = useState<'all'|AIProvider>('all');
  const [discovered,setDiscovered] = useState<Partial<Record<AIProvider,string[]>>>({});
  const [draftTest,setDraftTest] = useState('');
  const [modelDraft,setModelDraft] = useState('');
  const [advanced,setAdvanced] = useState(false);
  const [remote,setRemote] = useState<CloudData | null>(null);
  const [available,setAvailable] = useState(false), [saved,setSaved] = useState(false), [dirty,setDirty] = useState(false), [busy,setBusy] = useState(false);
  const [message,setMessage] = useState(''), [error,setError] = useState('');
  const [name,setName] = useState(''), [project,setProject] = useState(''), [priority,setPriority] = useState('1'), [draft,setDraft] = useState('');
  const [show,setShow] = useState(false), [edit,setEdit] = useState<string | null>(null);
  const [password,setPassword] = useState(''), [confirmation,setConfirmation] = useState(''), [username,setUsername] = useState('owner');
  const [backup,setBackup] = useState(''), [backupPassword,setBackupPassword] = useState(''), [confirm,setConfirm] = useState<string | null>(null);
  const [backupConfirmation,setBackupConfirmation] = useState('');
  const [now,setNow] = useState(Date.now());
  const remoteActive = mode === 'server' && Boolean(remote) && isCloudActive();
  const settings = remoteActive ? remote!.settings : pool?.collection.settings || defaultSettings;
  const rows: Row[] = remoteActive ? remote!.keys : (pool?.collection.keys || []).map(({ key,...item }) => ({ ...item, masked: '••••' + key.slice(-4), health: pool!.status(item.id) }));
  const unlocked = mode === 'local' ? Boolean(pool) : remoteActive;
  const hasUnsaved = dirty || Boolean(draft || edit || (modelDraft && modelDraft !== settings.preferredModel));
  useEffect(() => { setModelDraft(settings.preferredModel ?? ''); }, [settings.preferredModel]);
  useEffect(() => { onStateChange?.({ dirty: dirty || Boolean(draft || edit || (modelDraft && modelDraft !== settings.preferredModel)), busy }); }, [dirty,draft,edit,modelDraft,settings.preferredModel,busy,onStateChange]);
  useEffect(() => { setDraftTest(''); }, [draft,provider]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (hasUnsaved) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload',warn); return () => window.removeEventListener('beforeunload',warn); }, [hasUnsaved]);
  const clearFields = () => { setDraft(''); setShow(false); setName(''); setProject(''); setPriority('1'); setEdit(null); setPassword(''); setConfirmation(''); setBackupPassword(''); setBackupConfirmation(''); setBackup(''); };
  const refreshSaved = () => { try { setSaved(Boolean(savedVault())); } catch { setError('Penyimpanan browser tidak tersedia. Gunakan key untuk sesi ini.'); } };
  useEffect(() => {
    refreshSaved();
    if (import.meta.env.BASE_URL === '/' || import.meta.env.VITE_API_BASE_URL) void cloudApi('capabilities').then(data => setAvailable(data.configured)).catch(() => {});
    const sync = (event: StorageEvent) => {
      if ([CLIENT_STORAGE_KEY, MULTI_VAULT_KEY, VAULT_STORAGE_KEY, null].includes(event.key)) {
        refreshSaved();
        if (!hasStoredClientKeys() && !savedVault()) {
          clearFields();
          setDirty(false);
        }
      }
    };
    window.addEventListener('storage',sync);
    const timer = setInterval(() => setNow(Date.now()),1000);
    return () => { window.removeEventListener('storage',sync); clearInterval(timer); };
  }, [onApiKeyChange]);
  useEffect(() => { if (!apiKey) { clearFields(); setRemote(null); setDirty(false); } }, [apiKey]);
  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true); setMessage(''); setError('');
    try { await fn(); } catch (err) { let text = safeError(err); for (const secret of draft.split(/\r?\n/).map(value => value.trim()).filter(Boolean)) text = text.replaceAll(secret,'[key disamarkan]'); setError(text); }
    finally { setBusy(false); setPassword(''); setConfirmation(''); setBackupPassword(''); setBackupConfirmation(''); }
  };
  const activate = (collection: Parameters<typeof activateCollection>[0]) => { activateCollection(collection, true); onApiKeyChange('__pool__'); setDirty(false); refreshSaved(); };
  const updateRemote = (data: CloudData) => { setRemote(data); activateCloud(data.keys.filter(k => k.enabled).length, data.keys.filter(k => k.enabled).map(k => k.provider ?? 'gemini'), data.settings); onApiKeyChange('__cloud__'); };
  useEffect(() => { if (isCloudActive()) void cloudApi('session').then(updateRemote).catch(() => { lockKeys(); onApiKeyChange(''); }); }, []);
  useEffect(() => {
    if (isCloudActive()) void cloudApi('session').then(data => setRemote(data)).catch(() => { lockKeys(); onApiKeyChange(''); });
  }, [revision]);
  const mutate = async (route: string, body: Record<string,unknown>) => updateRemote(await cloudApi(route, { ...body, revision: remote!.revision }));
  const add = () => run(async () => {
    const lines = draft.split(/\r?\n/).map(k => k.trim()).filter(Boolean), rank = Number(priority);
    const label = name.trim() || `${providerName(provider)} ${rows.filter(row => row.provider === provider).length + 1}`;
    if (!Number.isInteger(rank) || rank < 1 || rank > 100) throw new Error('Prioritas harus 1–100.');
    if (edit) {
      if (lines.length > 1) throw new Error('Penggantian menerima satu key.');
      if (rows.find(row => row.id === edit)?.provider !== provider && !lines.length) throw new Error('Masukkan key baru untuk mengganti penyedia.');
      const patch = { provider, name: label, project: project.trim(), priority: rank, ...(lines.length ? { key: lines[0] } : {}) };
      if (remoteActive) await mutate('update', { id: edit, patch });
      else activate({ ...pool!.collection, keys: pool!.collection.keys.map(k => k.id === edit ? { ...k, ...patch } : k) });
    } else {
      if (!lines.length) throw new Error('Masukkan setidaknya satu API key.');
      const keys = lines.map((key,index) => ({ id: crypto.randomUUID(), provider, name: label + (lines.length > 1 ? ` ${index + 1}` : ''), project: project.trim(), priority: rank, key, enabled: true }));
      if (remoteActive) await mutate('add', { keys }); else activate({ keys: [...(pool?.collection.keys || []), ...keys], settings: pool?.collection.keys.length ? settings : { ...settings, preferredProvider: provider, preferredModel: defaultProviderModel(provider), fallbackProvider: provider === 'groq' ? 'gemini' : 'groq', fallbackModel: defaultProviderModel(provider === 'groq' ? 'gemini' : 'groq') } });
    }
    setName(''); setProject(''); setDraft(''); setShow(false); setEdit(null);
    setMessage(remoteActive ? 'Key tersimpan terenkripsi di server.' : 'Key berhasil disimpan di perangkat ini dan siap digunakan.');
  });
  const toggle = (row: Row) => run(async () => {
    if (remoteActive) await mutate('update', { id: row.id, patch: { enabled: !row.enabled } });
    else activate({ ...pool!.collection, keys: pool!.collection.keys.map(k => k.id === row.id ? { ...k, enabled: !k.enabled } : k) });
  });
  const changeSettings = (next: PoolSettings) => run(async () => { if (remoteActive) await mutate('settings',{ settings: next }); else activate({ keys: pool?.collection.keys || [], settings: next }); });
  const test = (row: Row) => run(async () => {
    if (remoteActive) { const data = await cloudApi('test',{ id: row.id }); updateRemote(data); setDiscovered(old => ({ ...old, [row.provider ?? 'gemini']: data.models })); }
    else {
      const entry = pool!.collection.keys.find(k => k.id === row.id)!;
      try {
        const models = await probeKey(entry);
        setDiscovered(old => ({ ...old, [entry.provider ?? 'gemini']: models }));
        pool!.reset(row.id); pool!.health.set(row.id, { state: 'ready', lastSuccess: Date.now(), successes: 0, failures: 0, reason: 'Kredensial diterima untuk daftar model' });
        refreshKeyStatus();
      } catch { throw new Error('Uji koneksi gagal. Periksa key, izin penyedia, dan koneksi.'); }
    }
    setMessage('Kredensial diterima untuk daftar model. Akses model tertentu dan kuota generasi belum diuji.');
  });
  const testDraft = () => run(async () => {
    const lines = draft.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    if (lines.length !== 1) throw new Error('Masukkan satu key untuk uji koneksi. Penambahan massal tersedia di pengaturan lanjutan.');
    if (remoteActive) throw new Error('Tambahkan key ke server terlebih dahulu, lalu pilih Uji koneksi pada daftar.');
    const models = await probeKey({ id: 'draft', provider, name: 'Uji koneksi', project, key: lines[0], enabled: true, priority: 1 });
    setDiscovered(old => ({ ...old, [provider]: models })); setDraftTest('Koneksi berhasil. Key dapat ditambahkan.');
    setMessage('Key diterima. Uji ini membaca daftar model; kuota pembuatan kuis belum diuji.');
  });
  const testGeneration = (row: Row) => run(async () => {
    const selected = settings.preferredProvider === row.provider ? settings.preferredModel! : defaultProviderModel(row.provider ?? 'gemini');
    if (remoteActive) await cloudApi('test-generation',{ id: row.id, model: selected });
    else {
      const entry = pool!.collection.keys.find(key => key.id === row.id)!;
      const probe = new KeyPool({ keys: [{ ...entry, enabled: true }], settings: { ...defaultSettings } });
      try { const { generateQuiz } = await import('../server/aiService.js'); await generateQuiz({ provider: row.provider, model: selected, topic: 'Penjumlahan dasar', difficulty: 'easy', questionCount: 1, timeLimitMinutes: 0, language: 'id', enableGrounding: false },undefined,{ pool: probe, signal: AbortSignal.timeout(90_000) }); pool!.reset(row.id); pool!.health.set(row.id,{ state: 'ready', lastSuccess: Date.now(), successes: 1, failures: 0, reason: `Pembuatan soal berhasil: ${selected}` }); refreshKeyStatus(); }
      finally { probe.lock(); }
    }
    setMessage(`Satu soal berhasil dibuat dengan ${selected}. Uji ini menggunakan kuota model.`);
  });
  const download = (raw: string) => {
    const url = URL.createObjectURL(new Blob([raw],{ type: 'application/json' })), anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'quizmind-' + new Date().toISOString().slice(0,10) + '.vault.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  };
  const remove = () => run(async () => {
    if (confirm === 'all') {
      if (remoteActive) await mutate('clear',{});
      else {
        deleteStoredClientKeys();
        deleteVault();
        lockKeys(true);
        onApiKeyChange('');
        setSaved(false);
        setDirty(false);
      }
    } else if (confirm) {
      if (remoteActive) await mutate('remove',{ id: confirm });
      else {
        const nextKeys = pool!.collection.keys.filter(k => k.id !== confirm);
        if (!nextKeys.length) {
          deleteStoredClientKeys();
          deleteVault();
          lockKeys(true);
          onApiKeyChange('');
          setSaved(false);
          setDirty(false);
        } else {
          activate({ ...pool!.collection, keys: nextKeys });
        }
      }
    }
    setConfirm(null); setMessage('Penghapusan selesai. Untuk mencabut key, buka konsol penyedianya.');
  });
  const lock = () => run(async () => { if (remoteActive) await cloudApi('logout',{}); lockKeys(); onApiKeyChange(''); setRemote(null); setDirty(false); clearFields(); setMessage(saved || remoteActive ? 'Sesi terkunci. Salinan terenkripsi tetap tersimpan.' : 'Sesi terkunci. Key yang belum disimpan dihapus dari memori.'); });
  const modelOptions = (value: AIProvider) => [...new Set([...AI_MODELS.filter(model => model.provider === value).map(model => model.id), ...(discovered[value] || [])])];
  return <div className="key-manager" aria-busy={busy}>
    <nav className="connection-tabs" aria-label="Bagian Koneksi AI">
      {([['overview','Ringkasan'],['keys','API Key'],['models','Model & Cadangan'],['evaluation','Evaluasi AI'],['storage','Penyimpanan']] as const).map(([id,label]) => <button type="button" key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>)}
    </nav>
    <div className="connection-content" ref={contentRef}>
      {error && <div className="connection-feedback error" role="alert">{error}</div>}
      {message && <div className="connection-feedback" role="status"><CheckCircle2 size={18}/><span>{message}</span></div>}
      {tab==='evaluation'&&<AIEvaluationSettings value={normalizeEvaluationSettings(settings.evaluation??loadEvaluationPreferences())} onSave={async evaluation=>{if(remoteActive)await mutate('settings',{settings:{...settings,evaluation}});else if(pool)activate({...pool.collection,settings:{...settings,evaluation}});}}/>}
      <section hidden={tab !== 'overview'}>
        <div className="connection-section-heading"><div><h3>Satu tempat untuk koneksi AI Anda</h3><p>Hubungkan Gemini atau Groq, lalu pilih model untuk membuat kuis.</p></div><ShieldCheck size={24}/></div>
        <div className="connection-provider-grid">{(['gemini','groq'] as const).map(id => {
          const entries = rows.filter(row => row.provider === id);
          return <article key={id} className={'connection-provider-card ' + (settings.preferredProvider === id ? 'selected' : '')}>
            <span className="connection-provider-icon">{id === 'gemini' ? 'G' : 'g'}</span><h4>{providerName(id)}</h4><p>{id === 'gemini' ? 'Pembuatan kuis dan referensi Google Search.' : 'Pembuatan kuis dengan pilihan model melalui Groq.'}</p>
            <span className="connection-badge">{!apiKey && serverProviders.includes(id) ? 'Key hosting tersedia' : `${entries.filter(row => row.enabled).length} key aktif`}{settings.preferredProvider === id ? ' · Penyedia utama' : ''}</span>
            <button type="button" className="topic-chip" disabled={busy} onClick={() => { setProvider(id); setFilter(id); setTab('keys'); }}>Kelola koneksi <ArrowRight size={14}/></button>
          </article>;
        })}</div>
        <div className="connection-summary"><KeyRound size={19}/><div><strong>{unlocked ? (hasStoredClientKeys() ? `${rows.filter(row => row.enabled).length} key tersimpan di perangkat ini` : `${rows.filter(row => row.enabled).length} key aktif untuk sesi ini`) : saved ? 'Koleksi tersimpan · terkunci' : 'Mulai dengan menambahkan API key'}</strong><p>{unlocked ? `${providerName(settings.preferredProvider ?? 'gemini')} · ${settings.preferredModel}${remoteActive ? ' · tersimpan di server' : hasStoredClientKeys() ? ' · tersimpan di perangkat (tahan refresh)' : dirty ? ' · perubahan belum disimpan' : ' · sesi browser'}` : 'API key adalah kode akses dari penyedia AI. Anda dapat memakai key milik sendiri.'}</p></div></div>
        <div className="key-actions"><button type="button" className="connection-primary" onClick={() => setTab(saved && !unlocked ? 'storage' : 'keys')}>{saved && !unlocked ? 'Buka koleksi tersimpan' : 'Tambahkan API key'}</button><button type="button" className="topic-chip" onClick={() => setTab('storage')}>Atur penyimpanan</button></div>
      </section>
      <fieldset disabled={busy} className="key-controls">
        <section hidden={tab !== 'keys'}>
          <div className="connection-section-heading"><div><h3>API Key</h3><p>Tambahkan koneksi pribadi. Nilai key disembunyikan secara bawaan.</p></div><span className="connection-badge">{rows.length}/100 key</span></div>
          {!unlocked && (saved || mode === 'server') ? <div className="connection-empty"><KeyRound size={28}/><h4>Buka penyimpanan terlebih dahulu</h4><p>{mode === 'server' ? 'Masuk ke server untuk melihat dan menambahkan koneksi.' : 'Buka koleksi tersimpan dengan kata sandi Anda.'}</p><button type="button" className="connection-primary" onClick={() => setTab('storage')}>Buka Penyimpanan</button></div> : <div className="connection-add">
            <p className="connection-step">1. PILIH PENYEDIA</p>
            <div className="key-tabs">{(['gemini','groq'] as const).map(id => <button type="button" key={id} className="topic-chip" aria-pressed={provider === id} disabled={Boolean(edit)} onClick={() => setProvider(id)}>{providerName(id)}</button>)}</div>
            <div className="connection-field-heading"><label htmlFor="personal-api-key" className="field-label">2. {edit ? 'Key pengganti (opsional)' : 'Tempel API key'}</label><a href={provider === 'groq' ? 'https://console.groq.com/keys' : 'https://aistudio.google.com/apikey'} target="_blank" rel="noopener noreferrer">Dapatkan key {provider === 'groq' ? 'Groq' : 'Gemini'} ↗</a></div>
            <div className="flex gap-2"><textarea id="personal-api-key" className={'field-input flex-1 min-w-0 ' + (show ? '' : 'key-secret-input')} rows={2} value={draft} onChange={e => setDraft(e.target.value)} maxLength={advanced ? 110_000 : 1024} autoComplete="off" spellCheck={false} placeholder={edit ? 'Kosongkan untuk mempertahankan key saat ini' : 'Tempel kode akses dari konsol penyedia'}/><button type="button" className="icon-button" aria-label={show ? 'Sembunyikan API key' : 'Tampilkan API key'} aria-pressed={show} onClick={() => setShow(!show)}>{show ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div>
            <label htmlFor="key-name" className="field-label">3. Nama koneksi <span className="optional-badge">Opsional</span></label><input id="key-name" className="field-input" value={name} onChange={e => setName(e.target.value)} maxLength={70} placeholder="Contoh: Koneksi utama / Cadangan"/>
            <details open={advanced} onToggle={event => setAdvanced(event.currentTarget.open)} className="connection-advanced"><summary>Pengaturan lanjutan</summary><div className="key-form-grid"><div><label htmlFor="key-project" className="field-label">{provider === 'groq' ? 'ID organisasi Groq' : 'ID proyek Google'} · opsional</label><input id="key-project" className="field-input" value={project} onChange={e => setProject(e.target.value)} maxLength={100}/></div><div><label htmlFor="key-priority" className="field-label">Urutan penggunaan</label><input id="key-priority" className="field-input" type="number" min={1} max={100} value={priority} onChange={e => setPriority(e.target.value)}/></div></div><p className="field-help">Urutan 1 didahulukan. Key dalam {provider === 'groq' ? 'organisasi' : 'proyek'} yang sama berbagi kuota. ID diisi manual. Key tanpa ID dikelompokkan bersama untuk penyedia ini. Untuk menambah massal, tempel satu key per baris.</p></details>
            {draftTest && <p className="field-help" role="status">{draftTest}</p>}
            <div className="key-actions">{!remoteActive && <button type="button" className="topic-chip" disabled={!draft.trim()} onClick={() => void testDraft()}>4. Uji koneksi</button>}<button type="button" className="connection-primary" disabled={!edit && !draft.trim()} onClick={() => void add()}>{edit ? 'Terapkan perubahan' : remoteActive ? 'Tambahkan & simpan di server' : 'Simpan di perangkat ini'}</button>{edit && <button type="button" className="topic-chip" onClick={() => { setEdit(null); setDraft(''); setName(''); setProject(''); }}>Batal edit</button>}</div>
            <p className="field-help">{remoteActive ? 'Setelah ditambahkan, gunakan Uji koneksi pada daftar untuk memeriksa key melalui server.' : 'Key tersimpan di perangkat Anda dan otomatis aktif kembali saat halaman direfresh atau browser dibuka kembali.'}</p>
          </div>}
          {unlocked && <><div className="connection-list-heading"><h4>Koneksi Anda</h4><select aria-label="Filter penyedia" className="field-input" value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="all">Semua penyedia</option><option value="gemini">Gemini</option><option value="groq">Groq</option></select></div>
            <div className="key-list" aria-label="Daftar API key">{rows.filter(row => filter === 'all' || row.provider === filter).map(row => <article className="key-card" key={row.id}>
              <div className="key-card-heading"><span className="connection-badge">{providerName(row.provider ?? 'gemini')}</span><strong>{row.name}</strong><span>{row.masked}</span><span className={'key-state state-' + row.health.state}>{!row.enabled ? 'Nonaktif' : statuses[row.health.state]}{row.health.until && row.health.until > now ? ` · ${Math.ceil((row.health.until-now)/1000)} dtk` : ''}</span></div>
              <p className="field-help">Urutan {row.priority}{row.project ? ` · Kelompok ${row.project}` : ''}{row.health.lastSuccess ? ' · Diuji ' + new Date(row.health.lastSuccess).toLocaleString('id-ID') : ''}</p>{row.health.reason && <p className="field-help">{row.health.reason}</p>}
              <div className="key-actions"><button type="button" className="topic-chip" onClick={() => { setProvider(row.provider ?? 'gemini'); setEdit(row.id); setName(row.name); setProject(row.project); setPriority(String(row.priority)); setDraft(''); setShow(false); }}>Edit / ganti</button><button type="button" className="topic-chip" onClick={() => void test(row)}>Uji koneksi</button><button type="button" className="topic-chip" onClick={() => void toggle(row)}>{row.enabled ? 'Nonaktifkan' : 'Aktifkan'}</button><button type="button" className="topic-chip" onClick={() => setConfirm(row.id)}>Hapus</button></div>
              <details className="connection-advanced"><summary>Uji model & perbaikan status</summary><p className="field-help">Uji model membuat satu soal dan menggunakan kuota. Model: {settings.preferredProvider === row.provider ? settings.preferredModel : defaultProviderModel(row.provider ?? 'gemini')}.</p><div className="key-actions"><button type="button" className="topic-chip" onClick={() => void testGeneration(row)}>Uji pembuatan satu soal</button><button type="button" className="topic-chip" onClick={() => void run(async () => { if (remoteActive) await mutate('reset',{ id: row.id }); else { pool!.reset(row.id); refreshKeyStatus(); } setMessage('Status direset. Uji koneksi kembali.'); })}>Reset status</button></div></details>
            </article>)}{!rows.some(row => filter === 'all' || row.provider === filter) && <p className="connection-empty">Belum ada koneksi untuk pilihan ini.</p>}</div>
          </>}
        </section>
        <section hidden={tab !== 'models'}>
          <div className="connection-section-heading"><div><h3>Model & Cadangan</h3><p>Pilih koneksi utama dan cara aplikasi menangani layanan yang tidak tersedia.</p></div></div>
          {!unlocked ? <div className="connection-empty"><p>Tambahkan key atau buka penyimpanan untuk mengatur model.</p><button type="button" className="connection-primary" onClick={() => setTab('keys')}>Kelola API Key</button></div> : <>
            <label htmlFor="preferred-provider" className="field-label">Penyedia utama</label><select id="preferred-provider" className="field-input" value={settings.preferredProvider} onChange={e => { const value = e.target.value as AIProvider; void changeSettings({ ...settings, preferredProvider: value, preferredModel: defaultProviderModel(value) }); }}><option value="gemini">Google Gemini</option><option value="groq">Groq</option></select>
            <label htmlFor="preferred-model" className="field-label">Model utama</label><select id="preferred-model" className="field-input" value={settings.preferredModel} onChange={e => void changeSettings({ ...settings, preferredModel: e.target.value })}>{[...new Set([settings.preferredModel!,...modelOptions(settings.preferredProvider ?? 'gemini')])].map(id => <option key={id} value={id}>{AI_MODELS.find(model => model.id === id)?.name ?? id}</option>)}</select>
            <details className="connection-advanced"><summary>Gunakan ID model kustom</summary><p className="field-help">Pakai ID persis dari konsol penyedia. Uji koneksi memperbarui daftar model. Model kustom memakai JSON standar; pencarian web tidak diaktifkan otomatis.</p><label htmlFor="custom-model" className="field-label">ID model</label><input id="custom-model" className="field-input" value={modelDraft} maxLength={120} onChange={e => setModelDraft(e.target.value)}/><div className="key-actions"><button type="button" className="topic-chip" disabled={!modelDraft.trim() || modelDraft.trim() === settings.preferredModel} onClick={() => void changeSettings({ ...settings, preferredModel: modelDraft.trim() })}>Terapkan ID model</button><button type="button" className="topic-chip" onClick={() => setModelDraft(settings.preferredModel ?? '')}>Reset isian</button></div></details>
            <div className="connection-setting"><label className="key-checkbox"><input type="checkbox" checked={settings.allowKeyFallback ?? true} onChange={e => void changeSettings({ ...settings, allowKeyFallback: e.target.checked })}/><span><strong>Gunakan key cadangan</strong><small>Coba key lain dari penyedia yang sama jika key utama bermasalah.</small></span></label></div>
            <label htmlFor="key-strategy" className="field-label">Urutan penggunaan key</label><select id="key-strategy" className="field-input" value={settings.mode} onChange={e => void changeSettings({ ...settings, mode: e.target.value as PoolSettings['mode'] })}><option value="priority">Utama lalu cadangan</option><option value="balanced">Bagi penggunaan secara seimbang</option></select>
            <div className="connection-setting"><label className="key-checkbox"><input type="checkbox" checked={settings.allowModelFallback} onChange={e => void changeSettings({ ...settings, allowModelFallback: e.target.checked })}/><span><strong>Izinkan model cadangan</strong><small>Gunakan model lain pada penyedia yang sama. Gemma tetap memakai Gemma.</small></span></label></div>
            {settings.allowModelFallback && (['gemini','groq'] as const).map(id => <div key={id}><label htmlFor={'model-fallback-' + id} className="field-label">Model cadangan {providerName(id)}</label><select id={'model-fallback-' + id} className="field-input" value={settings.modelFallbacks?.[id]} onChange={e => void changeSettings({ ...settings, modelFallbacks: { ...settings.modelFallbacks, [id]: e.target.value } })}>{[...new Set([settings.modelFallbacks?.[id]!,...modelOptions(id)])].filter(Boolean).map(model => <option key={model} value={model}>{model}</option>)}</select></div>)}
            <div className="connection-setting"><label className="key-checkbox"><input type="checkbox" checked={settings.allowProviderFallback ?? false} onChange={e => void changeSettings({ ...settings, allowProviderFallback: e.target.checked })}/><span><strong>Izinkan penyedia cadangan</strong><small>Jika diaktifkan, materi kuis dapat dikirim ke penyedia cadangan. Perpindahan akan diberitahukan.</small></span></label></div>
            {settings.allowProviderFallback && <><label htmlFor="fallback-provider" className="field-label">Penyedia cadangan</label><select id="fallback-provider" className="field-input" value={settings.fallbackProvider} onChange={e => { const id = e.target.value as AIProvider; void changeSettings({ ...settings, fallbackProvider: id, fallbackModel: defaultProviderModel(id) }); }}><option value="gemini">Google Gemini</option><option value="groq">Groq</option></select><label htmlFor="fallback-model" className="field-label">Model penyedia cadangan</label><select id="fallback-model" className="field-input" value={settings.fallbackModel} onChange={e => void changeSettings({ ...settings, fallbackModel: e.target.value })}>{[...new Set([settings.fallbackModel!,...modelOptions(settings.fallbackProvider ?? 'groq')])].map(model => <option key={model} value={model}>{model}</option>)}</select>{!rows.some(row => row.provider === settings.fallbackProvider && row.enabled) && <p className="field-help">Tambahkan key aktif untuk penyedia cadangan ini.</p>}</>}
            <div className="connection-setting"><label className="key-checkbox"><input type="checkbox" checked={settings.allowGroundingFallback} onChange={e => void changeSettings({ ...settings, allowGroundingFallback: e.target.checked })}/><span><strong>Izinkan melanjutkan tanpa referensi web</strong><small>Digunakan jika pencarian gagal atau model cadangan tidak mendukungnya.</small></span></label></div>
          </>}
        </section>
        <section hidden={tab !== 'storage'}>
          <div className="connection-section-heading"><div><h3>Penyimpanan & Keamanan</h3><p>{remoteActive ? 'Perubahan otomatis tersimpan terenkripsi di server.' : hasStoredClientKeys() ? 'API key tersimpan di browser ini (localStorage). Tidak perlu mengisi ulang saat refresh atau membuka ulang.' : dirty ? 'Ada perubahan yang belum disimpan.' : saved ? 'Koleksi terenkripsi tersimpan di browser ini.' : 'Simpan key di perangkat ini agar tidak perlu diisi ulang saat refresh.'}</p></div><ShieldCheck size={23}/></div>
          <label className="field-label">Lokasi penyimpanan</label><div className="key-tabs"><button type="button" className="topic-chip" aria-pressed={mode === 'local'} disabled={unlocked} onClick={() => setMode('local')}>Perangkat ini</button><button type="button" className="topic-chip" aria-pressed={mode === 'server'} disabled={unlocked || !available} onClick={() => setMode('server')}>Server · lintas perangkat</button></div>
          <p className="field-help">{available ? 'Server tersedia untuk penggunaan lintas perangkat. Kunci sesi aktif sebelum berpindah lokasi.' : 'Penyimpanan server memerlukan backend Node dengan login dan disk persisten. Penyimpanan perangkat ini tersedia.'}</p>
          {mode === 'server' && !remoteActive && <><label className="field-label" htmlFor="vault-user">Nama pengguna</label><input id="vault-user" className="field-input" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} maxLength={80}/><label className="field-label" htmlFor="server-password">Kata sandi akun server</label><input id="server-password" type="password" className="field-input" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} maxLength={1024}/><button type="button" className="connection-primary" disabled={!password} onClick={() => void run(async () => { updateRemote(await cloudApi('login',{ username,password })); setMessage('Penyimpanan server terbuka.'); setTab('keys'); })}>Masuk ke server</button></>}
          {mode === 'local' && saved && !pool && <><label className="field-label" htmlFor="unlock-password">Kata sandi koleksi</label><input id="unlock-password" type="password" className="field-input" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} maxLength={1024}/><button type="button" className="connection-primary" disabled={!password} onClick={() => void run(async () => { activateCollection(await openVault(password)); onApiKeyChange('__pool__'); setDirty(false); setMessage('Koleksi terbuka. Key lama dikenali sebagai Gemini. Simpan untuk memperbarui format.'); setTab('keys'); })}>Buka koleksi</button></>}
          {mode === 'local' && unlocked && <div className="connection-save"><h4>{saved ? 'Simpan perubahan' : 'Simpan koleksi pertama Anda'}</h4><p className="field-help">Gunakan kata sandi minimal 12 karakter. Untuk mengganti kata sandi, simpan kembali dengan kata sandi baru. Kata sandi tidak disimpan dan tidak dapat dipulihkan.</p><label htmlFor="vault-password" className="field-label">Kata sandi penyimpanan</label><input id="vault-password" className="field-input" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} maxLength={1024}/><label htmlFor="vault-confirmation" className="field-label">Ulangi kata sandi</label><input id="vault-confirmation" className="field-input" type="password" autoComplete="new-password" value={confirmation} onChange={e => setPassword(e.target.value)} maxLength={1024}/><button type="button" className="connection-primary" disabled={password.length < 12 || password !== confirmation} onClick={() => void run(async () => { await storeVault(pool!.collection,password); setSaved(true); setDirty(false); setMessage('Koleksi tersimpan terenkripsi.'); })}>Simpan terenkripsi</button></div>}
          {unlocked && <div className="key-actions"><button type="button" className="topic-chip" onClick={() => dirty ? setConfirm('lock') : void lock()}>Kunci sesi</button>{remoteActive && <button type="button" className="topic-chip" onClick={() => void run(async () => { updateRemote(await cloudApi('session')); setMessage('Daftar terbaru dimuat.'); })}>Muat ulang daftar</button>}</div>}
          <details className="key-backup"><summary>Cadangan terenkripsi · ekspor / impor</summary><p className="field-help">Ekspor menyimpan seluruh koleksi Gemini dan Groq. Impor menambahkan key tanpa menimpa koleksi lama. Simpan kata sandi cadangan secara terpisah.</p><label className="field-label" htmlFor="backup-password">Kata sandi cadangan · minimal 12 karakter</label><input id="backup-password" className="field-input" type="password" autoComplete="off" maxLength={1024} value={backupPassword} onChange={e => setBackupPassword(e.target.value)}/>{unlocked && <><label className="field-label" htmlFor="backup-confirmation">Ulangi kata sandi untuk ekspor</label><input id="backup-confirmation" className="field-input" type="password" autoComplete="off" maxLength={1024} value={backupConfirmation} onChange={e => setBackupConfirmation(e.target.value)}/></>}<button type="button" className="topic-chip" disabled={!unlocked || backupPassword.length < 12 || backupPassword !== backupConfirmation} onClick={() => void run(async () => { const raw = remoteActive ? (await cloudApi('export',{ password: backupPassword })).backup : await encryptCollection(pool!.collection,backupPassword); download(raw); setMessage('Cadangan terenkripsi diunduh.'); })}>Ekspor cadangan</button><label className="field-label" htmlFor="backup-file">File cadangan untuk diimpor</label><input id="backup-file" className="field-input" type="file" accept=".json,application/json" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void run(async () => { if (file.size > 200_000) throw new Error('Cadangan maksimal 200 KB.'); setBackup(await file.text()); setMessage('Cadangan siap dibuka. Masukkan kata sandi cadangan.'); }); }}/><button type="button" className="topic-chip" disabled={!backup || backupPassword.length < 12 || (!unlocked && (mode === 'server' || saved))} onClick={() => void run(async () => { if (remoteActive) await mutate('import',{ backup,password: backupPassword }); else { const imported = await decryptCollection(backup,backupPassword); activate({ keys: [...(pool?.collection.keys || []), ...imported.keys], settings: pool?.collection.settings || imported.settings }); } setBackup(''); setMessage(remoteActive ? 'Cadangan ditambahkan dan tersimpan di server.' : 'Cadangan dibuka untuk sesi. Simpan koleksi untuk mempertahankan perubahan.'); })}>Impor cadangan</button></details>
          {(unlocked || (mode === 'local' && saved)) && <details className="connection-advanced"><summary>Hapus penyimpanan</summary><p className="field-help">Penghapusan di aplikasi tidak mencabut key di penyedia. Simpan cadangan jika masih diperlukan.</p><button type="button" className="topic-chip connection-danger" onClick={() => setConfirm('all')}>Hapus seluruh koleksi di lokasi ini</button></details>}
          <p className="field-help">API key tersimpan di browser ini (localStorage) agar tetap tersedia saat halaman direfresh atau ditutup. Anda dapat menghapus data ini kapan saja.</p>
        </section>
        {confirm && <div className="key-confirm" role="group" aria-label="Konfirmasi tindakan"><p>{confirm === 'lock' ? 'Perubahan sesi belum disimpan. Mengunci sekarang akan menghapus perubahan tersebut dari memori.' : confirm === 'all' ? 'Hapus seluruh koleksi dan salinan tersimpan di lokasi ini?' : 'Hapus key ini? Perubahan browser perlu disimpan kembali.'}</p><button type="button" className="topic-chip connection-danger" onClick={() => { if (confirm === 'lock') { setConfirm(null); void lock(); } else void remove(); }}>{confirm === 'lock' ? 'Kunci tanpa menyimpan' : 'Ya, hapus'}</button><button type="button" className="topic-chip" onClick={() => setConfirm(null)}>Batal</button></div>}
      </fieldset>
      <div className="connection-session-status" role="status"><span className={'status-dot ' + (unlocked ? '' : 'inactive')}/>{busy ? 'Memproses…' : remoteActive ? 'Tersimpan terenkripsi di server' : hasStoredClientKeys() ? 'Tersimpan di perangkat ini · siap digunakan' : dirty ? 'Aktif untuk sesi ini · perubahan belum disimpan' : saved ? unlocked ? 'Tersimpan terenkripsi · sesi terbuka' : 'Tersimpan terenkripsi · terkunci' : 'Belum ada koleksi tersimpan'}</div>
    </div>
  </div>;
}
