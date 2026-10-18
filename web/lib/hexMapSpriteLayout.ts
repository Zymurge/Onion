import type { UnitTypeBase } from '../../shared/types/index'

export type HexMapSpriteLayout = {
  x: number
  y: number
  width: number
  height: number
}

const DEFAULT_SPRITE_SCALE = 0.62
export function resolveHexMapSpriteLayout(
  unitType: Pick<UnitTypeBase, 'hexMapScale' | 'hexMapOffsetX' | 'hexMapOffsetY'> | undefined,
  center: { x: number; y: number },
  hexRadius: number,
): HexMapSpriteLayout {
  if (!Number.isFinite(hexRadius) || hexRadius <= 0) {
    throw new Error('Hex radius must be a finite number greater than 0')
  }

  const scale = unitType?.hexMapScale ?? DEFAULT_SPRITE_SCALE
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error('Hex map sprite scale must be a finite number greater than 0')
  }

  const offsetX = unitType?.hexMapOffsetX ?? 0
  const offsetY = unitType?.hexMapOffsetY ?? 0
  if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) {
    throw new Error('Hex map sprite offsets must be finite numbers')
  }

  const size = hexRadius * 2 * scale
  const hexDiameter = hexRadius * 2

  return {
    x: center.x - size / 2 + offsetX / 100 * hexDiameter,
    y: center.y - size / 2 - offsetY / 100 * hexDiameter,
    width: size,
    height: size,
  }
}
