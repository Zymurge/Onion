// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
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
		window.localStorage.clear()
		vi.restoreAllMocks()
	})

	it('loads a scenario preview and creates a game with the selected role', async () => {
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
				description: 'Opening statement.\nSecond statement.\n\n- First detail.\n- Second detail.',
				}])
			}
			if (url.endsWith('/scenarios/swamp-siege-01')) {
				return response({
				id: 'swamp-siege-01',
				name: 'swamp-siege-01',
				displayName: 'The Siege',
				description: 'Opening statement.\nSecond statement.\n\n- First detail.\n- Second detail.',
				map: { cells: [{ q: 1, r: 1 }] },
				initialState: { deployments: {
					'onion-1': { type: 'TheOnion', side: 'onion' },
					'pigs-stack': { kind: 'stack-group', unitType: 'LittlePigs', side: 'defender', count: 5 },
				} },
				victoryConditions: {
					objectives: [
						{ id: 'destroy-swamp', label: 'Destroy the swamp', kind: 'destroy-unit', unitType: 'Swamp', victor: 'onion', required: true },
						{ id: 'escape-map', label: 'Reach an escape hex', kind: 'escape-map', victor: 'onion', required: true },
						{ id: 'immobilize-onion', label: 'Immobilize the Onion', kind: 'immobilize-onion', victor: 'defender', required: true },
					],
					onion: { escapeLocation: 'south side', escapeHexes: [{ q: 0, r: 2 }] },
				},
				})
			}
			return response({ gameId: 42, role: 'defender' })
		})
		vi.stubGlobal('fetch', fetchMock)

		render(<GameCreateScreen navigate={navigate} runtimeConfig={{ apiBaseUrl: 'http://localhost:3000' } as never} />)

		expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/user/dashboard')
		const description = await screen.findByText((_, element) => element?.classList.contains('create-game-description'))
		expect(description.querySelector('br')).toBeInTheDocument()
		const firstBullet = screen.getByText('First detail.').closest('li')
		expect(firstBullet).toBeInTheDocument()
		expect(firstBullet?.parentElement?.tagName).toBe('UL')
		expect(firstBullet?.nextElementSibling).toHaveTextContent('Second detail.')
		const victoryConditions = await screen.findByRole('group', { name: 'Victory conditions' })
		expect(within(victoryConditions).getByRole('heading', { name: 'The Onion' })).toBeInTheDocument()
		expect(within(victoryConditions).getByText('Destroy the swamp')).toBeInTheDocument()
		expect(within(victoryConditions).getByRole('heading', { name: 'Defenders' })).toBeInTheDocument()
		expect(within(victoryConditions).getByText('Immobilize the Onion')).toBeInTheDocument()
		const escapeObjective = within(victoryConditions).getByText('Reach an escape hex').closest('li')
		expect(escapeObjective?.getAttribute('title')).toContain('Escape zone: south side; green crosshatching marks it on the map.')
		expect(within(victoryConditions).queryByText(/Escape zone:/)).toBeNull()
		expect(within(victoryConditions).queryByText('Required')).toBeNull()
		expect(within(victoryConditions).queryByText('Optional')).toBeNull()
		expect(screen.getByText('5 x Little Pigs')).toBeInTheDocument()
		await user.selectOptions(screen.getByLabelText(/your side/i), 'defender')
		await user.click(screen.getByRole('button', { name: /create game/i }))

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

		expect(window.localStorage.getItem('onion.auth.session')).toBeNull()
		expect(navigate).toHaveBeenCalledWith('/user/login')
	})
})