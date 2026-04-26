import { defineProject } from 'vitest/config'

export default defineProject({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'dist/**', '**/*.integration.test.ts'],
    setupFiles: ['./test/server/setup.ts'],
    maxWorkers: 1,
  },
})
