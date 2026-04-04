import { describe, expect, it, vi } from 'vitest'

import {
	createGameClient,
	type GameSnapshot,
	type GameStateEnvelope,
	type GameAction,
	GameClientSeamError,
} from './gameClient'
import type { GameRequestTransport } from './gameSessionTypes'

describe('game client seam contract', () => {
	const snapshot: GameSnapshot = {
		gameId: 123,
		phase: 'DEFENDER_COMBAT',
		selectedUnitId: 'wolf-2',
		mode: 'fire',
		scenarioName: "The Siege of Shrek's Swamp",
		turnNumber: 8,
		lastEventSeq: 47,
	}
	const session: GameStateEnvelope['session'] = { role: 'defender' }

	const action: GameAction = { type: 'set-mode', mode: 'end-phase' }

	it('loads the current state through the seam', async () => {
		const transport: GameRequestTransport = {
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction: vi.fn(),
		}

		const client = createGameClient(transport)

		await expect(client.getState(123)).resolves.toEqual({ snapshot, session })
		expect(transport.getState).toHaveBeenCalledWith(123)
	})

	it('submits actions through the seam', async () => {
		const transport: GameRequestTransport = {
			getState: vi.fn(),
			submitAction: vi.fn().mockResolvedValue(snapshot),
		}

		const client = createGameClient(transport)

		await expect(client.submitAction(123, action)).resolves.toEqual(snapshot)
		expect(transport.submitAction).toHaveBeenCalledWith(123, action)
	})

	it('submits end phase actions through the seam', async () => {
		const transport: GameRequestTransport = {
			getState: vi.fn(),
			submitAction: vi.fn().mockResolvedValue(snapshot),
		}

		const client = createGameClient(transport)

		await expect(client.submitAction(123, { type: 'end-phase' })).resolves.toEqual(snapshot)
		expect(transport.submitAction).toHaveBeenCalledWith(123, { type: 'end-phase' })
	})

	it('normalizes transport failures into a client error', async () => {
		const transport: GameRequestTransport = {
			getState: vi.fn().mockRejectedValue(new Error('socket closed')),
			submitAction: vi.fn(),
		}

		const client = createGameClient(transport)

		await expect(client.getState(123)).rejects.toMatchObject({
			kind: 'transport',
		})
	})

	it('handles transport failures when submitting actions', async () => {
		const transport: GameRequestTransport = {
			getState: vi.fn(),
			submitAction: vi.fn().mockRejectedValue(new GameClientSeamError('transport', 'mocked fault' )),
		}

		const client = createGameClient(transport)

		let error : unknown
		try {
			await client.submitAction(123, action)
		} catch (e) {
			error = e
		}
		
		expect((error as GameClientSeamError).kind).toBe('transport')
		expect((error as GameClientSeamError).message).toBe('mocked fault')
	})
})