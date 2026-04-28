import { useEffect, useMemo, useRef, useState } from 'react'
import { CombatResolutionToast } from './components/CombatResolutionToast'
import { MoveResolutionToast } from './components/MoveResolutionToast'
import { GameOverToast } from './components/GameOverToast'
import { ErrorOverlay } from './components/ErrorOverlay'
import { DraggableDebugPopup } from './components/DraggableDebugPopup'
import { ConnectGate } from './components/ConnectGate'
import { BattlefieldStage } from './components/BattlefieldStage'
import { BattlefieldLeftRail } from './components/BattlefieldLeftRail'
import { BattlefieldRightRail } from './components/BattlefieldRightRail'
import {
  type GameAction,
  type GameClient,
} from './lib/gameClient'
import { createGameSessionController } from './lib/gameSessionController'
import type { WebRuntimeConfig } from './lib/appBootstrap'
import { formatRamResolutionTitle } from './lib/moveResolution'
import { useGameSession } from './lib/useGameSession'
import { useDebugDiagnostics } from './lib/useDebugDiagnostics'
import { useBattlefieldInteractionState } from './lib/useBattlefieldInteractionState'
import { useBattlefieldDisplayState } from './lib/useBattlefieldDisplayState'
import { buildCombatCommitAction, buildEndPhaseCommitAction } from './lib/commitActionBuilders'
import { useInactiveEventStream } from './lib/useInactiveEventStream'
import { buildAcknowledgementTurnKey } from './lib/turnKey'
import type {
  GameRequestTransport,
  GameSessionController,
  GameSessionViewState,
  LiveEventSource,
} from './lib/gameSessionTypes'
import type { SessionBinding } from './lib/sessionBinding'
import {
  getPhaseOwner,
} from './lib/appViewHelpers'
import logger from './lib/logger'
import './App.css'

type AppProps = {
  gameClient?: GameClient
  gameId?: number
  liveEventSource?: LiveEventSource
  runtimeConfig?: WebRuntimeConfig
  showConnectionGate?: boolean
}

const idleSessionState: GameSessionViewState = {
  status: 'idle',
  snapshot: null,
  session: null,
  liveConnection: 'idle',
  lastAppliedEventSeq: null,
  lastAppliedEventType: null,
  lastUpdatedAt: null,
  error: null,
}

const idleLiveEventSource: LiveEventSource = {
  subscribe() {
    return () => {}
  },
  connect() {},
  disconnect() {},
  getConnectionState() {
    return 'idle'
  },
}

const idleSessionController: GameSessionController = {
  subscribe() {
    return () => {}
  },
  getSnapshot() {
    return idleSessionState
  },
  async load() {
    return
  },
  async refresh() {
    return
  },
  async submitAction() {
    return null
  },
  dispose() {},
}

function createRequestTransportFromGameClient(
  gameClient: GameClient,
): GameRequestTransport {
  return {
    async getState(gameId: number) {
      const startedAt = Date.now()
      logger.debug('[app-debug] transport getState start', {
        ts: startedAt,
        gameId,
      })

      try {
        const result = await gameClient.getState(gameId)
        logger.debug('[app-debug] transport getState success', {
          durationMs: Date.now() - startedAt,
          ts: Date.now(),
          gameId,
          phase: result.snapshot.phase,
          lastEventSeq: result.snapshot.lastEventSeq,
          sessionRole: result.session.role,
        })
        return result
      } catch (error) {
        logger.warn('[app-debug] transport getState failure', {
          durationMs: Date.now() - startedAt,
          ts: Date.now(),
          gameId,
          error,
        })
        throw error
      }
    },
    async submitAction(gameId: number, action: GameAction) {
      const startedAt = Date.now()
      logger.debug('[app-debug] transport submitAction start', {
        ts: startedAt,
        action,
        gameId,
      })

      try {
        const result = await gameClient.submitAction(gameId, action)
        logger.debug('[app-debug] transport submitAction success', {
          ts: Date.now(),
          action,
          durationMs: Date.now() - startedAt,
          gameId,
          phase: result.phase,
          lastEventSeq: result.lastEventSeq,
          sessionRole: null,
        })
        return result
      } catch (error) {
        logger.warn('[app-debug] transport submitAction failure', {
          ts: Date.now(),
          action,
          durationMs: Date.now() - startedAt,
          gameId,
          error,
        })
        throw error
      }
    },
    async pollEvents(gameId: number, afterSeq: number) {
      const startedAt = Date.now()
      logger.debug('[app-debug] transport pollEvents start', {
        ts: startedAt,
        afterSeq,
        gameId,
      })

      try {
        const result = await gameClient.pollEvents(gameId, afterSeq)
        logger.debug('[app-debug] transport pollEvents success', {
          ts: Date.now(),
          afterSeq,
          durationMs: Date.now() - startedAt,
          gameId,
          eventCount: result.length,
          lastSeq: result.length > 0 ? result[result.length - 1]?.seq ?? null : null,
        })
        return result
      } catch (error) {
        logger.warn('[app-debug] transport pollEvents failure', {
          ts: Date.now(),
          afterSeq,
          durationMs: Date.now() - startedAt,
          gameId,
          error,
        })
        throw error
      }
    },
  }
}

/**
 * Main Onion Web UI shell.
 *
 * Implements the three-phase turn handoff contract:
 *
 *   1. Inactive phase: Player is not active; event stream is visible and controls are locked.
 *   2. Acknowledgement phase: Player becomes active, but must acknowledge the new turn ("Begin Turn").
 *      - The event stream and Begin Turn button are visually highlighted.
 *      - Only the Begin Turn button is interactable; all other controls remain locked.
 *   3. Active phase: After acknowledgement, player can interact with the board and controls.
 *
 * State is tracked via:
 *   - `turnGateSnapshot`: Tracks the authoritative game/turn/phase and whether acknowledgement is pending.
 *   - `acknowledgedActiveTurnKey`: Records the last acknowledged turn key.
 *   - `inactiveEventAcknowledgementPending`: True if the UI is waiting for the user to acknowledge the new turn.
 *
 * See also: docs/web-ui-spec.md (Turn Handoff Contract)
 */
function App({ gameClient, gameId, liveEventSource, runtimeConfig, showConnectionGate = false }: AppProps) {
  const [connectedSession, setConnectedSession] = useState<SessionBinding | null>(null)
  const [acknowledgedActiveTurnKey, setAcknowledgedActiveTurnKey] = useState<string | null>(null)
  const [turnGateSnapshot, setTurnGateSnapshot] = useState<{
    activeGameId: number | null
    pendingAcknowledgementTurnKey: string | null
    sessionTurnActive: boolean
    turnKnown: boolean
  }>({
    activeGameId: null,
    pendingAcknowledgementTurnKey: null,
    sessionTurnActive: false,
    turnKnown: false,
  })
  const [dismissedGameOverToastKey, setDismissedGameOverToastKey] = useState<string | null>(null)
  const previousDebugStateRef = useRef<{
    activeGameId: number | null
    activeTurnOwner: 'onion' | 'defender' | null
    inactiveEventControlsLocked: boolean
    inactiveEventScreenLocked: boolean
    inactiveEventWindowVisible: boolean
    phaseAdvanceLabel: string | null
    sessionPhase: string | null
    sessionRole: 'onion' | 'defender' | null
    sessionTurnActive: boolean
    loggedAtMs: number
  } | null>(null)
  const previousTurnGateRef = useRef<{
    activeGameId: number | null
    sessionTurnActive: boolean
    turnKnown: boolean
  } | null>(null)
  const previousSessionReloadRef = useRef<{
    activeGameId: number | null
    lastAppliedEventSeq: number | null
    lastAppliedEventType: string | null
    liveConnection: string | null
    sessionPhase: string | null
    sessionRole: 'onion' | 'defender' | null
    sessionTurnActive: boolean
    loggedAtMs: number
  } | null>(null)

  const runtimeConnectionSeeded = showConnectionGate
  const liveRefreshQuietWindowMs = runtimeConfig?.liveRefreshQuietWindowMs ?? 500

  const providedRequestTransport = useMemo(() => {
    if (gameClient === undefined) {
      return null
    }

    return createRequestTransportFromGameClient(gameClient)
  }, [gameClient])

  const activeSessionBinding = useMemo<SessionBinding | null>(() => {
    if (providedRequestTransport !== null && gameId !== undefined) {
      if (typeof window !== 'undefined') {
        logger.debug('[app] using provided request transport', {
          gameId,
          hasLiveEventSource: liveEventSource !== undefined,
        })
      }
      return {
        gameId,
        requestTransport: providedRequestTransport,
        liveEventSource: liveEventSource ?? idleLiveEventSource,
      }
    }

    if (typeof window !== 'undefined') {
      logger.debug('[app] using connected session binding', {
        hasConnectedSession: connectedSession !== null,
        connectedGameId: connectedSession?.gameId ?? null,
      })
    }

    return connectedSession
  }, [connectedSession, gameId, liveEventSource, providedRequestTransport])

  const activeSessionController = useMemo(() => {
    if (activeSessionBinding === null) {
      return null
    }

    return createGameSessionController({
      gameId: activeSessionBinding.gameId,
      requestTransport: activeSessionBinding.requestTransport,
      liveEventSource: activeSessionBinding.liveEventSource,
      liveRefreshQuietWindowMs,
    })
  }, [activeSessionBinding, liveRefreshQuietWindowMs])

  const sessionState = useGameSession(activeSessionController ?? idleSessionController, {
    autoLoad: activeSessionController !== null,
    disposeOnUnmount: true,
  })

  const sessionPhase = sessionState.snapshot?.phase ?? null
  const sessionRole = sessionState.session?.role ?? null
  const sessionTurnNumber = sessionState.snapshot?.turnNumber ?? null
  const sessionWinner = sessionState.snapshot?.winner ?? null
  const sessionWinnerToastKey = sessionState.snapshot ? `${sessionState.snapshot.gameId}:${sessionState.snapshot.lastEventSeq}` : null
  const sessionTurnKnown = sessionState.snapshot !== null && sessionRole !== null
  const activeTurnOwner = getPhaseOwner(sessionPhase)
  const sessionTurnActive = sessionState.snapshot !== null && sessionRole !== null && activeTurnOwner === sessionRole
  const activeGameIdForGate = activeSessionBinding?.gameId ?? null
  const currentActiveTurnKey = buildAcknowledgementTurnKey({
    activeGameId: activeGameIdForGate,
    currentTurnNumber: sessionTurnNumber,
    sessionRole,
    sessionTurnActive: sessionTurnKnown && sessionTurnActive,
  })

  const pendingAcknowledgementTurnKey =
    currentActiveTurnKey !== null && acknowledgedActiveTurnKey !== currentActiveTurnKey ? currentActiveTurnKey : null

  const inactiveEventStream = useInactiveEventStream({
    activeGameId: activeGameIdForGate,
    activeTurnActive: sessionTurnActive,
    currentTurnNumber: sessionTurnNumber,
    lastAppliedEventSeq: sessionState.lastAppliedEventSeq,
    pollEvents: activeSessionBinding?.requestTransport.pollEvents,
  })

  useEffect(() => {
    setTurnGateSnapshot((current) => {
      const nextPendingAcknowledgementTurnKey = pendingAcknowledgementTurnKey

      if (
        current.activeGameId === activeGameIdForGate &&
        current.pendingAcknowledgementTurnKey === nextPendingAcknowledgementTurnKey &&
        current.sessionTurnActive === sessionTurnActive &&
        current.turnKnown === sessionTurnKnown
      ) {
        return current
      }

      return {
        activeGameId: activeGameIdForGate,
        pendingAcknowledgementTurnKey: nextPendingAcknowledgementTurnKey,
        sessionTurnActive,
        turnKnown: sessionTurnKnown,
      }
    })

    previousTurnGateRef.current = {
      activeGameId: activeGameIdForGate,
      sessionTurnActive,
      turnKnown: sessionTurnKnown,
    }
  }, [
    acknowledgedActiveTurnKey,
    activeGameIdForGate,
    currentActiveTurnKey,
    pendingAcknowledgementTurnKey,
    sessionTurnActive,
    sessionTurnKnown,
  ])

  const inactiveEventAcknowledgementPending =
    currentActiveTurnKey !== null &&
    pendingAcknowledgementTurnKey === currentActiveTurnKey &&
    acknowledgedActiveTurnKey !== currentActiveTurnKey

  const inactiveEventWindowVisible = sessionTurnKnown && (!sessionTurnActive || inactiveEventAcknowledgementPending)
  const inactiveEventControlsLocked = inactiveEventWindowVisible
  const inactiveEventScreenLocked = inactiveEventAcknowledgementPending

  const interactionState = useBattlefieldInteractionState({
    activeSessionController,
    activeTurnActive: sessionTurnActive,
    clientSnapshot: sessionState.snapshot,
    clientSnapshotPhase: sessionPhase,
    isControlledSession: activeSessionBinding !== null,
    isInteractionLocked: inactiveEventControlsLocked,
    isSelectionLocked: inactiveEventScreenLocked,
  })

  const battlefieldInteractionState = interactionState.interactionState

  const displayState = useBattlefieldDisplayState({
    activeSessionBinding,
    combatBaseSnapshot: battlefieldInteractionState.combatBaseSnapshot,
    interactionState: battlefieldInteractionState,
    sessionState,
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const now = Date.now()
    const currentReloadState = {
      activeGameId: activeSessionBinding?.gameId ?? null,
      lastAppliedEventSeq: sessionState.lastAppliedEventSeq,
      lastAppliedEventType: sessionState.lastAppliedEventType,
      liveConnection: sessionState.liveConnection,
      loggedAtMs: now,
      sessionPhase,
      sessionRole,
      sessionTurnActive,
    }
    const previousReloadState = previousSessionReloadRef.current
    const hasChanged =
      previousReloadState === null ||
      Object.entries(currentReloadState).some(([key, value]) => previousReloadState[key as keyof typeof previousReloadState] !== value)

    if (!hasChanged) {
      return
    }

    logger.debug('[app-debug] session reload', {
      ts: currentReloadState.loggedAtMs,
      deltaMs: previousReloadState === null ? null : currentReloadState.loggedAtMs - previousReloadState.loggedAtMs,
      previous: previousReloadState,
      current: currentReloadState,
    })

    previousSessionReloadRef.current = currentReloadState
  }, [
    activeSessionBinding?.gameId,
    sessionPhase,
    sessionRole,
    sessionState.lastAppliedEventSeq,
    sessionState.lastAppliedEventType,
    sessionState.liveConnection,
    sessionTurnActive,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const now = Date.now()
    const currentState = {
      activeGameId: activeSessionBinding?.gameId ?? null,
      activeTurnOwner,
      inactiveEventControlsLocked,
      inactiveEventScreenLocked,
      inactiveEventWindowVisible,
      phaseAdvanceLabel: displayState.phaseAdvanceLabel,
      sessionPhase,
      sessionRole,
      sessionTurnActive,
      loggedAtMs: now,
    }
    const previousState = previousDebugStateRef.current
    const hasChanged =
      previousState === null ||
      Object.entries(currentState).some(([key, value]) => previousState[key as keyof typeof previousState] !== value)

    if (!hasChanged) {
      return
    }

    logger.debug('[app-debug] turn state transition', {
      ts: currentState.loggedAtMs,
      deltaMs: previousState === null ? null : currentState.loggedAtMs - previousState.loggedAtMs,
      previous: previousState,
      current: {
        activeGameId: currentState.activeGameId,
        activeTurnOwner: currentState.activeTurnOwner,
        inactiveEntryCount: inactiveEventStream.entries.length,
        inactiveDismissed: inactiveEventStream.isDismissed,
        inactiveEventControlsLocked: currentState.inactiveEventControlsLocked,
        inactiveEventScreenLocked: currentState.inactiveEventScreenLocked,
        inactiveEventWindowVisible: currentState.inactiveEventWindowVisible,
        lastAppliedEventSeq: sessionState.lastAppliedEventSeq,
        phaseAdvanceLabel: currentState.phaseAdvanceLabel,
        sessionPhase: currentState.sessionPhase,
        sessionRole: currentState.sessionRole,
        sessionTurnActive: currentState.sessionTurnActive,
      },
    })

    previousDebugStateRef.current = currentState
  }, [
    activeSessionBinding?.gameId,
    activeTurnOwner,
    displayState.phaseAdvanceLabel,
    inactiveEventControlsLocked,
    inactiveEventScreenLocked,
    inactiveEventStream.entries.length,
    inactiveEventStream.isDismissed,
    inactiveEventWindowVisible,
    sessionPhase,
    sessionRole,
    sessionState.lastAppliedEventSeq,
    sessionTurnActive,
  ])

  const {
    actionError,
    commitClientAction,
    handleDeselectUnit,
    handleDismissCombatResolution,
    handleDismissRamResolution,
    handleMoveUnit,
    handleResolveRamPrompt,
    handleRefresh,
    handleSelectUnit,
    handleSelectStackMember,
    handleSelectAllStackMembers,
    handleClearStackSelection,
    isRefreshing,
    pendingRamPrompt,
    pendingCombatResolution,
    pendingRamResolution,
    selectedCombatTargetId,
    setActionError,
    setSelectedCombatTargetId,
  } = interactionState

  const {
    error: displayError,
    activeCombatRole,
    activeGameId,
    activeMode,
    activePhase,
    activePhaseLabel,
    activeRole,
    activeScenarioName,
    activeSelectedUnitIds,
    activeTurnActive,
    activeTurnNumber,
    clientSnapshot,
    combatRangeHexKeys,
    combatTargetIds,
    combatTargetOptions,
    connectionLabel,
    connectionStatus,
    displayedDefenders,
    displayedOnion,
    displayedScenarioMap,
    headerHasSnapshot,
    isCombatPhase,
    isMovementPhase,
    lastUpdatedAt,
    onionWeapons,
    phaseAdvanceLabel,
    readyWeaponDetails,
    selectedCombatAttackerIds,
    selectedCombatAttackCount,
    selectedCombatAttackLabel,
    selectedCombatAttackStrength,
    selectedCombatTarget,
    selectedInspectorDefender,
    selectedInspectorOnion,
    selectedInspectorUnitId,
    rightRailStackPanel,
    escapeHexes,
    victoryObjectives,
    shellPhase,
  } = displayState

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const now = Date.now()
    const currentState = {
      activeGameId: activeSessionBinding?.gameId ?? null,
      activeTurnOwner,
      inactiveEventControlsLocked,
      inactiveEventScreenLocked,
      inactiveEventWindowVisible,
      phaseAdvanceLabel,
      sessionPhase,
      sessionRole,
      sessionTurnActive,
      loggedAtMs: now,
    }
    const previousState = previousDebugStateRef.current
    const hasChanged =
      previousState === null ||
      Object.entries(currentState).some(([key, value]) => previousState[key as keyof typeof previousState] !== value)

    if (!hasChanged) {
      return
    }

    logger.debug('[app-debug] turn state transition', {
      atMs: currentState.loggedAtMs,
      deltaMs: previousState === null ? null : currentState.loggedAtMs - previousState.loggedAtMs,
      previous: previousState,
      current: {
        activeGameId: currentState.activeGameId,
        activeTurnOwner: currentState.activeTurnOwner,
        inactiveEntryCount: inactiveEventStream.entries.length,
        inactiveDismissed: inactiveEventStream.isDismissed,
        inactiveEventControlsLocked: currentState.inactiveEventControlsLocked,
        inactiveEventScreenLocked: currentState.inactiveEventScreenLocked,
        inactiveEventWindowVisible: currentState.inactiveEventWindowVisible,
        lastAppliedEventSeq: sessionState.lastAppliedEventSeq,
        phaseAdvanceLabel: currentState.phaseAdvanceLabel,
        sessionPhase: currentState.sessionPhase,
        sessionRole: currentState.sessionRole,
        sessionTurnActive: currentState.sessionTurnActive,
      },
    })

    previousDebugStateRef.current = currentState
  }, [
    activeSessionBinding?.gameId,
    activeTurnOwner,
    inactiveEventControlsLocked,
    inactiveEventScreenLocked,
    inactiveEventStream.entries.length,
    inactiveEventStream.isDismissed,
    inactiveEventWindowVisible,
    phaseAdvanceLabel,
    sessionPhase,
    sessionRole,
    sessionState.lastAppliedEventSeq,
    sessionTurnActive,
  ])

  const isControlledSession = activeSessionBinding !== null
  const shouldShowGameOverToast = sessionWinner !== null && sessionWinnerToastKey !== null && dismissedGameOverToastKey !== sessionWinnerToastKey

  const {
    debugEntries,
    debugOpen,
    debugPopupLayout,
    setDebugOpen,
    setDebugPopupLayout,
  } = useDebugDiagnostics()

  function handleConfirmCombat() {
    if (inactiveEventControlsLocked) {
      return
    }

    if (selectedCombatTarget === null || selectedCombatTarget.isDisabled === true || selectedCombatAttackCount === 0 || displayedOnion === null) {
      return
    }

    const combatAction = buildCombatCommitAction({
      state: clientSnapshot?.authoritativeState ?? null,
      anchorUnitId: activeCombatRole === 'defender' ? selectedInspectorUnitId : null,
      selectedUnitIds: selectedCombatAttackerIds,
      targetId: selectedCombatTarget.id,
      onionId: displayedOnion.id,
    })

    if (!combatAction.ok && combatAction.reason === 'empty-selection') {
      setActionError('Select at least one stack member before resolving combat.')
      return
    }

    if (!combatAction.ok) {
      return
    }

    void commitClientAction(combatAction.action)
  }

  function handleDismissGameOverToast() {
    if (sessionWinnerToastKey === null) {
      return
    }

    setDismissedGameOverToastKey(sessionWinnerToastKey)
  }

  if (!isControlledSession && runtimeConnectionSeeded) {
    return <ConnectGate runtimeConfig={runtimeConfig} onConnectedSession={setConnectedSession} />
  }

  return (
    <div className={`shell${inactiveEventScreenLocked ? ' inactive-event-screen-locked' : ''}`} data-phase={shellPhase}>
      {displayError ? (
        <ErrorOverlay
          message={displayError}
          placement="map"
          onDismiss={() => { /* no-op for now, could add dismiss logic if desired */ }}
        />
      ) : null}
      {actionError ? <ErrorOverlay message={actionError} placement="app" onDismiss={() => setActionError(null)} /> : null}
      {pendingCombatResolution && selectedCombatTarget !== null ? (
        <CombatResolutionToast
          title={`Combat resolved on ${selectedCombatTarget.label}`}
          resolution={pendingCombatResolution}
          modifiers={selectedCombatTarget.modifiers}
          onDismiss={handleDismissCombatResolution}
        />
      ) : null}
      {pendingRamResolution?.map((resolution, index) => (
        <MoveResolutionToast
          key={`${resolution.unitId}:${resolution.rammedUnitId}:${index}`}
          title={formatRamResolutionTitle(resolution)}
          resolution={resolution}
          onDismiss={() => handleDismissRamResolution(index)}
        />
      ))}
      {shouldShowGameOverToast ? <GameOverToast winner={sessionWinner} onDismiss={handleDismissGameOverToast} /> : null}
      <header className="topbar panel">
        <div
          className={`role-badge ${
            headerHasSnapshot
              ? activeTurnActive
                ? activeRole === 'defender'
                  ? 'role-badge-active role-badge-defender'
                  : 'role-badge-active role-badge-onion'
                : activeRole === 'defender'
                  ? 'role-badge-inactive role-badge-defender'
                  : 'role-badge-inactive role-badge-onion'
              : 'role-badge-waiting'
          }`}
        >
          {activeRole === 'defender' ? 'Defender' : activeRole === 'onion' ? 'Onion' : 'Waiting'}
        </div>
        <div className="topbar-state">
          <div className={`phase-chip phase-chip-turn${headerHasSnapshot ? '' : ' phase-chip-waiting'}`}>
            <span>Turn {activeTurnNumber ?? 'waiting'}</span>
          </div>
          <div className={`phase-chip phase-chip-state${activeTurnActive ? ' phase-chip-active' : ''}${headerHasSnapshot ? '' : ' phase-chip-waiting'}`}>
            <span>{headerHasSnapshot ? activePhaseLabel : 'WAITING'}</span>
          </div>
          {phaseAdvanceLabel !== null ? (
            <button
              type="button"
              className="phase-advance-btn"
              disabled={inactiveEventControlsLocked}
              onClick={() => {
                logger.debug('[app-debug] phase advance clicked', {
                  ts: Date.now(),
                  activeGameId: activeSessionBinding?.gameId ?? null,
                  activeTurnOwner,
                  inactiveEventControlsLocked,
                  inactiveEventScreenLocked,
                  inactiveEventWindowVisible,
                  phaseAdvanceLabel,
                  sessionPhase,
                  sessionRole,
                  sessionTurnActive,
                })
                if (inactiveEventControlsLocked) {
                  return
                }
                void commitClientAction(buildEndPhaseCommitAction().action)
              }}
            >
              {phaseAdvanceLabel}
            </button>
          ) : null}
          {/* Show Begin Turn button when inactive event stream is visible and can be dismissed */}
          {inactiveEventWindowVisible && (
            <button
              type="button"
              className={`phase-advance-btn begin-turn-btn${sessionTurnActive ? ' begin-turn-btn-ready' : ' disabled'}`}
              onClick={() => {
                logger.debug('[app-debug] begin turn clicked', {
                  ts: Date.now(),
                  activeGameId: activeSessionBinding?.gameId ?? null,
                  activeTurnOwner,
                  inactiveEntryCount: inactiveEventStream.entries.length,
                  inactiveDismissed: inactiveEventStream.isDismissed,
                  inactiveEventControlsLocked,
                  inactiveEventScreenLocked,
                  inactiveEventWindowVisible,
                  sessionPhase,
                  sessionRole,
                  sessionTurnActive,
                })
                inactiveEventStream.clearEntries()
                setAcknowledgedActiveTurnKey(currentActiveTurnKey)
              }}
              aria-label="Begin turn"
              disabled={!sessionTurnActive}
            >
              Begin Turn
            </button>
          )}
        </div>
        <div className="header-utility-controls">
          <div className="utility-group-vert">
            <div>
              <span className="stat-label-small">Scenario</span>
              <strong className={headerHasSnapshot ? '' : 'header-waiting'}>{activeScenarioName ?? 'Waiting for game state'}</strong>
            </div>
            <div>
              <span className="stat-label-small">Game ID</span>
              <strong className={headerHasSnapshot ? '' : 'header-waiting'}>{activeGameId ?? 'Waiting'}</strong>
            </div>
          </div>
          <div className="utility-group-vert">
            <button
              className="refresh-btn"
              title="Refresh game state"
              onClick={() => {
                logger.debug('[app-debug] refresh clicked', {
                  ts: Date.now(),
                  activeGameId: activeSessionBinding?.gameId ?? null,
                  sessionPhase,
                  sessionRole,
                  sessionTurnActive,
                  inactiveEventWindowVisible,
                  inactiveEventControlsLocked,
                })
                void handleRefresh()
              }}
              aria-label="Refresh"
              disabled={isRefreshing}
            >
              Refresh
            </button>
            <button
              className={`debug-toggle-btn${debugOpen ? ' active' : ''}`}
              title="Toggle debug diagnostics"
              aria-label="Toggle debug diagnostics"
              onClick={() => setDebugOpen((value: boolean) => !value)}
            >
              Debug
            </button>
          </div>
          <div className="utility-group-vert">
            <div className="sync-status-block" title={`Live connection: ${connectionLabel}`}>
              <span className="stat-label-small">Connection</span>
              <span className={`connection-status connection-status-${connectionStatus}`}>
                {connectionLabel}
              </span>
            </div>
            <div className="last-sync-block" title="Last live update time">
              <span className="stat-label-small">Last</span>
              <span className="last-sync">
                {lastUpdatedAt === null ? '—' : lastUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      </header>

      {debugOpen && (
        <DraggableDebugPopup
          layout={debugPopupLayout}
          onLayoutChange={setDebugPopupLayout}
          onClose={() => setDebugOpen(false)}
          lines={debugEntries}
          onAdvancePhase={() => {
            void commitClientAction(buildEndPhaseCommitAction().action)
          }}
        />
      )}

      <main className="battlefield-grid" onClick={handleDeselectUnit}>
        <BattlefieldLeftRail
          activeCombatRole={activeCombatRole}
          activeMode={activeMode}
          activeSelectedUnitIds={activeSelectedUnitIds}
          displayedDefenders={displayedDefenders}
          displayedOnion={displayedOnion}
          isCombatPhase={isCombatPhase}
          isMovementPhase={isMovementPhase}
          isSelectionLocked={inactiveEventScreenLocked}
          onionWeapons={onionWeapons}
          readyWeaponDetails={readyWeaponDetails}
          selectedCombatAttackLabel={selectedCombatAttackLabel}
          stackNaming={clientSnapshot?.authoritativeState?.stackNaming}
          stackRoster={clientSnapshot?.authoritativeState?.stackRoster}
          onSelectUnit={handleSelectUnit}
        />

        {displayedScenarioMap && displayedOnion ? (
          <BattlefieldStage
            activePhase={activePhase}
            activeTurnActive={activeTurnActive}
            defenders={displayedDefenders}
            onion={displayedOnion}
            stackNaming={clientSnapshot?.authoritativeState?.stackNaming}
            stackRoster={clientSnapshot?.authoritativeState?.stackRoster}
            scenarioMap={displayedScenarioMap}
            selectedCombatTargetId={selectedCombatTargetId}
            selectedUnitIds={activeSelectedUnitIds}
            combatRangeHexKeys={combatRangeHexKeys}
            combatTargetIds={combatTargetIds}
            escapeHexes={escapeHexes}
            isSelectionLocked={inactiveEventScreenLocked}
            isInteractionLocked={inactiveEventControlsLocked}
            canSubmitMove={
              activePhase === 'ONION_MOVE' ||
              activePhase === 'DEFENDER_MOVE' ||
              activePhase === 'GEV_SECOND_MOVE'
            }
            viewerRole={activeRole}
            onSelectUnit={handleSelectUnit}
            onSelectCombatTarget={setSelectedCombatTargetId}
            onDeselect={handleDeselectUnit}
            onMoveUnit={handleMoveUnit}
          />
        ) : (
          <section className="panel map-stage">
            <div className="map-frame">
              <div className="hex-map-shell panel-subtle">
                <p className="summary-line">Battlefield will appear once the game state loads.</p>
              </div>
            </div>
          </section>
        )}

        <BattlefieldRightRail
          activeCombatRole={activeCombatRole}
          activeRole={activeRole}
          activeSelectedUnitCount={activeSelectedUnitIds.length}
          isCombatPhase={isCombatPhase}
          showInactiveEventStream={inactiveEventWindowVisible}
          isInteractionLocked={inactiveEventControlsLocked}
          canDismissInactiveEventStream={sessionTurnActive}
          pendingRamPrompt={pendingRamPrompt}
          selectedCombatAttackCount={selectedCombatAttackCount}
          selectedCombatAttackStrength={selectedCombatAttackStrength}
          selectedCombatTarget={selectedCombatTarget}
          selectedCombatTargetId={selectedCombatTargetId}
          selectedInspectorDefender={selectedInspectorDefender}
          selectedInspectorOnion={selectedInspectorOnion}
          rightRailStackPanel={rightRailStackPanel}
          escapeHexes={escapeHexes}
          victoryObjectives={victoryObjectives}
          inactiveEventStream={inactiveEventStream}
          combatTargetOptions={combatTargetOptions}
          onConfirmCombat={handleConfirmCombat}
          onAttemptRam={() => handleResolveRamPrompt(true)}
          onDeclineRam={() => handleResolveRamPrompt(false)}
          onSelectCombatTarget={setSelectedCombatTargetId}
          onToggleStackMember={(unitId) => handleSelectStackMember(unitId, rightRailStackPanel.selectedStackMemberIds)}
          onSelectAllStackMembers={() => handleSelectAllStackMembers(rightRailStackPanel.selectedStackMemberIds)}
          onClearStackSelection={handleClearStackSelection}
        />
      </main>
    </div>
  )
}

export default App
