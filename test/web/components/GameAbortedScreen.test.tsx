// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { GameAbortedScreen } from '#web/components/GameAbortedScreen'

describe('GameAbortedScreen', () => {
	it('renders the supplied terminal message and stable test id', () => {
		render(<GameAbortedScreen message="Loaded game snapshot is invalid" />)

		expect(screen.getByTestId('game-aborted')).toHaveTextContent('Game aborted')
		expect(screen.getByTestId('game-aborted')).toHaveTextContent('Loaded game snapshot is invalid')
		expect(screen.getByRole('alert')).toBe(screen.getByTestId('game-aborted'))
	})

	it('renders the fallback terminal message when no message is supplied', () => {
		render(<GameAbortedScreen />)

		expect(screen.getByTestId('game-aborted')).toHaveTextContent('This game was stopped because its state could not be verified.')
	})
})