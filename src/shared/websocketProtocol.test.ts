import { expectTypeOf, describe, it } from 'vitest'

import type {
	WebSocketClientCommandMessage,
	WebSocketClientMessage,
	WebSocketClientResumeMessage,
	WebSocketMessage,
	WebSocketServerErrorMessage,
	WebSocketServerEventMessage,
	WebSocketServerMessage,
	WebSocketServerSnapshotMessage,
} from './websocketProtocol.js'
import type { Command, EventEnvelope, GameState } from '../types/index.js'
import type { GameStateResponse } from './apiProtocol.js'

describe('websocketProtocol definitions', () => {
	it('describes client command and resume messages', () => {
		const commandMessage = {
			kind: 'COMMAND',
			command: { type: 'END_PHASE' },
		} satisfies WebSocketClientCommandMessage

		const resumeMessage = {
			kind: 'RESUME',
			afterSeq: 42,
		} satisfies WebSocketClientResumeMessage

		expectTypeOf(commandMessage).toEqualTypeOf<WebSocketClientCommandMessage>()
		expectTypeOf(resumeMessage).toEqualTypeOf<WebSocketClientResumeMessage>()
		expectTypeOf<WebSocketClientMessage>().toMatchTypeOf<WebSocketClientCommandMessage | WebSocketClientResumeMessage>()
		expectTypeOf(commandMessage.command).toMatchTypeOf<Command>()
	})

	it('describes server snapshot, event, and error messages', () => {
		const snapshotState = {} as GameState
		const snapshot = {
			gameId: 123,
			scenarioId: 'scenario-1',
			role: 'onion',
			phase: 'ONION_MOVE',
			turnNumber: 1,
			winner: null,
			players: {
				onion: 'onion-player',
				defender: 'defender-player',
			},
			state: snapshotState,
			movementRemainingByUnit: {},
			eventSeq: 99,
		} satisfies GameStateResponse

		const snapshotMessage = {
			kind: 'STATE_SNAPSHOT',
			snapshot,
		} satisfies WebSocketServerSnapshotMessage

		const errorMessage = {
			kind: 'ERROR',
			message: 'boom',
			code: 'WS_ERROR',
			detailCode: 'RECONNECT_REQUIRED',
		} satisfies WebSocketServerErrorMessage

		const eventMessage = {
			kind: 'EVENT',
			event: {
				seq: 7,
				type: 'GAME_OVER',
				timestamp: '2026-04-01T00:00:00.000Z',
			} satisfies EventEnvelope,
		} satisfies WebSocketServerEventMessage

		expectTypeOf(snapshotMessage).toEqualTypeOf<WebSocketServerSnapshotMessage>()
		expectTypeOf(errorMessage).toEqualTypeOf<WebSocketServerErrorMessage>()
		expectTypeOf<WebSocketServerMessage>().toMatchTypeOf<
			| WebSocketServerSnapshotMessage
			| WebSocketServerEventMessage
			| WebSocketServerErrorMessage
		>()
		expectTypeOf<WebSocketMessage>().toMatchTypeOf<WebSocketClientMessage | WebSocketServerMessage>()
		expectTypeOf(eventMessage.event).toMatchTypeOf<EventEnvelope>()
	})
})