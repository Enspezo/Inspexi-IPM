import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// `ANALYZE=1 pnpm build` genereert dist/stats.html (treemap van de bundel).
export default defineConfig(async () => {
  const plugins: PluginOption[] = [react(), tailwindcss()];

  if (process.env.ANALYZE) {
    const { visualizer } = await import('rollup-plugin-visualizer');
    plugins.push(
      visualizer({
        filename: 'dist/stats.html',
        gzipSize: true,
        brotliSize: true,
        template: 'treemap',
      }) as PluginOption,
    );
  }

  return {
    plugins,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        // Workspace-pakket vanuit TS-source (Vite/Vitest compileert het); de
        // backend consumeert dezelfde package via dist. Eén bron-van-waarheid.
        '@inspexi/entitlements': path.resolve(
          __dirname,
          '../../packages/entitlements/src/index.ts',
        ),
        '@inspexi/calibration': path.resolve(
          __dirname,
          '../../packages/calibration/src/index.ts',
        ),
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Zware, zelden-gebruikte libs in eigen vendor-chunks houden zodat ze
          // los gecachet worden en alleen laden bij de lazy preview-/plattegrond-
          // schermen die ze nodig hebben (zie file-preview-modal & floor-plan-tab).
          manualChunks: {
            'docx-preview': ['docx-preview'],
            xlsx: ['xlsx'],
            konva: ['konva', 'react-konva'],
          },
        },
      },
    },
    server: {
      port: 5173,
      // Accept all hostnames (*.localhost subdomains)
      host: true,
      proxy: {
        '/api': {
          // Overridebaar zodat een tweede dev-instantie (bijv. vanuit een
          // worktree) naar een eigen API-poort kan wijzen.
          target: process.env.API_PROXY_TARGET || 'http://localhost:3001',
          // Keep original Host header so backend can detect subdomain
          changeOrigin: false,
        },
      },
    },
  };
});
