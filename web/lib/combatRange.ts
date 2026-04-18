import { hexKey, hexesWithinRange } from '../../shared/hex'

export type CombatRangeSource = {
  q: number
  r: number
  range: number
}

export type CombatRangeBounds = {
  width: number
  height: number
  cells: Array<{ q: number; r: number }>
}

function buildBoundsLookup(bounds: CombatRangeBounds | undefined): Set<string> | null {
  if (bounds === undefined) {
    return null
  }

  return new Set(bounds.cells.map(hexKey))
}

function inBounds(boundsLookup: Set<string> | null, q: number, r: number): boolean {
  if (boundsLookup === null) {
    return true
  }

  return boundsLookup.has(hexKey({ q, r }))
}

export function buildCombatRangeHexKeys(sources: ReadonlyArray<CombatRangeSource>, bounds?: CombatRangeBounds): Set<string> {
  if (sources.length === 0) {
    return new Set()
  }

  const boundsLookup = buildBoundsLookup(bounds)
  let sharedHexKeys: Set<string> | null = null

  for (const source of sources) {
    const sourceHexKeys = new Set(
      hexesWithinRange({ q: source.q, r: source.r }, source.range, 0)
        .filter((coord) => inBounds(boundsLookup, coord.q, coord.r))
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