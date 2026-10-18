import { describe, expect, it } from 'vitest'
import { resolveHexMapSpriteLayout } from '#web/lib/hexMapSpriteLayout'

describe('resolveHexMapSpriteLayout', () => {
  it('centers the sprite when offsets are omitted', () => {
    expect(resolveHexMapSpriteLayout(
      { hexMapScale: 0.5 },
      { x: 80, y: 90 },
      36,
    )).toEqual({
      x: 62,
      y: 72,
      width: 36,
      height: 36,
    })
  })

  it('applies percentage-point offsets from the hex center', () => {
    expect(resolveHexMapSpriteLayout(
      { hexMapScale: 0.5, hexMapOffsetX: -5, hexMapOffsetY: 10 },
      { x: 80, y: 90 },
      36,
    )).toEqual({
      x: 58.4,
      y: 64.8,
      width: 36,
      height: 36,
    })
  })

  it('moves negative X left and negative Y down', () => {
    expect(resolveHexMapSpriteLayout(
      { hexMapScale: 0.5, hexMapOffsetX: -5, hexMapOffsetY: -10 },
      { x: 80, y: 90 },
      36,
    )).toEqual({
      x: 58.4,
      y: 79.2,
      width: 36,
      height: 36,
    })
  })

  it('centers a full-hex sprite when both offsets are zero', () => {
    expect(resolveHexMapSpriteLayout(
      { hexMapScale: 1, hexMapOffsetX: 0, hexMapOffsetY: 0 },
      { x: 80, y: 90 },
      36,
    )).toEqual({
      x: 44,
      y: 54,
      width: 72,
      height: 72,
    })
  })

  it('allows scales above 1 and expands the sprite beyond the hex bounds', () => {
    expect(resolveHexMapSpriteLayout(
      { hexMapScale: 1.15 },
      { x: 80, y: 90 },
      36,
    )).toEqual({
      x: 38.6,
      y: 48.6,
      width: 82.8,
      height: 82.8,
    })
  })

  it('uses a safe default when a type has no map presentation settings', () => {
    expect(resolveHexMapSpriteLayout(undefined, { x: 36, y: 36 }, 36)).toEqual({
      x: 13.68,
      y: 13.68,
      width: 44.64,
      height: 44.64,
    })
  })

  it('rejects invalid hex sizes and sprite scales', () => {
    expect(() => resolveHexMapSpriteLayout(undefined, { x: 0, y: 0 }, 0)).toThrow(/Hex radius/)
    expect(() => resolveHexMapSpriteLayout(
      { hexMapScale: Number.POSITIVE_INFINITY },
      { x: 0, y: 0 },
      36,
    )).toThrow(/finite number greater than 0/)
  })
})
