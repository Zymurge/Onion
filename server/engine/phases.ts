import type { TurnPhase } from '#shared/types/index'
import type { EngineGameState } from '#server/engine/units'
import logger from '#server/logger'

function getWeaponTypeFromId(weaponId: string): 'main' | 'secondary' | 'ap' | 'missile' | null {
  if (weaponId === 'main') return 'main'
  if (weaponId.startsWith('secondary_')) return 'secondary'
  if (weaponId.startsWith('ap_')) return 'ap'
  if (weaponId.startsWith('missile_')) return 'missile'
  return null
}

export const TURN_PHASES: readonly TurnPhase[] = [
  'ONION_MOVE',
  'ONION_COMBAT',
  'DEFENDER_RECOVERY',
  'DEFENDER_MOVE',
  'DEFENDER_COMBAT',
  'GEV_SECOND_MOVE',
] as const

export function nextPhase(current: TurnPhase): TurnPhase {
  const idx = TURN_PHASES.indexOf(current)
  return TURN_PHASES[(idx + 1) % TURN_PHASES.length]
}

export type PhaseActor = 'onion' | 'defender' | 'engine'

export function phaseActor(phase: TurnPhase): PhaseActor {
  switch (phase) {
    case 'ONION_MOVE':
      logger.debug({ phase }, 'phaseActor called')
    case 'ONION_COMBAT':
      return 'onion'
    case 'DEFENDER_RECOVERY':
      return 'engine'
    case 'DEFENDER_MOVE':
    case 'DEFENDER_COMBAT':
    case 'GEV_SECOND_MOVE':
      return 'defender'
  }
}

/**
 * Advance to the next phase, running any maintenance side-effects.
 *
 * Maintenance applied:
 * - Entering ONION_MOVE: increment turn, reset ramsThisTurn, disabled→recovering
 * - Entering DEFENDER_RECOVERY: recovering→operational (engine auto-processes
 *   this phase, so it immediately continues to DEFENDER_MOVE)
 * @param state - Game state to mutate in place
 */
export function advancePhase(state: EngineGameState): void {
  const next = nextPhase(state.currentPhase)

  if (next === 'ONION_MOVE') {
    state.turn++
    state.ramsThisTurn = 0
    for (const weapon of state.onion.weapons) {
      if (weapon.status === 'spent') {
        const weaponType = getWeaponTypeFromId(weapon.id)
        weapon.status = 'ready'
        if (weaponType === 'missile') {
          const onion = state.onion as EngineGameState['onion'] & { missiles?: number }
          if (onion.missiles !== undefined) {
            onion.missiles += 1
          }
        } else if (weaponType) {
          const onion = state.onion as EngineGameState['onion'] & {
            batteries?: { main: number; secondary: number; ap: number }
          }
          if (onion.batteries) {
            onion.batteries[weaponType] = (onion.batteries[weaponType] ?? 0) + 1
          }
        }
      }
    }
    // Reset defender weapons for the new turn
    for (const unit of Object.values(state.defenders)) {
      if (unit.weapons) {
        for (const weapon of unit.weapons) {
          if (weapon.status === 'spent') {
            weapon.status = 'ready'
          }
        }
      }
      if (unit.status === 'disabled') unit.status = 'recovering'
    }
  }

  if (next === 'DEFENDER_RECOVERY') {
    for (const unit of Object.values(state.defenders)) {
      if (unit.status === 'recovering') unit.status = 'operational'
    }
  }

  state.currentPhase = next

  // Engine-controlled phases are auto-processed immediately
  if (phaseActor(next) === 'engine') {
    advancePhase(state)
  }
}

/**
 * Check if the game has ended and determine the winner.
 * @param state - Current game state
 * @returns Winner ('onion', 'defender', or null if game continues)
 */
export function checkVictoryConditions(
  state: EngineGameState,
): 'onion' | 'defender' | null {
  // Defender wins by immobilizing the Onion (treads = 0) or destroying it
  if (state.onion.treads <= 0 || state.onion.status === 'destroyed') {
    return 'defender'
  }

  // Game continues
  return null
}
