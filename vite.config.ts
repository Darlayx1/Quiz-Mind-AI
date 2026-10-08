import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: process.env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss(), {
      name: 'vault-content-security-policy',
      apply: 'build',
      transformIndexHtml() {
        const backend = process.env.VITE_API_BASE_URL ? new URL(process.env.VITE_API_BASE_URL) : null;
        if (backend && !['https:', 'http:'].includes(backend.protocol)) throw new Error('VITE_API_BASE_URL harus berupa URL HTTP(S).');
        const policy = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://generativelanguage.googleapis.com https://api.groq.com${backend ? ' ' + backend.origin : ''}; object-src 'none'; base-uri 'none'; form-action 'self'`;
        return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }];
      }
    }],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
