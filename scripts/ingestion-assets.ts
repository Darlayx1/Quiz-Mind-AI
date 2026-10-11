import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';

// Serve/package OCR resources from the same origin, including private/base-path deployments.
export function ingestionAssets(): Plugin {
  const root = path.resolve(import.meta.dirname, '../node_modules');
  const resources = new Map([
    ['worker.min.js', 'tesseract.js/dist/worker.min.js'],
    ['tesseract-core-lstm.js', 'tesseract.js-core/tesseract-core-lstm.js'],
    ['tesseract-core-lstm.wasm', 'tesseract.js-core/tesseract-core-lstm.wasm'],
    ['eng.traineddata.gz', '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'],
    ['ind.traineddata.gz', '@tesseract.js-data/ind/4.0.0_best_int/ind.traineddata.gz'],
  ]);
  let base = '/';
  return { name: 'local-material-ocr-assets',
    configResolved(config) { base = config.base; },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const prefix = base + 'ingestion-assets/';
        const url = req.url?.split('?')[0] || '';
        if (!url.startsWith(prefix)) return next();
        const name = url.slice(prefix.length), resource = resources.get(name);
        if (!resource) { res.statusCode = 404; res.end(); return; }
        try {
          const contents = await readFile(path.join(root, resource));
          res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
          res.setHeader('Cache-Control', 'public, max-age=3600'); res.end(contents);
        } catch (error) { next(error); }
      });
    },
    async generateBundle() {
      for (const [name, resource] of resources) this.emitFile({ type: 'asset', fileName: 'ingestion-assets/' + name, source: await readFile(path.join(root, resource)) });
    },
  };
}
