import type { InitialState } from './scenarioSchema'
import type { EngineGameState, OnionUnit, DefenderUnit } from './units'
import { getUnitDefinition } from './units'

/**
 * Normalize a scenario initialState into a valid EngineGameState.
 * Assumes initialState has already been validated by Zod.
 * Throws if required fields are missing or invalid.
 */
export function normalizeInitialStateToGameState(initial: InitialState): EngineGameState {
  // Assign onion ID and status
  const onion: OnionUnit = {
    id: 'onion-1',
    type: initial.onion.type as any, // Cast for now; engine will check
    position: initial.onion.position,
    treads: initial.onion.treads,
    status: initial.onion.status ?? 'operational',
    weapons: getUnitDefinition(initial.onion.type as any).weapons.map(w => ({ ...w })),
    missiles: initial.onion.missiles,
    batteries: { ...initial.onion.batteries },
  }

  // Assign defender IDs and fill defaults
  const defenders: Record<string, DefenderUnit> = {}
  for (const [key, def] of Object.entries(initial.defenders)) {
    defenders[key] = {
      id: key,
      type: def.type as any,
      position: def.position,
      status: def.status ?? 'operational',
      weapons: getUnitDefinition(def.type as any).weapons.map(w => ({ ...w })),
      ...(def.squads !== undefined ? { squads: def.squads } : {}),
    }
  }

  return {
    onion,
    defenders,
    ramsThisTurn: 0,
    currentPhase: 'ONION_MOVE',
    turn: 1,
  }
}
