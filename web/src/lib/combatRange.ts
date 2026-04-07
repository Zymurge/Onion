import { hexKey, hexesWithinRange } from '../../../src/shared/hex'

export type CombatRangeSource = {
  q: number
  r: number
  range: number
}

export type CombatRangeBounds = {
  width: number
  height: number
}

function inBounds(bounds: CombatRangeBounds | undefined, q: number, r: number): boolean {
  if (bounds === undefined) {
    return true
  }

  return q >= 0 && q < bounds.width && r >= 0 && r < bounds.height
}

export function buildCombatRangeHexKeys(sources: ReadonlyArray<CombatRangeSource>, bounds?: CombatRangeBounds): Set<string> {
  if (sources.length === 0) {
    return new Set()
  }

  let sharedHexKeys: Set<string> | null = null

  for (const source of sources) {
    const sourceHexKeys = new Set(
      hexesWithinRange({ q: source.q, r: source.r }, source.range)
        .filter((coord) => inBounds(bounds, coord.q, coord.r))
        .map(hexKey),
    )

    if (sharedHexKeys === null) {
      sharedHexKeys = sourceHexKeys
      continue
    }

    const nextSharedHexKeys = new Set<string>()
    for (const hexKeyValue of sharedHexKeys) {
      if (sourceHexKeys.has(hexKeyValue)) {
        nextSharedHexKeys.add(hexKeyValue)
      }
    }

    sharedHexKeys = nextSharedHexKeys
  }

  return sharedHexKeys ?? new Set()
}