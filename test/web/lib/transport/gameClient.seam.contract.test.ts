import { describe, expect, it, vi } from 'vitest'

import {
	createGameClient,
	type GameSnapshot,
	type GameStateEnvelope,
	type GameAction,
	GameClientSeamError,
} from '#web/lib/gameClient'
import { createFakeGameBackend } from '#web/lib/fakeGameBackend'
import type { GameRequestTransport } from '#web/lib/gameSessionTypes'

describe('game client seam contract', () => {
	const snapshot: GameSnapshot = {
		gameId: 123,
		phase: 'DEFENDER_COMBAT',
		scenarioName: "The Siege of Shrek's Swamp",
		turnNumber: 8,
		lastEventSeq: 47,
	}
	const session: GameStateEnvelope['session'] = { role: 'defender' }

	const action: GameAction = { type: 'MOVE', movers: ['wolf-2'], to: { q: 2, r: 4 } }

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

	it('passes through a fake backend transport and normalizes load failures', async () => {
		const backend = createFakeGameBackend({
			initialSnapshot: snapshot,
			session,
		})
		backend.failNextRefreshWith(new Error('fake backend refresh failed'))

		const client = createGameClient(backend.requestTransport)

		await expect(client.getState(123)).rejects.toMatchObject({
			kind: 'transport',
			message: 'fake backend refresh failed',
		})
		expect(backend.getCurrentSnapshot()).toEqual(snapshot)
		expect(backend.getCurrentSession()).toEqual(session)
	})

	it('passes through a fake backend transport for actions and records submitted payloads', async () => {
		const backend = createFakeGameBackend({
			initialSnapshot: snapshot,
			session,
		})
		const client = createGameClient(backend.requestTransport)

		await expect(client.submitAction(123, action)).resolves.toEqual(snapshot)
		expect(backend.getSubmittedActions()).toEqual([
			{ gameId: 123, action },
		])
	})

	it('returns an empty live event list when the transport does not expose polling', async () => {
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
		})

		await expect(client.pollEvents(123, 47)).resolves.toEqual([])
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

	it('normalizes non-error transport failures using the fallback message', async () => {
		const transport: GameRequestTransport = {
			getState: vi.fn().mockRejectedValue('socket closed'),
			submitAction: vi.fn(),
		}

		const client = createGameClient(transport)

		await expect(client.getState(123)).rejects.toMatchObject({
			kind: 'transport',
			message: 'Unexpected transport failure',
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

	it('normalizes poll failures from the seam', async () => {
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockRejectedValue(new Error('poll socket closed')),
		})

		await expect(client.pollEvents(123, 47)).rejects.toMatchObject({
			kind: 'transport',
			message: 'poll socket closed',
		})
	})
})