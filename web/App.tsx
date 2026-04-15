import { useState, useMemo } from 'react'
import { HexMapBoard } from './components/HexMapBoard'
import { CombatConfirmationView } from './components/CombatConfirmationView'
import { CombatResolutionToast } from './components/CombatResolutionToast'
import { MoveResolutionToast } from './components/MoveResolutionToast'
import { ErrorOverlay } from './components/ErrorOverlay'
import { DraggableDebugPopup } from './components/DraggableDebugPopup'
import { ConnectGate } from './components/ConnectGate'
import { CombatTargetList } from './components/CombatTargetList'
import {
  type GameAction,
  type GameClient,
} from './lib/gameClient'
import { statusTone } from './lib/battlefieldView'
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
  buildWeaponSelectionId,
  getPhaseOwner,
  parseAttackStats,
  parseWeaponStats,
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
        <aside className="panel rail rail-left">
          {isCombatPhase ? (
            <section className="section-block combat-scaffold">
              <div className="card-head">
                <div>
                  <p className="eyebrow">Combat</p>
                  <h2 title={activeCombatRole === 'onion'
                    ? 'Pick one or more eligible weapons from the rail. Ctrl+click adds or removes weapons from the attack group.'
                    : 'Pick one or more eligible units from the rail or board. Ctrl+click adds or removes units from the attack group.'
                  }>
                    Attacker Selection
                  </h2>
                </div>
                <span className="mini-tag mini-tag-live" data-testid="combat-attack-total">{selectedCombatAttackLabel}</span>
              </div>

              <div className="attacker-selection-list">
                {activeCombatRole === 'onion' ? (
                  readyWeaponDetails.length > 0 ? (
                    readyWeaponDetails.map((weapon) => {
                      const selectionId = buildWeaponSelectionId(weapon.id)
                      const isSelected = activeSelectedUnitIds.includes(selectionId)
                      return (
                        <button
                          key={weapon.id}
                          type="button"
                          className={`attacker-card-button slim-weapon-card${isSelected ? ' is-selected' : ''}`}
                          aria-pressed={isSelected}
                          data-selected={isSelected}
                          data-testid={`combat-weapon-${weapon.id}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            handleSelectUnit(selectionId, event.ctrlKey || event.metaKey)
                          }}
                        >
                          <div className="weapon-card-name">{weapon.name}</div>
                          <div className="weapon-card-stats">Attack: {weapon.attack} &nbsp;·&nbsp; Range: {weapon.range}</div>
                        </button>
                      )
                    })
                  ) : (
                    <p className="summary-line">No ready weapons available.</p>
                  )
                ) : displayedDefenders.length > 0 ? (
                  displayedDefenders.map((unit) => {
                    const isSelected = activeSelectedUnitIds.includes(unit.id)
                    const isActionable = unit.actionableModes.includes(activeMode)
                    const attackStats = parseAttackStats(unit.attack)
                    const isDestroyed = unit.status === 'destroyed'
                    const isDisabled = isDestroyed || !isActionable
                    return (
                      <button
                        key={unit.id}
                        type="button"
                        className={[
                          'attacker-card-button',
                          isSelected ? 'is-selected' : '',
                          isActionable ? 'is-actionable' : '',
                          isDisabled ? 'is-disabled' : '',
                          `tone-${statusTone(unit.status)}`,
                        ].join(' ')}
                        aria-pressed={isSelected}
                        data-selected={isSelected}
                        data-testid={`combat-unit-${unit.id}`}
                        disabled={false} // Always allow click for inspector
                        title={isDestroyed ? 'Destroyed units cannot attack.' : !isActionable ? 'This unit is not eligible to attack.' : undefined}
                        onClick={(event) => {
                          event.stopPropagation()
                          handleSelectUnit(unit.id, event.ctrlKey || event.metaKey)
                        }}
                      >
                        <div className="weapon-card-name">{unit.type}</div>
                        <div className="weapon-card-stats">Attack: {attackStats.damage} &nbsp;·&nbsp; Range: {attackStats.range}</div>
                      </button>
                    )
                  })
                ) : (
                  <p className="summary-line">Waiting for battlefield data.</p>
                )}
              </div>
            </section>
          ) : isMovementPhase ? (
            activeRole === 'onion' ? (
              <section className="section-block">
                <div className="card-head">
                  <p className="eyebrow">Onion</p>
                </div>
                {displayedOnion ? (
                  <button
                    type="button"
                    className={`onion-card-button ${activeSelectedUnitIds.includes(displayedOnion.id) ? 'is-selected' : ''}`}
                    aria-pressed={activeSelectedUnitIds.includes(displayedOnion.id)}
                    data-selected={activeSelectedUnitIds.includes(displayedOnion.id)}
                    data-testid={`combat-unit-${displayedOnion.id}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      handleSelectUnit(displayedOnion.id, event.ctrlKey || event.metaKey)
                    }}
                  >
                    <h3>{displayedOnion.id}</h3>
                    <div className="unit-summary">
                      <div className="summary-line">
                        <span>Treads <strong>{displayedOnion.treads}</strong></span>
                        <span>Moves <strong>{displayedOnion.movesRemaining}</strong></span>
                        <span>Rams remaining <strong>{displayedOnion.rams}</strong></span>
                      </div>
                      <div className="summary-line">
                        <span>Weapons <strong>{onionWeapons.operationalWeapons}</strong></span>
                        <span>Missiles <strong>{onionWeapons.operationalMissiles}</strong></span>
                      </div>
                    </div>
                  </button>
                ) : (
                  <p className="summary-line">Waiting for battlefield data.</p>
                )}
              </section>
            ) : activeRole === 'defender' ? (
              <section className="section-block">
                <div className="card-head">
                  <p className="eyebrow">Defenders</p>
                  <span className="mini-tag">{displayedDefenders.length} tracked</span>
                </div>
                {displayedDefenders.length > 0 ? (
                  <div className="defender-list">
                    {displayedDefenders.map((unit) => {
                      const isSelected = activeSelectedUnitIds.includes(unit.id)
                      const isActionable = unit.actionableModes.includes(activeMode)
                      const attackStats = parseAttackStats(unit.attack)
                      const isDestroyed = unit.status === 'destroyed'
                      return (
                        <button
                          key={unit.id}
                          type="button"
                          className={[
                            'defender-card-button',
                            'slim-weapon-card',
                            isSelected ? 'is-selected' : '',
                            isActionable ? 'is-actionable' : '',
                            `tone-${statusTone(unit.status)}`,
                          ].join(' ')}
                          aria-pressed={isSelected}
                          data-selected={isSelected}
                          data-testid={`combat-unit-${unit.id}`}
                          disabled={isDestroyed}
                          onClick={(event) => {
                            if (isDestroyed) {
                              event.stopPropagation()
                              return
                            }
                            event.stopPropagation()
                            if (isCombatPhase && activeCombatRole === 'defender') {
                              setSelectedUnitIds([])
                              setSelectedCombatTargetId('onion')
                            } else {
                              handleSelectUnit(unit.id, event.ctrlKey || event.metaKey)
                            }
                          }}
                        >
                          <div className="weapon-card-name">{unit.type}</div>
                          <div className="weapon-card-stats">Damage: {attackStats.damage} &nbsp;·&nbsp; Range: {attackStats.range} &nbsp;·&nbsp; Move: {unit.move}</div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="summary-line">Waiting for battlefield data.</p>
                )}
              </section>
            ) : null
          ) : null}
        </aside>

        <section className="panel map-stage">
          <div className="map-frame">
            {displayedScenarioMap && displayedOnion ? (
              <HexMapBoard
                scenarioMap={displayedScenarioMap}
                defenders={displayedDefenders}
                onion={displayedOnion}
                phase={activePhase}
                viewerRole={activeRole}
                selectedUnitIds={activeSelectedUnitIds}
                selectedCombatTargetId={selectedCombatTargetId}
                combatRangeHexKeys={combatRangeHexKeys}
                combatTargetIds={combatTargetIds}
                canSubmitMove={
                  activeTurnActive && (
                    activePhase === 'ONION_MOVE' ||
                    activePhase === 'DEFENDER_MOVE' ||
                    activePhase === 'GEV_SECOND_MOVE'
                  )
                }
                onSelectUnit={handleSelectUnit}
                onSelectCombatTarget={(targetId) => setSelectedCombatTargetId(targetId)}
                onDeselect={handleDeselectUnit}
                onMoveUnit={handleMoveUnit}
              />
            ) : (
              <div className="hex-map-shell panel-subtle">
                <p className="summary-line">Battlefield will appear once the game state loads.</p>
              </div>
            )}
          </div>
        </section>

        <aside className="panel rail rail-right">
          {/* Always show targeting list (combat UI) during defender combat phase; inspector only outside defender combat phase */}
          {selectedInspectorOnion !== null ? (
                <section className="selection-panel panel-subtle">
                  <div className="selection-panel-header">
                    <div>
                      <p className="eyebrow">Inspector</p>
                      <h2>{selectedInspectorOnion.type}</h2>
                    </div>
                    <span className="mini-tag">Selected</span>
                  </div>
                  <dl className="inspector-grid inspector-grid-right">
                    <div>
                      <dt>Stack</dt>
                      <dd>1</dd>
                    </div>
                    <div>
                      <dt>Treads</dt>
                      <dd>{selectedInspectorOnion.treads}</dd>
                    </div>
                    <div>
                      <dt>Moves</dt>
                      <dd>{selectedInspectorOnion.movesRemaining}</dd>
                    </div>
                    <div>
                      <dt>Rams remaining</dt>
                      <dd>{selectedInspectorOnion.rams}</dd>
                    </div>
                    <div>
                      <dt>Weapons</dt>
                      <dd>{parseWeaponStats(selectedInspectorOnion.weapons ?? '').operationalWeapons}</dd>
                    </div>
                    <div>
                      <dt>Missiles</dt>
                      <dd>{parseWeaponStats(selectedInspectorOnion.weapons ?? '').operationalMissiles}</dd>
                    </div>
                  </dl>
                </section>
              ) : isCombatPhase && activeRole === activeCombatRole && (activeRole === 'defender' || selectedInspectorDefender === null) ? (
                <section className="section-block panel-subtle">
                  <div className="card-head">
                    <div>
                      <p className="eyebrow">Combat</p>
                      <h2 title="Pick a target from the list. The list only includes targets currently in the active attack range.">
                        Valid Targets
                      </h2>
                    </div>
                    <span className="mini-tag">{combatTargetOptions.length} in range</span>
                  </div>
                  {selectedCombatTarget !== null ? (
                    <CombatConfirmationView
                      title={`Confirm attack on ${selectedCombatTarget.label}`}
                      attackStrength={selectedCombatAttackStrength}
                      defenseStrength={selectedCombatTarget.defense}
                      modifiers={selectedCombatTarget.modifiers}
                      confirmLabel="Resolve combat"
                      onConfirm={handleConfirmCombat}
                      dataTestId="combat-confirmation-view"
                    />
                  ) : null}
                  {combatTargetOptions.length > 0 ? (
                    <CombatTargetList
                      targets={combatTargetOptions}
                      selectedTargetId={selectedCombatTargetId}
                      selectedCombatAttackCount={selectedCombatAttackCount}
                      onSelectTarget={(targetId) => setSelectedCombatTargetId(targetId)}
                    />
                  ) : (
                    <p className="summary-line">No valid targets are currently in range.</p>
                  )}
                </section>
              ) : selectedInspectorDefender !== null ? (
                <section className="selection-panel panel-subtle">
                  <div className="selection-panel-header">
                    <div>
                      <p className="eyebrow">Inspector</p>
                      <h2>{selectedInspectorDefender.type}</h2>
                    </div>
                    <span className="mini-tag">Selected</span>
                  </div>
                  <dl className="inspector-grid inspector-grid-right">
                    <div>
                      <dt>Stack</dt>
                      <dd>{selectedInspectorDefender.type === 'LittlePigs' ? selectedInspectorDefender.squads ?? 1 : 1}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{selectedInspectorDefender.status}</dd>
                    </div>
                    <div>
                      <dt>Damage</dt>
                      <dd>{parseAttackStats(selectedInspectorDefender.attack).damage}</dd>
                    </div>
                    <div>
                      <dt>Range</dt>
                      <dd>{parseAttackStats(selectedInspectorDefender.attack).range}</dd>
                    </div>
                    <div>
                      <dt>Move</dt>
                      <dd>{selectedInspectorDefender.move}</dd>
                    </div>
                    <div>
                      <dt>Selected</dt>
                      <dd>{activeSelectedUnitIds.length}</dd>
                    </div>
                  </dl>
                </section>
              ) : isCombatPhase ? (
                <section className="selection-panel panel-subtle">
                  <div className="selection-panel-header">
                    <div>
                      <p className="eyebrow">Inspector</p>
                    </div>
                  </div>
                  <div className="empty-state">Select a unit on the map or in the rail to inspect it here.</div>
                </section>
              ) : (
                <section className="selection-panel panel-subtle">
                  <div className="selection-panel-header">
                    <div>
                      <p className="eyebrow">Inspector</p>
                    </div>
                  </div>
                  <div className="empty-state">Select a unit on the map or in the rail to inspect it here.</div>
                </section>
              )
          }
        </aside>
      </main>
    </div>
  )
}

export default App
