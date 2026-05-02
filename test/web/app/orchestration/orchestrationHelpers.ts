import { vi } from 'vitest'
import type { DefenderUnit, HexPos, StackRosterState, UnitStatus, Weapon } from '#shared/types/index'
import type { GameState } from '#shared/types/index'
import type { StackNamingSnapshot } from '#shared/stackNaming'
import { buildStackGroupKey, refreshStackNamingSnapshot } from '#shared/stackNaming'
import { buildStackRosterFromUnits } from '#shared/stackRoster'
import { getAllUnitDefinitions } from '#shared/unitDefinitions'
import { createMoveGameState } from '#shared/moveFixtures'
import { createGameClient, type GameClient, type GameSnapshot } from '#web/lib/gameClient'

// ---- Shared type alias ----

export type AuthoritativeBattlefieldSnapshot = GameSnapshot & {
	authoritativeState: GameState
	scenarioMap: {
		width: number
		height: number
		cells: Array<{ q: number; r: number }>
		hexes: Array<{ q: number; r: number; t: number }>
	}
}

// ---- Async test utility ----

/**
 * Returns a promise that can be resolved externally.
 * Useful for testing races between concurrent async operations.
 */
export function createDeferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((nextResolve) => {
		resolve = nextResolve
	})
	return { promise, resolve }
}

// ---- Snapshot factories ----

/**
 * Returns a snapshot built from a different base than the standard "connected"
 * snapshot. Useful for tests that verify the app reads authoritative state
 * rather than falling back to local fixtures.
 */
export function createAuthoritativeBattlefieldSnapshot(): AuthoritativeBattlefieldSnapshot {
	return {
		gameId: 123,
		phase: 'DEFENDER_COMBAT',
		scenarioName: 'Authoritative swamp state',
		turnNumber: 8,
		lastEventSeq: 47,
		authoritativeState: {
			onion: {
				id: 'onion-live',
				type: 'TheOnion',
				position: { q: 1, r: 1 },
				treads: 27,
				status: 'operational',
				weapons: [
					{
						id: 'main-1',
						name: 'Main Battery',
						attack: 4,
						range: 4,
						defense: 4,
						status: 'ready',
						individuallyTargetable: true,
					},
				],
				batteries: {
					main: 1,
					secondary: 0,
					ap: 0,
				},
			},
			defenders: {
				'dragon-7': {
					id: 'dragon-7',
					type: 'Dragon',
					position: { q: 0, r: 1 },
					status: 'operational',
					weapons: [
						{
							id: 'cannon-1',
							name: 'Dragon Cannon',
							attack: 6,
							range: 3,
							defense: 3,
							status: 'ready',
							individuallyTargetable: false,
						},
					],
				},
			},
			stackRoster: { groupsById: {}, },
    		stackNaming: { groupsInUse: [], usedGroupNames: [] },
			ramsThisTurn: 0,
		},
		movementRemainingByUnit: {
			'onion-live': 0,
			'dragon-7': 0,
		},
		scenarioMap: {
			width: 2,
			height: 2,
			cells: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }, { q: 1, r: 1 }],
			hexes: [{ q: 1, r: 1, t: 1 }],
		},
		victoryObjectives: [],
	}
}

/**
 * Returns the standard two-defender snapshot used by most orchestration tests.
 * Pass `overrides` to replace only the top-level fields you need.
 *
 * For authoritative-state or map overrides use the `authoritativeState` /
 * `scenarioMap` keys in `overrides`, or spread `baseOrchestrationSnapshot` and
 * override individual fields after the fact.
 */
export function createConnectedBattlefieldSnapshot(
	overrides: Partial<AuthoritativeBattlefieldSnapshot> = {},
): AuthoritativeBattlefieldSnapshot {
	return {
		gameId: 123,
		phase: 'DEFENDER_COMBAT',
		scenarioName: "The Siege of Shrek's Swamp",
		turnNumber: 8,
		lastEventSeq: 47,
		authoritativeState: {
			onion: {
				id: 'onion-1',
				type: 'TheOnion',
				position: { q: 0, r: 1 },
				treads: 33,
				status: 'operational',
				weapons: [
					{
						id: 'main-1',
						name: 'Main Battery',
						attack: 4,
						range: 4,
						defense: 4,
						status: 'ready',
						individuallyTargetable: true,
					},
				],
				batteries: {
					main: 1,
					secondary: 0,
					ap: 0,
				},
			},
			defenders: {
				'wolf-2': {
					id: 'wolf-2',
					type: 'BigBadWolf',
					position: { q: 3, r: 6 },
					status: 'operational',
					weapons: [
						{
							id: 'main',
							name: 'Main Gun',
							attack: 4,
							range: 2,
							defense: 2,
							status: 'ready',
							individuallyTargetable: false,
						},
					],
				},
				'puss-1': {
					id: 'puss-1',
					type: 'Puss',
					position: { q: 4, r: 4 },
					status: 'operational',
					weapons: [
						{
							id: 'main',
							name: 'Main Gun',
							attack: 4,
							range: 2,
							defense: 3,
							status: 'ready',
							individuallyTargetable: false,
						},
					],
				},
			},
			stackRoster: { groupsById: {}, },
    		stackNaming: { groupsInUse: [], usedGroupNames: [] },
			ramsThisTurn: 0,
		},
		movementRemainingByUnit: {
			'onion-1': 0,
			'wolf-2': 4,
			'puss-1': 3,
		},
		scenarioMap: {
			width: 8,
			height: 8,
			cells: Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, q) => ({ q, r }))).flat(),
			hexes: [{ q: 1, r: 1, t: 1 }],
		},
		victoryObjectives: [],
		...overrides,
	}
}

/**
 * Two-defender snapshot with the wolf moved to `{q:1,r:1}` (adjacent to the
 * onion) and both onion batteries included, so combat-range tests can fire.
 */
export function createInRangeCombatSnapshot(): AuthoritativeBattlefieldSnapshot {
	return {
		...createConnectedBattlefieldSnapshot(),
		phase: 'DEFENDER_COMBAT' as const,
		authoritativeState: {
			...createConnectedBattlefieldSnapshot().authoritativeState,
			onion: {
				...createConnectedBattlefieldSnapshot().authoritativeState.onion,
				weapons: [
					{
						id: 'main-1',
						name: 'Main Battery',
						attack: 4,
						range: 4,
						defense: 4,
						status: 'ready' as const,
						individuallyTargetable: true,
					},
					{
						id: 'secondary-1',
						name: 'Secondary Battery',
						attack: 3,
						range: 2,
						defense: 3,
						status: 'ready' as const,
						individuallyTargetable: true,
					},
				],
			},
			defenders: {
				...createConnectedBattlefieldSnapshot().authoritativeState.defenders,
				'wolf-2': {
					...createConnectedBattlefieldSnapshot().authoritativeState.defenders['wolf-2'],
					position: { q: 1, r: 1 },
				},
			},
		},
	}
}

/**
 * Like `createInRangeCombatSnapshot` but with puss-1 moved to `{q:0,r:2}` so
 * that wolf-2 and puss-1 are in different hex positions (needed for tests that
 * check grouped vs. un-grouped selection).
 */
export function createGroupedInRangeCombatSnapshot(): AuthoritativeBattlefieldSnapshot {
	const snapshot = createInRangeCombatSnapshot()

	return {
		...snapshot,
		authoritativeState: {
			...snapshot.authoritativeState,
			defenders: {
				...snapshot.authoritativeState.defenders,
				'puss-1': {
					...snapshot.authoritativeState.defenders['puss-1'],
					position: { q: 0, r: 2 },
				},
			},
		},
	}
}

/**
 * Returns a snapshot in `ONION_MOVE` phase using `createMoveGameState` for the
 * authoritative onion state with the given tread count.
 */
export function createSnapshotWithTreads(treads: number, movementRemaining: number): AuthoritativeBattlefieldSnapshot {
	return {
		...createConnectedBattlefieldSnapshot(),
		phase: 'ONION_MOVE',
		authoritativeState: createMoveGameState(treads),
		movementRemainingByUnit: {
			'onion-1': movementRemaining,
			'wolf-2': 4,
			'puss-1': 3,
		},
	}
}

// ---- Base snapshot constant ----

/**
 * Suite-level read-only base snapshot for orchestration tests.
 *
 * Individual tests should clone it with spread and override only the fields
 * they care about:
 *
 * ```ts
 * const snapshot = {
 *   ...baseOrchestrationSnapshot,
 *   phase: 'ONION_MOVE' as const,
 *   authoritativeState: {
 *     ...baseOrchestrationSnapshot.authoritativeState,
 *     ...buildDefenderTree({ ... }),
 *   },
 * }
 * ```
 *
 * Do NOT mutate this object directly.
 */
export const baseOrchestrationSnapshot: AuthoritativeBattlefieldSnapshot = createConnectedBattlefieldSnapshot()

// ---- Defender-tree builder ----

const UNIT_DEFINITIONS = getAllUnitDefinitions()

function getDefaultWeapons(unitType: string): Weapon[] {
	const def = UNIT_DEFINITIONS[unitType as keyof typeof UNIT_DEFINITIONS]
	if (def === undefined) return []
	// Clone each weapon and force status to ready so tests start in a clean combat state.
	return def.weapons.map((w) => ({ ...w, status: 'ready' as const }))
}

/** Minimal description of an individual (non-grouped) defender unit. */
export type UnitInput = {
	id: string
	type: string
	pos: HexPos
	status?: UnitStatus
	/** Explicit weapon list. Omit to get unit-definition defaults, all marked ready. */
	weapons?: Weapon[]
	squads?: number
	friendlyName?: string
}

/** Minimal description of one member within a grouped defender stack. */
export type GroupMemberInput = {
	id: string
	status?: UnitStatus
	/** Explicit weapon list. Omit to get unit-definition defaults, all marked ready. */
	weapons?: Weapon[]
}

/** Minimal description of a set of grouped defenders at the same hex (e.g. a LittlePigs stack). */
export type GroupInput = {
	type: string
	pos: HexPos
	units: GroupMemberInput[]
}

/**
 * The expanded defender structures produced by {@link buildDefenderTree}.
 * Spread directly into `authoritativeState`:
 *
 * ```ts
 * authoritativeState: {
 *   ...baseOrchestrationSnapshot.authoritativeState,
 *   ...buildDefenderTree({ units, groups }),
 * }
 * ```
 */
export type DefenderTree = {
	defenders: Record<string, DefenderUnit>
	stackRoster: StackRosterState
	stackNaming: StackNamingSnapshot
}

/**
 * Build a complete defender tree from minimal unit and group descriptions.
 *
 * @param units  - Individual (non-grouped) defenders. Each needs at least `id`,
 *                 `type`, and `pos`; all other fields default to sensible values.
 * @param groups - Grouped defender stacks (stackable unit types sharing the same
 *                 hex, e.g. LittlePigs). Provide each member under `units`.
 *
 * The returned object contains `defenders`, `stackRoster`, and `stackNaming` and
 * can be spread directly into `authoritativeState`.
 */
export function buildDefenderTree(opts: {
	units?: UnitInput[]
	groups?: GroupInput[]
}): DefenderTree {
	const { units = [], groups = [] } = opts
	const defenders: Record<string, DefenderUnit> = {}

	// ---- Individual units ----
	for (const unit of units) {
		defenders[unit.id] = {
			id: unit.id,
			type: unit.type,
			position: unit.pos,
			status: unit.status ?? 'operational',
			weapons: unit.weapons ?? getDefaultWeapons(unit.type),
			squads: unit.squads,
			friendlyName: unit.friendlyName,
		}
	}

	// ---- Grouped units ----
	for (const group of groups) {
		for (const member of group.units) {
			defenders[member.id] = {
				id: member.id,
				type: group.type,
				position: group.pos,
				status: member.status ?? 'operational',
				weapons: member.weapons ?? getDefaultWeapons(group.type),
				squads: 1,
			}
		}
	}

	// Build stack roster from all defender entries.
	// buildStackRosterFromUnits only groups stackable types (maxStacks > 1).
	const allSourceUnits = Object.values(defenders).map((d) => ({
		id: d.id ?? '',
		type: d.type,
		position: d.position,
		status: d.status,
		squads: d.squads,
		weapons: d.weapons,
		friendlyName: d.friendlyName,
	}))

	// For groups input, also build explicit unitIds entries in the roster so
	// the stack-member lookup in appViewHelpers can find members by id.
	const stackRosterGroupsById: StackRosterState['groupsById'] = {}
	for (const group of groups) {
		const groupId = buildStackGroupKey(group.type, group.pos)
		stackRosterGroupsById[groupId] = {
			groupName: group.type,
			unitType: group.type,
			position: group.pos,
			unitIds: group.units.map((m) => m.id),
		}
	}
	// Merge in any auto-derived groups for individually-listed stackable units
	// (units input entries whose type has maxStacks > 1).
	const autoRoster = buildStackRosterFromUnits(allSourceUnits)
	const stackRoster: StackRosterState = {
		groupsById: { ...autoRoster.groupsById, ...stackRosterGroupsById },
	}

	const stackNaming = refreshStackNamingSnapshot(undefined, allSourceUnits)

	return { defenders, stackRoster, stackNaming }
}

// ---- Mock game-client factory ----

/**
 * Creates a fully mocked `GameClient` for use in orchestration tests.
 *
 * By default:
 * - `getState` resolves once with `{ snapshot, session }`.
 * - `submitAction` resolves with `snapshot` (same state, no change).
 * - `pollEvents` resolves with an empty array.
 *
 * Pass `overrides` to replace individual transport methods, e.g. to make
 * `submitAction` reject or to chain multiple `getState` responses.
 */
export function createTestClient(
	snapshot: AuthoritativeBattlefieldSnapshot,
	session: { role: 'onion' | 'defender' },
	overrides: {
		getState?: ReturnType<typeof vi.fn>
		submitAction?: ReturnType<typeof vi.fn>
		pollEvents?: ReturnType<typeof vi.fn>
	} = {},
): GameClient {
	return createGameClient({
		getState: overrides.getState ?? vi.fn().mockResolvedValue({ snapshot, session }),
		submitAction: overrides.submitAction ?? vi.fn().mockResolvedValue(snapshot),
		pollEvents: overrides.pollEvents ?? vi.fn().mockResolvedValue([]),
	})
}

// Re-export building blocks that tests may need directly
export { createMoveGameState }
