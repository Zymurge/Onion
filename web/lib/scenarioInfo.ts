import type { SessionCatalog } from './sessionCatalog'
import type { ServerGameSnapshot } from './gameClient'

export type ScenarioInfoObjective = {
  id: string
  label: string
  required: boolean
  completed: boolean
}

export type ScenarioInfoData = {
  scenarioName: string
  description: string | null
  objectives: ReadonlyArray<ScenarioInfoObjective>
  escapeHexes: ReadonlyArray<string>
  onionDescription: string | null
  defenderDescription: string | null
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
  initialState?: {
    deployments?: Record<string, ScenarioDeployment>
  }
  victoryConditions?: {
    objectives?: ReadonlyArray<{ id?: string; label?: string; required?: boolean }>
    onion?: { description?: string; escapeHexes?: ReadonlyArray<{ q: number; r: number }> }
    defender?: { description?: string }
  }
}

function formatScenarioType(typeId: string, catalog: SessionCatalog | null): string {
  return catalog?.unitTypes[typeId]?.name ?? typeId.replace(/([a-z])([A-Z])/g, '$1 $2')
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
  const objectives = snapshotObjectives.length > 0
    ? snapshotObjectives.map((objective) => ({
      id: objective.id,
      label: objective.label,
      required: objective.required,
      completed: objective.completed,
    }))
    : detailObjectives
      .filter((objective): objective is { id: string; label: string; required?: boolean } => typeof objective.id === 'string' && typeof objective.label === 'string')
      .map((objective) => ({
        id: objective.id,
        label: objective.label,
        required: objective.required !== false,
        completed: false,
      }))

  return {
    scenarioName: snapshot?.scenarioName ?? detail?.displayName ?? 'Scenario briefing',
    description: detail?.description ?? null,
    objectives,
    escapeHexes: detail?.victoryConditions?.onion?.escapeHexes?.map((hex) => `${hex.q}, ${hex.r}`) ?? snapshot?.escapeHexes?.map((hex) => `${hex.q}, ${hex.r}`) ?? [],
    onionDescription: detail?.victoryConditions?.onion?.description ?? null,
    defenderDescription: detail?.victoryConditions?.defender?.description ?? null,
    manifest: buildScenarioManifest(detail, catalog),
  }
}
