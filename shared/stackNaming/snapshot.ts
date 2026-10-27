import type { StackRosterState } from '../types/index.js'
import {
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
): StackNamingSnapshot {
	const sourceUnitById = new Map(sourceUnits.map((unit) => [unit.unitId, unit]))
	const activeGroupIds: string[] = []
	const rosterGroupsInUse: StackNamingGroupRecord[] = []
	const rosterUsedGroupNames: string[] = []
	const allocatedUsedGroupNames = new Set(seed?.usedGroupNames ?? [])

	for (const [groupId, group] of Object.entries(stackRoster?.groupsById ?? {})) {
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

		activeGroupIds.push(groupId)
		const persistedGroupName = group.groupName?.trim() ?? ''
		const hasPersistedGroupName = persistedGroupName.length > 0 && !isLegacyCoordinateGroupName(persistedGroupName)
		const baseGroupName = hasPersistedGroupName
			? persistedGroupName
			: resolveStackLabel(group.unitType, firstUnit.unitId, firstUnit.friendlyName, unitIds.length)
		const authoritativeGroupName = hasPersistedGroupName
			? baseGroupName
			: createUniqueName(baseGroupName, allocatedUsedGroupNames)
		allocatedUsedGroupNames.add(authoritativeGroupName)
		rosterGroupsInUse.push({ groupId, groupName: authoritativeGroupName, unitType: group.unitType })
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
	engine.clearMissingGroups(activeGroupIds)
	return engine.snapshot()
}