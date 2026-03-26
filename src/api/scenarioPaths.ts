import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

function isScenarioDir(path: string): boolean {
  return existsSync(resolve(path))
}

export function resolveScenariosDir(): string {
  if (process.env.SCENARIOS_DIR) {
    return process.env.SCENARIOS_DIR
  }

  let current = process.cwd()
  for (let depth = 0; depth < 4; depth++) {
    const candidate = resolve(current, 'scenarios')
    if (isScenarioDir(candidate)) {
      return candidate
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  return resolve(process.cwd(), 'scenarios')
}
