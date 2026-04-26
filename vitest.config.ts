import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['server/**', 'shared/**', 'types/**'],
      exclude: ['server/**/*.test.ts', 'server/**/*.integration.test.ts', 'server/db/migrations/**', 'shared/**/*.test.ts', 'test/**'],
    },
    projects: ['./vitest.node.config.ts', './web/vitest.config.ts'],
  },
})
