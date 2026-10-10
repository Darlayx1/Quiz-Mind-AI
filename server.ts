import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AI_MODELS, DEFAULT_MODEL } from './src/models.js';

dotenv.config();
const root = path.dirname(fileURLToPath(import.meta.url));
const production = process.env.NODE_ENV === 'production' || root.endsWith('dist-server');
const app = express();
app.get('/api/health', (_req, res) => res.json({ status: 'ok', model: DEFAULT_MODEL,
  models: AI_MODELS.map(model => model.id), features: { localWorkspace: true, accountWorkspace: true } }));
// AI and account writes use workspace adapters, never an anonymous shared server key.
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
