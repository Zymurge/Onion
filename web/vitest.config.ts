import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const webRoot = fileURLToPath(new URL('.', import.meta.url))
const sharedRoot = fileURLToPath(new URL('../shared', import.meta.url))
const rootNodeModules = fileURLToPath(new URL('../node_modules', import.meta.url))
const rootReact = `${rootNodeModules}/react`
const rootReactDom = `${rootNodeModules}/react-dom`

export default defineConfig({
  root: '.',
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: /^#web$/, replacement: webRoot },
      { find: /^#web\/(.*)$/, replacement: `${webRoot}$1` },
      { find: /^#shared$/, replacement: sharedRoot },
      { find: /^#shared\/(.*)$/, replacement: `${sharedRoot}/$1` },
      { find: /^react-json-print$/, replacement: fileURLToPath(new URL('./test-support/react-json-print.tsx', import.meta.url)) },
      { find: /^react$/, replacement: rootReact },
      { find: /^react\/(.*)$/, replacement: `${rootReact}/$1` },
      { find: /^react-dom$/, replacement: rootReactDom },
      { find: /^react-dom\/(.*)$/, replacement: `${rootReactDom}/$1` },
    ],
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    testTimeout: 60_000,
    include: ['../test/web/**/*.test.ts*'],
    exclude: ['../test/web/build.test.ts'],
    setupFiles: ['../test/web/setup.ts'],
  },
})
