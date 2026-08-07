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
	WebSocketServerSessionInitMessage,
} from '#shared/websocketProtocol'
import type { Command, EventEnvelope, GameState, SessionInitPayload } from '#shared/types/index'
import type { GameStateResponse } from '#shared/apiProtocol'

describe('websocketProtocol definitions', () => {
	it('describes client command and resume messages', () => {
		expectTypeOf<WebSocketClientCommandMessage>().toMatchTypeOf<{
			kind: 'COMMAND'
			command: Command
			requestId?: string
		}>()
		expectTypeOf<Extract<Command, { type: 'MOVE' }>>().toMatchTypeOf<{
			type: 'MOVE'
			movers: ReadonlyArray<string>
			to: { q: number; r: number }
			attemptRam?: boolean
		}>()
		expectTypeOf<WebSocketClientResumeMessage>().toMatchTypeOf<{
			kind: 'RESUME'
			afterSeq: number
		}>()
		expectTypeOf<WebSocketClientMessage>().toMatchTypeOf<WebSocketClientCommandMessage | WebSocketClientResumeMessage>()
	})

	it('describes server snapshot, event, and error messages', () => {
		expectTypeOf<WebSocketServerSessionInitMessage>().toMatchTypeOf<{
			kind: 'SESSION_INIT'
			payload: SessionInitPayload
		}>()
		expectTypeOf<SessionInitPayload>().toMatchTypeOf<{
			unitTypes: Record<string, unknown>
			weaponTypes: Record<string, unknown>
		}>()
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
			| WebSocketServerSessionInitMessage
			| WebSocketServerSnapshotMessage
			| WebSocketServerEventMessage
			| WebSocketServerErrorMessage
		>()
		expectTypeOf<Extract<WebSocketServerMessage, { kind: 'SESSION_INIT' }>>().toEqualTypeOf<WebSocketServerSessionInitMessage>()
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
