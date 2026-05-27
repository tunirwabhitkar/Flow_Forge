import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/rest': {
        target: 'http://localhost:5678',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:5678',
        changeOrigin: true,
      },
      '/webhook': {
        target: 'http://localhost:5678',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'vue-router', 'pinia'],
          editor: ['@vueflow/core', '@vueflow/background', '@vueflow/controls'],
          codemirror: ['codemirror', '@codemirror/view', '@codemirror/state'],
          elementPlus: ['element-plus'],
        },
      },
    },
  },
});
