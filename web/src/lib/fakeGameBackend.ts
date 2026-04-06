import type {
  GameRequestTransport,
  LiveEventSource,
  LiveSessionSignal,
} from './gameSessionTypes'
import type { GameSnapshot, GameSessionContext, GameAction } from './gameClient'

/**
 * Fake backend for deterministic controller and app tests.
 *
 * Usage:
 *   - Seed with initial snapshot and session.
 *   - Queue refresh snapshots.
 *   - Emit live events and connection changes.
 *   - Record submitted actions.
 *   - Inject transport failures.
 *   - Expose helpers for test assertions and manipulation.
 */

export function createFakeGameBackend(options: {
  initialSnapshot: GameSnapshot
  session: GameSessionContext
}) {
  // Internal state
  let currentSnapshot = options.initialSnapshot
  let currentSession: GameSessionContext = options.session
  let refreshQueue: Array<{ snapshot: GameSnapshot; session: GameSessionContext }> = []
  let failNextRefresh: Error | null = null
  let submittedActions: Array<{ gameId: number; action: GameAction }> = []
  const liveListeners = new Set<(signal: LiveSessionSignal) => void>()
  let connectionStatus: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' = 'idle'
  let emittedSignals: LiveSessionSignal[] = []


	// --- Fake Request Transport ---
	const requestTransport: GameRequestTransport = {
    async getState(_gameId: number) {
      void _gameId // suppress unused variable warning
			if (failNextRefresh) {
				const err = failNextRefresh
				failNextRefresh = null
				throw err
			}
			if (refreshQueue.length > 0) {
				const { snapshot, session } = refreshQueue.shift()!
				currentSnapshot = snapshot
				currentSession = session
			}
			return {
				snapshot: currentSnapshot,
				session: currentSession,
			}
		},
		async submitAction(gameId: number, action: GameAction) {
			submittedActions.push({ gameId, action })
			// For the fake, just return the current snapshot (could be extended for more realism)
			return currentSnapshot
		},
	}


  // --- Fake Live Event Source ---
  const liveEventSource: LiveEventSource = {
    subscribe(listener) {
      liveListeners.add(listener)
      return () => {
        liveListeners.delete(listener)
      }
    },
    connect(gameId: number) {
      connectionStatus = 'connecting'
      emitSignal({ kind: 'connection', gameId, status: 'connecting' })
      setTimeout(() => {
        connectionStatus = 'connected'
        emitSignal({ kind: 'connection', gameId, status: 'connected' })
      }, 1)
    },
    disconnect(gameId: number) {
      connectionStatus = 'disconnected'
      emitSignal({ kind: 'connection', gameId, status: 'disconnected' })
    },
    getConnectionState(_gameId: number) {
      void _gameId // suppress unused variable warning
      return connectionStatus
    },
  }


  function emitSignal(signal: LiveSessionSignal) {
    emittedSignals.push(signal)
    for (const listener of liveListeners) {
      listener(signal)
    }
  }


  // --- Test Helpers ---
  return {
    requestTransport,
    liveEventSource,

    // Manipulation
    seedSnapshot(snapshot: GameSnapshot, session: GameSessionContext) {
      currentSnapshot = snapshot
      currentSession = session
    },
    queueRefresh(snapshot: GameSnapshot, session: GameSessionContext) {
      refreshQueue.push({ snapshot, session })
    },
    failNextRefreshWith(error: Error) {
      failNextRefresh = error
    },
    emitLiveSignal(signal: LiveSessionSignal) {
      emitSignal(signal)
    },
    setConnectionStatus(status: typeof connectionStatus) {
      connectionStatus = status
    },

    // Verification
    getSubmittedActions() {
      return [...submittedActions]
    },
    getEmittedSignals() {
      return [...emittedSignals]
    },
    getCurrentSnapshot() {
      return currentSnapshot
    },
    getCurrentSession() {
      return currentSession
    },
    clear() {
      refreshQueue = []
      failNextRefresh = null
      submittedActions = []
      emittedSignals = []
    },
  }
}
