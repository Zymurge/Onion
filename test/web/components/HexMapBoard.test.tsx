	it('renders Little Pigs group info and focuses its map cell for a group event', () => {
		const littlePigsStack: BattlefieldUnit[] = [
			{
				friendlyName: 'Little Pigs 1',
				role: 'defender',
				unitId: 'pigs-1',
				typeId: 'LittlePigs',
				state: 'operational',
				side: 'defender',
				position: { q: 2, r: 2 },
				movesRemaining: 3,
				stackSize: 1,
				weapons: [],
				actionableModes: ['fire', 'combined'],
			},
			{
				friendlyName: 'Little Pigs 2',
				role: 'defender',
				unitId: 'pigs-2',
				typeId: 'LittlePigs',
				state: 'operational',
				side: 'defender',
				position: { q: 2, r: 2 },
				movesRemaining: 3,
				stackSize: 1,
				weapons: [],
				actionableModes: ['fire', 'combined'],
			},
		]
		const stackNaming: StackNamingSnapshot = {
			groupsInUse: [
				{ groupKey: 'LittlePigs:2,2', groupName: 'Little Pigs group', unitType: 'LittlePigs' },
			],
			usedGroupNames: ['Little Pigs group'],
		}
		const stackRoster: StackRosterState = {
			groupsById: {
				'LittlePigs:2,2': {
					groupName: 'Little Pigs group',
					unitType: 'LittlePigs',
					position: { q: 2, r: 2 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
			},
		}

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={littlePigsStack}
				onions={[onion]}
				stackNaming={stackNaming}
				stackRoster={stackRoster}
				eventFocusedUnitIds={['LittlePigs:2,2']}
				phase="DEFENDER_COMBAT"
				selectedUnitIds={[]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		expect(getMarkerLabel('pigs-1')).toBe('Little Pigs 1')
		expect(screen.getByTestId('hex-cell-2-2')).toHaveClass('hex-cell-event-focused')
		expect(screen.getByTestId('hex-cell-2-2').querySelector('.hex-event-focus-overlay')).not.toBeNull()
		expect(screen.getByTestId('hex-unit-pigs-1').querySelector('image')).not.toBeNull()
		expect(screen.queryByTestId('hex-unit-pigs-2')).toBeNull()
		expect(screen.queryByTestId('hex-stack-label-2-2')).toBeNull()
		expect(screen.queryByTestId('hex-stack-count-2-2')).toBeNull()
	})

	it('throws when stacked defenders are rendered without canonical roster data', () => {
		const littlePigsStack: BattlefieldUnit[] = [
			{
				friendlyName: 'Little Pigs 1',
				role: 'defender',
				unitId: 'pigs-1',
				typeId: 'LittlePigs',
				state: 'operational',
				side: 'defender',
				position: { q: 2, r: 2 },
				movesRemaining: 3,
				stackSize: 1,
				weapons: [],
				actionableModes: ['fire', 'combined'],
			},
			{
				friendlyName: 'Little Pigs 2',
				role: 'defender',
				unitId: 'pigs-2',
				typeId: 'LittlePigs',
				state: 'operational',
				side: 'defender',
				position: { q: 2, r: 2 },
				movesRemaining: 3,
				stackSize: 1,
				weapons: [],
				actionableModes: ['fire', 'combined'],
			},
		]

		expect(() => {
			render(
				<HexMapBoard
					scenarioMap={scenarioMap}
					defenders={littlePigsStack}
						onions={[onion]}
					catalog={sessionCatalog}
					phase="DEFENDER_COMBAT"
					selectedUnitIds={[]}
					onSelectUnit={vi.fn()}
					onDeselect={vi.fn()}
					onMoveUnit={vi.fn()}
				/>,
			)
		}).toThrow('Missing stackRoster for grouped defenders')
	})

	it('keeps inspectable defender marker labels dark', () => {
		const inspectableUnit: BattlefieldUnit = {
			...defenders[1],
			unitId: 'wolf-2',
			state: 'operational',
			actionableModes: [],
		}

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={[inspectableUnit]}
				onions={[onion]}
				phase="ONION_COMBAT"
				selectedUnitIds={[]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		expect(screen.getByTestId('hex-unit-wolf-2').querySelector('text')).toHaveAttribute('fill', '#111111')
	})

	it('renders box-free combat sprites for Onion and defenders', () => {
		const eligible: BattlefieldUnit = {
			...defenders[0],
			unitId: 'puss-1',
			state: 'operational',
			actionableModes: ['fire', 'combined'],
		}
		const inspectable: BattlefieldUnit = {
			...defenders[1],
			unitId: 'wolf-2',
			state: 'operational',
			actionableModes: [],
		}
		const disabled: BattlefieldUnit = {
			...defenders[1],
			unitId: 'witch-3', // unique id
			state: 'disabled',
			actionableModes: [],
		}
		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={[eligible, inspectable, disabled]}
				onions={[onion]}
				phase="ONION_COMBAT"
				selectedUnitIds={[]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)
		const onionMarker = getSpriteMarker('onion-1')
		expect(onionMarker.classList.contains('hex-unit-stack-onion')).toBe(true)
		expect(onionMarker.querySelector('rect')?.getAttribute('class')).toBe('hex-unit-onion-hit-target')

		const defenderMarker = getSpriteMarker('wolf-2')
		expect(defenderMarker.classList.contains('hex-unit-stack-defender')).toBe(true)
		expect(defenderMarker.querySelector('rect')).toBeNull()

		const disabledMarker = getSpriteMarker('witch-3')
		expect(disabledMarker.classList.contains('hex-unit-stack-disabled')).toBe(true)
		expect(disabledMarker.classList.contains('tone-dim')).toBe(true)
		expect(disabledMarker.querySelector('.hex-unit-disabled-icon')).not.toBeNull()
	})

	it('renders box-free defender and Onion sprites during Defender combat', () => {
		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="DEFENDER_COMBAT"
				selectedUnitIds={[]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		const defenderMarker = getSpriteMarker('wolf-2')
		expect(defenderMarker.classList.contains('hex-unit-stack-defender')).toBe(true)
		expect(defenderMarker.querySelector('rect')).toBeNull()

		const onionMarker = getSpriteMarker('onion-1')
		expect(onionMarker.classList.contains('hex-unit-stack-onion')).toBe(true)
		expect(onionMarker.querySelector('rect')?.getAttribute('class')).toBe('hex-unit-onion-hit-target')
	})

	it('renders a partial-group combat marker as a box-free sprite', () => {
		const partialGroup: BattlefieldUnit[] = [
			{
				...defenders[0],
				unitId: 'pigs-1',
				typeId: 'LittlePigs',
				position: { q: 2, r: 2 },
				state: 'operational',
				actionableModes: [],
			},
			{
				...defenders[0],
				unitId: 'pigs-2',
				typeId: 'LittlePigs',
				position: { q: 2, r: 2 },
				state: 'operational',
				actionableModes: ['fire', 'combined'],
			},
		]

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={partialGroup}
				onions={[onion]}
				phase="DEFENDER_COMBAT"
				stackRoster={{
					groupsById: {
						'LittlePigs:2,2': {
							groupName: 'Little Pigs group',
							unitType: 'LittlePigs',
							position: { q: 2, r: 2 },
							unitIds: ['pigs-1', 'pigs-2'],
						},
					},
				}}
				selectedUnitIds={[]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/> ,
		)

		expect(getSpriteMarker('pigs-1').querySelector('rect')).toBeNull()
	})

	it('renders an all-spent grouped combat marker as a box-free sprite', () => {
		const spentGroup = defenders.slice(0, 2).map((defender, index) => ({
			...defender,
			unitId: `pigs-${index + 1}`,
			typeId: 'LittlePigs',
			position: { q: 2, r: 2 },
			state: 'operational' as const,
			actionableModes: [],
		}))

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={spentGroup}
				onions={[onion]}
				phase="DEFENDER_COMBAT"
				stackRoster={{
					groupsById: {
						'LittlePigs:2,2': {
							groupName: 'Little Pigs group',
							unitType: 'LittlePigs',
							position: { q: 2, r: 2 },
							unitIds: ['pigs-1', 'pigs-2'],
						},
					},
				}}
				selectedUnitIds={[]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/> ,
		)

		expect(getSpriteMarker('pigs-1').querySelector('rect')).toBeNull()
	})

	it('shows Onion and a surviving defender as shared occupants', () => {
		const survivingDefender: BattlefieldUnit = {
			...defenders[0],
			unitId: 'bbw-1',
			friendlyName: 'Big Bad Wolf',
			position: { q: 0, r: 0 },
		}

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={[survivingDefender]}
				onions={[{ ...onion, position: { q: 0, r: 0 } }]}
				phase="ONION_MOVE"
				selectedUnitIds={[]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		expect(screen.getByTestId('hex-cell-0-0')).toHaveClass('hex-cell-shared-occupancy')
		expect(screen.getByTestId('hex-unit-onion-1')).toBeInTheDocument()
		expect(screen.getByTestId('hex-unit-bbw-1')).toBeInTheDocument()
		expect(screen.getByTestId('hex-cell-0-0').querySelector('.hex-shared-occupancy-ring')).not.toBeNull()
	})

	it('renders Onion and defender sprites together during combat', () => {
		const coLocatedDefender: BattlefieldUnit = {
			...defenders[0],
			unitId: 'bbw-1',
			position: { q: 0, r: 0 },
		}

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={[coLocatedDefender]}
				onions={[{ ...onion, position: { q: 0, r: 0 } }]}
				phase="ONION_COMBAT"
				viewerRole="onion"
				selectedUnitIds={[]}
				combatTargetIds={new Set(['bbw-1'])}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		const onionMarker = getSpriteMarker('onion-1')
		expect(onionMarker.classList.contains('hex-unit-stack-onion')).toBe(true)
		expect(onionMarker.querySelector('rect')?.getAttribute('class')).toBe('hex-unit-onion-hit-target')
		const defenderMarker = getSpriteMarker('bbw-1')
		expect(defenderMarker.classList.contains('hex-unit-stack-defender')).toBe(true)
		expect(defenderMarker.querySelector('rect')).toBeNull()
	})

	it('marks active movement and disabled states on sprite markers', () => {
		const eligible: BattlefieldUnit = {
			...defenders[0],
			state: 'operational',
			movesRemaining: 2,
		}
		const disabled: BattlefieldUnit = {
			...defenders[1],
			state: 'disabled',
			movesRemaining: 2,
		}
		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={[eligible, disabled]}
				onions={[onion]}
				phase="DEFENDER_MOVE"
				selectedUnitIds={[]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)
		const eligibleMarker = getSpriteMarker('puss-1')
		expect(eligibleMarker.classList.contains('hex-unit-stack-move-ready')).toBe(true)

		const disabledMarker = getSpriteMarker('wolf-2')
		expect(disabledMarker.classList.contains('hex-unit-stack-disabled')).toBe(true)
		expect(disabledMarker.classList.contains('tone-dim')).toBe(true)
		expect(disabledMarker.querySelector('.hex-unit-disabled-icon')).not.toBeNull()
	})
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'

import { HexMapBoard as ProductionHexMapBoard } from '#web/components/HexMapBoard'
import { boardPixelSize } from '#web/lib/hexPixelLayout'
import type { CombatActionEligibility } from '#web/lib/actionEligibility/projection'
import type { CombatEligibility, CombatEligibilityReason } from '#web/lib/actionEligibility/combat'
import type { MovementEligibility } from '#web/lib/actionEligibility/movement'
import type { BattlefieldOnionView, BattlefieldUnit, TerrainHex } from '#web/lib/battlefieldView'
import { getUnitTypeCatalog, getWeaponTypeCatalog } from '#shared/unitDefinitions'
import { createSessionCatalog } from '#web/lib/sessionCatalog'
import type { BattlefieldActionEligibility } from '#web/lib/actionEligibility/projection'
import type { StackNamingSnapshot } from '#shared/stackNaming/index'
import type { StackRosterState } from '#shared/types/index'
import type { ComponentProps } from 'react'

const sessionCatalog = createSessionCatalog(getUnitTypeCatalog(), getWeaponTypeCatalog())

type TestHexMapBoardProps = Omit<ComponentProps<typeof ProductionHexMapBoard>, 'actionEligibility'> & {
	actionEligibility?: BattlefieldActionEligibility
}

function buildTestActionEligibility({ defenders, onions, phase, viewerRole }: TestHexMapBoardProps): BattlefieldActionEligibility {
	const activeMovementRole = phase === 'ONION_MOVE' ? 'onion' : phase === 'DEFENDER_MOVE' || phase === 'GEV_SECOND_MOVE' ? 'defender' : null
	const effectiveViewerRole = viewerRole ?? (phase?.startsWith('DEFENDER') || phase === 'GEV_SECOND_MOVE' ? 'defender' : 'onion')
	const buildMovementEligibility = (eligible: boolean): MovementEligibility => eligible
		? { eligible: true }
		: { eligible: false, reason: 'no-movement-remaining' }
	const buildCombatEligibility = (eligible: boolean, reason: CombatEligibilityReason): CombatEligibility => eligible
		? { eligible: true }
		: { eligible: false, reason }
	const buildCombatActionEligibility = (eligible: boolean, reason: CombatEligibilityReason): CombatActionEligibility => ({
		eligibility: buildCombatEligibility(eligible, reason),
		targetIds: ['test-target'],
		targetHexKeys: [],
	})
	const movementByUnitId: Record<string, MovementEligibility> = Object.fromEntries(
		[...defenders, ...onions].map((unit): [string, MovementEligibility] => [
			unit.unitId,
			buildMovementEligibility(activeMovementRole !== null && effectiveViewerRole === activeMovementRole && unit.role === activeMovementRole && unit.state === 'operational' && unit.movesRemaining > 0),
		]),
	)
	const defenderCombatByUnitId: Record<string, CombatActionEligibility> = Object.fromEntries(defenders.map((unit): [string, CombatActionEligibility] => {
		const eligible = phase === 'DEFENDER_COMBAT' && effectiveViewerRole === 'defender' && unit.state === 'operational' && unit.actionableModes.includes('fire')
		return [unit.unitId, buildCombatActionEligibility(eligible, 'no-attack-capabilities')]
	}))
	const onionCombatByWeaponId: Record<string, CombatActionEligibility> = Object.fromEntries(onions.flatMap((unit) => unit.weapons.map((weapon): [string, CombatActionEligibility] => {
		const eligible = phase === 'ONION_COMBAT' && viewerRole === 'onion' && unit.state === 'operational' && weapon.state === 'ready'
		return [weapon.id, buildCombatActionEligibility(eligible, 'attacks-spent')]
	})))

	return { movementByUnitId, defenderCombatByUnitId, onionCombatByWeaponId }
}

function TestHexMapBoard({ actionEligibility, ...props }: TestHexMapBoardProps) {
	return <ProductionHexMapBoard {...props} actionEligibility={actionEligibility ?? buildTestActionEligibility(props)} />
}

const HexMapBoard = TestHexMapBoard

function getMarkerLabel(unitId: string): string {
	const marker = screen.getByTestId(`hex-unit-${unitId}`)
	return Array.from(marker.querySelectorAll('tspan'), (line) => line.textContent ?? '').join(' ')
}

function getSpriteMarker(unitId: string): HTMLElement {
	const marker = screen.getByTestId(`hex-unit-${unitId}`)
	expect(marker.querySelector('image')).not.toBeNull()
	return marker
}

const scenarioMap = {
	width: 5,
	height: 5,
	cells: Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, q) => ({ q, r }))).flat(),
	hexes: Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, q) => ({ q, r, t: 0 } as TerrainHex))).flat(),
}

const sparseScenarioMap = {
	width: 5,
	height: 5,
	cells: [{ q: 0, r: 0 }, { q: 4, r: 4 }],
	hexes: [{ q: 4, r: 4, t: 1 } as TerrainHex],
}

const onion: BattlefieldOnionView = {
	unitId: 'onion-1',
	typeId: 'TheOnion',
	role: 'onion',
	side: 'onion',
	friendlyName: 'The Onion',
	position: { q: 0, r: 0 },
	state: 'operational',
	treads: 33,
	movesAllowed: 3,
	movesRemaining: 3,
	ramsRemaining: 0,
	weapons: [
		{ id: 'main-1', typeId: 'TheOnion.main', weaponClass: 'main', state: 'ready', friendlyName: 'Main Weapon' },
	],
}

const defenders: BattlefieldUnit[] = [
	{
		unitId: 'puss-1',
		typeId: 'Puss',
		role: 'defender',
		side: 'defender',
		friendlyName: 'Puss',
		state: 'operational',
		position: { q: 1, r: 1 },
		movesRemaining: 3,
		stackSize: 1,
		weapons: [],
		actionableModes: ['fire', 'combined'],
	},
	{
		unitId: 'wolf-2',
		typeId: 'BigBadWolf',
		role: 'defender',
		side: 'defender',
		friendlyName: 'Big Bad Wolf',
		state: 'operational',
		position: { q: 1, r: 2 },
		movesRemaining: 4,
		stackSize: 1,
		weapons: [],
		actionableModes: ['fire', 'combined'],
	},
]

const staleDefenderMove: BattlefieldUnit[] = [
	{
		...defenders[0],
		movesRemaining: 0,
	},
	{
		...defenders[1],
		movesRemaining: 0,
	},
]

const spentMovementEligibility: BattlefieldActionEligibility = {
	movementByUnitId: {
		'puss-1': { eligible: false, reason: 'no-movement-remaining' },
		'onion-1': { eligible: false, reason: 'not-your-turn' },
	},
	defenderCombatByUnitId: {},
	onionCombatByWeaponId: {},
}

describe('HexMapBoard', () => {
	it('uses projected movement eligibility instead of local allowance values', () => {
		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={[{ ...defenders[0], movesRemaining: 3 }]}
				onions={[onion]}
				actionEligibility={spentMovementEligibility}
				phase="DEFENDER_MOVE"
				viewerRole="defender"
				selectedUnitIds={['puss-1']}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		expect(screen.getByTestId('hex-cell-1-1')).not.toHaveClass('hex-cell-move-ready')
		expect(screen.getByTestId('hex-cell-2-1')).not.toHaveClass('hex-cell-reachable')
		expect(screen.getByTestId('hex-unit-puss-1')).not.toHaveClass('hex-unit-stack-move-ready')
	})

	it('does not highlight an eligible unit for an inactive viewer', () => {
		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				actionEligibility={{
					movementByUnitId: {
						'puss-1': { eligible: false, reason: 'not-your-turn' },
						'wolf-2': { eligible: false, reason: 'not-your-turn' },
						'onion-1': { eligible: false, reason: 'not-your-turn' },
					},
					defenderCombatByUnitId: {},
					onionCombatByWeaponId: {},
				}}
				phase="DEFENDER_MOVE"
				viewerRole="onion"
				selectedUnitIds={[]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		expect(screen.getByTestId('hex-cell-1-1')).not.toHaveClass('hex-cell-move-ready')
		expect(screen.getByTestId('hex-unit-puss-1')).not.toHaveClass('hex-unit-stack-move-ready')
	})

	it('uses projected movement eligibility during GEV secondary movement', () => {
		const secondaryMover = { ...defenders[1], movesRemaining: 1 }
		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={[secondaryMover]}
				onions={[onion]}
				actionEligibility={{
					movementByUnitId: {
						'wolf-2': { eligible: true },
						'onion-1': { eligible: false, reason: 'not-your-turn' },
					},
					defenderCombatByUnitId: {},
					onionCombatByWeaponId: {},
				}}
				phase="GEV_SECOND_MOVE"
				viewerRole="defender"
				selectedUnitIds={['wolf-2']}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		expect(screen.getByTestId('hex-cell-1-2')).toHaveClass('hex-cell-move-ready')
		expect(screen.getByTestId('hex-cell-2-2')).toHaveClass('hex-cell-reachable')
		expect(screen.getByTestId('hex-unit-wolf-2')).toHaveClass('hex-unit-stack-move-ready')
	})

	it('renders stacked Little Pigs without a badge overlay', () => {
		const stackedDefenders: BattlefieldUnit[] = [
			{
				...defenders[0],
				unitId: 'pigs-1',
				friendlyName: 'Little Pigs 1',
				position: { q: 2, r: 2 },
				movesRemaining: 3,
					weapons: [],
				actionableModes: ['fire', 'combined'],
			},
			{
				...defenders[1],
				unitId: 'pigs-2',
				friendlyName: 'Little Pigs 2',
				position: { q: 2, r: 2 },
				movesRemaining: 3,
					weapons: [],
				actionableModes: ['fire', 'combined'],
			},
		]
		const stackRoster: StackRosterState = {
			groupsById: {
				'LittlePigs:2,2': {
					groupName: 'Little Pigs group',
					unitType: 'LittlePigs',
					position: { q: 2, r: 2 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
			},
		}

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={stackedDefenders}
				onions={[onion]}
				stackRoster={stackRoster}
				phase="DEFENDER_MOVE"
				selectedUnitIds={[]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		expect(getMarkerLabel('pigs-1')).toBe('Little Pigs 1')
		expect(screen.queryByTestId('hex-unit-pigs-2')).toBeNull()
		expect(screen.queryByTestId('hex-stack-label-2-2')).toBeNull()
		expect(screen.queryByTestId('hex-stack-count-2-2')).toBeNull()
	})

	it('highlights an eligible selected unit and its reachable move radius', () => {
		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="DEFENDER_MOVE"
				selectedUnitIds={["puss-1"]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		const selectedCell = screen.getByTestId('hex-cell-1-1')
		const reachableCell = screen.getByTestId('hex-cell-2-1')
		expect(screen.getByTestId('hex-unit-puss-1').getAttribute('data-selected')).toBe('true')
		expect(selectedCell?.getAttribute('class')).toContain('hex-cell-selected')
		expect(selectedCell?.getAttribute('class')).toContain('hex-cell-move-ready')
		expect(reachableCell?.getAttribute('class')).toContain('hex-cell-reachable')
	})

	it('keeps defender move paths collapsed when the rendered allowance is stale', () => {
		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={staleDefenderMove}
				onions={[onion]}
				phase="DEFENDER_MOVE"
				selectedUnitIds={["puss-1"]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		expect(screen.getByTestId('hex-unit-puss-1').getAttribute('class')).not.toContain('hex-unit-stack-move-ready')
		expect(screen.getByTestId('hex-cell-2-1').getAttribute('class')).not.toContain('hex-cell-reachable')
	})

	it('marks the Onion as move-ready on the Onion movement side', () => {
		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="ONION_MOVE"
				selectedUnitIds={[]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		expect(getSpriteMarker('onion-1').classList.contains('hex-unit-stack-move-ready')).toBe(true)
		expect(getSpriteMarker('puss-1').classList.contains('hex-unit-stack-move-ready')).toBe(false)
		expect(getSpriteMarker('wolf-2').classList.contains('hex-unit-stack-move-ready')).toBe(false)
	})

	it('marks defenders as move-ready on the Defender movement side', () => {
		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="DEFENDER_MOVE"
				selectedUnitIds={[]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		expect(getSpriteMarker('wolf-2').classList.contains('hex-unit-stack-move-ready')).toBe(true)
		expect(getSpriteMarker('onion-1').classList.contains('hex-unit-stack-move-ready')).toBe(false)
	})

	it('marks disabled movement units in the sprite marker', () => {
		const disabledDefender: BattlefieldUnit = {
			...defenders[0],
			unitId: 'puss-disabled',
			state: 'disabled',
			movesRemaining: 3,
		}

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={[disabledDefender]}
				onions={[onion]}
				phase="DEFENDER_MOVE"
				selectedUnitIds={[]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		const marker = getSpriteMarker('puss-disabled')
		expect(marker.classList.contains('hex-unit-stack-disabled')).toBe(true)
		expect(marker.classList.contains('tone-dim')).toBe(true)
		expect(marker.querySelector('.hex-unit-disabled-icon')).not.toBeNull()
	})

	it('keeps a destroyed swamp visible and selectable on the map', () => {
		const destroyedSwamp: BattlefieldUnit = {
			...defenders[0],
			unitId: 'swamp-1',
			typeId: 'Swamp',
			friendlyName: 'The Swamp',
			state: 'destroyed',
			position: { q: 1, r: 1 },
			movesRemaining: 0,
			weapons: [],
			actionableModes: [],
		}

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={[destroyedSwamp, defenders[1]]}
				onions={[onion]}
				phase="DEFENDER_MOVE"
				selectedUnitIds={["swamp-1"]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		expect(screen.getByTestId('hex-unit-swamp-1')).not.toBeNull()
		expect(screen.getByTestId('hex-unit-swamp-1').getAttribute('class')).toContain('tone-destroyed')
		expect(screen.getByTestId('hex-unit-swamp-1').getAttribute('data-selected')).toBe('true')
		expect(screen.getByTestId('hex-unit-swamp-1').querySelector('image')?.getAttribute('href')).toContain('destroyed')
	})

	it('uses the intact swamp sprite for an operational swamp', () => {
		const intactSwamp: BattlefieldUnit = {
			...defenders[0],
			unitId: 'swamp-1',
			typeId: 'Swamp',
			friendlyName: 'The Swamp',
			state: 'operational',
			position: { q: 1, r: 1 },
			movesRemaining: 0,
			weapons: [],
			actionableModes: [],
		}

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={[intactSwamp]}
				onions={[onion]}
				phase="DEFENDER_MOVE"
				selectedUnitIds={[]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		const swampUnit = screen.getByTestId('hex-unit-swamp-1')
		expect(swampUnit.querySelector('image')?.getAttribute('href')).toContain('intact')
		expect(swampUnit.querySelector('rect')?.getAttribute('class')).toContain('hex-unit-rect-swamp')
		expect(swampUnit).not.toHaveClass('hex-unit-stack-move-ready')
		expect(swampUnit).not.toHaveClass('hex-unit-stack-combat-ready')
		expect(swampUnit.querySelector('rect')?.getAttribute('width')).toBe('48')
		expect(swampUnit.querySelector('rect')?.getAttribute('height')).toBe('48')
	})

	it('renders the swamp hex terrain behind the unit', () => {
		const swampTerrainScenarioMap = {
			...scenarioMap,
			hexes: [{ q: 1, r: 1, t: 1 } as TerrainHex],
		}

		render(
			<HexMapBoard
				scenarioMap={swampTerrainScenarioMap}
				defenders={[
					{
						...defenders[0],
						unitId: 'swamp-1',
						typeId: 'Swamp',
						friendlyName: 'The Swamp',
						state: 'operational',
						position: { q: 1, r: 1 },
						movesRemaining: 0,
									weapons: [],
						actionableModes: [],
					},
				]}
				onions={[onion]}
				phase="DEFENDER_MOVE"
				selectedUnitIds={[]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		expect(screen.getByTestId('hex-cell-1-1').getAttribute('class')).toContain('hex-terrain-1')
		expect(screen.getByTestId('hex-cell-1-1').getAttribute('class')).not.toContain('hex-terrain-default')
	})

	it('outlines escape hexes', () => {
		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="DEFENDER_MOVE"
				escapeHexes={[{ q: 2, r: 1 }, { q: 4, r: 4 }]}
				selectedUnitIds={[]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		expect(screen.getByTestId('hex-cell-2-1').getAttribute('class')).toContain('hex-cell-escape')
		expect(screen.getByTestId('hex-cell-4-4').getAttribute('class')).toContain('hex-cell-escape')
		expect(screen.getByTestId('hex-cell-2-1').querySelector('.hex-shape-escape-overlay')).not.toBeNull()
		expect(screen.getByTestId('hex-cell-4-4').querySelector('.hex-shape-escape-overlay')).not.toBeNull()
		expect(screen.getByTestId('hex-cell-0-0').getAttribute('class')).not.toContain('hex-cell-escape')
	})

	it('renders combat range overlays when provided', () => {
		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="ONION_COMBAT"
				selectedUnitIds={["weapon:main-1"]}
				combatRangeHexKeys={new Set(['1,1', '2,1'])}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		expect(screen.getByTestId('hex-cell-1-1').getAttribute('class')).toContain('hex-cell-combat-range')
		expect(screen.getByTestId('hex-cell-2-1').getAttribute('class')).toContain('hex-cell-combat-range')
		expect(screen.getByTestId('hex-cell-0-0').getAttribute('class')).not.toContain('hex-cell-combat-range')
	})

	it('renders default terrain cells alongside special terrain overrides', () => {
		render(
			<HexMapBoard
				scenarioMap={{
					width: 5,
					height: 5,
					cells: Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, q) => ({ q, r }))).flat(),
					hexes: [{ q: 2, r: 1, t: 1 }],
				}}
				defenders={defenders}
				onions={[onion]}
				phase="DEFENDER_MOVE"
				selectedUnitIds={[]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		expect(screen.getByTestId('hex-cell-0-0')).not.toBeNull()
		expect(screen.getByTestId('hex-cell-2-1')).not.toBeNull()
		expect(screen.getByTestId('hex-cell-1-0').getAttribute('class')).toContain('hex-terrain-default')
		expect(screen.getByTestId('hex-cell-4-4').getAttribute('class')).toContain('hex-terrain-default')
	})

	it('sizes the svg from sparse cell membership and keeps overlays on the rendered cell', () => {
		render(
			<HexMapBoard
				scenarioMap={sparseScenarioMap}
				defenders={[
					{
						unitId: 'wolf-2',
						typeId: 'BigBadWolf',
						friendlyName: 'Big Bad Wolf',
						role: 'defender',
						side: 'defender',
						state: 'operational',
						position: { q: 4, r: 4 },
						movesRemaining: 4,
						stackSize: 1,
						weapons: [],
						actionableModes: ['fire', 'combined'],
					},
				]}
				onions={[onion]}
				phase="ONION_COMBAT"
				selectedUnitIds={["weapon:main-1"]}
				selectedCombatTargetId={null}
				combatRangeHexKeys={new Set(['4,4'])}
				onSelectUnit={vi.fn()}
				onSelectCombatTarget={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		const svg = screen.getByRole('img', { name: /swamp siege hex map/i }) as unknown as SVGSVGElement
		const expectedBounds = boardPixelSize(sparseScenarioMap.cells, 36, 28)

		expect(svg.getAttribute('width')).toBe(String(expectedBounds.width))
		expect(svg.getAttribute('height')).toBe(String(expectedBounds.height))
		expect(screen.getByTestId('hex-cell-4-4').getAttribute('class')).toContain('hex-cell-combat-range')
		expect(screen.queryByTestId('hex-cell-1-1')).toBeNull()
	})

	it('zooms from the vertical slider and preserves the current scroll anchor', () => {
		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="DEFENDER_MOVE"
				selectedUnitIds={["puss-1"]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		const viewport = screen.getByTestId('hex-map-viewport') as HTMLDivElement
		const scrollTo = vi.fn()
		Object.defineProperty(viewport, 'clientWidth', { value: 240, configurable: true })
		Object.defineProperty(viewport, 'clientHeight', { value: 180, configurable: true })
		Object.defineProperty(viewport, 'scrollLeft', { value: 90, writable: true, configurable: true })
		Object.defineProperty(viewport, 'scrollTop', { value: 60, writable: true, configurable: true })
		Object.defineProperty(viewport, 'scrollTo', { value: scrollTo, configurable: true })

		fireEvent.change(screen.getByRole('slider', { name: /map zoom/i }), { target: { value: '150' } })

		const svg = screen.getByRole('img', { name: /swamp siege hex map/i })
		const expectedBounds = boardPixelSize(scenarioMap.cells, 36, 28)
		expect(svg.getAttribute('width')).toBe(String(expectedBounds.width * 1.5))
		expect(svg.getAttribute('height')).toBe(String(expectedBounds.height * 1.5))
		expect(scrollTo).toHaveBeenCalledWith({ left: 195, top: 135, behavior: 'auto' })
	})

	it('scrolls when the user wheels over the map viewport', () => {
		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="DEFENDER_MOVE"
				selectedUnitIds={["puss-1"]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		const viewport = screen.getByTestId('hex-map-viewport') as HTMLDivElement
		const scrollTo = vi.fn()
		const scrollBy = vi.fn()
		Object.defineProperty(viewport, 'clientWidth', { value: 240, configurable: true })
		Object.defineProperty(viewport, 'clientHeight', { value: 180, configurable: true })
		Object.defineProperty(viewport, 'scrollLeft', { value: 90, writable: true, configurable: true })
		Object.defineProperty(viewport, 'scrollTop', { value: 60, writable: true, configurable: true })
		Object.defineProperty(viewport, 'scrollTo', { value: scrollTo, configurable: true })
		Object.defineProperty(viewport, 'scrollBy', { value: scrollBy, configurable: true })

		const svg = screen.getByRole('img', { name: /swamp siege hex map/i })
		const initialWidth = Number(svg.getAttribute('width'))

		fireEvent.wheel(viewport, { deltaY: -120 })

		expect(Number(svg.getAttribute('width'))).toBe(initialWidth)
		expect(scrollBy).toHaveBeenCalledWith({ left: 0, top: -120, behavior: 'auto' })
	})

	it('zooms when the user wheels over the zoom slider', () => {
		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="DEFENDER_MOVE"
				selectedUnitIds={["puss-1"]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		const slider = screen.getByLabelText(/map zoom/i)
		const svg = screen.getByRole('img', { name: /swamp siege hex map/i })
		const initialWidth = Number(svg.getAttribute('width'))

		fireEvent.wheel(slider, { deltaY: -120 })

		expect(Number(svg.getAttribute('width'))).toBeGreaterThan(initialWidth)
	})

	it('exposes a zoom range that can fully fit the map', () => {
		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="DEFENDER_MOVE"
				selectedUnitIds={["puss-1"]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		const slider = screen.getByLabelText(/map zoom/i)
		expect(slider.getAttribute('min')).toBe('50')
		expect(slider.getAttribute('max')).toBe('200')
	})

	it('deselects when the user left-clicks an empty hex', () => {
		const onDeselect = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="DEFENDER_MOVE"
				selectedUnitIds={["puss-1"]}
				onSelectUnit={vi.fn()}
				onDeselect={onDeselect}
				onMoveUnit={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId('hex-cell-2-0'))
		expect(onDeselect).toHaveBeenCalledTimes(1)
	})

	it('submits a move when the user right-clicks an in-range hex', () => {
		const onMoveUnit = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="DEFENDER_MOVE"
				selectedUnitIds={["puss-1"]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={onMoveUnit}
			/>,
		)

		fireEvent.contextMenu(screen.getByTestId('hex-cell-2-1'))
		expect(onMoveUnit).toHaveBeenCalledWith('puss-1', { q: 2, r: 1 })
	})

	it('does not submit a right-click beyond the movement already spent', () => {
		const onMoveUnit = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={[
					{
						...defenders[0],
						movesRemaining: 1,
						movementSpent: { DEFENDER_MOVE: 2 },
					},
				]}
				onions={[onion]}
				phase="DEFENDER_MOVE"
				selectedUnitIds={["puss-1"]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={onMoveUnit}
			/>,
		)

		fireEvent.contextMenu(screen.getByTestId('hex-cell-4-1'))
		expect(onMoveUnit).not.toHaveBeenCalled()
	})

	it('allows the Onion to be selected from the map during Onion movement', () => {
		const onSelectUnit = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="ONION_MOVE"
				selectedUnitIds={["onion-1"]}
				onSelectUnit={onSelectUnit}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId('hex-unit-onion-1'))
		expect(onSelectUnit).toHaveBeenCalledWith('onion-1', false)
	})

	it('inspects a defender from the map during Onion combat without selecting a combat target', () => {
		const onSelectCombatTarget = vi.fn()
		const onSelectUnit = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="ONION_COMBAT"
				viewerRole="onion"
				selectedUnitIds={["weapon:main-1"]}
				selectedCombatTargetId={null}
				onSelectUnit={onSelectUnit}
				onSelectCombatTarget={onSelectCombatTarget}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId('hex-unit-puss-1'))
		expect(onSelectUnit).toHaveBeenCalledWith('puss-1', false)
		expect(onSelectCombatTarget).not.toHaveBeenCalled()
	})

	it('selects a defender target from a right-click during Onion combat', () => {
		const onSelectCombatTarget = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="ONION_COMBAT"
				viewerRole="onion"
				selectedUnitIds={["weapon:main-1"]}
				selectedCombatTargetId={null}
				onSelectUnit={vi.fn()}
				onSelectCombatTarget={onSelectCombatTarget}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		fireEvent.contextMenu(screen.getByTestId('hex-unit-puss-1'))
		expect(onSelectCombatTarget).toHaveBeenCalledWith('puss-1')
	})

	it('selects the roster group when right-clicking a stacked defender during Onion combat', () => {
		const onSelectCombatTarget = vi.fn()
		const littlePigsStack: BattlefieldUnit[] = [
			{ ...defenders[0], unitId: 'pigs-1', typeId: 'LittlePigs', friendlyName: 'Little Pigs 1' },
			{ ...defenders[0], unitId: 'pigs-2', typeId: 'LittlePigs', friendlyName: 'Little Pigs 2' },
		]
		const stackRoster: StackRosterState = {
			groupsById: {
				'LittlePigs:1,1': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 1, r: 1 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
			},
		}

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={littlePigsStack}
				onions={[onion]}
				phase="ONION_COMBAT"
				viewerRole="onion"
				selectedUnitIds={['weapon:main-1']}
				combatTargetIds={new Set(['LittlePigs:1,1'])}
				stackRoster={stackRoster}
				onSelectUnit={vi.fn()}
				onSelectCombatTarget={onSelectCombatTarget}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		fireEvent.contextMenu(screen.getByTestId('hex-unit-pigs-1'))
		expect(onSelectCombatTarget).toHaveBeenCalledWith('LittlePigs:1,1')
	})

	it('selects the Onion treads from a right-click during defender combat', () => {
		const onSelectCombatTarget = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="DEFENDER_COMBAT"
				viewerRole="defender"
				selectedUnitIds={['puss-1']}
				selectedCombatTargetId={'onion-1:treads'}
				combatTargetIds={new Set(['onion-1:treads', 'weapon:main'])}
				onSelectUnit={vi.fn()}
				onSelectCombatTarget={onSelectCombatTarget}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		fireEvent.contextMenu(screen.getByTestId('hex-unit-onion-1'))
		expect(onSelectCombatTarget).toHaveBeenCalledWith('onion-1:treads')
		expect(screen.getByTestId('hex-unit-onion-1').getAttribute('data-selected')).toBe('false')
		expect(screen.getByTestId('hex-cell-0-0').getAttribute('class')).toContain('hex-cell-selected')
	})

	it('lets the Onion client inspect the Onion by left click during defender combat', () => {
		const onSelectUnit = vi.fn()
		const onSelectCombatTarget = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="DEFENDER_COMBAT"
				viewerRole="onion"
				selectedUnitIds={['puss-1']}
				selectedCombatTargetId={null}
				onSelectUnit={onSelectUnit}
				onSelectCombatTarget={onSelectCombatTarget}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId('hex-unit-onion-1'))
		expect(onSelectUnit).toHaveBeenCalledWith('onion-1', false)
		expect(onSelectCombatTarget).not.toHaveBeenCalled()
	})

	it('allows defender combat board clicks on defender units to add to the selection group', () => {
		const onSelectUnit = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="DEFENDER_COMBAT"
				selectedUnitIds={['puss-1']}
				onSelectUnit={onSelectUnit}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId('hex-unit-wolf-2'), { ctrlKey: true })
		expect(onSelectUnit).toHaveBeenCalledWith('wolf-2', true)
	})

	it('does not select a combat target that is not in the legal target set', () => {
		const onSelectCombatTarget = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="ONION_COMBAT"
				selectedUnitIds={['weapon:ap_2']}
				combatTargetIds={new Set(['puss-1'])}
				selectedCombatTargetId={null}
				onSelectUnit={vi.fn()}
				onSelectCombatTarget={onSelectCombatTarget}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		fireEvent.contextMenu(screen.getByTestId('hex-unit-wolf-2'))
		expect(onSelectCombatTarget).not.toHaveBeenCalled()
		expect(screen.getByTestId('hex-unit-wolf-2').getAttribute('data-selected')).toBe('false')
	})

	it('highlights every selected unit across the board when a selection group is active', () => {
		const onSelectUnit = vi.fn()
		const sharedOnion: BattlefieldOnionView = {
			...onion,
				position: { q: 1, r: 1 },
		}
		const sharedDefender: BattlefieldUnit = {
			...defenders[0],
			position: { q: 1, r: 1 },
		}

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={[sharedDefender]}
				onions={[sharedOnion]}
				phase="ONION_COMBAT"
				viewerRole="onion"
				selectedUnitIds={["weapon:main-1"]}
				onSelectUnit={onSelectUnit}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		expect(screen.getByTestId('hex-unit-onion-1')).not.toBeNull()
		expect(screen.getByTestId('hex-unit-puss-1')).not.toBeNull()
		expect(screen.getByTestId('hex-unit-onion-1').getAttribute('data-selected')).toBe('true')
		expect(screen.getByTestId('hex-unit-puss-1').getAttribute('data-selected')).toBe('false')
		expect(screen.getByTestId('hex-cell-1-1').getAttribute('class')).toContain('hex-cell-selected')

		fireEvent.click(screen.getByTestId('hex-unit-puss-1'), { ctrlKey: true })
		expect(onSelectUnit).toHaveBeenCalledWith('puss-1', true)

		fireEvent.click(screen.getByTestId('hex-unit-onion-1'))
		expect(onSelectUnit).toHaveBeenCalledWith('onion-1', false)
	})

	it('removes a unit from a ctrl-clicked selection group while preserving the rest', () => {
		const onSelectUnit = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="DEFENDER_MOVE"
				selectedUnitIds={["puss-1", "wolf-2"]}
				onSelectUnit={onSelectUnit}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId('hex-unit-puss-1'), { ctrlKey: true })
		expect(onSelectUnit).toHaveBeenCalledWith('puss-1', true)
	})

	it('allows Onion combat board clicks to inspect units without changing combat targeting', () => {
		const onSelectUnit = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="ONION_COMBAT"
				viewerRole="onion"
				selectedUnitIds={["weapon:main-1"]}
				onSelectUnit={onSelectUnit}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId('hex-unit-onion-1'), { ctrlKey: true })
		expect(onSelectUnit).toHaveBeenCalledWith('onion-1', true)
		fireEvent.click(screen.getByTestId('hex-unit-puss-1'), { ctrlKey: true })
		expect(onSelectUnit).toHaveBeenCalledWith('puss-1', true)
		expect(screen.getByTestId('hex-unit-onion-1').getAttribute('data-selected')).toBe('true')
		expect(screen.getByTestId('hex-unit-puss-1').getAttribute('data-selected')).toBe('false')
	})

	it('ignores right-clicks when the selected unit is invalid', () => {
		const onMoveUnit = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="DEFENDER_MOVE"
				selectedUnitIds={["ghost-unit"]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={onMoveUnit}
			/>,
		)

		fireEvent.contextMenu(screen.getByTestId('hex-cell-2-1'))
		expect(onMoveUnit).not.toHaveBeenCalled()
		expect(screen.queryByText(/illegal move/i)).toBeNull()
	})

	it('ignores right-clicks when move submission is disabled', () => {
		const onMoveUnit = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="DEFENDER_MOVE"
				selectedUnitIds={["puss-1"]}
				canSubmitMove={false}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={onMoveUnit}
			/>,
		)

		fireEvent.contextMenu(screen.getByTestId('hex-cell-2-1'))
		expect(onMoveUnit).not.toHaveBeenCalled()
		expect(screen.queryByText(/illegal move/i)).toBeNull()
	})

	it('shows the occupied-hex move reason when the user right-clicks an invalid destination with an eligible unit', () => {
		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onions={[onion]}
				phase="DEFENDER_MOVE"
				selectedUnitIds={["puss-1"]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)
		fireEvent.contextMenu(screen.getByTestId('hex-cell-1-2'))
		const toast = screen.getByText(/destination hex is occupied/i)
		expect(toast).not.toBeNull()
		expect(toast.parentElement?.classList.contains('hex-map-toast-overlay')).toBe(true)
		fireEvent.click(document.body)
		expect(screen.queryByText(/destination hex is occupied/i)).toBeNull()
	})

	it('does not show an error bubble when the selected unit is ineligible (e.g., disabled)', () => {
		const disabledDefender = { ...defenders[0], state: 'disabled' as const }
		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={[disabledDefender]}
				onions={[onion]}
				phase="DEFENDER_MOVE"
				selectedUnitIds={["puss-1"]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)
		fireEvent.contextMenu(screen.getByTestId('hex-cell-2-4'))
		expect(screen.queryByText(/illegal move/i)).toBeNull()
	})
})
