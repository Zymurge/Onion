import type { EventEnvelope, GameState } from '#shared/types/index'
import type { VictoryObjectiveKind, VictoryObjectiveState, VictoryObjectiveVictor } from '#shared/apiProtocol'
import { hexKey } from '#shared/axialHex'
import { getDefender } from '#shared/unitState'
import type { ExplicitScenarioMap } from '#shared/scenarioMap'
import type { RulesContext } from '#shared/rulesContext'

export type VictoryObjective = {
  id: string
  label: string
  kind: VictoryObjectiveKind
  victor: VictoryObjectiveVictor
  required?: boolean
  unitId?: string
  unitType?: string
}

export type VictoryConditions = {
  maxTurns?: number
  objectives?: VictoryObjective[]
  onion?: {
    escapeHexes?: Array<{ q: number; r: number }>
    description?: string
  }
  defender?: {
    description?: string
  }
}

export type VictoryEvaluationContext = {
  victoryConditions?: VictoryConditions
  scenarioMap: ExplicitScenarioMap
  state: GameState
  turnNumber: number
  events?: ReadonlyArray<EventEnvelope>
  rules?: RulesContext
}

export type VictoryEvaluation = {
  objectives: VictoryObjectiveState[]
  winner: VictoryObjectiveVictor | null
}

function isOnionEscaped(
  scenarioMap: ExplicitScenarioMap,
  state: GameState,
  turnNumber: number,
  escapeHexes?: Array<{ q: number; r: number }>,
): boolean {
  if (escapeHexes !== undefined && escapeHexes.length > 0) {
    if (turnNumber <= 1) {
      return false
    }

    return Object.values(state.onions).some((onion) => escapeHexes.some((hex) => hexKey(hex) === hexKey(onion.position)))
  }

  return Object.values(state.onions).some((onion) => !scenarioMap.cells.some((cell) => hexKey(cell) === hexKey(onion.position)))
}

function isOnionImmobilized(state: GameState): boolean {
  const onions = Object.values(state.onions)
  return onions.length > 0 && onions.every((onion) => onion.treads === undefined || onion.treads <= 0 || onion.state === 'destroyed')
}

function isObjectiveCompleted(
  context: VictoryEvaluationContext,
  objective: VictoryObjective,
): boolean {
  const { state, events = [], scenarioMap, turnNumber, victoryConditions } = context

  if (objective.kind === 'destroy-unit') {
    if (objective.unitId !== undefined) {
      const defenderId = getDefender(objective.unitId, state)
      return (defenderId !== undefined && state.defenders[defenderId]?.state === 'destroyed')
        || events.some((event) => event.type === 'UNIT_STATUS_CHANGED' && event.unitId === objective.unitId && event.to === 'destroyed')
    }

    if (objective.unitType !== undefined) {
      return Object.values(state.defenders).some((defender) => defender.typeId === objective.unitType && defender.state === 'destroyed')
    }

    return false
  }

  if (objective.kind === 'escape-map') {
    return isOnionEscaped(scenarioMap, state, turnNumber, victoryConditions?.onion?.escapeHexes)
  }

  return objective.kind === 'immobilize-onion' ? isOnionImmobilized(state) : false
}

export function evaluateVictoryConditions(context: VictoryEvaluationContext): VictoryEvaluation {
  const objectives = (context.victoryConditions?.objectives ?? []).map((objective) => ({
    ...objective,
    required: objective.required ?? true,
    completed: isObjectiveCompleted(context, objective),
  }))

  const winner = (['onion', 'defender'] as const).find((victor) => {
    const requiredObjectives = objectives.filter((objective) => objective.victor === victor && objective.required)
    return requiredObjectives.length > 0 && requiredObjectives.every((objective) => objective.completed)
  }) ?? null

  return { objectives, winner }
}
