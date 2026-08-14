import type { DefenderMap, DefenderUnit, HexPos, OnionMap, StackRosterState, UnitState, Weapon } from '#shared/types/index'
import type { StackNamingSnapshot } from '#shared/stackNaming'
import { buildStackGroupKey } from '#shared/stackNaming'
import { buildStackRosterFromUnits, refreshStackRosterNamingSnapshot } from '#shared/stackRoster'
import { getAllUnitDefinitions, isUnitTypeStackable } from '#shared/unitDefinitions'
import { makeDefender, makeOnion, makeScenarioSnapshot, makeWeapon, type TestScenarioSnapshot } from '#test/utils/gameStateUtils'

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
export function createAuthoritativeBattlefieldSnapshot(): TestScenarioSnapshot {
	return makeScenarioSnapshot({
		gameId: 123,
		phase: 'DEFENDER_COMBAT',
		scenarioName: 'Authoritative swamp state',
		turnNumber: 8,
		lastEventSeq: 47,
		authoritativeState: {
			onions: {
				'onion-live': makeOnion({
					unitId: 'onion-live',
					position: { q: 1, r: 1 },
					treads: 27,
					friendlyName: 'The Onion',
					weapons: [makeWeapon({ id: 'main-1', typeId: 'TheOnion.main', friendlyName: 'Main Weapon' })],
				}),
			},
			defenders: {
				'dragon-7': makeDefender({
					unitId: 'dragon-7',
					typeId: 'Dragon',
					position: { q: 0, r: 1 },
					friendlyName: 'Dragon 7',
					weapons: [makeWeapon({ id: 'cannon-1', typeId: 'Dragon.main_1', friendlyName: 'Dragon Cannon' })],
				}),
			},
			stackRoster: { groupsById: {} },
			stackNaming: { groupsInUse: [], usedGroupNames: [] },
		},
		scenarioMap: {
			width: 2,
			height: 2,
			cells: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }, { q: 1, r: 1 }],
			hexes: [{ q: 1, r: 1, t: 1 }],
		},
		victoryObjectives: [],
	})
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
	overrides: Partial<TestScenarioSnapshot> = {},
): TestScenarioSnapshot {
	return makeScenarioSnapshot({
		gameId: 123,
		phase: 'DEFENDER_COMBAT',
		scenarioName: "The Siege of Shrek's Swamp",
		turnNumber: 8,
		lastEventSeq: 47,
		authoritativeState: {
			onions: {
				'onion-1': makeOnion({
					unitId: 'onion-1',
					position: { q: 0, r: 1 },
					treads: 33,
					friendlyName: 'The Onion',
					weapons: [makeWeapon({ id: 'main-1', typeId: 'TheOnion.main', friendlyName: 'Main Weapon' })],
				}),
			},
			defenders: {
				'wolf-2': makeDefender({
					unitId: 'wolf-2',
					typeId: 'BigBadWolf',
					position: { q: 3, r: 6 },
					friendlyName: 'Big Bad Wolf 2',
					weapons: [makeWeapon({ id: 'main', typeId: 'BigBadWolf.main', friendlyName: 'Main Gun' })],
				}),
				'puss-1': makeDefender({
					unitId: 'puss-1',
					typeId: 'Puss',
					position: { q: 4, r: 4 },
					friendlyName: 'Puss 1',
					weapons: [makeWeapon({ id: 'main', typeId: 'Puss.main', friendlyName: 'Main Gun' })],
				}),
			},
			stackRoster: { groupsById: {} },
			stackNaming: { groupsInUse: [], usedGroupNames: [] },
		},
		scenarioMap: {
			width: 8,
			height: 8,
			cells: Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, q) => ({ q, r }))).flat(),
			hexes: [{ q: 1, r: 1, t: 1 }],
		},
		victoryObjectives: [],
		...overrides,
	})
}

/**
 * Two-defender snapshot with the wolf moved to `{q:1,r:1}` (adjacent to the
 * onion) and both onion weapons included, so combat-range tests can fire.
 */
export function createInRangeCombatSnapshot(): TestScenarioSnapshot {
	const snapshot = createConnectedBattlefieldSnapshot()
	return {
		...snapshot,
		authoritativeState: {
			...snapshot.authoritativeState,
			onions: {
				...snapshot.authoritativeState.onions,
				'onion-1': makeOnion({
					...snapshot.authoritativeState.onions['onion-1'],
					friendlyName: 'The Onion',
					weapons: [
						makeWeapon({ id: 'main-1', typeId: 'TheOnion.main', friendlyName: 'Main Weapon' }),
						makeWeapon({ id: 'secondary-1', typeId: 'TheOnion.secondary_1', friendlyName: 'Secondary Weapon' }),
					],
				}),
			},
			defenders: {
				...snapshot.authoritativeState.defenders,
				'wolf-2': makeDefender({
					...snapshot.authoritativeState.defenders['wolf-2'],
					friendlyName: 'Big Bad Wolf 2',
					position: { q: 1, r: 1 },
				}),
			},
		},
	}
}

/**
 * Like `createInRangeCombatSnapshot` but with puss-1 moved to `{q:0,r:2}` so
 * that wolf-2 and puss-1 are in different hex positions (needed for tests that
 * check grouped vs. un-grouped selection).
 */
export function createGroupedInRangeCombatSnapshot(): TestScenarioSnapshot {
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
 * Returns a snapshot in `ONION_MOVE` phase using `makeScenarioSnapshot` for the
 * authoritative onion state with the given tread count.
 */
export type TreadsSnapshotOptions = {
	onions?: OnionMap
	defenders?: DefenderMap
}

export function createSnapshotWithTreads(
	treads: number,
	options: TreadsSnapshotOptions = {},
): TestScenarioSnapshot {
	return makeScenarioSnapshot({
		phase: 'ONION_MOVE',
		authoritativeState: {
			onions: options.onions ?? {
				'onion-1': makeOnion({ position: { q: 0, r: 1 }, treads, friendlyName: 'The Onion' }),
			},
			...(options.defenders === undefined ? {} : { defenders: options.defenders }),
		},
	})
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
export const baseOrchestrationSnapshot: TestScenarioSnapshot = createConnectedBattlefieldSnapshot()

// ---- Defender-tree builder ----

const UNIT_DEFINITIONS = getAllUnitDefinitions()

function getDefaultWeapons(unitType: string): ReadonlyArray<Weapon> {
	const def = UNIT_DEFINITIONS[unitType as keyof typeof UNIT_DEFINITIONS]
	if (def === undefined) return []
	// Clone each weapon and force state to ready so tests start in a clean combat state.
	return def.weapons.map((weapon) => makeWeapon({
		id: weapon.typeId.split('.').at(-1) ?? weapon.typeId,
		typeId: weapon.typeId,
		friendlyName: weapon.name,
		state: 'ready',
	}))
}

/** Minimal description of an individual (non-grouped) defender unit. */
export type UnitInput = {
	id: string
	type: string
	pos: HexPos
	state?: UnitState
	/** Explicit weapon list. Omit to get unit-definition defaults, all marked ready. */
	weapons?: ReadonlyArray<Weapon>
	friendlyName?: string
}

/** Minimal description of a grouped defender stack. Members must already be listed in `units`. */
export type GroupInput = {
	groupName: string
	memberIds: ReadonlyArray<string>
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
	defenders: DefenderMap
	stackRoster: StackRosterState
	stackNaming: StackNamingSnapshot
}

/**
 * Build a complete defender tree from minimal unit and group descriptions.
 *
 * @param units  - Individual (non-grouped) defenders. Each needs at least `id`,
 *                 `type`, and `pos`; all other fields default to sensible values.
 * @param groups - Grouped defender stacks. Provide the member defenders under
 *                 `units`, then list their ids here alongside the stack name.
 *
 * The returned object contains `defenders`, `stackRoster`, and `stackNaming` and
 * can be spread directly into `authoritativeState`.
 */
export function buildDefenderTree(opts: {
	units?: ReadonlyArray<UnitInput>
	groups?: ReadonlyArray<GroupInput>
}): DefenderTree {
	const { units = [], groups = [] } = opts
	const defenders: Record<string, DefenderUnit> = {}

	// ---- Individual units ----
	for (const unit of units) {
		defenders[unit.id] = makeDefender({
			unitId: unit.id,
			typeId: unit.type,
			position: unit.pos,
			state: unit.state ?? 'operational',
			weapons: unit.weapons ?? getDefaultWeapons(unit.type),
			friendlyName: unit.friendlyName,
		})
	}

	// ---- Grouped units ----
	const allSourceUnits = Object.values(defenders).map((d) => ({
		unitId: d.unitId,
		typeId: d.typeId,
		position: d.position,
		state: d.state,
		weapons: d.weapons,
		friendlyName: d.friendlyName,
	}))

	const stackRoster = buildStackRosterFromUnits(allSourceUnits)
	for (const group of groups) {
		if (group.memberIds.length === 0) {
			throw new Error(`Grouped defender stack '${group.groupName}' has no members`)
		}

		const memberUnits = group.memberIds.map((memberId) => {
			const member = defenders[memberId]
			if (member === undefined) {
				throw new Error(`Grouped defender stack '${group.groupName}' references missing defender '${memberId}'`)
			}

			return member
		})

		const firstMember = memberUnits[0]
		if (!isUnitTypeStackable(firstMember.typeId)) {
			throw new Error(`Grouped defender stack '${group.groupName}' must reference a stackable unit type, got '${firstMember.typeId}'`)
		}

		for (const member of memberUnits.slice(1)) {
			if (member.typeId !== firstMember.typeId) {
				throw new Error(`Grouped defender stack '${group.groupName}' mixes unit types '${firstMember.typeId}' and '${member.typeId}'`)
			}

			if (member.position.q !== firstMember.position.q || member.position.r !== firstMember.position.r) {
				throw new Error(`Grouped defender stack '${group.groupName}' mixes positions for '${member.unitId}'`)
			}
		}

		const groupKey = buildStackGroupKey(firstMember.typeId, firstMember.position)
		stackRoster.groupsById[groupKey] = {
			...(stackRoster.groupsById[groupKey] ?? {
				unitType: firstMember.typeId,
				position: firstMember.position,
				unitIds: [],
			}),
			groupName: group.groupName,
			unitType: firstMember.typeId,
			position: firstMember.position,
			unitIds: [...group.memberIds],
		}
	}

	const stackNaming = refreshStackRosterNamingSnapshot(stackRoster, undefined, defenders)

	return { defenders: defenders as DefenderMap, stackRoster, stackNaming }
}
