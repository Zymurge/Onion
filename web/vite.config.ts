import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  root: '.',
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
    },
  },
  server: {
    open: '/index.html',
    watch: process.env.E2E_RUNTIME_FILE ? null : undefined,
    fs: {
      allow: ['..'],
    },
  },
})
