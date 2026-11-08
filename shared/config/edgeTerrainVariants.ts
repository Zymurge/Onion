import type { ScenarioEdgeTerrain, ScenarioEdgeVariant } from '../types/index.js'

export const EDGE_TERRAIN_VARIANTS = {
  ridge: ['ridge-1', 'ridge-2', 'ridge-3', 'ridge-4'],
  stream: ['stream-1', 'stream-2', 'stream-3', 'stream-4'],
} as const satisfies Record<ScenarioEdgeTerrain, readonly ScenarioEdgeVariant[]>

export function isSupportedEdgeVariant(
  type: ScenarioEdgeTerrain,
  variant: string,
): variant is ScenarioEdgeVariant {
  return (EDGE_TERRAIN_VARIANTS[type] as readonly string[]).includes(variant)
}
