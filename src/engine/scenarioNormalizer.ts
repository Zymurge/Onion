import type { InitialState } from './scenarioSchema.js'
import type { DefenderUnit, EngineGameState, OnionUnit } from './units.js'
import { getUnitDefinition } from './units.js'

/**
 * Normalize a scenario initialState into a valid EngineGameState.
 * Assumes initialState has already been validated by Zod.
 * Throws if required fields are missing or invalid.
 */
export function normalizeInitialStateToGameState(initial: InitialState): EngineGameState {
  const onionDefinition = getUnitDefinition(initial.onion.type as any)

  // Assign onion ID and status
  const onion: OnionUnit & {
    missiles: number
    batteries: { main: number; secondary: number; ap: number }
  } = {
    id: 'onion-1',
    type: initial.onion.type as any, // Cast for now; engine will check
    position: initial.onion.position,
    treads: initial.onion.treads,
    status: (initial.onion.status ?? 'operational') as OnionUnit['status'],
    weapons: onionDefinition.weapons.map((weapon) => ({ ...weapon })),
    missiles: initial.onion.missiles,
    batteries: { ...initial.onion.batteries },
  }

  // Assign defender IDs and fill defaults
  const defenders: Record<string, DefenderUnit> = {}
  for (const [key, def] of Object.entries(initial.defenders) as Array<[string, InitialState['defenders'][string]]>) {
    const defenderDefinition = getUnitDefinition(def.type as any)
    defenders[key] = {
      id: key,
      type: def.type as any,
      position: def.position,
      status: (def.status ?? 'operational') as DefenderUnit['status'],
      weapons: defenderDefinition.weapons.map((weapon) => ({ ...weapon })),
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
