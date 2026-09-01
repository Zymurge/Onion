// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GameCreateScreen } from '#web/components/GameCreateScreen'
import { saveAuthSession } from '#web/lib/authSession'

function response(body: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		text: async () => JSON.stringify(body),
	} as Response
}

describe('GameCreateScreen', () => {
	beforeEach(() => {
		window.sessionStorage.clear()
		vi.restoreAllMocks()
	})

	it('loads a scenario preview and creates a lobby with the selected role', async () => {
		const user = userEvent.setup()
		const navigate = vi.fn()
		saveAuthSession({
			apiBaseUrl: 'http://localhost:3000',
			username: 'player-1',
			userId: 'user-1',
			token: 'token-1',
		})
		const fetchMock = vi.fn()
		fetchMock.mockImplementation(async (url: string) => {
			if (url.endsWith('/scenarios')) {
				return response([{
				id: 'swamp-siege-01',
				name: 'swamp-siege-01',
				displayName: 'The Siege',
				description: 'Destroy the swamp and escape.',
				}])
			}
			if (url.endsWith('/scenarios/swamp-siege-01')) {
				return response({
				id: 'swamp-siege-01',
				name: 'swamp-siege-01',
				displayName: 'The Siege',
				description: 'Destroy the swamp and escape.',
				map: { cells: [{ q: 1, r: 1 }] },
				initialState: { deployments: { onion: {}, swamp: {} } },
				victoryConditions: { objectives: [{ label: 'Destroy the swamp' }] },
				})
			}
			return response({ gameId: 42, role: 'defender' })
		})
		vi.stubGlobal('fetch', fetchMock)

		render(<GameCreateScreen navigate={navigate} runtimeConfig={{ apiBaseUrl: 'http://localhost:3000' } as never} />)

		expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/user/dashboard')
		await screen.findByText('Destroy the swamp and escape.')
		await user.selectOptions(screen.getByLabelText(/your side/i), 'defender')
		await user.click(screen.getByRole('button', { name: /create lobby/i }))

		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
		const createCall = fetchMock.mock.calls.find(([url]) => url === 'http://localhost:3000/games')
		expect(createCall).toBeDefined()
		expect(JSON.parse(createCall?.[1]?.body as string)).toEqual({
			scenarioId: 'swamp-siege-01',
			role: 'defender',
		})
		expect(createCall?.[1]?.headers).toMatchObject({ authorization: 'Bearer token-1' })
		expect(navigate).toHaveBeenCalledWith('/user/dashboard')
	})

	it('shows Sign Out and clears the session for an authenticated player', async () => {
		const user = userEvent.setup()
		const navigate = vi.fn()
		saveAuthSession({
			apiBaseUrl: 'http://localhost:3000',
			username: 'player-1',
			userId: 'user-1',
			token: 'token-1',
		})
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([])))

		render(<GameCreateScreen navigate={navigate} runtimeConfig={{ apiBaseUrl: 'http://localhost:3000' } as never} />)

		await user.click(screen.getByRole('button', { name: 'Sign Out' }))

		expect(window.sessionStorage.getItem('onion.auth.session')).toBeNull()
		expect(navigate).toHaveBeenCalledWith('/user/login')
	})
})