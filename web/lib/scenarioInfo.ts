import type { SessionCatalog } from './sessionCatalog'
import type { ServerGameSnapshot } from './gameClient'
import type { VictoryObjectiveKind, VictoryObjectiveVictor } from '../../shared/apiProtocol'
import { buildVictoryConditionDetail, isVictoryConditionKind } from './victoryConditionDefinitions'

export type ScenarioInfoObjective = {
  id: string
  label: string
  kind: VictoryObjectiveKind
  victor: VictoryObjectiveVictor
  required: boolean
  completed: boolean
  detail: string
}

export type ScenarioInfoData = {
  scenarioName: string
  description: string | null
  objectives: ReadonlyArray<ScenarioInfoObjective>
  manifest: {
    onion: ReadonlyArray<string>
    defender: ReadonlyArray<string>
  }
}

export type ScenarioDeployment = {
  side?: 'onion' | 'defender'
  type?: string
  unitType?: string
  count?: number
  squads?: number
}

export type ScenarioDetailResponse = {
  id?: string
  description?: string
  displayName?: string
  map?: { cells?: unknown[] }
  initialState?: {
    deployments?: Record<string, ScenarioDeployment>
  }
  victoryConditions?: {
    objectives?: ReadonlyArray<{
      id?: string
      label?: string
      kind?: VictoryObjectiveKind
      victor?: VictoryObjectiveVictor
      required?: boolean
      unitId?: string
      unitType?: string
    }>
    onion?: { escapeHexes?: ReadonlyArray<{ q: number; r: number }>; escapeLocation?: string }
  }
}

function formatScenarioType(typeId: string, catalog: SessionCatalog | null): string {
  return catalog?.unitTypes[typeId]?.name ?? typeId.replace(/([a-z])([A-Z])/g, '$1 $2')
}

function isVictoryObjectiveKind(kind: unknown): kind is VictoryObjectiveKind {
  return isVictoryConditionKind(kind)
}

function buildObjectiveDetail(
  objective: Pick<ScenarioInfoObjective, 'kind'> & { unitId?: string; unitType?: string },
  detail: ScenarioDetailResponse | null,
  catalog: SessionCatalog | null,
): string {
  return buildVictoryConditionDetail(objective.kind, {
    objective,
    detail,
    formatTypeName: (typeId) => formatScenarioType(typeId, catalog),
  })
}

export function buildScenarioManifest(detail: ScenarioDetailResponse | null, catalog: SessionCatalog | null) {
  const manifest = { onion: [] as string[], defender: [] as string[] }
  const totals = new Map<string, number>()
  for (const deployment of Object.values(detail?.initialState?.deployments ?? {})) {
    const typeId = deployment.type ?? deployment.unitType
    if (deployment.side === undefined || typeId === undefined) {
      continue
    }

    const key = `${deployment.side}:${typeId}`
    totals.set(key, (totals.get(key) ?? 0) + (deployment.count ?? deployment.squads ?? 1))
  }

  for (const [key, count] of totals) {
    const [side, typeId] = key.split(':') as ['onion' | 'defender', string]
    manifest[side].push(`${count} x ${formatScenarioType(typeId, catalog)}`)
  }

  return manifest
}

export function buildScenarioInfoData(
  snapshot: ServerGameSnapshot | null,
  detail: ScenarioDetailResponse | null,
  catalog: SessionCatalog | null,
): ScenarioInfoData {
  const snapshotObjectives = snapshot?.victoryObjectives ?? []
  const detailObjectives = detail?.victoryConditions?.objectives ?? []
  const objectivesWithoutDetail = snapshotObjectives.length > 0
    ? snapshotObjectives.map((objective) => ({
      id: objective.id,
      label: objective.label,
      kind: objective.kind,
      victor: objective.victor,
      required: objective.required,
      completed: objective.completed,
      unitId: objective.unitId,
      unitType: objective.unitType,
    }))
    : detailObjectives
      .filter((objective): objective is { id: string; label: string; kind: VictoryObjectiveKind; victor: VictoryObjectiveVictor; required?: boolean; unitId?: string; unitType?: string } =>
        typeof objective.id === 'string' && typeof objective.label === 'string' && isVictoryObjectiveKind(objective.kind) && (objective.victor === 'onion' || objective.victor === 'defender'))
      .map((objective) => ({
        id: objective.id,
        label: objective.label,
        kind: objective.kind,
        victor: objective.victor,
        required: objective.required !== false,
        completed: false,
        unitId: objective.unitId,
        unitType: objective.unitType,
      }))
  const objectives = objectivesWithoutDetail.map((objective) => ({
    ...objective,
    detail: buildObjectiveDetail(objective, detail, catalog),
  }))

  return {
    scenarioName: snapshot?.scenarioName ?? detail?.displayName ?? 'Scenario briefing',
    description: detail?.description ?? null,
    objectives,
    manifest: buildScenarioManifest(detail, catalog),
  }
}
