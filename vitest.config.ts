import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'dist/**', '**/*.integration.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['server/**', 'shared/**', 'types/**'],
      exclude: ['server/**/*.test.ts', 'server/**/*.integration.test.ts', 'shared/**/*.test.ts', 'test/**'],
    },
    maxWorkers: 1
  },
})