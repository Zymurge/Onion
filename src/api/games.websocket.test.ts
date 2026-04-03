import { describe, expect, it, vi } from 'vitest'

import { buildApp } from '../app.js'
import * as engineGame from '../engine/index.js'
import { advanceToPhase, createGame, createMovePlan, endPhase, joinGame, register, submitAction } from './helpers.js'

async function readWsMessage(ws: { once: (event: 'message', handler: (data: Buffer | string) => void) => void }) {
	return new Promise<any>((resolve) => {
		ws.once('message', (data) => {
			const text = typeof data === 'string' ? data : data.toString()
			resolve(JSON.parse(text))
		})
	})
}

describe('GET /games/:id/ws', () => {
	it('sends the current snapshot and broadcasts live events', async () => {
		const app = buildApp()
		const shrek = await register(app, 'shrek')
		const fiona = await register(app, 'fiona')
		const { gameId } = await createGame(app, shrek.token, 'onion')
		await app.ready()

		let snapshotMessagePromise: Promise<any> | null = null
		const ws = await app.injectWS(`/games/${gameId}/ws?token=${encodeURIComponent(shrek.token)}`, {}, {
			onOpen(openWs) {
				snapshotMessagePromise = readWsMessage(openWs)
			},
		})

		expect(snapshotMessagePromise).not.toBeNull()
		const snapshotMessage = await snapshotMessagePromise!
		expect(snapshotMessage.kind).toBe('STATE_SNAPSHOT')
		expect(snapshotMessage.snapshot.gameId).toBe(gameId)
		expect(snapshotMessage.snapshot.role).toBe('onion')

		const liveEventPromise = readWsMessage(ws)
		await joinGame(app, gameId, fiona.token)
		const liveEventMessage = await liveEventPromise

		expect(liveEventMessage.kind).toBe('EVENT')
		expect(liveEventMessage.event.type).toBe('PLAYER_JOINED')
		expect(liveEventMessage.event.role).toBe('defender')

		ws.terminate()
	})

	it('broadcasts MOVE events to connected websocket clients', async () => {
		const app = buildApp()
		const shrek = await register(app, 'shrek')
		const fiona = await register(app, 'fiona')
		const { gameId } = await createGame(app, shrek.token, 'onion')
		await joinGame(app, gameId, fiona.token)
		await app.ready()

		let snapshotMessagePromise: Promise<any> | null = null
		const ws = await app.injectWS(`/games/${gameId}/ws?token=${encodeURIComponent(shrek.token)}`, {}, {
			onOpen(openWs) {
				snapshotMessagePromise = readWsMessage(openWs)
			},
		})

		await snapshotMessagePromise

		const moveTo = { q: 1, r: 10 }
		const validatedPlan = createMovePlan({ to: moveTo, path: [moveTo] })
		const validateSpy = vi.spyOn(engineGame, 'validateUnitMovement').mockReturnValue({ ok: true, plan: validatedPlan } as any)
		const executeSpy = vi.spyOn(engineGame, 'executeUnitMovement').mockImplementation(((state: any, plan: any) => {
			state.onion.position = plan.to
			return { success: true, newPosition: plan.to }
		}) as any)

		const liveEventPromise = readWsMessage(ws)
		await submitAction(app, gameId, shrek.token, { type: 'MOVE', unitId: 'onion', to: moveTo })
		const liveEventMessage = await liveEventPromise

		expect(liveEventMessage.kind).toBe('EVENT')
		expect(liveEventMessage.event.type).toBe('ONION_MOVED')
		expect(liveEventMessage.event.to).toEqual(moveTo)

		validateSpy.mockRestore()
		executeSpy.mockRestore()
		ws.terminate()
	})

	it('broadcasts FIRE_RESOLVED events to connected websocket clients', async () => {
		const app = buildApp()
		const shrek = await register(app, 'shrek')
		const fiona = await register(app, 'fiona')
		const { gameId } = await createGame(app, shrek.token, 'onion')
		await joinGame(app, gameId, fiona.token)
		await advanceToPhase(app, gameId, shrek.token, fiona.token, 'DEFENDER_COMBAT')
		await app.ready()

		let snapshotMessagePromise: Promise<any> | null = null
		const ws = await app.injectWS(`/games/${gameId}/ws?token=${encodeURIComponent(fiona.token)}`, {}, {
			onOpen(openWs) {
				snapshotMessagePromise = readWsMessage(openWs)
			},
		})

		await snapshotMessagePromise

		const validateSpy = vi.spyOn(engineGame, 'validateCombatAction').mockReturnValue({
			ok: true,
			plan: {
				actionType: 'FIRE',
				actor: 'defender',
				attackerIds: ['wolf-1'],
				target: { kind: 'treads' as const, id: 'onion' },
				attackStrength: 2,
				defense: 2,
			},
		} as any)
		const executeSpy = vi.spyOn(engineGame, 'executeCombatAction').mockImplementation(((state: any) => {
			state.onion.treads = 43
			return {
				success: true,
				actionType: 'FIRE',
				attackerIds: ['wolf-1'],
				targetId: 'onion',
				roll: { roll: 6, result: 'X', odds: '1:1' },
				treadsLost: 2,
			}
		}) as any)

		const liveEventPromise = readWsMessage(ws)
		await submitAction(app, gameId, fiona.token, { type: 'FIRE', attackers: ['wolf-1'], targetId: 'onion' })
		const liveEventMessage = await liveEventPromise

		expect(liveEventMessage.kind).toBe('EVENT')
		expect(liveEventMessage.event.type).toBe('FIRE_RESOLVED')
		expect(liveEventMessage.event.attackers).toEqual(['wolf-1'])
		expect(liveEventMessage.event.targetId).toBe('onion')

		validateSpy.mockRestore()
		executeSpy.mockRestore()
		ws.terminate()
	})

	it('broadcasts END_PHASE events to connected websocket clients', async () => {
		const app = buildApp()
		const shrek = await register(app, 'shrek')
		const fiona = await register(app, 'fiona')
		const { gameId } = await createGame(app, shrek.token, 'onion')
		await app.ready()

		let snapshotMessagePromise: Promise<any> | null = null
		const ws = await app.injectWS(`/games/${gameId}/ws?token=${encodeURIComponent(shrek.token)}`, {}, {
			onOpen(openWs) {
				snapshotMessagePromise = readWsMessage(openWs)
			},
		})

		await snapshotMessagePromise

		const joinEventPromise = readWsMessage(ws)
		await joinGame(app, gameId, fiona.token)
		const joinEventMessage = await joinEventPromise
		expect(joinEventMessage.kind).toBe('EVENT')
		expect(joinEventMessage.event.type).toBe('PLAYER_JOINED')

		const phaseEventPromise = readWsMessage(ws)
		await endPhase(app, gameId, shrek.token)
		const phaseEventMessage = await phaseEventPromise

		expect(phaseEventMessage.kind).toBe('EVENT')
		expect(phaseEventMessage.event.type).toBe('PHASE_CHANGED')

		ws.terminate()
	})

	it('replays events after afterSeq for reconnecting websocket clients', async () => {
		const app = buildApp()
		const shrek = await register(app, 'shrek')
		const fiona = await register(app, 'fiona')
		const { gameId } = await createGame(app, shrek.token, 'onion')
		await joinGame(app, gameId, fiona.token)
		await endPhase(app, gameId, shrek.token)
		await app.ready()

		let snapshotMessagePromise: Promise<any> | null = null
		const ws = await app.injectWS(`/games/${gameId}/ws?token=${encodeURIComponent(shrek.token)}`, {}, {
			onOpen(openWs) {
				snapshotMessagePromise = readWsMessage(openWs)
			},
		})

		const snapshotMessage = await snapshotMessagePromise
		expect(snapshotMessage.kind).toBe('STATE_SNAPSHOT')
		expect(snapshotMessage.snapshot.eventSeq).toBe(2)

		const resumeEventPromise = readWsMessage(ws)
		ws.send(JSON.stringify({ kind: 'RESUME', afterSeq: 1 }))
		const resumeEventMessage = await resumeEventPromise

		expect(resumeEventMessage.kind).toBe('EVENT')
		expect(resumeEventMessage.event.seq).toBe(2)
		expect(resumeEventMessage.event.type).toBe('PHASE_CHANGED')

		ws.terminate()
	})

	it('rejects websocket upgrades without auth', async () => {
		const app = buildApp()
		const shrek = await register(app, 'shrek')
		const { gameId } = await createGame(app, shrek.token, 'onion')
		await app.ready()

		await expect(app.injectWS(`/games/${gameId}/ws`)).rejects.toThrow('Unexpected server response: 401')
	})
})