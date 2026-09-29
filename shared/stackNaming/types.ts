/** Active group name tracked for a canonical type-and-position key. */
export type StackNamingGroupRecord = {
	groupKey: string
	groupName: string
	unitType: string
}

/** Persisted naming state used to preserve group-name allocation across updates. */
export type StackNamingSnapshot = {
	groupsInUse: StackNamingGroupRecord[]
	usedGroupNames: string[]
}

/** Partial naming state accepted when creating or refreshing a naming engine. */
export type StackNamingSeed = Partial<StackNamingSnapshot>

/** Flat unit data used to derive active stack names from a roster. */
export type StackNamingSourceUnit = {
	unitId: string
	typeId: string
	position: { q: number; r: number }
	state: string
	squads?: number
	friendlyName?: string
}