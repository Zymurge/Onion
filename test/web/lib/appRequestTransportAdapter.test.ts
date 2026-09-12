import { describe, expect, it, vi } from 'vitest'

import type { GameAction, GameClient, GameSnapshot, GameStateEnvelope } from '#web/lib/gameClient'
import logger from '#web/lib/logger'
import { createRequestTransportFromGameClient } from '#web/lib/appRequestTransportAdapter'

const snapshot: GameSnapshot = {
	gameId: 123,
	phase: 'DEFENDER_COMBAT',
	scenarioName: 'Adapter test scenario',
	turnNumber: 1,
	lastEventSeq: 7,
	victoryObjectives: [],
}
const session: GameStateEnvelope['session'] = { role: 'defender' }
const action: GameAction = { type: 'end-phase' }

function createClient(overrides: Partial<GameClient> = {}): GameClient {
	return {
		getState: vi.fn().mockResolvedValue({ snapshot, session }),
		submitAction: vi.fn().mockResolvedValue(snapshot),
		pollEvents: vi.fn().mockResolvedValue([]),
		...overrides,
	}
}

describe('createRequestTransportFromGameClient', () => {
	it('forwards state, action, and event polling calls', async () => {
		const client = createClient({
			pollEvents: vi.fn().mockResolvedValue([{ seq: 8, type: 'PHASE_CHANGED' }]),
		})
		const transport = createRequestTransportFromGameClient(client)

		await expect(transport.getState(123)).resolves.toEqual({ snapshot, session })
		await expect(transport.submitAction(123, action)).resolves.toEqual(snapshot)
		await expect(transport.pollEvents?.(123, 7)).resolves.toEqual([{ seq: 8, type: 'PHASE_CHANGED' }])

		expect(client.getState).toHaveBeenCalledWith(123)
		expect(client.submitAction).toHaveBeenCalledWith(123, action)
		expect(client.pollEvents).toHaveBeenCalledWith(123, 7)
	})

	it('preserves the optional diagnostic reporter', async () => {
		const reportDiagnostic = vi.fn().mockResolvedValue(undefined)
		const client = createClient({ reportDiagnostic })
		const transport = createRequestTransportFromGameClient(client)
		const diagnostic = {
			reportId: 'report-1',
			code: 'CLIENT_SESSION_READY' as const,
			message: 'ready',
			snapshot: {
				gameId: 123,
				scenarioName: snapshot.scenarioName,
				phase: snapshot.phase,
				turnNumber: 1,
				lastEventSeq: snapshot.lastEventSeq,
			},
			client: { build: 'test', userAgent: 'test' },
			protocolTraffic: [],
		}

		expect(transport.reportDiagnostic).toBe(reportDiagnostic)
		await transport.reportDiagnostic?.(123, diagnostic)
		expect(reportDiagnostic).toHaveBeenCalledWith(123, diagnostic)
	})

	it('rethrows adapter failures and logs the failed operation', async () => {
		const error = new Error('socket closed')
		const client = createClient({
			getState: vi.fn().mockRejectedValue(error),
		})
		const warnSpy = vi.spyOn(logger, 'warn')
		const transport = createRequestTransportFromGameClient(client)

		await expect(transport.getState(123)).rejects.toBe(error)
		expect(warnSpy).toHaveBeenCalledWith(
			'[app-debug] transport getState failure',
			expect.objectContaining({ gameId: 123, error }),
		)

		warnSpy.mockRestore()
	})

	it('logs successful action metadata without changing the result', async () => {
		const debugSpy = vi.spyOn(logger, 'debug')
		const client = createClient()
		const transport = createRequestTransportFromGameClient(client)

		await expect(transport.submitAction(123, action)).resolves.toBe(snapshot)
		expect(debugSpy).toHaveBeenCalledWith(
			'[app-debug] transport submitAction success',
			expect.objectContaining({ gameId: 123, action, phase: snapshot.phase, lastEventSeq: snapshot.lastEventSeq }),
		)

		debugSpy.mockRestore()
	})
})