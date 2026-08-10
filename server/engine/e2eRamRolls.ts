import type { RollSource } from './movement.js'

const MIN_ROLL = 1
const MAX_ROLL = 6

/** Parses an explicit E2E-only d6 sequence and returns a fresh queue for each game. */
export function createE2ERollSourceFactory(raw: string | undefined, scenarioOverridesRaw?: string): ((scenarioId?: string) => RollSource) | undefined {
  const configured = raw?.trim()
  if (!configured) {
    return undefined
  }

  const parseRolls = (value: string, label: string): number[] => value.split(',').map((entry, index) => {
    const roll = Number(entry.trim())
    if (!Number.isInteger(roll) || roll < MIN_ROLL || roll > MAX_ROLL) {
      throw new Error(`${label} entry at index ${index} must be an integer between ${MIN_ROLL} and ${MAX_ROLL}, received ${entry.trim()}`)
    }
    return roll
  })
  const rolls = parseRolls(configured, 'E2E_RAM_ROLLS')
  const scenarioOverrides = new Map<string, number[]>()
  for (const entry of scenarioOverridesRaw?.split(';') ?? []) {
    const separatorIndex = entry.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }
    const scenarioId = entry.slice(0, separatorIndex).trim()
    const override = entry.slice(separatorIndex + 1).trim()
    if (scenarioId.length > 0 && override.length > 0) {
      scenarioOverrides.set(scenarioId, parseRolls(override, `E2E_RAM_ROLLS_BY_SCENARIO[${scenarioId}]`))
    }
  }

  return (scenarioId) => {
    const configuredRolls = scenarioId === undefined ? undefined : scenarioOverrides.get(scenarioId)
    const queue = [...(configuredRolls ?? rolls)]
    const sourceLabel = configuredRolls === undefined ? 'E2E_RAM_ROLLS' : `E2E_RAM_ROLLS_BY_SCENARIO[${scenarioId}]`
    return {
      next(): number {
        const roll = queue.shift()
        if (roll === undefined) {
          throw new Error(`${sourceLabel} exhausted after ${queue.length} remaining roll(s)`)
        }
        return roll
      },
    }
  }
}

export const createE2ERamRollsFactory = createE2ERollSourceFactory