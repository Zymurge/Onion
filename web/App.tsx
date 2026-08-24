import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CombatResolutionToast } from './components/CombatResolutionToast'
import { MoveResolutionToast } from './components/MoveResolutionToast'
import { GameOverToast } from './components/GameOverToast'
import { ErrorOverlay } from './components/ErrorOverlay'
import { DraggableDebugPopup } from './components/DraggableDebugPopup'
import { ConnectGate } from './components/ConnectGate'
import { AppBattlefieldStage } from './components/AppBattlefieldStage'
import { AppShellHeader } from './components/AppShellHeader'
import { BattlefieldLeftRail } from './components/BattlefieldLeftRail'
import { BattlefieldRightRail } from './components/BattlefieldRightRail'
import {
	type ClientDiagnosticReport,
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
import { routeShellControl } from './lib/shellControlRouting'
import type {
  GameRequestTransport,
  GameSessionController,
  GameSessionViewState,
  LiveEventSource,
} from './lib/gameSessionTypes'
import type { SessionBinding } from './lib/sessionBinding'
import { getPhaseOwner } from './lib/battlefieldViewBuilders'
import logger from './lib/logger'
import { buildLoginRedirect } from './lib/authRouting'
import { clearAuthSession, getAuthSession, getAuthSessionExpiresAt, type AuthSession } from './lib/authSession'
import { createHttpGameRequestTransport } from './lib/httpGameClient'
import { createLiveEventSource } from './lib/liveEventSource'
import './App.css'

type AppProps = {
  gameClient?: GameClient
  gameId?: number
  liveEventSource?: LiveEventSource
  navigate?: (path: string) => void
  runtimeConfig?: WebRuntimeConfig
  showConnectionGate?: boolean
}

const idleSessionState: GameSessionViewState = {
  status: 'idle',
  catalog: null,
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
  abort() {},
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
    ...(gameClient.reportDiagnostic === undefined ? {} : { reportDiagnostic: gameClient.reportDiagnostic }),
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
 *   - `acknowledgedActiveTurnKey`: Records the last acknowledged turn key.
 *   - `inactiveEventAcknowledgementPending`: True if the UI is waiting for the user to acknowledge the new turn.
 *
 * See also: docs/web-ui-spec.md (Turn Handoff Contract)
 */
function App({ gameClient, gameId, liveEventSource, navigate, runtimeConfig, showConnectionGate = false }: AppProps) {
  const [authSession] = useState<AuthSession | null>(() => getAuthSession())
  const [connectedSession, setConnectedSession] = useState<SessionBinding | null>(null)
  const [acknowledgedActiveTurnKey, setAcknowledgedActiveTurnKey] = useState<string | null>(null)
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
  const reportedSessionDiagnosticGameIdRef = useRef<number | null>(null)
	const reportedSnapshotDiagnosticGameIdRef = useRef<number | null>(null)
  const authRedirectedRef = useRef(false)

  const runtimeConnectionSeeded = showConnectionGate
  const liveRefreshQuietWindowMs = runtimeConfig?.liveRefreshQuietWindowMs ?? 500

  const redirectToLogin = useCallback(() => {
    if (authRedirectedRef.current || typeof window === 'undefined') {
      return
    }

    authRedirectedRef.current = true
    clearAuthSession()
    ;(navigate ?? ((path: string) => window.location.replace(path)))(buildLoginRedirect())
  }, [navigate])

  useEffect(() => {
    if (authSession === null) {
      return
    }

    const expiresAt = getAuthSessionExpiresAt(authSession)
    if (expiresAt === null) {
      return
    }

    const delayMs = expiresAt - Date.now()
    if (delayMs <= 0) {
      redirectToLogin()
      return
    }

    const timeout = window.setTimeout(() => {
      redirectToLogin()
    }, delayMs)

    return () => window.clearTimeout(timeout)
  }, [authSession, redirectToLogin])

  const providedRequestTransport = useMemo(() => {
    if (gameClient === undefined) {
      return null
    }

    return createRequestTransportFromGameClient(gameClient)
  }, [gameClient])

  const persistedSessionBinding = useMemo<SessionBinding | null>(() => {
    if (authSession === null || gameId === undefined) {
      return null
    }

    return {
      requestTransport: createHttpGameRequestTransport({
        baseUrl: authSession.apiBaseUrl,
        token: authSession.token,
      }),
      liveEventSource: createLiveEventSource({
        baseUrl: authSession.apiBaseUrl,
        token: authSession.token,
      }),
      gameId,
    }
  }, [authSession, gameId])

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

    return connectedSession ?? persistedSessionBinding
  }, [connectedSession, gameId, liveEventSource, persistedSessionBinding, providedRequestTransport])

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

  useEffect(() => {
    if (sessionState.error?.status === 401) {
      redirectToLogin()
    }
  }, [redirectToLogin, sessionState.error])

  const sessionPhase = sessionState.snapshot?.phase ?? null
  const sessionRole = sessionState.session?.role ?? null
  const sessionTurnNumber = sessionState.snapshot?.turnNumber ?? null
  const sessionWinner = sessionState.snapshot?.winner ?? null
  const sessionWinnerToastKey = sessionState.snapshot ? `${sessionState.snapshot.gameId}:${sessionState.snapshot.lastEventSeq}` : null
  const sessionTurnKnown = sessionState.snapshot !== null && sessionRole !== null
  const activeTurnOwner = getPhaseOwner(sessionPhase)
  const sessionTurnActive = sessionState.snapshot !== null && sessionRole !== null && activeTurnOwner === sessionRole
  const activeGameIdForGate = activeSessionBinding?.gameId ?? null

  useEffect(() => {
    const reportDiagnostic = activeSessionBinding?.requestTransport.reportDiagnostic
    const snapshot = sessionState.snapshot
    const gameId = activeSessionBinding?.gameId
    if (reportDiagnostic === undefined || snapshot === null || gameId === undefined || sessionState.status !== 'ready') {
      return
    }

    if (reportedSessionDiagnosticGameIdRef.current === gameId) {
      return
    }

    reportedSessionDiagnosticGameIdRef.current = gameId
    const diagnostic: ClientDiagnosticReport = {
      reportId: crypto.randomUUID(),
      code: 'CLIENT_SESSION_READY',
      message: 'Client loaded an authoritative game snapshot',
      snapshot: {
        gameId: snapshot.gameId,
        scenarioName: snapshot.scenarioName,
        phase: snapshot.phase,
        turnNumber: snapshot.turnNumber ?? 0,
        lastEventSeq: snapshot.lastEventSeq,
      },
      client: {
        build: 'web-client',
        userAgent: navigator.userAgent,
      },
      protocolTraffic: [],
    }

    void reportDiagnostic(gameId, diagnostic).catch((error: unknown) => {
      logger.warn('[app] client diagnostic report failed', {
        gameId,
        reportId: diagnostic.reportId,
        error,
      })
    })
  }, [activeSessionBinding, sessionState.snapshot, sessionState.status])
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

  const hasRemoteGameAbort = inactiveEventStream.entries.some((entry) => entry.type === 'GAME_ABORTED')

  useEffect(() => {
    if (!hasRemoteGameAbort || activeSessionController === null || sessionState.status === 'aborted') {
      return
    }

    activeSessionController.abort('The game was aborted because a client reported an invalid snapshot.')
  }, [activeSessionController, hasRemoteGameAbort, sessionState.status])

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
    catalog: sessionState.catalog,
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
    displayedOnions,
    displayedScenarioMap,
    headerHasSnapshot,
    isCombatPhase,
    isMovementPhase,
    lastUpdatedAt,
    onionWeapons,
    phaseAdvanceLabel,
    readyWeaponDetails,
    stacksExpandable,
    selectedCombatAttackerIds,
    selectedCombatAttackCount,
    selectedCombatAttackMemberLabels,
    selectedCombatAttackLabel,
    selectedCombatAttackStrength,
    selectedCombatTarget,
    selectedInspectorDefender,
    selectedInspectorOnion,
    selectedInspectorLabel,
    selectedInspectorUnitId,
    rightRailStackPanel,
    escapeHexes,
    victoryObjectives,
    shellPhase,
  } = displayState

  useEffect(() => {
    const reportDiagnostic = activeSessionBinding?.requestTransport.reportDiagnostic
    const snapshot = sessionState.snapshot
    const gameId = activeSessionBinding?.gameId
    if (displayError === null || snapshot === null || gameId === undefined || sessionState.status !== 'ready') {
      return
    }

    if (reportedSnapshotDiagnosticGameIdRef.current === gameId) {
      return
    }

    reportedSnapshotDiagnosticGameIdRef.current = gameId
    activeSessionController?.abort(displayError)
    if (reportDiagnostic === undefined) {
      return
    }

    const diagnostic: ClientDiagnosticReport = {
      reportId: crypto.randomUUID(),
      code: 'SNAPSHOT_INVALID',
      path: 'authoritativeState',
      refreshAttempt: 0,
      message: displayError,
      snapshot: {
        gameId: snapshot.gameId,
        scenarioName: snapshot.scenarioName,
        phase: snapshot.phase,
        turnNumber: snapshot.turnNumber ?? 0,
        lastEventSeq: snapshot.lastEventSeq,
      },
      client: {
        build: 'web-client',
        userAgent: navigator.userAgent,
      },
      protocolTraffic: [],
    }

    void reportDiagnostic(gameId, diagnostic).catch((error: unknown) => {
      logger.warn('[app] invalid snapshot diagnostic report failed', {
        gameId,
        reportId: diagnostic.reportId,
        error,
      })
    })
  }, [activeSessionBinding, activeSessionController, displayError, sessionState.snapshot, sessionState.status])

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
  const appState = sessionState.status === 'loading' ? 'loading' : headerHasSnapshot ? 'loaded' : 'empty'

  const {
    debugEntries,
    debugOpen,
    debugPopupLayout,
    setDebugOpen,
    setDebugPopupLayout,
  } = useDebugDiagnostics()

  function runShellControl(control: 'refresh-session' | 'advance-phase' | 'acknowledge-turn' | 'toggle-debug-diagnostics', enabled: boolean, execute: () => void) {
    const decision = routeShellControl(
      {
        surface: 'header/control',
        control,
        enabled,
      },
      (trace) => {
        logger.debug('[app-debug] shell control routed', {
          ts: Date.now(),
          ...trace,
        })
      },
    )

    if (decision.intent === 'noop') {
      return
    }

    execute()
  }

  function handleConfirmCombat() {
    if (inactiveEventControlsLocked) {
      return
    }

    if (selectedCombatTarget === null || selectedCombatTarget.isDisabled === true || selectedCombatAttackCount === 0 || displayedOnion === null) {
      return
    }

    const combatAction = buildCombatCommitAction({
      state: {
        ...clientSnapshot?.authoritativeState,
        catalog: sessionState.catalog ?? undefined,
      } as Parameters<typeof buildCombatCommitAction>[0]['state'],
      anchorUnitId: activeCombatRole === 'defender' ? selectedInspectorUnitId : null,
      selectedUnitIds: selectedCombatAttackerIds,
      targetId: selectedCombatTarget.id,
      onionId: displayedOnion.unitId,
    })

    if (!combatAction.ok && combatAction.reason === 'empty-stack-selection') {
      setActionError('Select at least one stack member before resolving combat.')
      return
    }

    if (!combatAction.ok) {
      setActionError(
        combatAction.reason === 'missing-onion'
          ? 'Loaded game snapshot is missing the canonical Onion unit ID.'
          : combatAction.reason === 'snapshot-missing-stack-selection'
          ? 'Loaded game snapshot is missing canonical stackRoster data for the selected unit.'
          : 'Unable to resolve combat from the current selection.',
      )
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

  function handleAdvancePhase() {
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
    void commitClientAction(buildEndPhaseCommitAction().action)
  }

  function handleAcknowledgeTurn() {
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
  }

  function handleRefreshFromHeader() {
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
  }

  function handleToggleDebugDiagnostics() {
    setDebugOpen((value: boolean) => !value)
  }

  if (!isControlledSession && runtimeConnectionSeeded) {
    return <ConnectGate runtimeConfig={runtimeConfig} onConnectedSession={setConnectedSession} />
  }

  if (sessionState.status === 'aborted') {
    return (
      <div className="game-aborted" data-testid="game-aborted" role="alert">
        <h1>Game aborted</h1>
        <p>{sessionState.error?.message ?? 'This game was stopped because its state could not be verified.'}</p>
      </div>
    )
  }

  return (
    <div
      className={`shell${inactiveEventScreenLocked ? ' inactive-event-screen-locked' : ''}`}
      data-phase={shellPhase}
      data-state={appState}
      data-testid="app-shell"
    >
      <span data-testid={`app-${appState}-state`} hidden aria-hidden="true" />
      {headerHasSnapshot ? <span data-testid="app-ready" hidden aria-hidden="true" /> : null}
      <span
        data-testid="session-sync-probe"
        data-observed-event-seq={sessionState.lastAppliedEventSeq ?? undefined}
        data-snapshot-event-seq={sessionState.snapshot?.lastEventSeq ?? undefined}
        data-session-status={sessionState.status}
        hidden
        aria-hidden="true"
      />
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
      <AppShellHeader
        appState={appState}
        headerHasSnapshot={headerHasSnapshot}
        activeTurnActive={activeTurnActive}
        activeRole={activeRole}
        activeTurnNumber={activeTurnNumber}
        activePhaseLabel={activePhaseLabel}
        phaseAdvanceLabel={phaseAdvanceLabel}
        inactiveEventControlsLocked={inactiveEventControlsLocked}
        inactiveEventWindowVisible={inactiveEventWindowVisible}
        sessionTurnActive={sessionTurnActive}
        activeScenarioName={activeScenarioName}
        activeGameId={activeGameId}
        isRefreshing={isRefreshing}
        debugOpen={debugOpen}
        connectionLabel={connectionLabel}
        connectionStatus={connectionStatus}
        lastUpdatedAt={lastUpdatedAt}
        runShellControl={runShellControl}
        onAdvancePhase={handleAdvancePhase}
        onAcknowledgeTurn={handleAcknowledgeTurn}
        onRefresh={handleRefreshFromHeader}
        onToggleDebugDiagnostics={handleToggleDebugDiagnostics}
      />

      {debugOpen && (
        <DraggableDebugPopup
          layout={debugPopupLayout}
          onLayoutChange={setDebugPopupLayout}
          onClose={() => setDebugOpen(false)}
          lines={debugEntries}
          onAdvancePhase={() => {
            runShellControl('advance-phase', true, () => {
              void commitClientAction(buildEndPhaseCommitAction().action)
            })
          }}
        />
      )}

      <main className="battlefield-grid" onClick={handleDeselectUnit}>
        <BattlefieldLeftRail
          activeCombatRole={activeCombatRole}
          activeRole={activeRole}
          activeTurnActive={activeTurnActive}
          activeMode={activeMode}
          activeSelectedUnitIds={activeSelectedUnitIds}
          displayedDefenders={displayedDefenders}
          displayedOnion={displayedOnion}
          displayedOnions={displayedOnions}
          isCombatPhase={isCombatPhase}
          isMovementPhase={isMovementPhase}
          isSelectionLocked={inactiveEventScreenLocked}
          stacksExpandable={stacksExpandable}
          onionWeapons={onionWeapons}
          readyWeaponDetails={readyWeaponDetails}
          selectedCombatAttackLabel={selectedCombatAttackLabel}
          stackNaming={clientSnapshot?.authoritativeState?.stackNaming}
          stackRoster={clientSnapshot?.authoritativeState?.stackRoster}
          catalog={sessionState.catalog ?? undefined}
          onSelectUnit={handleSelectUnit}
        />

        <AppBattlefieldStage
          activePhase={activePhase}
          activeTurnActive={activeTurnActive}
          defenders={displayedDefenders}
          onions={displayedOnions}
          stackNaming={clientSnapshot?.authoritativeState?.stackNaming}
          stackRoster={clientSnapshot?.authoritativeState?.stackRoster}
          catalog={sessionState.catalog ?? undefined}
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

        <BattlefieldRightRail
          activeCombatRole={activeCombatRole}
          activeRole={activeRole}
          activeSelectedUnitCount={activeSelectedUnitIds.length}
          isCombatPhase={isCombatPhase}
          showInactiveEventStream={inactiveEventWindowVisible}
          isInteractionLocked={inactiveEventControlsLocked}
          canDismissInactiveEventStream={sessionTurnActive}
          pendingRamPrompt={pendingRamPrompt}
          selectedCombatAttackStrength={selectedCombatAttackStrength}
          selectedCombatAttackerIds={selectedCombatAttackerIds}
          selectedCombatAttackMemberLabels={selectedCombatAttackMemberLabels}
          selectedCombatTarget={selectedCombatTarget}
          selectedCombatTargetId={selectedCombatTargetId}
          selectedInspectorLabel={selectedInspectorLabel}
          selectedInspectorDefender={selectedInspectorDefender}
          selectedInspectorOnion={selectedInspectorOnion}
          readyWeaponDetails={readyWeaponDetails}
          rightRailStackPanel={rightRailStackPanel}
          escapeHexes={escapeHexes}
          catalog={sessionState.catalog ?? undefined}
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
