import type { EventEnvelope, GameState, TurnPhase } from '../../shared/types/index.js'
import type { GameRequestTransport } from './gameSessionTypes.js'
import type { RamResolution as MoveResolution } from './moveResolution.js'

export type ScenarioMapSnapshot = {
	width: number
	height: number
	cells: ReadonlyArray<{ q: number; r: number }>
	hexes: ReadonlyArray<{ q: number; r: number; t: number }>
}

export type GamePhase = 'onion' | 'defender'

export type ActionMode = 'fire' | 'combined' | 'end-phase'

export type StackActionSelection = {
	anchorUnitId: string
	availableUnitIds: ReadonlyArray<string>
	selectedUnitIds: ReadonlyArray<string>
}

export type CombatResolution = {
	actionType: 'FIRE'
	attackers: ReadonlyArray<string>
	targetId: string
	outcome: 'NE' | 'D' | 'X'
	outcomeLabel: 'Hit' | 'Miss'
	roll?: number
	odds?: string
	details: ReadonlyArray<string>
}

export type RamResolution = MoveResolution

export type ServerGameSnapshot = {
	gameId: number
	scenarioId?: string
	hostUserId?: string
	status?: 'waiting' | 'ready' | 'active' | 'completed'
	phase: TurnPhase
	scenarioName: string
	turnNumber?: number
	winner?: 'onion' | 'defender' | null
	aborted?: boolean
	lastEventSeq: number
	role?: 'onion' | 'defender'
	players?: {
		onion: string | null
		defender: string | null
	}
	authoritativeState?: GameState
	scenarioMap?: ScenarioMapSnapshot
	victoryObjectives: Array<{
		id: string
		label: string
		kind: 'destroy-unit' | 'escape-map'
		required: boolean
		completed: boolean
		unitId?: string
		unitType?: string
	}>
	escapeHexes?: Array<{ q: number; r: number }>
	combatResolution?: CombatResolution
	ramResolution?: ReadonlyArray<RamResolution>
}

export type GameSnapshot = ServerGameSnapshot

type ClientDiagnosticContext = {
	reportId: string
	message: string
	snapshot: {
		gameId: number
		scenarioName: string
		phase: TurnPhase
		turnNumber: number
		lastEventSeq: number
	}
	client: {
		build: string
		userAgent: string
	}
	protocolTraffic: ReadonlyArray<{
		direction: 'request' | 'response'
		method: string
		path: string
		status: number
	}>
}

export type ClientDiagnosticReport =
	| (ClientDiagnosticContext & { code: 'CLIENT_SESSION_READY' })
	| (ClientDiagnosticContext & { code: 'SNAPSHOT_INVALID'; path: string; refreshAttempt: number })

export type GameSessionContext = {
	role: 'onion' | 'defender'
}

export type GameStateEnvelope = {
	snapshot: ServerGameSnapshot
	session: GameSessionContext
}

export type GameAction =
	| { type: 'select-unit'; unitId: string }
	| { type: 'set-mode'; mode: ActionMode }
	| { type: 'MOVE'; movers: ReadonlyArray<string>; to: { q: number; r: number }; attemptRam?: boolean }
	| { type: 'FIRE'; attackers: ReadonlyArray<string>; targetId: string; onionId: string }
	| { type: 'end-phase' }
	| { type: 'refresh' }

export type GameClientError = {
	kind: 'transport' | 'not-found' | 'invalid-action'
	message: string
	status?: number
}

export type GameClientTransport = GameRequestTransport & {
	pollEvents?(gameId: number, afterSeq: number): Promise<ReadonlyArray<EventEnvelope>>
}

export type GameClient = {
	getState(gameId: number): Promise<GameStateEnvelope>
	submitAction(gameId: number, action: GameAction): Promise<ServerGameSnapshot>
	pollEvents(gameId: number, afterSeq: number): Promise<ReadonlyArray<EventEnvelope>>
	reportDiagnostic?(gameId: number, diagnostic: ClientDiagnosticReport): Promise<void>
}

export class GameClientSeamError extends Error {
	kind: GameClientError['kind']
	status?: number

	constructor(kind: GameClientError['kind'], message: string, cause?: unknown, status?: number) {
		super(message)
		this.name = 'GameClientSeamError'
		this.kind = kind
		this.status = status
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
		reportDiagnostic: transport.reportDiagnostic === undefined
			? undefined
			: async (gameId: number, diagnostic: ClientDiagnosticReport) => {
				try {
					await transport.reportDiagnostic!(gameId, diagnostic)
				} catch (error) {
					throw normalizeTransportError(error)
				}
			},
	}
}