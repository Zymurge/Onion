import type { GameState, TurnPhase } from '../../shared/types/index'
import type { GameRequestTransport } from './gameSessionTypes'

export type ScenarioMapSnapshot = {
	width: number
	height: number
	cells: Array<{ q: number; r: number }>
	hexes: Array<{ q: number; r: number; t: number }>
}

export type GamePhase = 'onion' | 'defender'

export type ActionMode = 'fire' | 'combined' | 'end-phase'

export type CombatResolution = {
	actionType: 'FIRE'
	attackers: string[]
	targetId: string
	outcome: 'NE' | 'D' | 'X'
	outcomeLabel: 'Hit' | 'Miss'
	roll?: number
	odds?: string
	details: string[]
}

export type RamResolution = {
	actionType: 'MOVE'
	unitId: string
	rammedUnitIds: string[]
	destroyedUnitIds: string[]
	treadDamage?: number
	details: string[]
}

export type GameSnapshot = {
	gameId: number
	phase: TurnPhase
	selectedUnitId: string | null
	mode: ActionMode
	scenarioName?: string
	turnNumber?: number
	lastEventSeq: number
	authoritativeState?: GameState
	movementRemainingByUnit?: Record<string, number>
	scenarioMap?: ScenarioMapSnapshot
	combatResolution?: CombatResolution
	ramResolution?: RamResolution
}

export type GameSessionContext = {
	role: 'onion' | 'defender'
}

export type GameStateEnvelope = {
	snapshot: GameSnapshot
	session: GameSessionContext
}

export type GameAction =
	| { type: 'select-unit'; unitId: string }
	| { type: 'set-mode'; mode: ActionMode }
	| { type: 'MOVE'; unitId: string; to: { q: number; r: number } }
	| { type: 'FIRE'; attackers: string[]; targetId: string }
	| { type: 'end-phase' }
	| { type: 'refresh' }

export type GameEvent = {
	seq: number
	type: string
	summary?: string
	timestamp: string
	[key: string]: unknown
}

export type GameClientError = {
	kind: 'transport' | 'not-found' | 'invalid-action'
	message: string
}

export type GameClientTransport = GameRequestTransport & {
	pollEvents?(gameId: number, afterSeq: number): Promise<ReadonlyArray<GameEvent>>
}

export type GameClient = {
	getState(gameId: number): Promise<GameStateEnvelope>
	submitAction(gameId: number, action: GameAction): Promise<GameSnapshot>
	pollEvents(gameId: number, afterSeq: number): Promise<ReadonlyArray<GameEvent>>
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
		async getState(gameId: number) {
			try {
				return await transport.getState(gameId)
			} catch (error) {
				throw normalizeTransportError(error)
			}
		},
		async submitAction(gameId: number, action: GameAction) {
			try {
				return await transport.submitAction(gameId, action)
			} catch (error) {
				throw normalizeTransportError(error)
			}
		},
		async pollEvents(gameId: number, afterSeq: number) {
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