export type HexPoint = {
  x: number
  y: number
}

export type HexCoord = {
  q: number
  r: number
}

const SQRT_3 = Math.sqrt(3)

export function hexKey({ q, r }: HexCoord): string {
  return `${q},${r}`
}

function oddROffsetToCube({ q, r }: HexCoord) {
  const x = q - ((r - (r & 1)) / 2)
  const z = r
  const y = -x - z

  return { x, y, z }
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  const left = oddROffsetToCube(a)
  const right = oddROffsetToCube(b)

  return Math.max(
    Math.abs(left.x - right.x),
    Math.abs(left.y - right.y),
    Math.abs(left.z - right.z),
  )
}

export function hexesWithinRange(center: HexCoord, maxDistance: number, minDistance = 1): HexCoord[] {
  const normalizedMax = Math.floor(maxDistance)
  const normalizedMin = Math.max(0, Math.floor(minDistance))

  if (normalizedMax < normalizedMin || normalizedMax < 0) {
    return []
  }

  const hexes: HexCoord[] = []

  for (let q = center.q - normalizedMax; q <= center.q + normalizedMax; q += 1) {
    for (let r = center.r - normalizedMax; r <= center.r + normalizedMax; r += 1) {
      const candidate = { q, r }
      const distance = hexDistance(center, candidate)

      if (distance < normalizedMin || distance > normalizedMax) {
        continue
      }

      hexes.push(candidate)
    }
  }

  hexes.sort((left, right) => {
    const distanceDelta = hexDistance(center, left) - hexDistance(center, right)

    if (distanceDelta !== 0) {
      return distanceDelta
    }

    if (left.q !== right.q) {
      return left.q - right.q
    }

    return left.r - right.r
  })

  return hexes
}

export function axialToPixel({ q, r }: HexCoord, size: number): HexPoint {
  return {
    x: size * SQRT_3 * (q + (r & 1 ? 0.5 : 0)),
    y: size * 1.5 * r,
  }
}

export function hexCorners(center: HexPoint, size: number): HexPoint[] {
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index - 30)
    return {
      x: center.x + size * Math.cos(angle),
      y: center.y + size * Math.sin(angle),
    }
  })
}

export function pointsToString(points: HexPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ')
}

export function boardPixelSize(width: number, height: number, size: number, padding: number) {
  const horizontalRadius = (SQRT_3 / 2) * size
  let maxCenterX = 0
  let maxCenterY = 0

  for (let r = 0; r < height; r += 1) {
    for (let q = 0; q < width; q += 1) {
      const center = axialToPixel({ q, r }, size)
      if (center.x > maxCenterX) maxCenterX = center.x
      if (center.y > maxCenterY) maxCenterY = center.y
    }
  }

  return {
    width: maxCenterX + horizontalRadius + padding * 2,
    height: maxCenterY + size + padding * 2,
  }
}
