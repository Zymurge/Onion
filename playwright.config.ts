import { defineConfig } from '@playwright/test'
import { resolvePlaywrightConfig } from './test/e2e/runtime/playwrightConfig.js'

export default defineConfig(resolvePlaywrightConfig())