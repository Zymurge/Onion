/** Public stack-roster surface grouped by contracts, projections, and transitions. */
/** Roster inputs, validation findings, and derived-view contracts. */
export type {
	MoveStackRosterGroupInput,
	ReconcileStackRosterMoveLifecycleInput,
	ReconcileStackRosterMoveLifecycleResult,
	RelocateStackRosterUnitsInput,
	SplitStackRosterGroupInput,
	StackRosterConsistencyIssue,
	StackRosterGroupView,
	StackRosterIndex,
	StackRosterSourceUnit,
	StackRosterUnitView,
	StackRosterValidationIssue,
} from './types.js'

export { buildStackGroupKey } from '../stackNaming/index.js'
/** Shared group-key construction used by roster and naming layers. */
export {
/** Roster construction and naming synchronization. */
	buildStackRosterFromUnits,
	buildStackRosterNamingSourceUnits,
	canonicalizeStackRoster,
	refreshStackRosterNamingSnapshot,
} from './naming.js'
/** Derived roster projections. */
export { buildStackRosterIndex } from './indexing.js'
/** Structural and live-defender consistency validation. */
export { validateStackRoster, validateStackRosterConsistency } from './validation.js'
/** Pure roster mutations and move lifecycle reconciliation. */
export {
	expandStackRosterGroups,
	mergeStackRosterGroups,
	moveStackRosterGroup,
	reconcileStackRosterMoveLifecycle,
	relocateStackRosterUnits,
	retireStackRosterGroup,
	splitStackRosterGroup,
} from './transitions.js'