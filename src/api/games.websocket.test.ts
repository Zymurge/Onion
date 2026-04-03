import { describe, expect, it } from 'vitest'

import { buildApp } from '../app.js'
import { createGame, joinGame, register } from './helpers.js'

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

	it('rejects websocket upgrades without auth', async () => {
		const app = buildApp()
		const shrek = await register(app, 'shrek')
		const { gameId } = await createGame(app, shrek.token, 'onion')
		await app.ready()

		await expect(app.injectWS(`/games/${gameId}/ws`)).rejects.toThrow('Unexpected server response: 401')
	})
})