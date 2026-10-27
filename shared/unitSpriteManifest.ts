export const SUPPORTED_UNIT_SPRITE_KEYS = [
  'puss',
  'big-bad-wolf',
  'witch',
  'farquaad',
  'pinocchio',
  'dragon',
  'little-pigs',
  'the-onion',
  'the-onion-damaged',
  'swamp',
] as const

export type UnitSpriteKey = typeof SUPPORTED_UNIT_SPRITE_KEYS[number]

const supportedUnitSpriteKeys = new Set<string>(SUPPORTED_UNIT_SPRITE_KEYS)

export function isSupportedUnitSpriteKey(value: unknown): value is UnitSpriteKey {
  return typeof value === 'string' && supportedUnitSpriteKeys.has(value)
}

export function assertSupportedUnitSpriteKey(value: unknown, unitTypeId: string): void {
  if (value !== undefined && !isSupportedUnitSpriteKey(value)) {
    throw new Error(`Invalid spriteKey for unit type ${unitTypeId}: ${String(value)}`)
  }
}