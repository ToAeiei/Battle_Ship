import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * In dev the client runs on :5173 and the server on :3000, so socket traffic is
 * proxied. In production the server serves this build itself, and the client
 * simply talks to its own origin — which is why players never type an IP.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@battleship/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true, changeOrigin: true },
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
