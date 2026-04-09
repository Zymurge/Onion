import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

function isScenarioDir(path: string): boolean {
  return existsSync(resolve(path))
}

function findScenarioDirFrom(startDir: string): string | null {
  let current = startDir

  for (let depth = 0; depth < 4; depth++) {
    const candidate = resolve(current, 'scenarios')
    if (isScenarioDir(candidate)) {
      return candidate
    }

    const parent = dirname(current)
    if (parent === current) {
      break
    }

    current = parent
  }

  return null
}

export function resolveScenariosDir(): string {
  if (process.env.SCENARIOS_DIR) {
    return process.env.SCENARIOS_DIR
  }

  const cwdCandidate = findScenarioDirFrom(process.cwd())
  if (cwdCandidate !== null) {
    return cwdCandidate
  }

  const moduleDir = dirname(fileURLToPath(import.meta.url))
  const moduleCandidate = findScenarioDirFrom(moduleDir)
  if (moduleCandidate !== null) {
    return moduleCandidate
  }

  return resolve(process.cwd(), 'scenarios')
}
