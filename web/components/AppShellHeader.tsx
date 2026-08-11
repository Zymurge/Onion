type AppShellHeaderProps = {
  appState: 'loading' | 'loaded' | 'empty'
  headerHasSnapshot: boolean
  activeTurnActive: boolean
  activeRole: 'onion' | 'defender' | null
  activeTurnNumber: number | null
  activePhaseLabel: string
  phaseAdvanceLabel: string | null
  inactiveEventControlsLocked: boolean
  inactiveEventWindowVisible: boolean
  sessionTurnActive: boolean
  activeScenarioName: string | null
  activeGameId: number | null
  isRefreshing: boolean
  debugOpen: boolean
  connectionLabel: string
  connectionStatus: string
  lastUpdatedAt: Date | null
  runShellControl: (
    control: 'refresh-session' | 'advance-phase' | 'acknowledge-turn' | 'toggle-debug-diagnostics',
    enabled: boolean,
    execute: () => void,
  ) => void
  onAdvancePhase: () => void
  onAcknowledgeTurn: () => void
  onRefresh: () => void
  onToggleDebugDiagnostics: () => void
}

export function AppShellHeader({
  appState,
  headerHasSnapshot,
  activeTurnActive,
  activeRole,
  activeTurnNumber,
  activePhaseLabel,
  phaseAdvanceLabel,
  inactiveEventControlsLocked,
  inactiveEventWindowVisible,
  sessionTurnActive,
  activeScenarioName,
  activeGameId,
  isRefreshing,
  debugOpen,
  connectionLabel,
  connectionStatus,
  lastUpdatedAt,
  runShellControl,
  onAdvancePhase,
  onAcknowledgeTurn,
  onRefresh,
  onToggleDebugDiagnostics,
}: AppShellHeaderProps) {
  return (
    <header className="topbar panel" data-testid="app-shell-header">
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
        <div
          className={`phase-chip phase-chip-state${activeTurnActive ? ' phase-chip-active' : ''}${headerHasSnapshot ? '' : ' phase-chip-waiting'}`}
          data-state={appState}
          data-testid="app-state-chip"
        >
          <span>{headerHasSnapshot ? activePhaseLabel : 'WAITING'}</span>
        </div>
        {phaseAdvanceLabel !== null ? (
          <button
            type="button"
            className="phase-advance-btn"
            disabled={inactiveEventControlsLocked}
            onClick={() => runShellControl('advance-phase', !inactiveEventControlsLocked, onAdvancePhase)}
          >
            {phaseAdvanceLabel}
          </button>
        ) : null}
        {inactiveEventWindowVisible && (
          <button
            type="button"
            className={`phase-advance-btn begin-turn-btn${sessionTurnActive ? ' begin-turn-btn-ready' : ' disabled'}`}
            onClick={() => runShellControl('acknowledge-turn', sessionTurnActive, onAcknowledgeTurn)}
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
            onClick={() => runShellControl('refresh-session', !isRefreshing, onRefresh)}
            aria-label="Refresh"
            disabled={isRefreshing}
          >
            Refresh
          </button>
          <button
            className={`debug-toggle-btn${debugOpen ? ' active' : ''}`}
            title="Toggle debug diagnostics"
            aria-label="Toggle debug diagnostics"
            onClick={() => runShellControl('toggle-debug-diagnostics', true, onToggleDebugDiagnostics)}
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
  )
}
