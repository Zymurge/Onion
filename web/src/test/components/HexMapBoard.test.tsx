// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HexMapBoard } from '../../components/HexMapBoard'
import { boardPixelSize } from '../../lib/hex'
import type { BattlefieldOnionView, BattlefieldUnit, TerrainHex } from '../../lib/battlefieldView'

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
	id: 'onion-1',
	type: 'TheOnion',
	q: 0,
	r: 0,
	status: 'operational',
	treads: 33,
	movesAllowed: 3,
	movesRemaining: 3,
	rams: 0,
	weapons: 'main: ready',
}

const defenders: BattlefieldUnit[] = [
	{
		id: 'puss-1',
		type: 'Puss',
		status: 'operational',
		q: 1,
		r: 1,
		move: 3,
		weapons: 'main: ready',
		attack: '4 / rng 2',
		actionableModes: ['fire', 'combined'],
	},
	{
		id: 'wolf-2',
		type: 'BigBadWolf',
		status: 'operational',
		q: 1,
		r: 2,
		move: 4,
		weapons: 'main: ready',
		attack: '2 / rng 2',
		actionableModes: ['fire', 'combined'],
	},
]

const staleDefenderMove: BattlefieldUnit[] = [
	{
		...defenders[0],
		move: 0,
	},
	{
		...defenders[1],
		move: 0,
	},
]

describe('HexMapBoard', () => {
	it('highlights an eligible selected unit and its reachable move radius', () => {
		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onion={onion}
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
				onion={onion}
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

	it('renders combat range overlays when provided', () => {
		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onion={onion}
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
				onion={onion}
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
						id: 'wolf-2',
						type: 'BigBadWolf',
						status: 'operational',
						q: 4,
						r: 4,
						move: 4,
						weapons: 'main: ready',
						attack: '2 / rng 2',
						actionableModes: ['fire', 'combined'],
					},
				]}
				onion={onion}
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

		const svg = screen.getByRole('img', { name: /swamp siege hex map/i }) as SVGSVGElement
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
				onion={onion}
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
				onion={onion}
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
				onion={onion}
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

	it('deselects when the user left-clicks an empty hex', () => {
		const onDeselect = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onion={onion}
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
				onion={onion}
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

	it('allows the Onion to be selected from the map during Onion movement', () => {
		const onSelectUnit = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onion={onion}
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

	it('selects a defender target directly from the map during Onion combat', () => {
		const onSelectCombatTarget = vi.fn()
		const onSelectUnit = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onion={onion}
				phase="ONION_COMBAT"
				selectedUnitIds={["weapon:main-1"]}
				selectedCombatTargetId={null}
				onSelectUnit={onSelectUnit}
				onSelectCombatTarget={onSelectCombatTarget}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId('hex-unit-puss-1'))
		expect(onSelectCombatTarget).toHaveBeenCalledWith('puss-1')
		expect(onSelectUnit).not.toHaveBeenCalled()
	})

	it('selects a defender target from a right-click during Onion combat', () => {
		const onSelectCombatTarget = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onion={onion}
				phase="ONION_COMBAT"
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

	it('maps defender combat clicks on the Onion to the treads target id', () => {
		const onSelectCombatTarget = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onion={onion}
				phase="DEFENDER_COMBAT"
				selectedUnitIds={['puss-1']}
				selectedCombatTargetId={'onion-1:treads'}
				combatTargetIds={new Set(['onion-1:treads', 'weapon:main'])}
				onSelectUnit={vi.fn()}
				onSelectCombatTarget={onSelectCombatTarget}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId('hex-unit-onion-1'))
		expect(onSelectCombatTarget).toHaveBeenCalledWith('onion-1:treads')
		expect(screen.getByTestId('hex-unit-onion-1').getAttribute('data-selected')).toBe('false')
		expect(screen.getByTestId('hex-cell-0-0').getAttribute('class')).toContain('hex-cell-selected')
	})

	it('allows defender combat board clicks on defender units to add to the selection group', () => {
		const onSelectUnit = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onion={onion}
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
				onion={onion}
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
			q: 1,
			r: 1,
		}
		const sharedDefender: BattlefieldUnit = {
			...defenders[0],
			q: 1,
			r: 1,
		}

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={[sharedDefender]}
				onion={sharedOnion}
				phase="ONION_COMBAT"
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
		expect(onSelectUnit).not.toHaveBeenCalled()

		fireEvent.click(screen.getByTestId('hex-unit-onion-1'))
		expect(onSelectUnit).not.toHaveBeenCalled()
	})

	it('removes a unit from a ctrl-clicked selection group while preserving the rest', () => {
		const onSelectUnit = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onion={onion}
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

	it('does not allow Onion combat board clicks to alter the attacker group', () => {
		const onSelectUnit = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onion={onion}
				phase="ONION_COMBAT"
				selectedUnitIds={["weapon:main-1"]}
				onSelectUnit={onSelectUnit}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId('hex-unit-onion-1'), { ctrlKey: true })
		expect(onSelectUnit).not.toHaveBeenCalled()
		fireEvent.click(screen.getByTestId('hex-unit-puss-1'), { ctrlKey: true })
		expect(onSelectUnit).not.toHaveBeenCalled()
		expect(screen.getByTestId('hex-unit-onion-1').getAttribute('data-selected')).toBe('true')
		expect(screen.getByTestId('hex-unit-puss-1').getAttribute('data-selected')).toBe('false')
	})

	it('ignores right-clicks when the selected unit is invalid', () => {
		const onMoveUnit = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onion={onion}
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
				onion={onion}
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

	it('shows an out-of-range bubble when the user right-clicks an invalid hex with an eligible unit', () => {
		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onion={onion}
				phase="DEFENDER_MOVE"
				selectedUnitIds={["puss-1"]}
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)
		fireEvent.contextMenu(screen.getByTestId('hex-cell-2-4'))
		expect(screen.getByText(/illegal move/i)).not.toBeNull()
	})

	it('does not show an error bubble when the selected unit is ineligible (e.g., disabled)', () => {
		const disabledDefender = { ...defenders[0], status: 'disabled' as const }
		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={[disabledDefender]}
				onion={onion}
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
