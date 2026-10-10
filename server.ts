import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AI_MODELS, DEFAULT_MODEL } from './src/models.js';
import { parallelRelay } from './src/server/parallelSearch.js';

dotenv.config();
const root = path.dirname(fileURLToPath(import.meta.url));
const production = process.env.NODE_ENV === 'production' || root.endsWith('dist-server');
const app = express();
app.get('/api/health', (_req, res) => res.json({ status: 'ok', model: DEFAULT_MODEL,
  models: AI_MODELS.map(model => model.id), features: { localWorkspace: true, accountWorkspace: true } }));
// AI and account writes use workspace adapters, never an anonymous shared server key.
app.post('/api/parallel-search', express.text({ type: 'application/json', limit: '128kb' }), async (req, res) => {
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  const response = await parallelRelay(new Request('http://localhost/api/parallel-search', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: typeof req.body === 'string' ? req.body : '', signal: controller.signal }));
  res.status(response.status).set('Cache-Control', 'no-store').type('json').send(await response.text());
});
app.all('/api/*', (_req, res) => res.status(404).json({ error: 'Endpoint lama telah dipensiunkan. Gunakan Pengaturan AI.' }));
async function start() {
  if (production) {
    const staticDirectory = path.resolve(root, root.endsWith('dist-server') ? '../dist' : 'dist');
    app.use(express.static(staticDirectory));
    app.get('*', (_req, res) => res.sendFile(path.join(staticDirectory, 'index.html')));
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }
  app.listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => console.log('Quiz Mind AI ready.'));
}
void start();
