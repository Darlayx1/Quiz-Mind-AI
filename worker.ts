import { evaluateQuiz } from './src/server/evaluationService.js';
import assets from './.worker-assets.json';
import { generateQuiz } from './src/server/aiService.js';
import { KeyPool, defaultSettings } from './src/keyPool.js';
import { maskSecret } from './src/server/cryptoVault.js';
import { AI_MODELS, DEFAULT_MODEL } from './src/models.js';
import { normalizeQuizConfig, QuizConfigError } from './src/quizConfig.js';

type Environment = { GEMINI_API_KEY?: string; GROQ_API_KEY?: string; ENCRYPTION_SECRET?: string };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

export default {
  async fetch(request: Request, env: Environment) {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/keys/capabilities') return json({ configured: false, storage: 'browser-vault', maxKeys: 100 });
    if (pathname === '/api/health' && request.method === 'GET') {
      const providers = (['gemini','groq'] as const).filter(provider => { const key = provider === 'groq' ? env.GROQ_API_KEY : env.GEMINI_API_KEY; return key && !key.startsWith('MY_'); });
      const hasApiKey = providers.length > 0;
      return json({
        status: 'ok',
        version: '1.0.0',
        model: DEFAULT_MODEL,
        models: AI_MODELS.map(model => model.id),
        features: { deepThinking: true, googleSearchGrounding: true, serverSideProxy: true, aes256GcmVault: true },
        security: { hasApiKey, providers, maskedKey: hasApiKey ? 'Key server tersedia' : 'Belum dikonfigurasi di server', gitProtected: true },
        timestamp: new Date().toISOString()
      });
    }
    if (pathname.startsWith('/api/')) {
      if (request.method !== 'POST' || !['/api/generate-quiz','/api/evaluate-quiz'].includes(pathname)) {
        return json({ success: false, error: 'Endpoint API tidak ditemukan.' }, 404);
      }
      const declaredSize = Number(request.headers.get('content-length') || 0);
      if (declaredSize > 15 * 1024 * 1024) return json({ success: false, error: 'Materi terlalu besar.' }, 413);
      let body;
      try {
        const text = await request.text();
        if (new TextEncoder().encode(text).length > 15 * 1024 * 1024) return json({ success: false, error: 'Materi terlalu besar.' }, 413);
        body = JSON.parse(text);
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
      } catch {
        return json({ success: false, error: 'Isi permintaan harus berupa JSON yang valid.' }, 400);
      }
      try {
        if(pathname==='/api/evaluate-quiz'){
          const keys=(['gemini','groq'] as const).flatMap(provider=>{const key=provider==='groq'?env.GROQ_API_KEY:env.GEMINI_API_KEY;return key&&!key.startsWith('MY_')?[{id:'worker-'+provider,provider,name:'Key hosting',key,project:'',priority:1,enabled:true}]:[];});
          const pool=new KeyPool({keys,settings:{...defaultSettings}});
          try{return json({success:true,evaluations:await evaluateQuiz(body,{pool,signal:AbortSignal.any([request.signal,AbortSignal.timeout(120000)])})});}finally{pool.lock();}
        }
        if (pathname === '/api/generate-quiz') {
          const config = normalizeQuizConfig(body);
          const key = config.provider === 'groq' ? env.GROQ_API_KEY : env.GEMINI_API_KEY;
          if (!key || key.startsWith('MY_')) {
            return json({ success: false, error: 'API key penyedia pilihan belum dikonfigurasi. Tambahkan key di Koneksi AI atau pengaturan hosting.' }, 503);
          }
          const pool = new KeyPool({ keys: [{ id: 'worker-key', provider: config.provider, name: 'Key server', key, project: '', priority: 1, enabled: true }], settings: { ...defaultSettings } });
          let quiz;
          try { quiz = await generateQuiz(config, undefined, { pool, signal: request.signal }); } finally { pool.lock(); }
          return json({
            success: true,
            quiz,
          });
        }
      } catch (error: any) {
        if (error instanceof QuizConfigError) return json({ success: false, error: error.message }, 400);
        if (pathname.endsWith('/decrypt')) return json({ success: false, error: 'Dekripsi gagal atau kunci salah.' }, 400);
        const status = typeof error?.status === 'number' && error.status >= 400 && error.status < 600 ? error.status : 500;
        const message = error?.code ? String(error.message).replace(/AIza[\w-]+|gsk_[\w-]+/g,'[key disamarkan]') : 'Layanan AI belum berhasil membuat kuis. Periksa koneksi dan konfigurasi.';
        return json({ success: false, error: message }, status);
      }
    }
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
    const files = assets as Record<string, string>;
    const key = pathname === '/' ? '/index.html' : pathname;
    const content = files[key] ?? (pathname.startsWith('/assets/') ? undefined : files['/index.html']);
    if (content === undefined) return new Response('Not found', { status: 404 });
    const mime = key.endsWith('.js') ? 'text/javascript' : key.endsWith('.css') ? 'text/css' : 'text/html';
    return new Response(request.method === 'HEAD' ? null : content, {
      headers: {
        'content-type': mime + '; charset=utf-8',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'referrer-policy': 'no-referrer',
        'cache-control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
      }
    });
  },
};
