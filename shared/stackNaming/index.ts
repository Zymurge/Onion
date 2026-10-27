/** Public stack naming contract and lifecycle entry point. */
/** Naming records, snapshots, and source-unit contracts. */
export type {
	StackNamingGroupRecord,
	StackNamingSeed,
	StackNamingSnapshot,
	StackNamingSourceUnit,
} from './types.js'

export {
	/** Stateless label helpers. */
	resolveStackLabel,
	resolveStackUnitName,
} from './labels.js'
export { createStackNamingEngine, StackNamingEngine } from './engine.js'
export { refreshStackNamingSnapshotFromRoster } from './snapshot.js'

/** Stateful naming allocation and snapshot construction. */
import { createStackNamingEngine } from './engine.js'
/** Refresh naming state from the canonical roster and live units. */
import type { StackNamingSnapshot } from './types.js'

/** Resolve a stack label using a prior naming snapshot when one exists. */
export function resolveStackLabelFromSnapshot(
	seed: StackNamingSnapshot | undefined,
	groupId: string,
	unitType: string,
	unitId?: string,
	friendlyName?: string,
	stackSize = 1,
): string {
	return createStackNamingEngine(seed).resolveGroupName(groupId, unitType, unitId, friendlyName, stackSize)
}