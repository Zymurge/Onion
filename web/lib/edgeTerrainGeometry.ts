import { axialToPixel, type HexPoint } from './hexPixelLayout'
import { hexKey } from '../../shared/axialHex.js'
import type { HexPos, ScenarioEdgeVariant, ScenarioTerrainEdge } from '../../shared/types/index.js'

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
  cell: HexPos
  position: HexPoint
  angle: number
  mirrored: boolean
  type: ScenarioTerrainEdge['type']
  variants: [ScenarioEdgeVariant, ScenarioEdgeVariant]
  edgeKeys: [string, string]
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

function findSharedBoundaryPoint(left: BoundaryEndpoints, right: BoundaryEndpoints): HexPoint | undefined {
  const leftPoints = [left.start, left.end]
  const rightPoints = [right.start, right.end]

  for (const leftPoint of leftPoints) {
    for (const rightPoint of rightPoints) {
      if (distance(leftPoint, rightPoint) <= EDGE_POINT_TOLERANCE) {
        return midpoint(leftPoint, rightPoint)
      }
    }
  }

  return undefined
}

function otherBoundaryPoint(boundary: BoundaryEndpoints, shared: HexPoint): HexPoint {
  return distance(boundary.start, shared) <= EDGE_POINT_TOLERANCE ? boundary.end : boundary.start
}

/** Derives same-terrain corner overlays from exactly two incident canonical edges. */
export function deriveEdgeCorners(
  edges: ReadonlyArray<ScenarioTerrainEdge>,
  size: number,
): EdgeCornerGeometry[] {
  assertPositiveHexSize(size)

  const boundaries = edges.map((edge) => edgeBoundaryEndpoints(edge, size))
  const cells = new Map<string, { cell: HexPos; edgeIndexes: number[] }>()

  edges.forEach((edge, edgeIndex) => {
    for (const cell of [edge.a, edge.b]) {
      const key = hexKey(cell)
      const incident = cells.get(key)
      if (incident) {
        incident.edgeIndexes.push(edgeIndex)
      } else {
        cells.set(key, { cell, edgeIndexes: [edgeIndex] })
      }
    }
  })

  const corners: EdgeCornerGeometry[] = []
  for (const { cell, edgeIndexes } of cells.values()) {
    if (edgeIndexes.length !== 2) continue

    let [leftIndex, rightIndex] = edgeIndexes
    if (edgeIdentity(edges[leftIndex]) > edgeIdentity(edges[rightIndex])) {
      ;[leftIndex, rightIndex] = [rightIndex, leftIndex]
    }

    const leftEdge = edges[leftIndex]
    const rightEdge = edges[rightIndex]
    if (leftEdge.type !== rightEdge.type) continue

    const position = findSharedBoundaryPoint(boundaries[leftIndex], boundaries[rightIndex])
    if (!position) continue

    const leftVector = subtract(otherBoundaryPoint(boundaries[leftIndex], position), position)
    const rightVector = subtract(otherBoundaryPoint(boundaries[rightIndex], position), position)
    const cross = leftVector.x * rightVector.y - leftVector.y * rightVector.x
    if (Math.abs(cross) <= EDGE_POINT_TOLERANCE) continue

    const bisector = add(leftVector, rightVector)
    const edgeKeys = [edgeIdentity(leftEdge), edgeIdentity(rightEdge)] as [string, string]
    const variants = [leftEdge.variant, rightEdge.variant] as [ScenarioEdgeVariant, ScenarioEdgeVariant]

    corners.push({
      cell,
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
