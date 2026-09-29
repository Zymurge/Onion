import { getUnitTypeCatalog } from '../unitDefinitions.js'
import type { DefenderMap, HexPos, StackRosterGroupState } from '../types/index.js'

const UNIT_TYPE_CATALOG = getUnitTypeCatalog()

/** Return the catalog-defined squad count for a unit type. */
export function getStaticSquadCount(unitType: string): number | undefined {
	return UNIT_TYPE_CATALOG[unitType]?.squads
}

/** Determine whether a unit type belongs in stack roster groups. */
export function isStackRosterUnitType(unitType: string): boolean {
	return UNIT_TYPE_CATALOG[unitType as keyof typeof UNIT_TYPE_CATALOG]?.stackable === true
}

/** Read and copy the canonical member ids from a roster group. */
export function resolveGroupUnitIds(group: StackRosterGroupState): string[] {
	if (!Array.isArray(group.unitIds)) {
		throw new Error('Invalid stack roster group shape')
	}

	return [...group.unitIds]
}

/** Index defenders by map key, canonical unit id, and legacy id when present. */
export function buildDefenderLookup(defenders: DefenderMap | undefined): DefenderMap {
	const lookup: Record<string, DefenderMap[string]> = {}
	for (const [defenderKey, defender] of Object.entries(defenders ?? {})) {
		lookup[defenderKey] = defender
		if (defender !== null && typeof defender === 'object') {
			if (typeof defender.unitId === 'string') {
				lookup[defender.unitId] = defender
			}
			if ('id' in defender && typeof defender.id === 'string') {
				lookup[defender.id] = defender
			}
		}
	}

	return lookup as DefenderMap
}

/** Check whether an unknown value has the persisted roster group shape. */
export function isStackRosterGroupState(candidate: unknown): candidate is StackRosterGroupState {
	if (candidate === null || typeof candidate !== 'object') {
		return false
	}

	const group = candidate as StackRosterGroupState
	return typeof group.groupName === 'string'
		&& typeof group.unitType === 'string'
		&& typeof group.position === 'object'
		&& group.position !== null
		&& Array.isArray(group.unitIds)
}

/** Validate and return a persisted roster group for derived indexing. */
export function normalizeStackRosterGroup(groupId: string, candidate: unknown): StackRosterGroupState {
	if (!isStackRosterGroupState(candidate)) {
		throw new Error(`Invalid stack roster group shape for ${groupId}`)
	}

	return candidate
}

/** Check whether both coordinates in a hex position are finite numbers. */
export function isValidPosition(position: HexPos): boolean {
	return Number.isFinite(position.q) && Number.isFinite(position.r)
}