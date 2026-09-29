import {
	createUniqueName,
	resolveStackLabel,
	resolveStackUnitName,
	stripOrdinalSuffix,
} from './labels.js'
import type { StackNamingSeed, StackNamingSnapshot } from './types.js'

/** Stateful allocator that preserves active and retired stack group names. */
export class StackNamingEngine {
	private readonly usedGroupNames: Set<string>
	private readonly groupsInUse: Map<string, { groupKey: string; groupName: string; unitType: string }>

	constructor(seed?: StackNamingSeed) {
		this.usedGroupNames = new Set(seed?.usedGroupNames ?? [])
		this.groupsInUse = new Map((seed?.groupsInUse ?? []).map((record) => [record.groupKey, { ...record }]))
	}

	/** Resolve a unit display name using the catalog and optional friendly name. */
	resolveUnitName(unitType: string, unitId: string | undefined, friendlyName?: string): string {
		return resolveStackUnitName(unitType, unitId, friendlyName)
	}

	/** Resolve or allocate the stable display name for a group key. */
	resolveGroupName(groupKey: string, unitType: string, unitId?: string, friendlyName?: string, stackSize = 1): string {
		const existingRecord = this.groupsInUse.get(groupKey)
		if (existingRecord !== undefined) {
			if (/\sgroup(?:\s+\d+)?$/i.test(existingRecord.groupName)) {
				const ordinalUsed = [...this.usedGroupNames].find((used) => /\sgroup\s+\d+$/.test(used) && stripOrdinalSuffix(used) === existingRecord.groupName)
				if (ordinalUsed !== undefined) {
					return ordinalUsed
				}
			}

			return existingRecord.groupName
		}

		const baseName = resolveStackLabel(unitType, unitId, friendlyName, stackSize)
		const groupName = stackSize > 1 || /\sgroup(?:\s+\d+)?$/i.test(baseName)
			? createUniqueName(baseName, this.usedGroupNames)
			: baseName

		this.groupsInUse.set(groupKey, { groupKey, groupName, unitType })
		return groupName
	}

	/** Stop tracking an active group while retaining its allocated name history. */
	releaseGroup(groupKey: string): void {
		this.groupsInUse.delete(groupKey)
	}

	/** Remove inactive groups from the active snapshot without recycling names. */
	clearMissingGroups(activeGroupKeys: ReadonlyArray<string>): void {
		const activeGroupKeySet = new Set(activeGroupKeys)
		for (const groupKey of this.groupsInUse.keys()) {
			if (!activeGroupKeySet.has(groupKey)) {
				this.groupsInUse.delete(groupKey)
			}
		}
	}

	/** Return a serializable copy of the engine's active and retired names. */
	snapshot(): StackNamingSnapshot {
		return {
			groupsInUse: [...this.groupsInUse.values()],
			usedGroupNames: [...this.usedGroupNames],
		}
	}
}

/** Create a naming engine initialized from an optional persisted snapshot. */
export function createStackNamingEngine(seed?: StackNamingSeed): StackNamingEngine {
	return new StackNamingEngine(seed)
}