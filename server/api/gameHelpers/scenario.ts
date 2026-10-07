import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ScenarioSchema, type InitialState, type Scenario } from '#server/engine/scenarioSchema'
import type { GameState } from '#shared/types/index'
import { assertScenarioPositionsInMap, materializeScenarioMap, translateScenarioCoord, type AuthoredScenarioMap, type ExplicitScenarioMap } from '#shared/scenarioMap'
import type { VictoryEscapeHex } from '#shared/apiProtocol'
import type { RulesContext } from '#shared/rulesContext'
import type { VictoryConditions } from '#server/engine/victory'
import { createScenarioRulesContext } from '#server/engine/scenarioDefinitions'

/** Authored scenario data before map materialization and initial-state normalization. */
export type ScenarioSnapshot = {
  unitTypes?: Scenario['unitTypes']
  name?: string
  displayName?: string
  victoryConditions?: VictoryConditions
  map?: AuthoredScenarioMap
  initialState?: InitialState
}

/** Scenario data after schema validation and authored-map materialization. */
export type ValidatedScenarioSnapshot = Omit<ScenarioSnapshot, 'map' | 'initialState'> & {
  id: string
  description: string
  map: ExplicitScenarioMap
  initialState: InitialState
}

/** Error raised when authored scenario JSON fails schema or map validation. */
export class ScenarioValidationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ScenarioValidationError'
  }
}

/**
 * Validates and materializes an authored scenario snapshot.
 *
 * @param raw Unknown JSON-like value read from a scenario file.
 * @returns Validated scenario data with an explicit map and initial state.
 * @throws ScenarioValidationError when schema, map, or translated positions are invalid.
 */
export function parseScenarioSnapshot(raw: unknown): ValidatedScenarioSnapshot {
  const parsed = ScenarioSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ScenarioValidationError('Scenario does not match the required schema', { cause: parsed.error })
  }

  try {
    const translated = translateScenarioSnapshot(parsed.data)
    if (translated === undefined || translated.map === undefined) {
      throw new Error('Scenario map is missing')
    }

    return translated as ValidatedScenarioSnapshot
  } catch (error) {
    throw new ScenarioValidationError('Scenario map is invalid', { cause: error })
  }
}

/**
 * Returns the Onion escape hexes declared by a scenario.
 *
 * @param scenarioSnapshot Scenario data, if available.
 * @returns Declared escape hexes, or an empty list when none are configured.
 */
export function getScenarioEscapeHexes(scenarioSnapshot: ScenarioSnapshot | undefined): VictoryEscapeHex[] {
  return scenarioSnapshot?.victoryConditions?.onion?.escapeHexes ?? []
}

/** An explicit, materialized scenario map used by API validation and projection. */
export type ScenarioMapSnapshot = ExplicitScenarioMap

export function getScenarioRulesContext(scenarioId: string, scenarioSnapshot: ScenarioSnapshot): RulesContext {
  return createScenarioRulesContext(scenarioId, scenarioSnapshot.unitTypes)
}

/**
 * Materializes the authored map from a scenario snapshot.
 *
 * @param scenarioSnapshot Scenario containing an authored map or map-like value.
 * @returns Explicit map cells and terrain.
 * @throws Error when no map is present.
 */
export function getScenarioMapSnapshot(scenarioSnapshot: ScenarioSnapshot | undefined): ScenarioMapSnapshot {
  const candidate = scenarioSnapshot?.map ?? scenarioSnapshot
  if (!candidate) {
    throw new Error('Invalid scenario map snapshot')
  }

  return materializeScenarioMap(candidate as AuthoredScenarioMap)
}

/**
 * Translates radius-based authored coordinates into the explicit map coordinate space.
 *
 * @param initial Scenario snapshot to translate; explicit maps pass through unchanged.
 * @returns The original snapshot or a translated snapshot with map, deployments, and escape hexes updated.
 */
export function translateScenarioSnapshot(initial: ScenarioSnapshot | undefined): ScenarioSnapshot | undefined {
  if (initial === undefined || initial.map === undefined || !('radius' in initial.map)) {
    return initial
  }

  const radius = Math.max(0, Math.floor(initial.map.radius))
  const translatedInitialState = initial.initialState && typeof initial.initialState === 'object'
    ? (() => {
      const state = initial.initialState

      return {
        ...state,
        deployments: Object.fromEntries(
          Object.entries(state.deployments).map(([key, deployment]) => [
            key,
            { ...deployment, position: translateScenarioCoord(deployment.position, radius) },
          ]),
        ),
      } as InitialState
    })()
    : initial.initialState

  const translatedVictoryConditions = initial.victoryConditions && typeof initial.victoryConditions === 'object'
    ? (() => {
      const victoryConditions = initial.victoryConditions as {
        onion?: {
          escapeHexes?: Array<{ q: number; r: number }>
        }
      }

      return victoryConditions.onion
        ? {
          ...victoryConditions,
          onion: {
            ...victoryConditions.onion,
            escapeHexes: victoryConditions.onion.escapeHexes?.map((hex) => translateScenarioCoord(hex, radius)),
          },
        }
        : victoryConditions
    })()
    : initial.victoryConditions

  return {
    ...initial,
    map: materializeScenarioMap(initial.map),
    initialState: translatedInitialState,
    victoryConditions: translatedVictoryConditions,
  }
}

/**
 * Ensures unit deployment and escape positions belong to the scenario map.
 *
 * @param scenarioMap Materialized map used for membership checks.
 * @param scenarioSnapshot Scenario whose escape positions are also checked.
 * @param state Normalized initial game state whose unit positions are checked.
 * @returns Nothing when every position is valid.
 * @throws Error when any deployment or escape position is outside the map.
 */
export function assertScenarioStateFitsMap(scenarioMap: ScenarioMapSnapshot, scenarioSnapshot: ScenarioSnapshot, state: GameState): void {
  const positions: Array<{ label: string; position: { q: number; r: number } }> = [
    ...Object.values(state.onions).map((onion) => ({
      label: `onion start ${onion.unitId}`,
      position: onion.position,
    })),
    ...Object.values(state.defenders).map((defender) => ({
      label: `defender start ${defender.unitId}`,
      position: defender.position,
    })),
  ]

  const escapeHexes = scenarioSnapshot.victoryConditions?.onion?.escapeHexes
  if (escapeHexes !== undefined) {
    escapeHexes.forEach((position, index) => {
      positions.push({ label: `victory escape hex ${index + 1}`, position })
    })
  }

  assertScenarioPositionsInMap(scenarioMap, positions)
}

/**
 * Loads and validates a scenario by id from a directory of JSON files.
 *
 * @param id Scenario id to find.
 * @param scenariosDir Directory containing scenario JSON files.
 * @returns Validated scenario data, or null when the directory or id is not found.
 * @throws ScenarioValidationError when the matching file is invalid.
 */
export async function loadScenario(id: string, scenariosDir: string): Promise<ValidatedScenarioSnapshot | null> {
  let files: string[]
  try {
    files = await readdir(scenariosDir)
  } catch {
    return null
  }

  for (const file of files.filter((candidate) => candidate.endsWith('.json'))) {
    const fullPath = join(scenariosDir, file)
    const raw = await readFile(fullPath, 'utf8')
    let scenario: unknown
    try {
      scenario = JSON.parse(raw)
    } catch {
      continue
    }

    if (typeof scenario === 'object' && scenario !== null && 'id' in scenario && scenario.id === id) {
      const translated = parseScenarioSnapshot(scenario)

      return {
        ...translated,
        displayName: translated.displayName ?? translated.name,
      }
    }
  }

  return null
}