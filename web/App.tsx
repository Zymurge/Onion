import { useState, useMemo } from 'react'
import { CombatResolutionToast } from './components/CombatResolutionToast'
import { MoveResolutionToast } from './components/MoveResolutionToast'
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
import type {
  GameRequestTransport,
  GameSessionController,
  GameSessionViewState,
  LiveEventSource,
} from './lib/gameSessionTypes'
import type { SessionBinding } from './lib/sessionBinding'
import {
  buildCombatTargetActionId,
  getPhaseOwner,
} from './lib/appViewHelpers'
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

function createRequestTransportFromGameClient(gameClient: GameClient): GameRequestTransport {
  return {
    getState(gameId: number) {
      return gameClient.getState(gameId)
    },
    submitAction(gameId: number, action: GameAction) {
      return gameClient.submitAction(gameId, action)
    },
  }
}

function App({ gameClient, gameId, liveEventSource, runtimeConfig, showConnectionGate = false }: AppProps) {
  const [connectedSession, setConnectedSession] = useState<SessionBinding | null>(null)

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
      return {
        gameId,
        requestTransport: providedRequestTransport,
        liveEventSource: liveEventSource ?? idleLiveEventSource,
      }
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
  const activeTurnOwner = getPhaseOwner(sessionPhase)
  const sessionTurnActive = sessionState.snapshot !== null && sessionRole !== null && activeTurnOwner === sessionRole

  const interactionState = useBattlefieldInteractionState({
    activeSessionController,
    activeTurnActive: sessionTurnActive,
    clientSnapshot: sessionState.snapshot,
    clientSnapshotPhase: sessionPhase,
    isControlledSession: activeSessionBinding !== null,
  })

  const displayState = useBattlefieldDisplayState({
    activeSessionBinding,
    combatBaseSnapshot: interactionState.combatBaseSnapshot,
    lastRefreshAt: interactionState.lastRefreshAt,
    selectedCombatTargetId: interactionState.selectedCombatTargetId,
    selectedUnitIds: interactionState.selectedUnitIds,
    sessionState,
  })

  const {
    actionError,
    commitClientAction,
    handleDeselectUnit,
    handleDismissCombatResolution,
    handleDismissRamResolution,
    handleMoveUnit,
    handleRefresh,
    handleSelectUnit,
    isRefreshing,
    pendingCombatResolution,
    pendingRamResolution,
    selectedCombatTargetId,
    setActionError,
    setSelectedCombatTargetId,
    setSelectedUnitIds,
  } = interactionState

  const {
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
    shellPhase,
  } = displayState

  const isControlledSession = activeSessionBinding !== null

  const {
    debugEntries,
    debugOpen,
    debugPopupLayout,
    setDebugOpen,
    setDebugPopupLayout,
  } = useDebugDiagnostics()

  function handleConfirmCombat() {
    if (selectedCombatTarget === null || selectedCombatAttackCount === 0 || displayedOnion === null) {
      return
    }

    const targetId = buildCombatTargetActionId(selectedCombatTarget.id, displayedOnion.id)
    void commitClientAction({ type: 'FIRE', attackers: selectedCombatAttackerIds, targetId })
  }

  if (!isControlledSession && runtimeConnectionSeeded) {
    return <ConnectGate runtimeConfig={runtimeConfig} onConnectedSession={setConnectedSession} />
  }

  return (
    <div className="shell" data-phase={shellPhase}>
      {actionError ? <ErrorOverlay message={actionError} placement="app" onDismiss={() => setActionError(null)} /> : null}
      {pendingCombatResolution && selectedCombatTarget !== null ? (
        <CombatResolutionToast
          title={`Combat resolved on ${selectedCombatTarget.label}`}
          resolution={pendingCombatResolution}
          modifiers={selectedCombatTarget.modifiers}
          onDismiss={handleDismissCombatResolution}
        />
      ) : null}
      {pendingRamResolution ? (
        <MoveResolutionToast
          title={formatRamResolutionTitle(pendingRamResolution)}
          resolution={pendingRamResolution}
          onDismiss={handleDismissRamResolution}
        />
      ) : null}
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
              onClick={() => {
                void commitClientAction({ type: 'end-phase' })
              }}
            >
              {phaseAdvanceLabel}
            </button>
          ) : null}
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
            void commitClientAction({ type: 'end-phase' })
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
          onionWeapons={onionWeapons}
          readyWeaponDetails={readyWeaponDetails}
          selectedCombatAttackLabel={selectedCombatAttackLabel}
          onSelectDefenderCombatTarget={() => {
            setSelectedUnitIds([])
            setSelectedCombatTargetId('onion')
          }}
          onSelectUnit={handleSelectUnit}
        />

        {displayedScenarioMap && displayedOnion ? (
          <BattlefieldStage
            activePhase={activePhase}
            activeTurnActive={activeTurnActive}
            defenders={displayedDefenders}
            onion={displayedOnion}
            scenarioMap={displayedScenarioMap}
            selectedCombatTargetId={selectedCombatTargetId}
            selectedUnitIds={activeSelectedUnitIds}
            combatRangeHexKeys={combatRangeHexKeys}
            combatTargetIds={combatTargetIds}
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
          selectedCombatAttackCount={selectedCombatAttackCount}
          selectedCombatAttackStrength={selectedCombatAttackStrength}
          selectedCombatTarget={selectedCombatTarget}
          selectedCombatTargetId={selectedCombatTargetId}
          selectedInspectorDefender={selectedInspectorDefender}
          selectedInspectorOnion={selectedInspectorOnion}
          combatTargetOptions={combatTargetOptions}
          onConfirmCombat={handleConfirmCombat}
          onSelectCombatTarget={setSelectedCombatTargetId}
        />
      </main>
    </div>
  )
}

export default App
