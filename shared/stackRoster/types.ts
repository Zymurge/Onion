import type { DefenderMap, HexPos, StackRosterGroupState, StackRosterState, StackRosterUnitState } from '../types/index.js'

/** Minimal defender record used to construct canonical stack groups. */
export type StackRosterSourceUnit = {
	unitId: string
	typeId: string
	position: HexPos
	state: StackRosterUnitState['state']
	friendlyName?: string
	squads?: number
	weapons?: StackRosterUnitState['weapons']
}

/** Structural validation finding for a persisted roster. */
export type StackRosterValidationIssue = {
	code:
		| 'EMPTY_GROUP'
		| 'EMPTY_UNIT_ID'
		| 'EMPTY_GROUP_NAME'
		| 'EMPTY_UNIT_TYPE'
		| 'INVALID_POSITION'
		| 'DUPLICATE_UNIT_ID'
	message: string
	groupId: string
	unitId?: string
}

/** Consistency finding between roster groups and live defenders. */
export type StackRosterConsistencyIssue = {
	code:
		| 'GROUP_MEMBER_NOT_FOUND'
		| 'GROUP_MEMBER_TYPE_MISMATCH'
		| 'GROUP_MEMBER_POSITION_MISMATCH'
		| 'MEMBER_IN_MULTIPLE_GROUPS'
		| 'STACKABLE_DEFENDER_MISSING_GROUP'
		| 'NON_STACKABLE_GROUP'
	message: string
	groupId: string
	unitId?: string
}

/** Input for splitting selected members into a new roster group. */
export type SplitStackRosterGroupInput = {
	groupId: string
	newGroupId: string
	newGroupName: string
	movedUnitIds: string[]
	newPosition?: HexPos
}

/** Input for moving selected members between roster groups. */
export type MoveStackRosterGroupInput = {
	sourceGroupId: string
	destinationGroupId: string
	destinationGroupName: string
	movedUnitIds: string[]
	destinationPosition: HexPos
}

/** Input for relocating selected units to a canonical destination group. */
export type RelocateStackRosterUnitsInput = {
	movedUnitIds: string[]
	unitType: string
	destinationPosition: HexPos
	destinationGroupName: string
}

/** Inputs needed to reconcile a move with roster and naming lifecycle state. */
export type ReconcileStackRosterMoveLifecycleInput = {
	stackRoster: StackRosterState | undefined
	stackNaming: StackNamingSnapshot | undefined
	defenders: DefenderMap | undefined
	movedUnitId: string
	movedUnitIds?: ReadonlyArray<string>
	unitType: string
	destinationPosition: HexPos
	movedUnitFriendlyName?: string
}

/** Canonical roster and naming state returned after move reconciliation. */
export type ReconcileStackRosterMoveLifecycleResult = {
	stackRoster: StackRosterState
	stackNaming: StackNamingSnapshot
	destinationGroupId: string
	destinationGroupName: string
	selectedNameSource:
		| 'persisted-stack-naming'
		| 'allocated-destination-group'
		| 'destination-roster-group'
		| 'source-roster-group'
		| 'defender-friendly-name'
		| 'unit-type-fallback'
}

/** Derived unit view enriched with its canonical group context. */
export type StackRosterUnitView = StackRosterUnitState & {
	groupId: string
	groupKey: string
	unitType: string
	position: HexPos
}

/** Derived group view containing resolved unit records. */
export type StackRosterGroupView = StackRosterGroupState & {
	groupId: string
	groupKey: string
	unitIds: string[]
	units: StackRosterUnitView[]
}

/** Read-only derived lookup over persisted roster groups and live defenders. */
export type StackRosterIndex = {
	groupsById: Record<string, StackRosterGroupView>
	/** Derived unit lookup; this is not part of the persisted roster shape. */
	derivedUnitsById: Record<string, StackRosterUnitView>
	getGroupUnits(groupId: string): StackRosterUnitView[]
	getUnitGroup(unitId: string): StackRosterGroupView | null
}

/** Re-export shared state primitives used by roster contracts. */
export type { DefenderMap, HexPos, StackRosterGroupState, StackRosterState, StackRosterUnitState }

// Imported here only to keep the lifecycle input contract self-contained.
import type { StackNamingSnapshot } from '../stackNaming/index.js'