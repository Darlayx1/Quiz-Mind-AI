import { build } from 'esbuild';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const assets = {};
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(filename);
    else {
      const url = '/' + path.relative('dist', filename).replaceAll('\\', '/');
      assets[url] = await readFile(filename, 'utf8');
    }
  }
}
await collect('dist');
await writeFile('.worker-assets.json', JSON.stringify(assets));
await mkdir('dist/server', { recursive: true });
await build({
  entryPoints: ['worker.ts'], outfile: 'dist/server/index.js', bundle: true,
  platform: 'browser', format: 'esm', target: 'es2022',
  external: ['node:*'], minify: true,
});
