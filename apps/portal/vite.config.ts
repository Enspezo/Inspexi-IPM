import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Workspace-pakket vanuit TS-source (Vite/Vitest compileert het); de
      // backend consumeert dezelfde package via dist. Eén bron-van-waarheid.
      '@inspexi/entitlements': path.resolve(
        __dirname,
        '../../packages/entitlements/src/index.ts',
      ),
    },
  },
  server: {
    port: 5173,
    // Accept all hostnames (*.localhost subdomains)
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        // Keep original Host header so backend can detect subdomain
        changeOrigin: false,
      },
    },
  },
});
