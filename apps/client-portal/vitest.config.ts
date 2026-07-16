import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Zelfde opzet als apps/portal/vitest.config.ts; de entitlements-alias spiegelt
// vite.config.ts (workspace-pakket vanuit TS-source).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@inspexi/entitlements': path.resolve(
        __dirname,
        '../../packages/entitlements/src/index.ts',
      ),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
});
