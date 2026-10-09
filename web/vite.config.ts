import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// https://vite.dev/config/
export default defineConfig({
  root: '.',
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '#shared': resolve(workspaceRoot, 'shared'),
    },
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
