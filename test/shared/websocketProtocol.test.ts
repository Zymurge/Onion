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
} from '../../shared/websocketProtocol.js'
import type { Command, EventEnvelope, GameState } from '../../shared/types/index.js'
import type { GameStateResponse } from '../../shared/apiProtocol.js'

describe('websocketProtocol definitions', () => {
	it('describes client command and resume messages', () => {
		expectTypeOf<WebSocketClientCommandMessage>().toMatchTypeOf<{
			kind: 'COMMAND'
			command: Command
			requestId?: string
		}>()
		expectTypeOf<WebSocketClientResumeMessage>().toMatchTypeOf<{
			kind: 'RESUME'
			afterSeq: number
		}>()
		expectTypeOf<WebSocketClientMessage>().toMatchTypeOf<WebSocketClientCommandMessage | WebSocketClientResumeMessage>()
	})

	it('describes server snapshot, event, and error messages', () => {
		expectTypeOf<WebSocketServerSnapshotMessage>().toMatchTypeOf<{
			kind: 'STATE_SNAPSHOT'
			snapshot: GameStateResponse
		}>()
		expectTypeOf<WebSocketServerErrorMessage>().toMatchTypeOf<{
			kind: 'ERROR'
			message: string
			code?: string
			detailCode?: string
		}>()
		expectTypeOf<WebSocketServerEventMessage>().toMatchTypeOf<{
			kind: 'EVENT'
			event: EventEnvelope
		}>()
		expectTypeOf<WebSocketServerMessage>().toMatchTypeOf<
			| WebSocketServerSnapshotMessage
			| WebSocketServerEventMessage
			| WebSocketServerErrorMessage
		>()
		expectTypeOf<WebSocketMessage>().toMatchTypeOf<WebSocketClientMessage | WebSocketServerMessage>()
		expectTypeOf<GameStateResponse>().toMatchTypeOf<{
			gameId: number
			scenarioId: string
			role: 'onion' | 'defender'
			winner: 'onion' | 'defender' | null
			players: { onion: string | null; defender: string | null }
			state: GameState
			movementRemainingByUnit: Record<string, number>
			eventSeq: number
		}>()
	})
})