import type { GameStateResponse } from './apiProtocol.js'
import type { Command, EventEnvelope, SessionInitPayload } from './types/index.js'

export type WebSocketClientCommandMessage = {
	kind: 'COMMAND'
	command: Command
	requestId?: string
}

export type WebSocketClientResumeMessage = {
	kind: 'RESUME'
	afterSeq: number
}

export type WebSocketClientMessage = WebSocketClientCommandMessage | WebSocketClientResumeMessage

export type WebSocketServerEventMessage = {
	kind: 'EVENT'
	event: EventEnvelope
}

export type WebSocketServerSessionInitMessage = {
	kind: 'SESSION_INIT'
	payload: SessionInitPayload
}

export type WebSocketServerSnapshotMessage = {
	kind: 'STATE_SNAPSHOT'
	snapshot: GameStateResponse
}

export type WebSocketServerErrorMessage = {
	kind: 'ERROR'
	message: string
	code?: string
	detailCode?: string
}

export type WebSocketServerMessage =
	| WebSocketServerSessionInitMessage
	| WebSocketServerEventMessage
	| WebSocketServerSnapshotMessage
	| WebSocketServerErrorMessage

export type WebSocketMessage = WebSocketClientMessage | WebSocketServerMessage