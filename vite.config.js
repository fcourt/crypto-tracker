import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
