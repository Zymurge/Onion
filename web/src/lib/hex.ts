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

export function hexDistance(a: HexCoord, b: HexCoord): number {
  const dq = a.q - b.q
  const dr = a.r - b.r
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr))
}

export function hexesWithinRange(center: HexCoord, maxDistance: number, minDistance = 1): HexCoord[] {
  const normalizedMax = Math.floor(maxDistance)
  const normalizedMin = Math.max(0, Math.floor(minDistance))

  if (normalizedMax < normalizedMin || normalizedMax < 0) {
    return []
  }

  const hexes: HexCoord[] = []

  for (let dq = -normalizedMax; dq <= normalizedMax; dq += 1) {
    const minDr = Math.max(-normalizedMax, -dq - normalizedMax)
    const maxDr = Math.min(normalizedMax, -dq + normalizedMax)

    for (let dr = minDr; dr <= maxDr; dr += 1) {
      const candidate = { q: center.q + dq, r: center.r + dr }
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
