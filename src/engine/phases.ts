import type { TurnPhase } from '../types/index.js'
import type { EngineGameState } from './units.js'

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
 * Check if the game has ended and determine the winner.
 * @param state - Current game state
 * @param turnNumber - Current turn number
 * @param maxTurns - Maximum allowed turns
 * @returns Winner ('onion', 'defender', or null if game continues)
 */
export function checkVictoryConditions(
  state: EngineGameState,
  turnNumber: number,
  maxTurns: number
): 'onion' | 'defender' | null
