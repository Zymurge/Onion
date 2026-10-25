import type { GameState, TurnPhase } from '#shared/types/index'
import logger from '#server/logger'
import { expandStackRosterGroups, refreshStackRosterNamingSnapshot } from '#shared/stackRoster/index'

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
      return 'onion'
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

export function pruneDestroyedDefendersFromStackRoster(state: EngineGameState): void {
  if (!Object.values(state.defenders).some((unit) => unit.state === 'destroyed')) {
    return
  }

  if (state.stackRoster !== undefined) {
    const liveDefenders = Object.fromEntries(
      Object.entries(state.defenders).filter(([, unit]) => unit.state !== 'destroyed'),
    )
    state.stackRoster = expandStackRosterGroups(state.stackRoster, liveDefenders)
    state.stackNaming = refreshStackRosterNamingSnapshot(state.stackRoster, state.stackNaming, state.defenders)
  }
}

export function clearDestroyedOnions(state: EngineGameState): void {
  state.onions = Object.fromEntries(
    Object.entries(state.onions).filter(([, unit]) => unit.state !== 'destroyed'),
  )
}
