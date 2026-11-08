import type { ScenarioEdgeTerrain, ScenarioEdgeVariant } from '../../shared/types/index.js'

export const edgeTerrainAssetRegistry: Readonly<Record<ScenarioEdgeVariant, string>> = {
  'ridge-1': '/terrain/edges/ridge-1.svg',
  'ridge-2': '/terrain/edges/ridge-2.svg',
  'ridge-3': '/terrain/edges/ridge-3.svg',
  'ridge-4': '/terrain/edges/ridge-4.svg',
  'stream-1': '/terrain/edges/stream-1.svg',
  'stream-2': '/terrain/edges/stream-2.svg',
  'stream-3': '/terrain/edges/stream-3.svg',
  'stream-4': '/terrain/edges/stream-4.svg',
}

export const edgeTerrainCornerAssetRegistry: Readonly<Record<ScenarioEdgeTerrain, string>> = {
  ridge: '/terrain/edges/ridge-corner.svg',
  stream: '/terrain/edges/stream-corner.svg',
}

export function getEdgeTerrainAsset(variant: ScenarioEdgeVariant): string {
  return edgeTerrainAssetRegistry[variant]
}

export function getEdgeTerrainCornerAsset(type: ScenarioEdgeTerrain): string {
  return edgeTerrainCornerAssetRegistry[type]
}
