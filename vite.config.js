import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { src: '/src' },
  },
  optimizeDeps: {
    include: ['extended-typescript-sdk'],
  },
  build: {
    commonjsOptions: {
      include: [/extended-typescript-sdk/, /node_modules/],
    },
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
