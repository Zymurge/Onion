import {
	formatStackGroupName,
	resolveStackLabel,
	resolveStackUnitName,
} from './labels.js'
import type { StackNamingSeed, StackNamingSnapshot } from './types.js'

const CANONICAL_GROUP_ID_PATTERN = /^group-[1-9]\d*$/
const CANONICAL_GROUP_NAME_PATTERN = /^Group ([1-9]\d*) - \[(.+)\]$/

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
		const usedGroupNames = seed?.usedGroupNames ?? []
		for (const groupName of usedGroupNames) {
			if (!CANONICAL_GROUP_NAME_PATTERN.test(groupName)) {
				throw new Error(`Used group name ${groupName} must be canonical`)
			}
		}

		for (const record of seed?.groupsInUse ?? []) {
			assertCanonicalGroupId(record.groupId)
			const ordinal = record.groupId.slice('group-'.length)
			const canonicalGroupName = formatStackGroupName(ordinal, record.unitType, undefined, undefined, record.groupName)
			if (record.groupName !== canonicalGroupName) {
				throw new Error(`Group ${record.groupId} must use a canonical group name`)
			}
		}

		this.usedGroupNames = new Set(usedGroupNames)
		this.groupsInUse = new Map((seed?.groupsInUse ?? []).map((record) => [record.groupId, { ...record }]))
		for (const record of this.groupsInUse.values()) {
			this.usedGroupNames.add(record.groupName)
		}
	}

	/** Resolve a unit display name using the catalog and optional friendly name. */
	resolveUnitName(unitType: string, unitId: string | undefined, friendlyName?: string): string {
		return resolveStackUnitName(unitType, unitId, friendlyName)
	}

	/** Resolve or allocate the stable display name for a group identity. */
	resolveGroupName(groupId: string, unitType: string, unitId?: string, friendlyName?: string, stackSize = 1): string {
		assertCanonicalGroupId(groupId)
		const existingRecord = this.groupsInUse.get(groupId)
		const baseName = resolveStackLabel(unitType, unitId, friendlyName, stackSize)
		const isGroup = existingRecord !== undefined || stackSize > 1 || /\sgroup(?:\s+\d+)?$/i.test(baseName)
		const groupName = isGroup
			? formatStackGroupName(groupId.slice('group-'.length), unitType, unitId, friendlyName, existingRecord?.groupName)
			: baseName

		if (isGroup) {
			this.usedGroupNames.add(groupName)
		}
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