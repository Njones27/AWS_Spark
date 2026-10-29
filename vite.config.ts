/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
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
  test: { environment: 'node' },
});
