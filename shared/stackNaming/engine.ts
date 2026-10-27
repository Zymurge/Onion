import {
	createUniqueName,
	resolveStackLabel,
	resolveStackUnitName,
	stripOrdinalSuffix,
} from './labels.js'
import type { StackNamingSeed, StackNamingSnapshot } from './types.js'

const CANONICAL_GROUP_ID_PATTERN = /^group-[1-9]\d*$/

function assertCanonicalGroupId(groupId: string): void {
	if (!CANONICAL_GROUP_ID_PATTERN.test(groupId)) {
		throw new Error(`Group ${groupId} must use a canonical group ID`)
	}
}

/** Stateful allocator that preserves active and retired stack group names. */
export class StackNamingEngine {
	private readonly usedGroupNames: Set<string>
	private readonly groupsInUse: Map<string, { groupId: string; groupName: string; unitType: string }>

	constructor(seed?: StackNamingSeed) {
		for (const record of seed?.groupsInUse ?? []) {
			assertCanonicalGroupId(record.groupId)
		}

		this.usedGroupNames = new Set(seed?.usedGroupNames ?? [])
		this.groupsInUse = new Map((seed?.groupsInUse ?? []).map((record) => [record.groupId, { ...record }]))
	}

	/** Resolve a unit display name using the catalog and optional friendly name. */
	resolveUnitName(unitType: string, unitId: string | undefined, friendlyName?: string): string {
		return resolveStackUnitName(unitType, unitId, friendlyName)
	}

	/** Resolve or allocate the stable display name for a group identity. */
	resolveGroupName(groupId: string, unitType: string, unitId?: string, friendlyName?: string, stackSize = 1): string {
		assertCanonicalGroupId(groupId)
		const existingRecord = this.groupsInUse.get(groupId)
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

		this.groupsInUse.set(groupId, { groupId, groupName, unitType })
		return groupName
	}

	/** Stop tracking an active group while retaining its allocated name history. */
	releaseGroup(groupId: string): void {
		assertCanonicalGroupId(groupId)
		this.groupsInUse.delete(groupId)
	}

	/** Remove inactive groups from the active snapshot without recycling names. */
	clearMissingGroups(activeGroupIds: ReadonlyArray<string>): void {
		for (const groupId of activeGroupIds) {
			assertCanonicalGroupId(groupId)
		}

		const activeGroupIdSet = new Set(activeGroupIds)
		for (const groupId of this.groupsInUse.keys()) {
			if (!activeGroupIdSet.has(groupId)) {
				this.groupsInUse.delete(groupId)
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