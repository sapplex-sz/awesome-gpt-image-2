import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localVercelApi } from './scripts/vite-local-api.mjs';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [localVercelApi(), react()],
  publicDir: 'data',
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        lens: resolve(root, 'lens.html')
      }
    }
  }
});
