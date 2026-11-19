import { axialToPixel, type HexPoint } from './hexPixelLayout'
import { hexKey } from '../../shared/axialHex.js'
import type { ScenarioEdgeVariant, ScenarioTerrainEdge } from '../../shared/types/index.js'

export const DEFAULT_EDGE_ENDPOINT_INSET = 5
const EDGE_POINT_TOLERANCE = 0.000001

type BoundaryEndpoints = {
  start: HexPoint
  end: HexPoint
  center: HexPoint
}

export type EdgeSegmentGeometry = {
  boundary: BoundaryEndpoints
  start: HexPoint
  end: HexPoint
  angle: number
  length: number
}

export type EdgeCornerGeometry = {
  position: HexPoint
  angle: number
  mirrored: boolean
  type: ScenarioTerrainEdge['type']
  variants: [ScenarioEdgeVariant, ScenarioEdgeVariant]
  edgeKeys: [string, string]
}

export type EdgeJunctionGeometry = {
  position: HexPoint
  angle: number
  mirrored: boolean
  type: ScenarioTerrainEdge['type']
  variants: [ScenarioEdgeVariant, ScenarioEdgeVariant, ScenarioEdgeVariant]
  edgeKeys: [string, string, string]
}

export type EdgeTerminalCapGeometry = {
  position: HexPoint
  angle: number
  side: 'start' | 'end'
  edgeKey: string
  type: ScenarioTerrainEdge['type']
}

type BoundaryVertex = {
  position: HexPoint
  edgeIndexes: number[]
}

function assertPositiveHexSize(size: number): void {
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error('Hex size must be a positive finite number')
  }
}

function subtract(left: HexPoint, right: HexPoint): HexPoint {
  return { x: left.x - right.x, y: left.y - right.y }
}

function add(left: HexPoint, right: HexPoint): HexPoint {
  return { x: left.x + right.x, y: left.y + right.y }
}

function scale(point: HexPoint, factor: number): HexPoint {
  return { x: point.x * factor, y: point.y * factor }
}

function distance(left: HexPoint, right: HexPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y)
}

function midpoint(left: HexPoint, right: HexPoint): HexPoint {
  return scale(add(left, right), 0.5)
}

function normalizeLineAngle(angle: number): number {
  const normalized = angle % Math.PI
  return normalized < 0 ? normalized + Math.PI : normalized
}

/** Returns the two pixel coordinates of the shared boundary between an adjacent pair. */
export function edgeBoundaryEndpoints(edge: ScenarioTerrainEdge, size: number): BoundaryEndpoints {
  assertPositiveHexSize(size)

  const firstCenter = axialToPixel(edge.a, size)
  const secondCenter = axialToPixel(edge.b, size)
  const center = midpoint(firstCenter, secondCenter)
  const centerDelta = subtract(secondCenter, firstCenter)
  const centerDistance = Math.hypot(centerDelta.x, centerDelta.y)
  const tangent = {
    x: -centerDelta.y / centerDistance,
    y: centerDelta.x / centerDistance,
  }
  const halfBoundaryLength = size / 2

  return {
    start: add(center, scale(tangent, -halfBoundaryLength)),
    end: add(center, scale(tangent, halfBoundaryLength)),
    center,
  }
}

/** Returns the inset, drawable segment and its normalized line angle. */
export function edgeSegmentGeometry(
  edge: ScenarioTerrainEdge,
  size: number,
  inset = DEFAULT_EDGE_ENDPOINT_INSET,
): EdgeSegmentGeometry {
  const boundary = edgeBoundaryEndpoints(edge, size)
  const boundaryLength = distance(boundary.start, boundary.end)
  if (!Number.isFinite(inset) || inset < 0 || inset * 2 >= boundaryLength) {
    throw new Error('Edge endpoint inset must be non-negative and shorter than half the edge boundary')
  }

  const direction = scale(subtract(boundary.end, boundary.start), 1 / boundaryLength)
  const start = add(boundary.start, scale(direction, inset))
  const end = add(boundary.end, scale(direction, -inset))

  return {
    boundary,
    start,
    end,
    angle: normalizeLineAngle(Math.atan2(direction.y, direction.x)),
    length: distance(start, end),
  }
}

export function edgeIdentity(edge: ScenarioTerrainEdge): string {
  return `${hexKey(edge.a)}-${hexKey(edge.b)}`
}

function otherBoundaryPoint(boundary: BoundaryEndpoints, shared: HexPoint): HexPoint {
  return distance(boundary.start, shared) <= EDGE_POINT_TOLERANCE ? boundary.end : boundary.start
}

function collectEdgeBoundaryVertices(edges: ReadonlyArray<ScenarioTerrainEdge>, size: number) {
  assertPositiveHexSize(size)
  const boundaries = edges.map((edge) => edgeBoundaryEndpoints(edge, size))
  const vertices: BoundaryVertex[] = []

  boundaries.forEach((boundary, edgeIndex) => {
    for (const position of [boundary.start, boundary.end]) {
      const incident = vertices.find((vertex) => distance(vertex.position, position) <= EDGE_POINT_TOLERANCE)
      if (incident) {
        incident.edgeIndexes.push(edgeIndex)
      } else {
        vertices.push({ position, edgeIndexes: [edgeIndex] })
      }
    }
  })

  return { boundaries, vertices }
}

/** Derives a terminal overlay for each terrain edge endpoint not shared by another edge of that terrain. */
export function deriveEdgeTerminalCaps(
  edges: ReadonlyArray<ScenarioTerrainEdge>,
  size: number,
): EdgeTerminalCapGeometry[] {
  const { boundaries, vertices } = collectEdgeBoundaryVertices(edges, size)
  const terminals: EdgeTerminalCapGeometry[] = []

  for (const { position, edgeIndexes } of vertices) {
    for (const type of ['stream', 'ridge'] as const) {
      const terrainIndexes = edgeIndexes.filter((index) => edges[index].type === type)
      if (terrainIndexes.length !== 1) continue

      const edgeIndex = terrainIndexes[0]
      const edge = edges[edgeIndex]
      const boundary = boundaries[edgeIndex]
      const side = distance(boundary.start, position) <= EDGE_POINT_TOLERANCE ? 'start' : 'end'
      const segment = edgeSegmentGeometry(edge, size)

      terminals.push({
        position: side === 'start' ? segment.start : segment.end,
        angle: Math.atan2(segment.end.y - segment.start.y, segment.end.x - segment.start.x),
        side,
        edgeKey: edgeIdentity(edge),
        type,
      })
    }
  }

  return terminals
}

/** Derives same-terrain junction overlays from exactly three canonical edges at one vertex. */
export function deriveJunctionAngle(vectors: ReadonlyArray<HexPoint>): number {
  const normalizeAngle = (angle: number) => (angle + 360) % 360
  const circularDistance = (left: number, right: number) => {
    const difference = Math.abs(normalizeAngle(left) - normalizeAngle(right))
    return Math.min(difference, 360 - difference)
  }
  const baseDirections = [210, 90, 330]

  let bestAngle = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let offset = 0; offset < 360; offset += 30) {
    const candidates = baseDirections.map((direction) => normalizeAngle(direction + offset))
    const distance = vectors.reduce((total, vector) => {
      const actual = normalizeAngle(Math.atan2(vector.y, vector.x) * (180 / Math.PI))
      return total + Math.min(...candidates.map((candidate) => circularDistance(actual, candidate)))
    }, 0)

    if (distance < bestDistance - EDGE_POINT_TOLERANCE) {
      bestDistance = distance
      bestAngle = offset
    }
  }

  return bestAngle
}

export function deriveEdgeJunctions(
  edges: ReadonlyArray<ScenarioTerrainEdge>,
  size: number,
): EdgeJunctionGeometry[] {
  const { boundaries, vertices } = collectEdgeBoundaryVertices(edges, size)

  const junctions: EdgeJunctionGeometry[] = []
  for (const { position, edgeIndexes } of vertices) {
    if (edgeIndexes.length !== 3) continue

    const sortedIndexes = [...edgeIndexes].sort((left, right) =>
      edgeIdentity(edges[left]).localeCompare(edgeIdentity(edges[right])),
    )
    const terrainType = edges[sortedIndexes[0]].type
    if (sortedIndexes.some((edgeIndex) => edges[edgeIndex].type !== terrainType)) continue

    const vectors = sortedIndexes.map((edgeIndex) =>
      subtract(otherBoundaryPoint(boundaries[edgeIndex], position), position),
    )
    const angle = deriveJunctionAngle(vectors)
    const mirrored = false

    junctions.push({
      position,
      angle,
      mirrored,
      type: terrainType,
      variants: sortedIndexes.map((edgeIndex) => edges[edgeIndex].variant) as [ScenarioEdgeVariant, ScenarioEdgeVariant, ScenarioEdgeVariant],
      edgeKeys: sortedIndexes.map((edgeIndex) => edgeIdentity(edges[edgeIndex])) as [string, string, string],
    })
  }

  return junctions
}

export function deriveEdgeCorners(
  edges: ReadonlyArray<ScenarioTerrainEdge>,
  size: number,
): EdgeCornerGeometry[] {
  const { boundaries, vertices } = collectEdgeBoundaryVertices(edges, size)

  const corners: EdgeCornerGeometry[] = []
  for (const { position, edgeIndexes } of vertices) {
    if (edgeIndexes.length !== 2) continue

    let [leftIndex, rightIndex] = edgeIndexes
    if (edgeIdentity(edges[leftIndex]) > edgeIdentity(edges[rightIndex])) {
      ;[leftIndex, rightIndex] = [rightIndex, leftIndex]
    }

    const leftEdge = edges[leftIndex]
    const rightEdge = edges[rightIndex]
    if (leftEdge.type !== rightEdge.type) continue

    const leftVector = subtract(otherBoundaryPoint(boundaries[leftIndex], position), position)
    const rightVector = subtract(otherBoundaryPoint(boundaries[rightIndex], position), position)
    const cross = leftVector.x * rightVector.y - leftVector.y * rightVector.x
    if (Math.abs(cross) <= EDGE_POINT_TOLERANCE) continue

    const bisector = add(leftVector, rightVector)
    const edgeKeys = [edgeIdentity(leftEdge), edgeIdentity(rightEdge)] as [string, string]
    const variants = [leftEdge.variant, rightEdge.variant] as [ScenarioEdgeVariant, ScenarioEdgeVariant]

    corners.push({
      position,
      angle: Math.atan2(bisector.y, bisector.x),
      mirrored: cross < 0,
      type: leftEdge.type,
      variants,
      edgeKeys,
    })
  }

  return corners
}
