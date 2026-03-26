import { describe, expect, it, vi } from 'vitest'

import {
	createGameClient,
	type GameClientTransport,
	type GameSnapshot,
	type GameAction,
} from './gameClient'

describe('game client contract', () => {
	const snapshot: GameSnapshot = {
		gameId: 123,
		phase: 'defender',
		selectedUnitId: 'wolf-2',
		mode: 'fire',
		lastEventSeq: 47,
	}

	const action: GameAction = { type: 'set-mode', mode: 'end-phase' }

	it('loads the current state through the seam', async () => {
		const transport: GameClientTransport = {
			getState: vi.fn().mockResolvedValue(snapshot),
			submitAction: vi.fn(),
		}

		const client = createGameClient(transport)

		await expect(client.getState(123)).resolves.toEqual(snapshot)
		expect(transport.getState).toHaveBeenCalledWith(123)
	})

	it('submits actions through the seam', async () => {
		const transport: GameClientTransport = {
			getState: vi.fn(),
			submitAction: vi.fn().mockResolvedValue(snapshot),
		}

		const client = createGameClient(transport)

		await expect(client.submitAction(123, action)).resolves.toEqual(snapshot)
		expect(transport.submitAction).toHaveBeenCalledWith(123, action)
	})

	it('normalizes transport failures into a client error', async () => {
		const transport: GameClientTransport = {
			getState: vi.fn().mockRejectedValue(new Error('socket closed')),
			submitAction: vi.fn(),
		}

		const client = createGameClient(transport)

		await expect(client.getState(123)).rejects.toMatchObject({
			kind: 'transport',
		})
	})
})