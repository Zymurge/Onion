import { describe, expect, it } from 'vitest'

import {
  edgeTerrainAssetRegistry,
  edgeTerrainCornerAssetRegistry,
} from '../../../web/lib/edgeTerrainAssetRegistry'
import { EDGE_TERRAIN_VARIANTS } from '../../../shared/config/edgeTerrainVariants'

describe('edge terrain asset registry', () => {
  it('provides one segment asset for every supported variant', () => {
    for (const [type, variants] of Object.entries(EDGE_TERRAIN_VARIANTS)) {
      for (const variant of variants) {
        expect(edgeTerrainAssetRegistry[variant]).toMatch(
          new RegExp(`/terrain/edges/${type}-[1-4]\\.svg$`),
        )
      }
    }
  })

  it('provides one normalized corner asset for each terrain kind', () => {
    expect(edgeTerrainCornerAssetRegistry.ridge).toBe('/terrain/edges/ridge-corner.svg')
    expect(edgeTerrainCornerAssetRegistry.stream).toBe('/terrain/edges/stream-corner.svg')
  })
})
