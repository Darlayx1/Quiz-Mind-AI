import assets from './.worker-assets.json';
import { AI_MODELS, DEFAULT_MODEL } from './src/models.js';
import { normalizeQuizConfig, QuizConfigError } from './src/quizConfig.js';

type Environment = { GEMINI_API_KEY?: string };
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
        features: { localWorkspace: true, accountWorkspace: true, serverSideProxy: false },
        security: { hasApiKey: false, gitProtected: true },
        timestamp: new Date().toISOString()
      });
    }
    if (pathname.startsWith('/api/')) {
      if (request.method !== 'POST' || pathname !== '/api/generate-quiz') {
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
          return json({ success: false, error: 'Gunakan Pengaturan AI. Mode lokal memakai key lokal; mode akun memakai layanan Supabase terautentikasi.' }, 503);
        }
      } catch (error: any) {
        if (error instanceof QuizConfigError) return json({ success: false, error: error.message }, 400);
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
