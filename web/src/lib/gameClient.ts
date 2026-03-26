export type GamePhase = 'onion' | 'defender'

export type ActionMode = 'fire' | 'combined' | 'end-phase'

export type GameSnapshot = {
	gameId: string
	phase: GamePhase
	selectedUnitId: string | null
	mode: ActionMode
	lastEventSeq: number
}

export type GameAction =
	| { type: 'select-unit'; unitId: string }
	| { type: 'set-mode'; mode: ActionMode }
	| { type: 'refresh' }

export type GameEvent = {
	seq: number
	type: string
	summary: string
	timestamp: string
}

export type GameClientError = {
	kind: 'transport' | 'not-found' | 'invalid-action'
	message: string
}

export type GameClientTransport = {
	getState(gameId: string): Promise<GameSnapshot>
	submitAction(gameId: string, action: GameAction): Promise<GameSnapshot>
	pollEvents?(gameId: string, afterSeq: number): Promise<ReadonlyArray<GameEvent>>
}

export type GameClient = {
	getState(gameId: string): Promise<GameSnapshot>
	submitAction(gameId: string, action: GameAction): Promise<GameSnapshot>
	pollEvents(gameId: string, afterSeq: number): Promise<ReadonlyArray<GameEvent>>
}

export class GameClientSeamError extends Error {
	kind: GameClientError['kind']

	constructor(kind: GameClientError['kind'], message: string, cause?: unknown) {
		super(message)
		this.name = 'GameClientSeamError'
		this.kind = kind
		this.cause = cause
	}
}

function normalizeTransportError(error: unknown): GameClientSeamError {
	if (error instanceof GameClientSeamError) {
		return error
	}

	const message = error instanceof Error ? error.message : 'Unexpected transport failure'
	return new GameClientSeamError('transport', message, error)
}

export function createGameClient(transport: GameClientTransport): GameClient {
	return {
		async getState(gameId: string) {
			try {
				return await transport.getState(gameId)
			} catch (error) {
				throw normalizeTransportError(error)
			}
		},
		async submitAction(gameId: string, action: GameAction) {
			try {
				return await transport.submitAction(gameId, action)
			} catch (error) {
				throw normalizeTransportError(error)
			}
		},
		async pollEvents(gameId: string, afterSeq: number) {
			if (transport.pollEvents === undefined) {
				return []
			}

			try {
				return await transport.pollEvents(gameId, afterSeq)
			} catch (error) {
				throw normalizeTransportError(error)
			}
		},
	}
}