export type HexPoint = {
  x: number
  y: number
}

export type HexCoord = {
  q: number
  r: number
}

const SQRT_3 = Math.sqrt(3)

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

export function boardPixelSize(cells: ReadonlyArray<HexCoord>, size: number, padding: number) {
  const horizontalRadius = (SQRT_3 / 2) * size
  let maxCenterX = 0
  let maxCenterY = 0

  for (const coord of cells) {
    const center = axialToPixel(coord, size)
    if (center.x > maxCenterX) maxCenterX = center.x
    if (center.y > maxCenterY) maxCenterY = center.y
  }

  return {
    width: maxCenterX + horizontalRadius + padding * 2,
    height: maxCenterY + size + padding * 2,
  }
}
