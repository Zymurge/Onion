import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const webRoot = fileURLToPath(new URL('./web', import.meta.url))
const sharedRoot = fileURLToPath(new URL('./shared', import.meta.url))
const serverRoot = fileURLToPath(new URL('./server', import.meta.url))
const rootNodeModules = fileURLToPath(new URL('./node_modules', import.meta.url))
const rootReact = `${rootNodeModules}/react`
const rootReactDom = `${rootNodeModules}/react-dom`

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: /^#server$/, replacement: serverRoot },
      { find: /^#server\/(.*)$/, replacement: `${serverRoot}/$1` },
      { find: /^#shared$/, replacement: sharedRoot },
      { find: /^#shared\/(.*)$/, replacement: `${sharedRoot}/$1` },
      { find: /^#web$/, replacement: webRoot },
      { find: /^#web\/(.*)$/, replacement: `${webRoot}/$1` },
      { find: /^react-json-print$/, replacement: fileURLToPath(new URL('./web/test-support/react-json-print.tsx', import.meta.url)) },
      { find: /^react$/, replacement: rootReact },
      { find: /^react\/(.*)$/, replacement: `${rootReact}/$1` },
      { find: /^react-dom$/, replacement: rootReactDom },
      { find: /^react-dom\/(.*)$/, replacement: `${rootReactDom}/$1` },
    ],
  },
  server: {
    fs: {
      allow: [rootDir],
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts*', 'server/**/*.integration.test.ts'],
    exclude: ['test/web/build.test.ts', '**/node_modules/**', 'dist/**', 'server/db/migrations/**'],
    setupFiles: ['./test/server/setup.ts', './test/web/setup.ts'],
    testTimeout: 60_000,
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['server/**', 'shared/**', 'web/**', 'types/**'],
      exclude: ['server/**/*.test.ts', 'server/**/*.integration.test.ts', 'server/db/migrations/**', 'shared/**/*.test.ts', 'test/**'],
    },
  },
})
