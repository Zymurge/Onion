import type { BattlefieldOnionView, BattlefieldUnit } from './battlefieldView.js'
import { getBattlefieldPosition } from './battlefieldView.js'
import { resolveBattlefieldDisplayName } from './battlefieldNaming.js'
import { isSessionUnitTypeStackable, type SessionCatalog } from './sessionCatalog.js'
import { hexKey } from '../../shared/hex.js'

export type HexOccupant = BattlefieldUnit | BattlefieldOnionView

export type OccupantRosterGroup = {
  groupId: string
  unitIds: ReadonlyArray<string>
}

export type OccupantRosterIndex = {
  getUnitGroup: (unitId: string) => OccupantRosterGroup | null
}

/** Builds the visible occupant lookup keyed by battlefield hex. */
export function buildOccupantMap({
  onions,
  defenders,
}: {
  onions: ReadonlyArray<BattlefieldOnionView>
  defenders: ReadonlyArray<BattlefieldUnit>
}): Map<string, HexOccupant[]> {
  const occupantMap = new Map<string, HexOccupant[]>()

  for (const onion of onions) {
    const key = hexKey(getBattlefieldPosition(onion))
    occupantMap.set(key, [...(occupantMap.get(key) ?? []), onion])
  }

  for (const defender of defenders) {
    if (!shouldRenderDefender(defender)) {
      continue
    }

    const key = hexKey(getBattlefieldPosition(defender))
    occupantMap.set(key, [...(occupantMap.get(key) ?? []), defender])
  }

  return occupantMap
}

/** Returns the visual offset for one marker in a shared hex. */
export function getStackOffset(index: number, total: number): { dx: number; dy: number } {
  if (total <= 1) {
    return { dx: 0, dy: 0 }
  }

  if (total === 2) {
    return { dx: 0, dy: index === 0 ? -11 : 11 }
  }

  const radius = 11
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2
  return {
    dx: Math.round(Math.cos(angle) * radius),
    dy: Math.round(Math.sin(angle) * radius),
  }
}

/** Reports whether a defender remains visible on the battlefield. */
export function shouldRenderDefender(defender: BattlefieldUnit): boolean {
  return defender.status !== 'destroyed' || defender.type === 'Swamp'
}

/** Resolves the display label for a non-Swamp occupant marker. */
export function getUnitMarkerText(occupant: HexOccupant, stackNaming?: Parameters<typeof resolveBattlefieldDisplayName>[1]): string | null {
  if (occupant.type === 'Swamp') {
    return null
  }

  return resolveBattlefieldDisplayName(occupant, stackNaming)
}

/** Reports whether visible defenders require canonical roster grouping. */
export function hasStackedOccupants(
  defenders: ReadonlyArray<BattlefieldUnit>,
  catalog?: SessionCatalog,
): boolean {
  const stackedCountsByPosition = new Map<string, number>()

  for (const defender of defenders) {
    if (catalog === undefined || !isSessionUnitTypeStackable(catalog, defender.type)) {
      continue
    }

    if ((defender.squads ?? 1) > 1) {
      return true
    }

    const position = getBattlefieldPosition(defender)
    const key = `${defender.type}:${position.q},${position.r}`
    const nextCount = (stackedCountsByPosition.get(key) ?? 0) + 1
    stackedCountsByPosition.set(key, nextCount)
    if (nextCount > 1) {
      return true
    }
  }

  return false
}

/** Collapses roster members to one rendered marker per stack group. */
export function collapseStackedOccupants(
  occupants: ReadonlyArray<HexOccupant>,
  rosterIndex: OccupantRosterIndex | null,
): HexOccupant[] {
  const renderedOccupants: HexOccupant[] = []
  const renderedGroupIds = new Set<string>()

  for (const occupant of occupants) {
    const rosterGroup = rosterIndex?.getUnitGroup(occupant.id) ?? null

    if (rosterGroup !== null) {
      if (renderedGroupIds.has(rosterGroup.groupId)) {
        continue
      }

      renderedGroupIds.add(rosterGroup.groupId)
      const anchorUnitId = rosterGroup.unitIds.find((unitId) => occupants.some((candidate) => candidate.id === unitId)) ?? occupant.id
      renderedOccupants.push(occupants.find((candidate) => candidate.id === anchorUnitId) ?? occupant)
      continue
    }

    renderedOccupants.push(occupant)
  }

  return renderedOccupants
}

/** Resolves the roster-preferred occupant for a cell-level action. */
export function resolveCanonicalOccupant(
  occupants: ReadonlyArray<HexOccupant>,
  rosterIndex: OccupantRosterIndex | null,
): HexOccupant | undefined {
  for (const occupant of occupants) {
    const rosterGroup = rosterIndex?.getUnitGroup(occupant.id) ?? null

    if (rosterGroup === null) {
      return occupant
    }

    const anchorUnitId = rosterGroup.unitIds.find((unitId) => occupants.some((candidate) => candidate.id === unitId))
    if (anchorUnitId !== undefined) {
      return occupants.find((candidate) => candidate.id === anchorUnitId) ?? occupant
    }
  }

  return occupants[0]
}