/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // `SPARK_API_PROXY=https://<dev CloudFront domain> npm run dev` sends /api to the dev stage (a .env.local file works
  // too). Without it there is no proxy, and the app simply stays offline-only. loadEnv reads process.env as well.
  const apiProxy = loadEnv(mode, '.', 'SPARK_').SPARK_API_PROXY;
  return {
    plugins: [react()],
    // Relative base so the build works from any static host path (S3, Amplify, GitHub Pages).
    base: './',
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id) => (id.includes('node_modules') ? (/@xyflow|d3-/.test(id) ? 'flow' : 'vendor') : undefined),
        },
      },
    },
    server: apiProxy ? { proxy: { '/api': { target: apiProxy, changeOrigin: true } } } : undefined,
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  };
});
