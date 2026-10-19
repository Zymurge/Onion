import { readFile } from 'node:fs/promises'

import { ZodError } from 'zod'

import { parseScenarioSnapshot, ScenarioValidationError } from '#server/api/gameHelpers/scenario'

function formatError(error: unknown): string {
  if (error instanceof ScenarioValidationError && error.cause instanceof ZodError) {
    const details = error.cause.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '<root>'
      return `${path}: ${issue.message}`
    }).join('\n  - ')

    return `${error.message}:\n  - ${details}`
  }

  if (error instanceof ScenarioValidationError && error.cause instanceof Error) {
    return `${error.message}: ${error.cause.message}`
  }

  return error instanceof Error ? error.message : String(error)
}

async function main(): Promise<void> {
  const scenarioPath = process.argv[2]
  if (scenarioPath === undefined || process.argv.length > 3) {
    console.error('Usage: pnpm scenario:validate <scenario-file>')
    process.exitCode = 1
    return
  }

  try {
    const raw = JSON.parse(await readFile(scenarioPath, 'utf8')) as unknown
    const scenario = parseScenarioSnapshot(raw)
    console.log(`Valid scenario: ${scenario.displayName ?? scenario.name} (${scenario.id})`)
  } catch (error) {
    console.error(`Invalid scenario "${scenarioPath}": ${formatError(error)}`)
    process.exitCode = 1
  }
}

void main()