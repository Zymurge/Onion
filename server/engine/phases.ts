import type { GameState, TurnPhase } from '#shared/types/index'
import logger from '#server/logger'
import { refreshStackRosterNamingSnapshot } from '#shared/stackRoster'

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

export function clearDestroyedDefenders(state: EngineGameState): void {
  const destroyedUnitIds = new Set<string>()
  for (const [unitId, unit] of Object.entries(state.defenders)) {
    if (unit.state === 'destroyed') {
      destroyedUnitIds.add(unitId)
      destroyedUnitIds.add(unit.unitId)
    }
  }

  if (destroyedUnitIds.size === 0) {
    return
  }

  state.defenders = Object.fromEntries(
    Object.entries(state.defenders).filter(([, unit]) => unit.state !== 'destroyed' || unit.typeId === 'Swamp'),
  )

  if (state.stackRoster !== undefined) {
    const groupsById = Object.fromEntries(
      Object.entries(state.stackRoster.groupsById)
        .flatMap(([groupId, group]) => {
          const unitIds = group.unitIds.filter((unitId) => state.defenders[unitId] !== undefined && !destroyedUnitIds.has(unitId))
          return unitIds.length > 0 ? [[groupId, { ...group, unitIds }] as const] : []
        }),
    )
    state.stackRoster = { groupsById }
    state.stackNaming = refreshStackRosterNamingSnapshot(state.stackRoster, state.stackNaming, state.defenders)
  }
}

export function clearDestroyedOnions(state: EngineGameState): void {
  state.onions = Object.fromEntries(
    Object.entries(state.onions).filter(([, unit]) => unit.state !== 'destroyed'),
  )
}
