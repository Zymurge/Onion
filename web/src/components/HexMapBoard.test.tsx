it('allows move submission during the active player\'s move phase', () => {
	const onMoveUnit = vi.fn()
	render(
		<HexMapBoard
			scenarioMap={scenarioMap}
			defenders={defenders}
			onion={onion}
			phase="ONION_MOVE"
			selectedUnitId="onion-1"
			canSubmitMove={true}
			onSelectUnit={vi.fn()}
			onDeselect={vi.fn()}
			onMoveUnit={onMoveUnit}
		/>,
	)
	fireEvent.contextMenu(screen.getByTestId('hex-cell-1-1'))
	expect(onMoveUnit).toHaveBeenCalledWith('onion-1', { q: 1, r: 1 })
})

it('disallows move submission during the other player\'s phase', () => {
	const onMoveUnit = vi.fn()
	render(
		<HexMapBoard
			scenarioMap={scenarioMap}
			defenders={defenders}
			onion={onion}
			phase="DEFENDER_FIRE"
			selectedUnitId="onion-1"
			canSubmitMove={false}
			onSelectUnit={vi.fn()}
			onDeselect={vi.fn()}
			onMoveUnit={onMoveUnit}
		/>,
	)
	fireEvent.contextMenu(screen.getByTestId('hex-cell-1-1'))
	expect(onMoveUnit).not.toHaveBeenCalled()
	expect(screen.queryByText(/illegal move/i)).toBeNull()
})

it('disallows move submission during the active player\'s non-move phase', () => {
	const onMoveUnit = vi.fn()
	render(
		<HexMapBoard
			scenarioMap={scenarioMap}
			defenders={defenders}
			onion={onion}
			phase="ONION_FIRE"
			selectedUnitId="onion-1"
			canSubmitMove={false}
			onSelectUnit={vi.fn()}
			onDeselect={vi.fn()}
			onMoveUnit={onMoveUnit}
		/>,
	)
	fireEvent.contextMenu(screen.getByTestId('hex-cell-1-1'))
	expect(onMoveUnit).not.toHaveBeenCalled()
	expect(screen.queryByText(/illegal move/i)).toBeNull()
})
// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { HexMapBoard } from './HexMapBoard'
import type { BattlefieldOnionView, BattlefieldUnit, TerrainHex } from '../lib/battlefieldView'

const scenarioMap = {
	width: 5,
	height: 5,
	hexes: [] as TerrainHex[],
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
		q: 2,
		r: 2,
		move: 4,
		weapons: 'main: ready',
		attack: '2 / rng 2',
		actionableModes: ['fire', 'combined'],
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
				selectedUnitId="puss-1"
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		const selectedCell = screen.getByTestId('hex-cell-1-1')
		const reachableCell = screen.getByTestId('hex-cell-2-1')
		expect(selectedCell?.getAttribute('class')).toContain('hex-cell-selected')
		expect(selectedCell?.getAttribute('class')).toContain('hex-cell-move-ready')
		expect(reachableCell?.getAttribute('class')).toContain('hex-cell-reachable')
	})

	it('deselects when the user left-clicks an empty hex', () => {
		const onDeselect = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onion={onion}
				phase="DEFENDER_MOVE"
				selectedUnitId="puss-1"
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
				selectedUnitId="puss-1"
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={onMoveUnit}
			/>,
		)

		fireEvent.contextMenu(screen.getByTestId('hex-cell-2-1'))
		expect(onMoveUnit).toHaveBeenCalledWith('puss-1', { q: 2, r: 1 })
	})

	it('renders and selects both occupants when the onion and a defender share a hex', () => {
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
				phase="ONION_MOVE"
				selectedUnitId="onion-1"
				onSelectUnit={onSelectUnit}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)

		expect(screen.getByTestId('hex-unit-onion-1')).not.toBeNull()
		expect(screen.getByTestId('hex-unit-puss-1')).not.toBeNull()

		fireEvent.click(screen.getByTestId('hex-unit-puss-1'))
		expect(onSelectUnit).toHaveBeenCalledWith('puss-1')

		fireEvent.click(screen.getByTestId('hex-unit-onion-1'))
		expect(onSelectUnit).toHaveBeenCalledWith('onion-1')
	})

	it('ignores right-clicks when the selected unit is invalid', () => {
		const onMoveUnit = vi.fn()

		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={defenders}
				onion={onion}
				phase="DEFENDER_MOVE"
				selectedUnitId="ghost-unit"
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
				selectedUnitId="puss-1"
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
				selectedUnitId="puss-1"
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)
		fireEvent.contextMenu(screen.getByTestId('hex-cell-4-4'))
		expect(screen.getByText(/illegal move/i)).not.toBeNull()
	})

	it('does not show an error bubble when the selected unit is ineligible (e.g., disabled)', () => {
		const disabledDefender = { ...defenders[0], status: 'disabled' }
		render(
			<HexMapBoard
				scenarioMap={scenarioMap}
				defenders={[disabledDefender]}
				onion={onion}
				phase="DEFENDER_MOVE"
				selectedUnitId="puss-1"
				onSelectUnit={vi.fn()}
				onDeselect={vi.fn()}
				onMoveUnit={vi.fn()}
			/>,
		)
		fireEvent.contextMenu(screen.getByTestId('hex-cell-4-4'))
		expect(screen.queryByText(/illegal move/i)).toBeNull()
	})
})