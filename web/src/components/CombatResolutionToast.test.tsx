// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { CombatResolutionToast } from './CombatResolutionToast'

describe('CombatResolutionToast', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('renders resolution details and dismisses on click', () => {
		const onDismiss = vi.fn()

		render(
			<CombatResolutionToast
				title="Combat resolved on Treads"
				resolution={{
					actionType: 'FIRE',
					attackers: ['wolf-2'],
					targetId: 'onion-1',
					outcome: 'X',
					outcomeLabel: 'Hit',
					roll: 6,
					odds: '2:1',
					details: ['Treads lost: 3 (remaining 30)'],
				}}
				modifiers={['Attackers: 2']}
				onDismiss={onDismiss}
			/>,
		)

		expect(screen.getByTestId('combat-resolution-toast')).not.toBeNull()
		expect(screen.getByText(/Combat resolved on Treads/i)).not.toBeNull()
		expect(screen.getByText(/^Hit$/i)).not.toBeNull()
		expect(screen.getByText(/^6$/i)).not.toBeNull()
		expect(screen.getByText(/^2:1$/i)).not.toBeNull()
		expect(screen.getByText(/Attackers: 2/i)).not.toBeNull()
		expect(screen.getByText(/Treads lost: 3/i)).not.toBeNull()

		fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
		expect(onDismiss).toHaveBeenCalledTimes(1)
	})

	it('auto-dismisses after ten seconds', () => {
		const onDismiss = vi.fn()

		render(
			<CombatResolutionToast
				title="Combat resolved on Treads"
				resolution={{
					actionType: 'FIRE',
					attackers: ['wolf-2'],
					targetId: 'onion-1',
					outcome: 'X',
					outcomeLabel: 'Hit',
					roll: 6,
					odds: '2:1',
					details: ['Treads lost: 3 (remaining 30)'],
				}}
				modifiers={['Attackers: 2']}
				onDismiss={onDismiss}
			/>,
		)

		vi.advanceTimersByTime(10_000)
		expect(onDismiss).toHaveBeenCalledTimes(1)
	})
})