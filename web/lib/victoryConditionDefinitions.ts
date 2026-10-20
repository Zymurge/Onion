import type { VictoryObjectiveKind, VictoryObjectiveVictor } from '../../shared/apiProtocol'
import type { ScenarioDetailResponse } from './scenarioInfo'

export type VictoryConditionDetailContext = {
  objective: {
    unitId?: string
    unitType?: string
  }
  detail: ScenarioDetailResponse | null
  formatTypeName: (typeId: string) => string
}

export type VictoryConditionDefinition = {
  victor: VictoryObjectiveVictor | readonly VictoryObjectiveVictor[]
  buildDetail: (context: VictoryConditionDetailContext) => string
}

function getDestroyTarget({ objective, detail, formatTypeName }: VictoryConditionDetailContext): string {
  const deployment = objective.unitId === undefined ? undefined : detail?.initialState?.deployments?.[objective.unitId]
  const typeId = objective.unitType ?? deployment?.type ?? deployment?.unitType
  return typeId === undefined ? 'the designated unit' : formatTypeName(typeId)
}

export const victoryConditionDefinitions = {
  'destroy-unit': {
    victor: ['onion', 'defender'],
    buildDetail: (context) => `Destroy ${getDestroyTarget(context)} to complete this condition.`,
  },
  'escape-map': {
    victor: ['onion', 'defender'],
    buildDetail: ({ detail }) => {
      const escape = detail?.victoryConditions?.onion
      const locationDetail = (escape?.escapeHexes?.length ?? 0) > 0
        ? ` Escape zone: ${escape.escapeLocation ?? 'marked area'}; green crosshatching marks it on the map.`
        : ''
      return `Move The Onion to a marked escape hex.${locationDetail}`
    },
  },
  'immobilize-onion': {
    victor: 'defender',
    buildDetail: () => "Reduce The Onion's treads to zero to immobilize it.",
  },
} satisfies Record<VictoryObjectiveKind, VictoryConditionDefinition>

export function isVictoryConditionKind(kind: unknown): kind is VictoryObjectiveKind {
  return typeof kind === 'string' && Object.prototype.hasOwnProperty.call(victoryConditionDefinitions, kind)
}

export function buildVictoryConditionDetail(
  kind: VictoryObjectiveKind,
  context: VictoryConditionDetailContext,
): string {
  return victoryConditionDefinitions[kind].buildDetail(context)
}