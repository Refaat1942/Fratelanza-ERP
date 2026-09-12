import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const root = resolve(__dirname, '../..');
const desktopSrc = resolve(__dirname, '../desktop/src');

export default defineConfig({
  base: '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@web': resolve(__dirname, 'src'),
      '@desktop': desktopSrc,
      '@fratelanza/types': resolve(root, 'packages/types/src/index.ts'),
      '@fratelanza/shared': resolve(root, 'packages/shared/src/index.ts'),
      '@fratelanza/localization': resolve(root, 'packages/localization/src/index.ts'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  define: {
    'import.meta.env.VITE_SAME_ORIGIN_API': JSON.stringify('true'),
    'import.meta.env.VITE_WEB_APP': JSON.stringify('true'),
  },
});
