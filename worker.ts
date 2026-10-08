import assets from './.worker-assets.json';
import { generateQuizWithGemini } from './src/server/geminiService.js';
import { encryptData, decryptData, maskSecret } from './src/server/cryptoVault.js';
import { AI_MODELS, DEFAULT_MODEL } from './src/models.js';
import { normalizeQuizConfig, QuizConfigError } from './src/quizConfig.js';

type Environment = { GEMINI_API_KEY?: string; ENCRYPTION_SECRET?: string };
const json = (data: unknown, status = 200) => Response.json(data, { status });

export default {
  async fetch(request: Request, env: Environment) {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/health' && request.method === 'GET') {
      const hasApiKey = Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
      return json({
        status: 'ok',
        version: '1.0.0',
        model: DEFAULT_MODEL,
        models: AI_MODELS.map(model => model.id),
        features: { deepThinking: true, googleSearchGrounding: true, serverSideProxy: true, aes256GcmVault: true },
        security: { hasApiKey, maskedKey: hasApiKey ? maskSecret(env.GEMINI_API_KEY) : 'Belum dikonfigurasi di server', gitProtected: true },
        timestamp: new Date().toISOString()
      });
    }
    if (pathname.startsWith('/api/')) {
      if (request.method !== 'POST' || !['/api/generate-quiz', '/api/vault/encrypt', '/api/vault/decrypt'].includes(pathname)) {
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
        if (pathname === '/api/generate-quiz') {
          const config = normalizeQuizConfig(body);
          if (!env.GEMINI_API_KEY || env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
            return json({ success: false, error: 'GEMINI_API_KEY belum dikonfigurasi di server. Pemilik aplikasi perlu memasangnya pada pengaturan hosting.' }, 503);
          }
          const quiz = await generateQuizWithGemini(config, env.GEMINI_API_KEY);
          return json({
            success: true,
            quiz,
            integrityToken: encryptData(JSON.stringify({ quizId: quiz.id, createdAt: quiz.createdAt }), env.ENCRYPTION_SECRET || env.GEMINI_API_KEY)
          });
        }
        const secret = typeof body.secret === 'string' && body.secret ? body.secret : env.ENCRYPTION_SECRET || env.GEMINI_API_KEY;
        if (pathname.endsWith('/encrypt')) {
          if (typeof body.text !== 'string' || !body.text) return json({ error: 'Field "text" wajib diisi.' }, 400);
          return json({ success: true, encrypted: encryptData(body.text, secret) });
        }
        if (pathname.endsWith('/decrypt')) {
          if (typeof body.encrypted !== 'string' || !body.encrypted) return json({ error: 'Field "encrypted" wajib diisi.' }, 400);
          return json({ success: true, decrypted: decryptData(body.encrypted, secret) });
        }
      } catch (error: any) {
        if (error instanceof QuizConfigError) return json({ success: false, error: error.message }, 400);
        if (pathname.endsWith('/decrypt')) return json({ success: false, error: 'Dekripsi gagal atau kunci salah.' }, 400);
        const status = typeof error?.status === 'number' && error.status >= 400 && error.status < 600 ? error.status : 500;
        const message = error instanceof Error ? error.message : String(error);
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
        'cache-control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
      }
    });
  },
};
