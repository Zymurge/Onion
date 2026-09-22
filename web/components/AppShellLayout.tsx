import type { ComponentProps, ReactNode } from 'react'

import { AppBattlefieldStage } from './AppBattlefieldStage'
import { AppShellHeader } from './AppShellHeader'
import { BattlefieldLeftRail } from './BattlefieldLeftRail'
import { BattlefieldRightRail } from './BattlefieldRightRail'
import { DraggableDebugPopup } from './DraggableDebugPopup'
import { ScenarioInfoDialog } from './ScenarioInfoDialog'
import type { AppCommands } from '../lib/appCommands'
import type { AppSessionWiring } from '../lib/appSessionWiring'
import type { TurnHandoffGate } from '../lib/appTurnHandoffGate'
import type { useBattlefieldDisplayState } from '../lib/useBattlefieldDisplayState'
import type { useBattlefieldInteractionState } from '../lib/useBattlefieldInteractionState'
import type { useDebugDiagnostics } from '../lib/useDebugDiagnostics'
import type { useInactiveEventStream } from '../lib/useInactiveEventStream'
import { useScenarioInfo } from '../lib/useScenarioInfo'

export type AppShellLayoutProps = {
  commands: AppCommands
  debug: ReturnType<typeof useDebugDiagnostics>
  display: ReturnType<typeof useBattlefieldDisplayState>
  gate: TurnHandoffGate
  inactiveEventStream: ReturnType<typeof useInactiveEventStream>
  interaction: ReturnType<typeof useBattlefieldInteractionState>
  session: AppSessionWiring
  overlays: ReactNode
}

export function AppShellLayout({ commands, debug, display, gate, inactiveEventStream, interaction, session, overlays }: AppShellLayoutProps) {
  const scenarioInfo = useScenarioInfo({
    snapshot: display.clientSnapshot,
    authSession: session.authSession,
    catalog: session.state.catalog,
  })

  const appState: ComponentProps<typeof AppShellHeader>['appState'] = session.state.status === 'loading'
    ? 'loading'
    : display.headerHasSnapshot
      ? 'loaded'
      : 'empty'
  const stackNaming = display.clientSnapshot?.authoritativeState?.stackNaming
  const stackRoster = display.clientSnapshot?.authoritativeState?.stackRoster
  const catalog = session.state.catalog ?? undefined
  const terminalWinner = display.clientSnapshot?.winner ?? null
  const isGameOver = display.clientSnapshot?.status === 'completed' || terminalWinner === 'onion' || terminalWinner === 'defender'
  return (
    <div
      className={`shell${gate.screenLocked ? ' inactive-event-screen-locked' : ''}`}
      data-phase={display.shellPhase}
      data-state={appState}
      data-testid="app-shell"
    >
      <span data-testid={`app-${appState}-state`} hidden aria-hidden="true" />
      {display.headerHasSnapshot ? <span data-testid="app-ready" hidden aria-hidden="true" /> : null}
      <span
        data-testid="session-sync-probe"
        data-observed-event-seq={session.state.lastAppliedEventSeq ?? undefined}
        data-snapshot-event-seq={session.state.snapshot?.lastEventSeq ?? undefined}
        data-session-status={session.state.status}
        hidden
        aria-hidden="true"
      />
      {overlays}
      <AppShellHeader
        appState={appState}
        headerHasSnapshot={display.headerHasSnapshot}
        activeTurnActive={display.activeTurnActive}
        activeRole={display.activeRole}
        activeTurnNumber={display.activeTurnNumber}
        activePhaseLabel={display.activePhaseLabel}
        phaseAdvanceLabel={display.phaseAdvanceLabel}
        inactiveEventControlsLocked={gate.controlsLocked}
        inactiveEventWindowVisible={gate.inactiveEventWindowVisible}
        sessionTurnActive={session.turn.isActive}
        activeScenarioName={display.activeScenarioName}
        activeGameId={display.activeGameId}
        isRefreshing={interaction.isRefreshing}
        debugOpen={debug.debugOpen}
        connectionLabel={display.connectionLabel}
        connectionStatus={display.connectionStatus}
        lastUpdatedAt={display.lastUpdatedAt}
        runShellControl={commands.runShellControl}
        onAdvancePhase={commands.advancePhase}
        onAcknowledgeTurn={commands.acknowledgeTurn}
        onRefresh={() => { void commands.refresh() }}
        onToggleDebugDiagnostics={commands.toggleDebugDiagnostics}
        onOpenScenarioInfo={scenarioInfo.open}
      />

      {scenarioInfo.isOpen ? (
        <ScenarioInfoDialog
          data={scenarioInfo.data}
          loading={scenarioInfo.loading}
          error={scenarioInfo.activeError}
          onClose={scenarioInfo.close}
        />
      ) : null}

      {debug.debugOpen ? (
        <DraggableDebugPopup
          layout={debug.debugPopupLayout}
          onLayoutChange={debug.setDebugPopupLayout}
          onClose={() => debug.setDebugOpen(false)}
          lines={debug.debugEntries}
          onAdvancePhase={commands.advancePhase}
        />
      ) : null}

      <main className="battlefield-grid" onClick={interaction.handleDeselectUnit}>
        <BattlefieldLeftRail
          activeCombatRole={display.activeCombatRole}
          activeRole={display.activeRole}
          activeTurnActive={display.activeTurnActive}
          activeMode={display.activeMode}
          activeSelectedUnitIds={display.activeSelectedUnitIds}
          displayedDefenders={display.displayedDefenders}
          displayedOnion={display.displayedOnion}
          displayedOnions={display.displayedOnions}
          isCombatPhase={display.isCombatPhase}
          isMovementPhase={display.isMovementPhase}
          isSelectionLocked={gate.screenLocked || isGameOver}
          stacksExpandable={display.stacksExpandable}
          onionWeapons={display.onionWeapons}
          readyWeaponDetails={display.readyWeaponDetails}
          selectedCombatAttackLabel={display.selectedCombatAttackLabel}
          stackNaming={stackNaming}
          stackRoster={stackRoster}
          catalog={catalog}
          onSelectUnit={interaction.handleSelectUnit}
        />

        <AppBattlefieldStage
          activePhase={display.activePhase}
          activeTurnActive={display.activeTurnActive}
          defenders={display.displayedDefenders}
          lifecycleStatus={session.state.snapshot?.status}
          onions={display.displayedOnions}
          stackNaming={stackNaming}
          stackRoster={stackRoster}
          catalog={catalog}
          scenarioMap={display.displayedScenarioMap}
          selectedCombatTargetId={display.selectedCombatTargetIdForRender}
          selectedUnitIds={display.activeSelectedUnitIds}
          combatRangeHexKeys={display.combatRangeHexKeys}
          combatTargetIds={display.combatTargetIds}
          escapeHexes={display.escapeHexes}
          isSelectionLocked={gate.screenLocked || isGameOver}
          isInteractionLocked={gate.controlsLocked || isGameOver}
          canSubmitMove={!isGameOver && (display.activePhase === 'ONION_MOVE' || display.activePhase === 'DEFENDER_MOVE' || display.activePhase === 'GEV_SECOND_MOVE')}
          viewerRole={display.activeRole}
          onSelectUnit={interaction.handleSelectUnit}
          onSelectCombatTarget={interaction.setSelectedCombatTargetId}
          onDeselect={interaction.handleDeselectUnit}
          onMoveUnit={interaction.handleMoveUnit}
        />

        <BattlefieldRightRail
          activeCombatRole={display.activeCombatRole}
          activeRole={display.activeRole}
          activeSelectedUnitCount={display.activeSelectedUnitIds.length}
          isCombatPhase={display.isCombatPhase}
          gameOverSummary={terminalWinner === null ? null : { winner: terminalWinner, objectives: display.victoryObjectives }}
          showInactiveEventStream={gate.inactiveEventWindowVisible}
          isInteractionLocked={gate.controlsLocked}
          canDismissInactiveEventStream={session.turn.isActive}
          pendingRamPrompt={interaction.pendingRamPrompt}
          selectedCombatAttackStrength={display.selectedCombatAttackStrength}
          selectedCombatAttackRange={display.selectedCombatAttackRange}
          selectedCombatAttackerIds={display.selectedCombatAttackerIds}
          selectedCombatAttackMemberLabels={display.selectedCombatAttackMemberLabels}
          selectedCombatTarget={display.selectedCombatTarget}
          selectedCombatTargetId={display.selectedCombatTargetIdForRender}
          selectedInspectorLabel={display.selectedInspectorLabel}
          selectedInspectorDefender={display.selectedInspectorDefender}
          selectedInspectorOnion={display.selectedInspectorOnion}
          readyWeaponDetails={display.readyWeaponDetails}
          rightRailStackPanel={display.rightRailStackPanel}
          catalog={catalog}
          inactiveEventStream={inactiveEventStream}
          combatTargetOptions={display.combatTargetOptions}
          onConfirmCombat={commands.confirmCombat}
          onAttemptRam={commands.attemptRam}
          onDeclineRam={commands.declineRam}
          onSelectCombatTarget={interaction.setSelectedCombatTargetId}
          onToggleStackMember={(unitId) => interaction.handleSelectStackMember(unitId, display.rightRailStackPanel.selectedStackMemberIds)}
          onSelectAllStackMembers={() => interaction.handleSelectAllStackMembers(display.rightRailStackPanel.selectedStackMemberIds)}
          onClearStackSelection={interaction.handleClearStackSelection}
        />
      </main>
    </div>
  )
}
