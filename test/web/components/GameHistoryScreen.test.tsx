// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GameHistoryScreen } from '#web/components/GameHistoryScreen'
import { saveAuthSession } from '#web/lib/authSession'

function response(body: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		statusText: status === 500 ? 'Internal Server Error' : 'OK',
		text: async () => JSON.stringify(body),
	} as Response
}

const completedGame = {
	gameId: 12,
	scenarioId: 'swamp-siege-01',
	scenarioDisplayName: 'The Siege of Shrek\'s Swamp',
	phase: 'ONION_MOVE',
	turnNumber: 8,
	winner: 'user-1',
	status: 'completed',
	createdAt: '2026-09-20T10:00:00.000Z',
	lastActivityAt: '2026-09-21T11:00:00.000Z',
	completedAt: '2026-09-21T11:00:00.000Z',
	hostUserId: 'user-1',
	canDelete: true,
	players: { onion: 'user-1', defender: 'user-2' },
	role: 'onion',
}

describe('GameHistoryScreen', () => {
	beforeEach(() => {
		window.sessionStorage.clear()
		window.localStorage.clear()
		window.history.replaceState({}, '', '/user/history')
		vi.restoreAllMocks()
	})

	it('lists completed matches and preserves the history navigation state', async () => {
		saveAuthSession({ apiBaseUrl: 'http://localhost:3000', username: 'player-1', userId: 'user-1', token: 'token-1' })
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ games: [completedGame] }))

		render(<GameHistoryScreen />)

		expect(screen.getByRole('heading', { name: 'Game History' })).not.toBeNull()
		await screen.findByText('The Siege of Shrek\'s Swamp')
		expect(screen.getByText(/Onion: user-1.*Defenders: user-2/)).not.toBeNull()
		expect(screen.getByRole('link', { name: 'Review Game' })).toHaveAttribute('href', '/game/12?returnTo=%2Fuser%2Fhistory')
		expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute('href', '/user/history')
		expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/games/history?status=all&creator=any', expect.anything())
	})

	it('returns from review to the active history filters', async () => {
		const user = userEvent.setup()
		saveAuthSession({ apiBaseUrl: 'http://localhost:3000', username: 'player-1', userId: 'user-1', token: 'token-1' })
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ games: [completedGame] }))

		render(<GameHistoryScreen />)
		await screen.findByText('The Siege of Shrek\'s Swamp')
		await user.selectOptions(screen.getByLabelText('Creator'), 'me')

		expect(screen.getByRole('link', { name: 'Review Game' })).toHaveAttribute(
			'href',
			'/game/12?returnTo=%2Fuser%2Fhistory%3Fcreator%3Dme',
		)
	})

	it('filters by my games and supports archive and delete confirmation', async () => {
		const user = userEvent.setup()
		saveAuthSession({ apiBaseUrl: 'http://localhost:3000', username: 'player-1', userId: 'user-1', token: 'token-1' })
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = String(input)
			if (url.includes('/games/12/archive')) return response({ gameId: 12, status: 'archived' })
			if (url.includes('/games/12')) return response({ gameId: 12, deleted: true })
			return response({ games: [completedGame] })
		})

		render(<GameHistoryScreen />)
		await screen.findByText('The Siege of Shrek\'s Swamp')
		await user.selectOptions(screen.getByLabelText('Creator'), 'me')
		expect(window.location.search).toContain('creator=me')
		await user.click(screen.getByRole('button', { name: 'Archive game' }))
		expect(screen.getByText(/archive game 12/i)).not.toBeNull()
		await user.click(screen.getByRole('button', { name: 'Confirm archive' }))
		await screen.findByText('Archived')
		await user.click(screen.getByRole('button', { name: 'Delete game' }))
		expect(screen.getByText(/snapshot and event history will be removed/i)).not.toBeNull()
		expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/games/12/archive', expect.objectContaining({ method: 'PATCH' }))
	})
})