import { describe, expect, it } from 'vitest'

import {
  deriveEdgeCorners,
  edgeBoundaryEndpoints,
  edgeSegmentGeometry,
} from '../../../../web/lib/edgeTerrainGeometry'

const size = 36
const origin = { q: 0, r: 0 }
const neighbors = [
  { q: 1, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: -1, r: 1 },
]
const ringNeighbors = [
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
]

function edge(a: { q: number; r: number }, b: { q: number; r: number }, type: 'ridge' | 'stream' = 'ridge') {
  return { a, b, type, variant: type === 'ridge' ? 'ridge-1' as const : 'stream-1' as const }
}

describe('edge terrain geometry', () => {
  it('derives one shared boundary of the expected length for all six axial directions', () => {
    for (const neighbor of neighbors) {
      const endpoints = edgeBoundaryEndpoints(edge(origin, neighbor), size)
      const dx = endpoints.end.x - endpoints.start.x
      const dy = endpoints.end.y - endpoints.start.y

      expect(Math.hypot(dx, dy)).toBeCloseTo(size, 6)
      expect((endpoints.start.x + endpoints.end.x) / 2).toBeCloseTo(
        (endpoints.center.x),
        6,
      )
      expect((endpoints.start.y + endpoints.end.y) / 2).toBeCloseTo(
        (endpoints.center.y),
        6,
      )
    }
  })

  it('insets both segment endpoints without changing the boundary midpoint', () => {
    const geometry = edgeSegmentGeometry(edge(origin, { q: 1, r: 0 }), size, 5)

    expect(geometry.start).not.toEqual(geometry.boundary.start)
    expect(geometry.end).not.toEqual(geometry.boundary.end)
    expect(Math.hypot(
      geometry.end.x - geometry.start.x,
      geometry.end.y - geometry.start.y,
    )).toBeCloseTo(size - 10, 6)
    expect(geometry.angle).toBeGreaterThanOrEqual(0)
    expect(geometry.angle).toBeLessThan(Math.PI)
  })

  it('emits corners only for exactly two same-type incident edges', () => {
    const sameType = [
      edge(origin, { q: 1, r: 0 }),
      edge(origin, { q: 0, r: 1 }),
    ]

    expect(deriveEdgeCorners(sameType, size)).toHaveLength(1)
    expect(deriveEdgeCorners([
      sameType[0],
      edge(origin, { q: 0, r: 1 }, 'stream'),
    ], size)).toEqual([])
    expect(deriveEdgeCorners([
      ...sameType,
      edge(origin, { q: 1, r: -1 }),
    ], size)).toEqual([])
  })

  it('reports both bend mirror directions from local edge geometry', () => {
    const corners = ringNeighbors.map((neighbor, index) => deriveEdgeCorners([
      edge(origin, neighbor),
      edge(origin, ringNeighbors[(index + 1) % ringNeighbors.length]),
    ], size)[0])

    expect(corners).toHaveLength(6)
    expect(new Set(corners.map((corner) => corner.mirrored))).toEqual(new Set([true, false]))
  })
})