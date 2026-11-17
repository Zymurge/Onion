import { describe, expect, it } from 'vitest'

import {
  deriveEdgeCorners,
  deriveEdgeTerminalCaps,
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
  it('validates hex size even when no edge endpoints are present', () => {
    expect(() => deriveEdgeCorners([], 0)).toThrow('Hex size must be a positive finite number')
    expect(() => deriveEdgeTerminalCaps([], 0)).toThrow('Hex size must be a positive finite number')
  })

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

  it('emits a corner only when exactly two same-type edges meet at a vertex', () => {
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
    ], size)).toHaveLength(2)
  })

  it('derives separate joins at shared vertices when a hex has three incident edges', () => {
    const streamEdges = [
      edge({ q: 2, r: 11 }, { q: 3, r: 11 }, 'stream'),
      edge({ q: 2, r: 12 }, { q: 3, r: 11 }, 'stream'),
      edge({ q: 3, r: 11 }, { q: 3, r: 12 }, 'stream'),
    ]

    expect(deriveEdgeCorners(streamEdges, size)).toHaveLength(2)
  })

  it('derives terrain-matched terminal caps only at vertices with one incident edge of that terrain', () => {
    const isolated = edge(origin, { q: 1, r: 0 }, 'stream')
    const isolatedCaps = deriveEdgeTerminalCaps([isolated], size)

    expect(isolatedCaps).toHaveLength(2)
    expect(isolatedCaps.map((cap) => cap.side)).toEqual(['start', 'end'])
    expect(isolatedCaps.every((cap) => cap.edgeKey === '0,0-1,0')).toBe(true)
    expect(isolatedCaps.every((cap) => cap.type === 'stream')).toBe(true)

    const isolatedRidgeCaps = deriveEdgeTerminalCaps([edge(origin, { q: 1, r: 0 })], size)
    expect(isolatedRidgeCaps).toHaveLength(2)
    expect(isolatedRidgeCaps.every((cap) => cap.type === 'ridge')).toBe(true)

    const connected = [
      isolated,
      edge(origin, { q: 0, r: 1 }, 'stream'),
    ]
    expect(deriveEdgeTerminalCaps(connected, size)).toHaveLength(2)

    const mixed = [isolated, edge(origin, { q: 0, r: 1 }, 'ridge')]
    const mixedCaps = deriveEdgeTerminalCaps(mixed, size)
    expect(mixedCaps.filter((cap) => cap.type === 'stream')).toHaveLength(2)
    expect(mixedCaps.filter((cap) => cap.type === 'ridge')).toHaveLength(2)
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