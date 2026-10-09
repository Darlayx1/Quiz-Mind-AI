import { evaluateQuiz } from './src/server/evaluationService.js';
import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateQuiz } from './src/server/aiService.js';
import { KeyPool, defaultSettings } from './src/keyPool.js';
import { maskSecret } from './src/server/cryptoVault.js';
import { ServerKeyStore } from './src/server/keyStore.js';
import { AI_MODELS, DEFAULT_MODEL } from './src/models.js';
import { normalizeQuizConfig, QuizConfigError } from './src/quizConfig.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable('x-powered-by');
app.use((_req,res,next) => { res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('X-Frame-Options','DENY'); res.setHeader('Referrer-Policy','no-referrer'); next(); });
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production' || __dirname.endsWith('dist-server');
if (isProduction) process.env.NODE_ENV = 'production';
const staticDir = path.resolve(__dirname, __dirname.endsWith('dist-server') ? '../dist' : 'dist');

app.use('/api', (req, res, next) => {
  const allowedOrigin = process.env.CORS_ORIGIN;
  const origin = req.headers.origin;
  if (allowedOrigin && origin) {
    if (origin !== allowedOrigin) return res.status(403).json({ success: false, error: 'Origin tidak diizinkan.' });
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Vault-CSRF');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.status(204).end();
  }
  next();
});

app.use(express.json({ limit: '15mb' }));
app.use('/api', (_req,res,next) => { res.setHeader('Cache-Control','no-store'); next(); });
const keyStore = new ServerKeyStore();
keyStore.install(app);
const runtimePool = new KeyPool({ settings: { ...defaultSettings }, keys: (() => {
  const key = process.env.GEMINI_API_KEY;
  return key && !key.startsWith('MY_') ? [{ id: 'runtime-gemini', provider: 'gemini' as const, name: 'Gemini server', project: '', key, enabled: true, priority: 1 }] : [];
})() });

// =========================================================================
// API ROUTES
// =========================================================================

/**
 * Health Check & Status Keamanan API Key
 */
app.get('/api/health', (_req: Request, res: Response) => {
  const providers = !keyStore.configured ? runtimePool.collection.keys.map(key => key.provider!) : [];
  const hasKey = providers.length > 0;
  const masked = providers.length ? 'Key server tersedia · ' + providers.join(', ') : 'Belum tersedia';

  res.json({
    status: 'ok',
    version: '1.0.0',
    model: DEFAULT_MODEL,
    models: AI_MODELS.map(model => model.id),
    features: {
      deepThinking: true,
      googleSearchGrounding: true,
      serverSideProxy: true,
      aes256GcmVault: true,
    },
    security: {
      hasApiKey: hasKey,
      providers,
      maskedKey: keyStore.configured ? 'Masuk ke vault server untuk memakai key' : hasKey ? masked : 'Belum diisi di .env',
      gitProtected: true, // .env terproteksi di .gitignore
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Endpoint Utama: Buat Kuis dengan Gemini atau Gemma 4 31B
 */
app.post('/api/generate-quiz', async (req: Request, res: Response) => {
  const disconnected = new AbortController();
  const onClose = () => { if (!res.writableEnded) disconnected.abort(); };
  res.on('close', onClose);
  const streaming = keyStore.configured && req.headers.accept === 'application/x-ndjson';
  try {
    const config = normalizeQuizConfig(req.body);

    const notices: string[] = [];
    const quiz = keyStore.configured
      ? await keyStore.generation(req, res, (pool, signal) => {
          if (streaming) { res.setHeader('Content-Type','application/x-ndjson'); res.setHeader('X-Accel-Buffering','no'); res.flushHeaders(); }
          return generateQuiz(config, undefined, { pool, signal, onNotice: message => { notices.push(message); if (streaming && !res.destroyed) res.write(JSON.stringify({notice:message}) + '\n'); } });
        })
      : await generateQuiz(config, undefined, { pool: runtimePool, signal: disconnected.signal, onNotice: message => notices.push(message) });
    if (!quiz || res.destroyed) return;
    if (streaming) return res.end(JSON.stringify({success:true,quiz,notices}) + '\n');
    if (res.headersSent) return;

    return res.json({
      success: true,
      quiz,
      notices,
    });
  } catch (error: any) {
    if (res.destroyed) return;
    if (error instanceof QuizConfigError) return res.status(400).json({ success: false, error: error.message });
    const status = typeof error?.status === 'number' && error.status >= 400 && error.status < 600 ? error.status : 500;
    const errorMessage = error?.name === 'AbortError' ? 'Pembuatan kuis dibatalkan.' : error?.name === 'TimeoutError' ? 'Batas waktu pembuatan kuis tercapai.' :
      error?.code ? String(error.message).replace(/AIza[\w-]+|gsk_[\w-]+/g,'[key disamarkan]') : 'Terjadi kesalahan sistem saat menghubungi layanan AI.';
    if (streaming && res.headersSent) return res.end(JSON.stringify({success:false,error:errorMessage,status}) + '\n');
    if (res.headersSent) return;
    return res.status(status).json({
      success: false,
      error: errorMessage,
    });
  } finally { res.off('close', onClose); }
});

app.post('/api/evaluate-quiz',async(req:Request,res:Response)=>{
 const disconnected=new AbortController();const close=()=>{if(!res.writableEnded)disconnected.abort();};res.on('close',close);
 try{
  const evaluations=keyStore.configured?await keyStore.generation(req,res,(pool,signal)=>evaluateQuiz(req.body,{pool,signal})):await evaluateQuiz(req.body,{pool:runtimePool,signal:disconnected.signal});
  if(!evaluations||res.destroyed||res.headersSent)return;res.json({success:true,evaluations});
 }catch(error:any){if(res.destroyed||res.headersSent)return;res.status(error?.status>=400&&error.status<600?error.status:502).json({success:false,error:error?.code?String(error.message).replace(/AIza[\w-]+|gsk_[\w-]+/g,'[key disamarkan]'):'Evaluasi AI belum berhasil. Jawaban tetap tersimpan.',code:error?.code});}
 finally{res.off('close',close);}
});

// Pastikan semua rute /api/* yang tidak cocok selalu mengembalikan format JSON, bukan HTML Vite
app.all('/api/*', (_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Endpoint API tidak ditemukan.' });
});
app.use((error: any, _req: Request, res: Response, _next: express.NextFunction) => {
  res.status(error?.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 503).json({ success: false, error: 'Permintaan tidak dapat diproses. Periksa format, ukuran data, dan konfigurasi server.' });
});

// =========================================================================
// VITE DEV SERVER / STATIC ASSETS HANDLER
// =========================================================================
async function startServer() {
  if (isProduction) {
    app.use(express.static(staticDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[QuizMind AI] Server aktif di http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Gagal memulai server:', err);
  process.exit(1);
});
