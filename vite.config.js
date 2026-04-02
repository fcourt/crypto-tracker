import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  resolve: {
    alias: { src: '/src' },
  },
  server: {
    proxy: {
      '/api': {
        target: 'https://api.extended.exchange',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/extended\?endpoint=/, ''),
      },
    },
  },
});
