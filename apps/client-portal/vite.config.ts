import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// Client-portal (4e app). Eigen poort (5174) zodat hij naast de Beheer-portal (5173) kan draaien.
// Net als de Beheer-portal: host: true (accepteert *.localhost-subdomeinen) en een /api-proxy die
// de originele Host-header behoudt (changeOrigin: false) zodat de backend het org-subdomein ziet.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Workspace-pakket vanuit TS-source (Vite compileert het); de backend
      // consumeert dezelfde package via dist. Eén bron-van-waarheid.
      '@inspexi/entitlements': path.resolve(
        __dirname,
        '../../packages/entitlements/src/index.ts',
      ),
    },
  },
  server: {
    port: 5174,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: false,
      },
    },
  },
});
