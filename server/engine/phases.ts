import type { GameState, TurnPhase } from '#shared/types/index'
import { getUnitRamCapacity } from '#shared/unitMovement'
import logger from '#server/logger'
import { UnitWeapons } from '#shared/unitWeapons'

type EngineGameState = GameState

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
 * - Entering ONION_MOVE: increment turn, reset Onion ram capacity, disabled→recovering
 * - Entering DEFENDER_RECOVERY: recovering→operational (engine auto-processes
 *   this phase, so it immediately continues to DEFENDER_MOVE)
 * @param state - Game state to mutate in place
 */
export function advancePhase(state: EngineGameState): void {
  const next = nextPhase(state.currentPhase)

  if (next === 'ONION_MOVE') {
    state.turn++
    for (const onion of Object.values(state.onions)) {
      onion.ramsRemaining = getUnitRamCapacity(onion.typeId)
      new UnitWeapons(onion.weapons).rechargeSpent()
    }
    // Reset defender weapons for the new turn
    for (const unit of Object.values(state.defenders)) {
      if (unit.weapons) {
        for (const weapon of unit.weapons) {
          if (weapon.state === 'spent') {
            weapon.state = 'ready'
          }
        }
      }
      if (unit.state === 'disabled') unit.state = 'recovering'
    }
  }

  if (next === 'DEFENDER_RECOVERY') {
    for (const unit of Object.values(state.defenders)) {
      if (unit.state === 'recovering') unit.state = 'operational'
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
  // Defenders win only when every Onion is immobilized or destroyed.
  const onions = Object.values(state.onions)
  if (onions.length > 0 && onions.every((onion) => onion.treads <= 0 || onion.state === 'destroyed')) {
    return 'defender'
  }

  // Game continues
  return null
}
