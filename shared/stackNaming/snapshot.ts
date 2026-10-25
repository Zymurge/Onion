import type { StackRosterState } from '../types/index.js'
import { isUnitTypeStackable } from '../unitDefinitions.js'
import {
	buildStackGroupKey,
	createUniqueName,
	isLegacyCoordinateGroupName,
	resolveStackLabel,
} from './labels.js'
import { createStackNamingEngine } from './engine.js'
import type { StackNamingGroupRecord, StackNamingSnapshot, StackNamingSourceUnit } from './types.js'

/**
 * Refresh naming from the authoritative roster and flat source-unit records.
 * Missing roster groups are removed from the active snapshot while their
 * allocated names remain in usedGroupNames and are not recycled.
 */
export function refreshStackNamingSnapshotFromRoster(
	seed: StackNamingSnapshot | undefined,
	stackRoster: StackRosterState | undefined,
	sourceUnits: ReadonlyArray<StackNamingSourceUnit>,
	unitTypes?: Readonly<Record<string, { stackable?: boolean }>>,
): StackNamingSnapshot {
	const sourceUnitById = new Map(sourceUnits.map((unit) => [unit.unitId, unit]))
	const activeGroupKeys: string[] = []
	const rosterGroupsInUse: StackNamingGroupRecord[] = []
	const rosterUsedGroupNames: string[] = []
	const allocatedUsedGroupNames = new Set(seed?.usedGroupNames ?? [])

	for (const group of Object.values(stackRoster?.groupsById ?? {})) {
		const unitIds = [...group.unitIds]
		if (unitIds.length === 0) {
			continue
		}

		if (unitIds.length <= 1) {
			continue
		}

		const firstUnit = sourceUnitById.get(unitIds[0])
		if (firstUnit === undefined) {
			continue
		}

		const groupKey = buildStackGroupKey(group.unitType, group.position)
		activeGroupKeys.push(groupKey)
		const persistedGroupName = group.groupName?.trim() ?? ''
		const hasPersistedGroupName = persistedGroupName.length > 0 && !isLegacyCoordinateGroupName(persistedGroupName)
		const baseGroupName = hasPersistedGroupName
			? persistedGroupName
			: resolveStackLabel(group.unitType, firstUnit.unitId, firstUnit.friendlyName, unitIds.length)
		const authoritativeGroupName = hasPersistedGroupName
			? baseGroupName
			: createUniqueName(baseGroupName, allocatedUsedGroupNames)
		allocatedUsedGroupNames.add(authoritativeGroupName)
		rosterGroupsInUse.push({ groupKey, groupName: authoritativeGroupName, unitType: group.unitType })
		rosterUsedGroupNames.push(authoritativeGroupName)
	}

	const engine = createStackNamingEngine({
		...seed,
		groupsInUse: [
			...(seed?.groupsInUse ?? []),
			...rosterGroupsInUse,
		],
		usedGroupNames: [
			...(seed?.usedGroupNames ?? []),
			...rosterUsedGroupNames,
		],
	})
	engine.clearMissingGroups(activeGroupKeys)
	return engine.snapshot()
}