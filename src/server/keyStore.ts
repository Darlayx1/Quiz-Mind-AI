import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { KeyPool, defaultSettings, validateCollection, type KeyCollection, type PoolSettings } from '../keyPool.js';
import { encryptData, decryptData } from './cryptoVault.js';
import { decryptCollection, encryptCollection } from '../multiKeyVault.js';
import { probeKey } from './providerClient.js';
import { generateQuiz } from './aiService.js';
import { defaultProviderModel } from '../models.js';

const ttl = 15 * 60_000;
type Session = { expires: number; csrf: string; controller: AbortController };
export class ServerKeyStore {
  private db?: DatabaseSync;
  private cached?: { revision: number; pool: KeyPool };
  private sessions = new Map<string, Session>();
  private failures = new Map<string, { count: number; until: number }>();
  private generating = new Set<string>();
  private checkingPasswords = 0;
  readonly configured: boolean;
  constructor(private env = process.env) {
    this.configured = Boolean(env.VAULT_PASSWORD_HASH && env.ENCRYPTION_SECRET);
    if (!this.configured) return;
    if (!/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(env.VAULT_PASSWORD_HASH!)) throw new Error('VAULT_PASSWORD_HASH tidak valid. Jalankan npm run vault:password.');
    // Verify configuration before opening a store; never fall back to a public secret.
    encryptData('configuration check', env.ENCRYPTION_SECRET);
    const dir = path.resolve(env.DATA_DIR || '.private-vault');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(dir, 'keys.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS vault (owner TEXT PRIMARY KEY, revision INTEGER NOT NULL, ciphertext TEXT NOT NULL)');
    try { chmodSync(path.join(dir, 'keys.sqlite'), 0o600); } catch { /* Windows ACLs are controlled by the host. */ }
  }
  private owner() { return this.env.VAULT_USERNAME || 'owner'; }
  private read() {
    const row = this.db!.prepare('SELECT revision,ciphertext FROM vault WHERE owner=?').get(this.owner()) as { revision: number; ciphertext: string } | undefined;
    return { revision: row?.revision || 0, collection: row ? validateCollection(JSON.parse(decryptData(row.ciphertext, this.env.ENCRYPTION_SECRET))) : { keys: [], settings: { ...defaultSettings } } as KeyCollection };
  }
  pool() {
    const row = this.db!.prepare('SELECT revision FROM vault WHERE owner=?').get(this.owner()) as { revision: number } | undefined;
    if (this.cached?.revision === (row?.revision || 0)) return this.cached.pool;
    const data = this.read();
    if (!this.cached || this.cached.revision !== data.revision) {
      this.cached?.pool.lock();
      this.cached = { revision: data.revision, pool: new KeyPool(data.collection) };
    }
    return this.cached.pool;
  }
  private write(collection: KeyCollection, revision: unknown) {
    if (!Number.isInteger(revision) || Number(revision) < 0) throw Object.assign(new Error('Versi vault wajib disertakan.'), { status: 400 });
    const validated = validateCollection(collection), ciphertext = encryptData(JSON.stringify(validated), this.env.ENCRYPTION_SECRET);
    this.db!.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db!.prepare('SELECT revision FROM vault WHERE owner=?').get(this.owner()) as { revision: number } | undefined;
      if ((row?.revision || 0) !== revision) throw Object.assign(new Error('Vault berubah pada perangkat lain. Muat ulang daftar sebelum menyimpan.'), { status: 409 });
      this.db!.prepare('INSERT INTO vault VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET revision=excluded.revision,ciphertext=excluded.ciphertext').run(this.owner(), Number(revision) + 1, ciphertext);
      this.db!.exec('COMMIT');
    } catch (error) { this.db!.exec('ROLLBACK'); throw error; }
    if (this.cached) { this.cached.pool.update(validated); this.cached.revision = Number(revision) + 1; }
  }
  metadata() {
    const { revision, collection } = this.read(), pool = this.pool();
    return { revision, settings: collection.settings, monitoring: pool.monitoring(), keys: collection.keys.map(({ key, ...entry }) => ({ ...entry, masked: '••••' + key.slice(-4), health: pool.status(entry.id) })) };
  }
  private cleanup() {
    const now = Date.now();
    for (const [id,s] of this.sessions) if (s.expires <= now) { s.controller.abort(); this.sessions.delete(id); }
    for (const [ip,f] of this.failures) if (f.until <= now) this.failures.delete(ip);
  }
  session(req: Request) {
    this.cleanup();
    const token = /(?:^|;\s*)quizmind_vault=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    return token ? this.sessions.get(token) : undefined;
  }
  authorize(req: Request, res: Response, mutate = false) {
    const session = this.session(req);
    if (!session) { res.status(401).json({ error: 'Masuk ke vault server untuk melanjutkan.' }); return; }
    if (mutate && req.headers['x-vault-csrf'] !== session.csrf) { res.status(403).json({ error: 'Sesi keamanan berubah. Masuk kembali.' }); return; }
    session.expires = Date.now() + ttl;
    const token = /quizmind_vault=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];
    if (token) res.cookie('quizmind_vault', token, { httpOnly: true, secure: this.env.NODE_ENV === 'production', sameSite: this.env.NODE_ENV === 'production' && this.env.CORS_ORIGIN ? 'none' : 'strict', path: '/api', maxAge: ttl });
    return session;
  }
  async generation<T>(req: Request, res: Response, fn: (pool: KeyPool, signal: AbortSignal) => Promise<T>) {
    const session = this.authorize(req, res, true); if (!session) return;
    const fingerprint = createHash('sha256').update(req.path+JSON.stringify(req.body)).digest('hex');
    if (this.generating.has(fingerprint) || this.generating.size >= 3) { res.status(409).json({ error: 'Permintaan yang sama sedang berjalan atau tiga pekerjaan sudah aktif.' }); return; }
    this.generating.add(fingerprint);
    const disconnected = new AbortController();
    const onClose = () => { if (!res.writableEnded) disconnected.abort(); };
    res.on('close', onClose);
    const signal = AbortSignal.any([disconnected.signal, session.controller.signal, AbortSignal.timeout(Math.max(1, session.expires - Date.now()))]);
    try { return await fn(this.pool(), signal); }
    finally { this.generating.delete(fingerprint); res.off('close', onClose); }
  }
  install(app: Express) {
    app.use('/api/keys', (req,res,next) => {
      res.setHeader('Cache-Control','no-store');
      if (req.path === '/capabilities') return next();
      if (!this.configured) return res.status(503).json({ error: 'Vault server belum dikonfigurasi. Pasang login, secret enkripsi, dan penyimpanan persisten di server.' });
      const origin = req.headers.origin;
      const sameOrigin = `${req.secure ? 'https' : 'http'}://${req.headers.host}`;
      if (origin && origin !== (this.env.CORS_ORIGIN || sameOrigin)) return res.status(403).json({ error: 'Origin tidak diizinkan.' });
      next();
    });
    app.get('/api/keys/capabilities', (_req,res) => res.json({ configured: this.configured, storage: 'encrypted-sqlite', maxKeys: 100 }));
    app.post('/api/keys/login', async (req,res) => {
      try {
      this.cleanup();
      const ip = req.ip || 'unknown', previous = this.failures.get(ip);
      if ((previous?.count || 0) >= 5) return res.status(429).json({ error: 'Terlalu banyak percobaan login. Tunggu 15 menit.' });
      if (this.failures.size >= 10_000 || this.sessions.size >= 100) return res.status(429).json({ error: 'Server sedang sibuk. Coba setelah jeda.' });
      if (this.checkingPasswords >= 4) return res.status(429).json({ error: 'Server sedang memeriksa login lain. Coba setelah jeda.' });
      this.failures.set(ip, { count: (previous?.count || 0) + 1, until: previous?.until || Date.now() + ttl });
      const password = req.body?.password;
      if (typeof password !== 'string' || password.length > 1024) return res.status(401).json({ error: 'Nama pengguna atau kata sandi salah.' });
      const [,salt,expected] = this.env.VAULT_PASSWORD_HASH!.split('$');
      this.checkingPasswords++;
      let derived: Buffer;
      try { derived = await new Promise<Buffer>((resolve,reject) => scrypt(password, Buffer.from(salt,'hex'), 64, (err,key) => err ? reject(err) : resolve(key))); }
      finally { this.checkingPasswords--; }
      if (!timingSafeEqual(derived, Buffer.from(expected,'hex')) || req.body.username !== this.owner()) return res.status(401).json({ error: 'Nama pengguna atau kata sandi salah.' });
      this.failures.delete(ip);
      const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
      const oldToken = /quizmind_vault=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];
      if (oldToken) { this.sessions.get(oldToken)?.controller.abort(); this.sessions.delete(oldToken); }
      this.sessions.set(token, { csrf, expires: Date.now() + ttl, controller: new AbortController() });
      res.cookie('quizmind_vault', token, { httpOnly: true, secure: this.env.NODE_ENV === 'production', sameSite: this.env.NODE_ENV === 'production' && this.env.CORS_ORIGIN ? 'none' : 'strict', path: '/api', maxAge: ttl });
      return res.json({ csrf, ...this.metadata() });
      } catch { return res.status(503).json({ error: 'Vault server tidak dapat dibuka. Periksa konfigurasi dan penyimpanan.' }); }
    });
    app.get('/api/keys/session', (req,res) => { const session = this.authorize(req,res); if (session) res.json({ csrf: session.csrf, ...this.metadata() }); });
    app.post('/api/keys/logout', (req,res) => {
      const session = this.authorize(req,res,true); if (!session) return;
      const token = /quizmind_vault=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];
      session.controller.abort(); if (token) this.sessions.delete(token);
      res.clearCookie('quizmind_vault', { path: '/api', httpOnly: true, sameSite: 'strict', secure: this.env.NODE_ENV === 'production' });
      res.json({ success: true });
    });
    const mutation = (route: string, fn: (body: any) => void | Promise<void>) => app.post('/api/keys/' + route, async (req,res) => {
      if (!this.authorize(req,res,true)) return;
      if (this.generating.size) return res.status(409).json({ error: 'Tunggu atau batalkan pembuatan kuis sebelum mengubah vault.' });
      try { await fn(req.body); res.json(this.metadata()); }
      catch (error: any) { res.status(error.status || 400).json({ error: error.status === 409 ? error.message : 'Perubahan tidak dapat disimpan. Periksa data, kata sandi cadangan, dan izin penyimpanan.' }); }
    });
    mutation('add', body => {
      const data = this.read();
      if (!Array.isArray(body.keys)) throw new Error();
      const provider = body.keys[0]?.provider ?? 'gemini';
      this.write({ ...data.collection, keys: [...data.collection.keys, ...body.keys], settings: data.collection.keys.length ? data.collection.settings : { ...data.collection.settings, preferredProvider: 'gemini', preferredModel: defaultProviderModel('gemini'), fallbackProvider: 'gemini', fallbackModel: 'gemini-3.5-flash-lite' } }, body.revision);
    });
    mutation('update', body => {
      const data = this.read(), entry = data.collection.keys.find(k => k.id === body.id); if (!entry) throw new Error();
      const patch = body.patch;
      if (!patch || Object.keys(patch).some(k => !['name','project','priority','enabled','key','provider'].includes(k))) throw new Error();
      if (patch.provider && patch.provider !== entry.provider && !patch.key) throw new Error();
      this.write({ ...data.collection, keys: data.collection.keys.map(k => k.id === body.id ? { ...k, ...patch, id: k.id } : k) }, body.revision);
    });
    mutation('remove', body => { const data = this.read(); this.write({ ...data.collection, keys: data.collection.keys.filter(k => k.id !== body.id) }, body.revision); });
    mutation('settings', body => { const data = this.read(); this.write({ ...data.collection, settings: body.settings as PoolSettings }, body.revision); });
    mutation('import', async body => {
      const imported = await decryptCollection(body.backup, body.password), data = this.read();
      // Merge without replacing existing credentials; duplicates are rejected atomically.
      this.write({ ...data.collection, keys: [...data.collection.keys, ...imported.keys], settings: data.collection.keys.length ? data.collection.settings : imported.settings }, body.revision);
    });
    mutation('clear', body => { this.write({ keys: [], settings: { ...defaultSettings } }, body.revision); });
    mutation('reset', body => { this.pool().reset(body.id); });
    app.post('/api/keys/export', async (req,res) => {
      if (!this.authorize(req,res,true)) return;
      try { res.json({ backup: await encryptCollection(this.read().collection, req.body.password) }); }
      catch { res.status(400).json({ error: 'Gunakan kata sandi cadangan minimal 12 karakter.' }); }
    });
    app.post('/api/keys/test', async (req,res) => {
      if (!this.authorize(req,res,true)) return;
      const entry = this.pool().collection.keys.find(k => k.id === req.body.id);
      if (!entry) return res.status(404).json({ error: 'Key tidak ditemukan.' });
      try {
        // Only list models: no generated tokens. This proves credentials, not access to every generation capability.
        const models = await probeKey(entry);
        this.pool().reset(entry.id);
        this.pool().health.set(entry.id, { state: 'ready', lastSuccess: Date.now(), successes: 0, failures: 0, reason: 'Kredensial diterima untuk daftar model; kuota generasi belum diuji' });
        res.json({ ...this.metadata(), models, testedProvider: entry.provider });
      } catch { res.status(400).json({ error: 'Uji kredensial gagal. Periksa key, pembatasan, dan koneksi. Kuota generasi tidak diuji.' }); }
    });
    app.post('/api/keys/test-generation', async (req,res) => {
      const session = this.authorize(req,res,true); if (!session) return;
      const entry = this.pool().collection.keys.find(key => key.id === req.body.id);
      if (!entry) return res.status(404).json({ error: 'Key tidak ditemukan.' });
      const probe = new KeyPool({ keys: [{ ...entry, enabled: true }], settings: { ...defaultSettings } });
      try {
        const quiz = await generateQuiz({ provider: entry.provider, model: req.body.model ?? defaultProviderModel(entry.provider ?? 'gemini'), topic: 'Penjumlahan dasar', difficulty: 'easy', questionCount: 1, timeLimitMinutes: 0, language: 'id', enableGrounding: false }, undefined, { pool: probe, signal: AbortSignal.any([session.controller.signal,AbortSignal.timeout(300_000)]) });
        if (this.pool().collection.keys.some(key => key.id === entry.id && key.key === entry.key)) {
          this.pool().reset(entry.id); this.pool().health.set(entry.id,{ state: 'ready', lastSuccess: Date.now(), successes: 1, failures: 0, reason: `Pembuatan soal berhasil: ${quiz.model}` });
        }
        res.json({ ...this.metadata(), testedModel: quiz.model, message: 'Satu soal berhasil dibuat. Uji ini menggunakan kuota model.' });
      } catch { res.status(400).json({ error: 'Uji pembuatan soal gagal. Periksa model, izin, kuota, dan koneksi.' }); }
      finally { probe.lock(); }
    });
  }
  close() { this.cached?.pool.lock(); for (const session of this.sessions.values()) session.controller.abort(); this.db?.close(); }
}
