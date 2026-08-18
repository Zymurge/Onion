import { buildStackGroupKey, type StackNamingSnapshot } from '#shared/stackNaming'
import type { VictoryObjectiveState } from '#shared/apiProtocol'
import type {
	DefenderMap,
	DefenderUnit,
	GameState,
	HexPos,
	OnionUnit,
	StackRosterGroupState,
	StackRosterState,
	Weapon,
} from '#shared/types/index'
import { buildFriendlyName, DEFAULT_ONION_UNIT_TYPE_ID, getUnitTypeCatalog, getWeaponType } from '#shared/unitDefinitions'
import { buildBattlefieldDefenderView, buildBattlefieldOnionView } from '#web/lib/battlefieldViewBuilders'
import type { BattlefieldOnionView, BattlefieldUnit, UnitStatus } from '#web/lib/battlefieldView'
import { createGameClient, type GameClient, type GameSnapshot, type ScenarioMapSnapshot } from '#web/lib/gameClient'

/**
 * Utility to create a new Weapon object with default properties, allowing for overrides.
 *
 * @param overrides Partial properties to override the default weapon.
 * @returns A new Weapon object with the specified overrides.
 */
export function makeWeapon(overrides: Partial<Weapon> = {}): Weapon {
	const typeId = overrides.typeId ?? 'Puss.main'
	return {
		id: 'main',
		typeId,
		weaponClass: overrides.weaponClass ?? getWeaponType(typeId).weaponClass,
		state: 'ready',
		friendlyName: 'Main Weapon 1',
		...overrides,
	}
}

/**
 * Utility to create a new DefenderUnit object with default properties, allowing for overrides.
 * @param overrides Partial properties to override the default defender unit.
 * @returns A new DefenderUnit object with the specified overrides.
 */
export function makeDefender(overrides: Partial<DefenderUnit> = {}): DefenderUnit {
	const unitType = overrides.typeId ?? 'Puss'
	const weaponTypeId = getUnitTypeCatalog()[unitType]?.weapons[0]?.typeId ?? 'Puss.main'
	const defaultDefender: DefenderUnit = {
		unitId: 'puss-1',
		typeId: unitType,
		role: 'defender',
		side: 'defender',
		position: { q: 2, r: 0 },
		state: 'operational',
		weapons: [makeWeapon({ id: weaponTypeId.split('.').at(-1) ?? 'main', typeId: weaponTypeId })],
		friendlyName: 'Puss 1',
		...overrides,
	}

	if (overrides.friendlyName === undefined && overrides.typeId !== undefined) {
		const template = getUnitTypeCatalog()[defaultDefender.typeId]?.friendlyNameTemplate
		if (template !== undefined) {
			defaultDefender.friendlyName = buildFriendlyName(template, defaultDefender.unitId)
		}
	}

	return defaultDefender
}

export function makeDefenderMap(overrides: Record<string, Partial<DefenderUnit>> = {}): DefenderMap {
	return Object.fromEntries(
		Object.entries(overrides).map(([unitId, defender]) => [
			unitId,
			makeDefender({ unitId, ...defender }),
		]),
	) as DefenderMap
}

/**
 * Utility to create a new OnionUnit object with default properties, allowing for overrides.
 * @param overrides Partial properties to override the default onion unit.
 * @returns A new OnionUnit object with the specified overrides.
 */
export function makeOnion(overrides: Partial<OnionUnit> = {}): OnionUnit {
	return {
		unitId: 'onion-1',
		typeId: DEFAULT_ONION_UNIT_TYPE_ID,
		role: 'onion',
		side: 'onion',
		position: { q: 0, r: 0 },
		state: 'operational',
		friendlyName: 'The Onion 1',
		treads: 45,
		ramsRemaining: 2,
		weapons: [
			makeWeapon({ id: 'main', typeId: `${DEFAULT_ONION_UNIT_TYPE_ID}.main`, friendlyName: 'Main Weapon 1' }),
			makeWeapon({ id: 'secondary_1', typeId: `${DEFAULT_ONION_UNIT_TYPE_ID}.secondary_1`, friendlyName: 'Secondary Weapon 1' }),
			makeWeapon({ id: 'ap_1', typeId: `${DEFAULT_ONION_UNIT_TYPE_ID}.ap_1`, friendlyName: 'AP Gun 1' }),
		],
		...overrides,
	}
}

export function makeBattlefieldDefender(
	unitOverrides: Partial<DefenderUnit> = {},
	viewOverrides: Partial<BattlefieldDefenderFixture> = {},
): BattlefieldUnit {
	const defender = makeDefender(unitOverrides)
	const weapons = Array.isArray(viewOverrides.weapons)
		? viewOverrides.weapons
		: viewOverrides.weaponDetails?.map((weapon) => makeWeapon({
			...weapon,
			id: weapon.id ?? 'main',
			friendlyName: weapon.friendlyName ?? weapon.name ?? 'Main Weapon',
			state: weapon.state ?? weapon.status ?? 'ready',
		}))
	const baseView = buildBattlefieldDefenderView(defender, {
		activePhase: 'DEFENDER_COMBAT',
		activeTurnActive: true,
		stackSize: viewOverrides.stackSize ?? viewOverrides.squads ?? 1,
	})

	return {
		...baseView,
		...(weapons === undefined ? {} : { weapons }),
		...(viewOverrides.movesRemaining === undefined && viewOverrides.move === undefined
			? {}
			: { movesRemaining: viewOverrides.movesRemaining ?? viewOverrides.move ?? 0 }),
		...(viewOverrides.actionableModes === undefined ? {} : { actionableModes: viewOverrides.actionableModes }),
	}
}

export function makeBattlefieldOnion(
	unitOverrides: Partial<OnionUnit> = {},
	viewOverrides: Partial<BattlefieldOnionView> = {},
): BattlefieldOnionView {
	return {
		...buildBattlefieldOnionView(makeOnion(unitOverrides)),
		...viewOverrides,
	}
}

export type BattlefieldDefenderFixture = Omit<Partial<BattlefieldUnit>, 'weapons'> & {
	id?: string
	type?: string
	status?: UnitStatus
	weapons?: ReadonlyArray<Weapon> | string
	weaponDetails?: ReadonlyArray<Partial<Weapon> & {
		name?: string
		status?: Weapon['state']
		attack?: number
		range?: number
		defense?: number
		individuallyTargetable?: boolean
	}>
	squads?: number
	move?: number
	q?: number
	r?: number
}

export function canonicalizeBattlefieldDefenders(defenders: ReadonlyArray<BattlefieldDefenderFixture>): BattlefieldUnit[] {
	return defenders.map((view) => {
		const weaponDetails = view.weaponDetails?.map((weapon) => {
			const weaponId = weapon.id ?? 'main'
			return makeWeapon({
				...weapon,
				id: weaponId,
				typeId: weapon.typeId ?? getUnitTypeCatalog()[view.typeId ?? view.type ?? 'Puss']?.weapons[0]?.typeId ?? 'Puss.main',
				state: weapon.state ?? weapon.status ?? 'ready',
				friendlyName: weapon.friendlyName ?? weapon.name ?? 'Main Weapon',
			})
		})

		const defenderOverrides: Partial<DefenderUnit> = {
			unitId: view.unitId ?? view.id ?? 'puss-1',
			typeId: view.typeId ?? view.type ?? 'Puss',
			position: view.position ?? { q: view.q ?? 0, r: view.r ?? 0 },
			state: view.state ?? view.status ?? 'operational',
			friendlyName: view.friendlyName,
		}
		if (weaponDetails !== undefined) {
			defenderOverrides.weapons = weaponDetails
		} else if (Array.isArray(view.weapons)) {
			defenderOverrides.weapons = view.weapons
		}

		return makeBattlefieldDefender(defenderOverrides, {
			...view,
			...(weaponDetails === undefined ? {} : { weaponDetails }),
		})
	})
}

export type BattlefieldOnionFixture = Partial<BattlefieldOnionView> & {
	id?: string
	type?: string
	status?: UnitStatus
	q?: number
	r?: number
	rams?: number
	weaponDetails?: ReadonlyArray<Partial<Weapon> & { name?: string; status?: Weapon['state'] }>
	weapons?: ReadonlyArray<Weapon> | string
}

export function canonicalizeBattlefieldOnion(view: BattlefieldOnionFixture): BattlefieldOnionView {
	const weapons = (view.weaponDetails ?? (Array.isArray(view.weapons) ? view.weapons : [])).map((weapon) => makeWeapon({
		...weapon,
		typeId: weapon.typeId ?? `${view.typeId ?? view.type ?? DEFAULT_ONION_UNIT_TYPE_ID}.${weapon.id.replace(/-\d+$/, '')}`,
		state: weapon.state ?? (weapon as Weapon & { status?: Weapon['state'] }).status ?? 'ready',
	}))

	const onionOverrides: Partial<OnionUnit> = {
		unitId: view.unitId ?? view.id ?? 'onion-1',
		typeId: view.typeId ?? view.type ?? DEFAULT_ONION_UNIT_TYPE_ID,
		position: view.position ?? { q: view.q ?? 0, r: view.r ?? 0 },
		state: view.state ?? view.status ?? 'operational',
		treads: view.treads,
		ramsRemaining: view.ramsRemaining ?? view.rams,
		weapons,
	}
	if (view.friendlyName !== undefined) {
		onionOverrides.friendlyName = view.friendlyName
	}

	return makeBattlefieldOnion(onionOverrides, {
		movesAllowed: view.movesAllowed,
		movesRemaining: view.movesRemaining,
	})
}

/**
 * Utility to create a new StackRosterState object with default properties, allowing for overrides.
 * Provides a default stack group for Little Pigs at position (1,1) with units pigs-1 and pigs-2.
 * @param overrides Partial properties to override the default stack roster state.
 * @returns A new StackRosterState object with the specified overrides.
 */
export function makeStackRoster(overrides: Partial<StackRosterState> = {}): StackRosterState {
	return {
			groupsById: {
				'LittlePigs:1,1': makeStackGroup(),
			},
			...overrides,
	}
}

export function makeStackGroup(overrides: Partial<StackRosterGroupState> = {}): StackRosterGroupState {
	return {
		groupName: 'Little Pigs group 1',
		unitType: 'LittlePigs',
		position: { q: 1, r: 1 },
		unitIds: ['pigs-1', 'pigs-2'],
		...overrides,
	}
}

/**
 * Utility to create a new StackNamingSnapshot object with default properties, allowing for overrides.
 * Provides a default stack naming snapshot with a single group in use for Little Pigs at position (1,1).
 * @param overrides Partial properties to override the default stack naming snapshot.
 * @returns A new StackNamingSnapshot object with the specified overrides.
 */
export function makeStackNaming(overrides: Partial<StackNamingSnapshot> = {}): StackNamingSnapshot {
	return {
		groupsInUse: [
			{ groupKey: 'LittlePigs:1,1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' }
		],
		usedGroupNames: ['Little Pigs group 1'],
		...overrides,
	}
}

export type StackFixture = Pick<GameState, 'defenders' | 'stackNaming' | 'stackRoster'>

export type StackFixtureOptions = {
	groups?: Record<string, StackRosterGroupState>
	unitOverrides?: Record<string, Partial<DefenderUnit>>
	base?: Partial<StackFixture>
}

function mergeStackNaming(
	baseNaming: StackNamingSnapshot | undefined,
	roster: StackRosterState,
): StackNamingSnapshot {
	const groupsByKey = new Map<string, StackNamingSnapshot['groupsInUse'][number]>()

	for (const group of baseNaming?.groupsInUse ?? []) {
		groupsByKey.set(group.groupKey, group)
	}

	for (const group of Object.values(roster.groupsById)) {
		groupsByKey.set(buildStackGroupKey(group.unitType, group.position), {
			groupKey: buildStackGroupKey(group.unitType, group.position),
			groupName: group.groupName,
			unitType: group.unitType,
		})
	}

	return {
		groupsInUse: [...groupsByKey.values()],
		usedGroupNames: [...new Set([
			...(baseNaming?.usedGroupNames ?? []),
			...Object.values(roster.groupsById).map((group) => group.groupName),
		])],
	}
}

export function makeStackFixture({
	groups = {},
	unitOverrides = {},
	base = {},
}: StackFixtureOptions = {}): StackFixture {
	const stackRoster: StackRosterState = {
		...(base.stackRoster ?? { groupsById: {} }),
		groupsById: {
			...(base.stackRoster?.groupsById ?? {}),
			...groups,
		},
	}

	const derivedDefenders = Object.fromEntries(
		Object.values(groups).flatMap((group) => group.unitIds.map((unitId) => [
			unitId,
			makeDefender({
				...unitOverrides[unitId],
				unitId,
				typeId: group.unitType,
				position: group.position,
			}),
		])),
	) as DefenderMap

	return {
		defenders: {
			...(base.defenders ?? {}),
			...derivedDefenders,
		},
		stackRoster,
		stackNaming: mergeStackNaming(base.stackNaming, stackRoster),
	}
}

/**
 * Utility to create a new GameState object with default properties, allowing for overrides.
 * The default game state includes one onion unit, one swamp, two pig defenders in a stack, and a single puss.
 * @param overrides Partial properties to override the default game state.
 * @returns A new GameState object with the specified overrides.
 */
export function makeGameState(overrides: Partial<GameState> = {}): GameState {
	return {
		onions: { 'onion-1': makeOnion() },
		defenders: {
			'swamp-1': makeDefender({ unitId: 'swamp-1', typeId: 'Swamp',      position: { q: 8, r: 8 }, weapons: [], friendlyName: 'Swamp 1' }),
			'pigs-1':  makeDefender({ unitId: 'pigs-1',  typeId: 'LittlePigs', position: { q: 1, r: 1 }, weapons: [], friendlyName: 'Little Pigs 1' }),
			'pigs-2':  makeDefender({ unitId: 'pigs-2',  typeId: 'LittlePigs', position: { q: 1, r: 1 }, weapons: [], friendlyName: 'Little Pigs 2' }),
			'puss-1':  makeDefender({ unitId: 'puss-1',  typeId: 'Puss',       position: { q: 2, r: 0 }, weapons: [], friendlyName: 'Puss 1' }),
		},
		stackRoster: makeStackRoster(),
		stackNaming: makeStackNaming(),
		currentPhase: 'ONION_COMBAT',
		turn: 1,
		...overrides,
	}
}

export type TestScenarioSnapshot = GameSnapshot & {
	authoritativeState: GameState
	scenarioMap: ScenarioMapSnapshot
}

export type ScenarioSnapshotOptions = Omit<Partial<TestScenarioSnapshot>, 'authoritativeState' | 'scenarioMap'> & {
	authoritativeState?: Partial<GameState>
	scenarioMap?: Partial<ScenarioMapSnapshot>
}

export function makeScenarioGameState(overrides: Partial<GameState> = {}): GameState {
	return makeGameState({
		onions: {
			'onion-1': makeOnion({ position: { q: 0, r: 1 }, friendlyName: 'The Onion' }),
		},
		defenders: {
			'wolf-2': makeDefender({
				unitId: 'wolf-2',
				typeId: 'BigBadWolf',
				position: { q: 3, r: 6 },
				friendlyName: 'Big Bad Wolf 2',
			}),
			'puss-1': makeDefender({
				unitId: 'puss-1',
				typeId: 'Puss',
				position: { q: 4, r: 4 },
				friendlyName: 'Puss 1',
			}),
		},
		stackRoster: makeStackRoster({ groupsById: {} }),
		stackNaming: makeStackNaming({ groupsInUse: [], usedGroupNames: [] }),
		currentPhase: 'DEFENDER_COMBAT',
		turn: 11,
		...overrides,
	})
}

export function makeScenarioSnapshot(options: ScenarioSnapshotOptions = {}): TestScenarioSnapshot {
	const { authoritativeState: stateOverrides, scenarioMap: mapOverrides, ...snapshotOverrides } = options
	const phase = snapshotOverrides.phase ?? 'DEFENDER_COMBAT'
	const turnNumber = snapshotOverrides.turnNumber ?? 11
	const authoritativeState = makeScenarioGameState({ currentPhase: phase, turn: turnNumber, ...stateOverrides })

	return {
		gameId: 123,
		phase,
		scenarioName: 'Selection Contract Test',
		turnNumber,
		lastEventSeq: 47,
		authoritativeState,
		victoryObjectives: [],
		scenarioMap: {
			width: 8,
			height: 8,
			cells: Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, q) => ({ q, r }))).flat(),
			hexes: [],
			...mapOverrides,
		},
		...snapshotOverrides,
	}
}

export function makeScenarioObjective(overrides: Partial<VictoryObjectiveState> = {}): VictoryObjectiveState {
	return {
		id: 'objective-1',
		label: 'Destroy the marked unit',
		kind: 'destroy-unit',
		required: true,
		completed: false,
		...overrides,
	}
}

export function createTestClient(
	snapshot: TestScenarioSnapshot,
	session: { role: 'onion' | 'defender' },
	overrides: {
		getState?: GameClient['getState']
		submitAction?: GameClient['submitAction']
		pollEvents?: GameClient['pollEvents']
		reportDiagnostic?: GameClient['reportDiagnostic']
	} = {},
): GameClient {
	const defaultGetState: GameClient['getState'] = async () => ({ snapshot, session })
	const getState = overrides.getState ?? defaultGetState
	const defaultSubmitAction: GameClient['submitAction'] = async () => snapshot
	const defaultPollEvents: GameClient['pollEvents'] = async () => []

	return createGameClient({
		async getState(gameId) {
			return getState(gameId)
		},
		submitAction: overrides.submitAction ?? defaultSubmitAction,
		pollEvents: overrides.pollEvents ?? defaultPollEvents,
		reportDiagnostic: overrides.reportDiagnostic,
	})
}

export type { DefenderMap, DefenderUnit, GameState, HexPos, OnionUnit, StackRosterGroupState, StackRosterState, Weapon }
