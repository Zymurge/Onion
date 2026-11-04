import type { StackRosterState } from '../types/index.js'
import { createStackNamingEngine } from './engine.js'
import type { StackNamingSnapshot, StackNamingSourceUnit } from './types.js'

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
	const engine = createStackNamingEngine(seed)

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
		engine.resolveGroupName(groupId, group.unitType, firstUnit.unitId, firstUnit.friendlyName, unitIds.length)
	}

	engine.clearMissingGroups(activeGroupIds)
	return engine.snapshot()
}