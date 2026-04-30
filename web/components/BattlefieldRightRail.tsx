import { CombatConfirmationView } from './CombatConfirmationView'
import { CombatTargetList } from './CombatTargetList'
import { BattlefieldInspectorPanel } from './BattlefieldInspectorPanel'
import { InactiveEventStream } from './InactiveEventStream'
import { resolveBattlefieldUnitName } from '../lib/appViewHelpers'
import { buildRightRailCombatPanelViewModel } from '../lib/rightRailCombatPanel'
import type { BattlefieldOnionView, BattlefieldUnit } from '../lib/battlefieldView'
import type { TimelineEvent } from '../lib/battlefieldView'
import type { CombatTargetOption } from '../lib/combatPreview'
import type { VictoryEscapeHex, VictoryObjectiveState } from '../../shared/apiProtocol'
import { routeInteraction, type InteractionRoutingRequest } from '../lib/interactionRouting'
import { routeRightRailControl, type RightRailControlRequest } from '../lib/rightRailControlRouting'
import logger from '../lib/logger'

type RamPrompt = {
  unitId: string
  to: { q: number; r: number }
  targetLabel: string
}

type BattlefieldRightRailProps = {
  activeCombatRole: 'onion' | 'defender' | null
  activeRole: 'onion' | 'defender' | null
  activeSelectedUnitCount: number
  isCombatPhase: boolean
  showInactiveEventStream: boolean
  isInteractionLocked: boolean
  canDismissInactiveEventStream: boolean
  pendingRamPrompt: RamPrompt | null
  selectedCombatAttackStrength: number
  selectedCombatTarget: CombatTargetOption | null
  selectedCombatTargetId: string | null
  selectedInspectorLabel: string | null
  selectedInspectorDefender: BattlefieldUnit | null
  selectedInspectorOnion: BattlefieldOnionView | null
  rightRailStackPanel: {
    isVisible: boolean
    selectedStackMembers: ReadonlyArray<BattlefieldUnit | BattlefieldOnionView>
    selectedStackSelectionCount: number
    selectedStackSelectionIds: ReadonlyArray<string>
  }
  victoryObjectives: ReadonlyArray<VictoryObjectiveState>
  escapeHexes: ReadonlyArray<VictoryEscapeHex>
  inactiveEventStream: {
    entries: ReadonlyArray<TimelineEvent>
    errorMessage: string | null
    clearEntries: () => void
    isLoading: boolean
    isDismissed: boolean
    clearErrorMessage: () => void
  }
  combatTargetOptions: ReadonlyArray<CombatTargetOption>
  onConfirmCombat: () => void
  onAttemptRam: () => void
  onDeclineRam: () => void
  onSelectCombatTarget: (targetId: string) => void
  onToggleStackMember: (unitId: string) => void
  onSelectAllStackMembers: () => void
  onClearStackSelection: () => void
}

export function BattlefieldRightRail({
  activeCombatRole,
  activeRole,
  activeSelectedUnitCount,
  isCombatPhase,
  showInactiveEventStream,
  isInteractionLocked,
  canDismissInactiveEventStream,
  pendingRamPrompt,
  selectedCombatAttackStrength,
  selectedCombatTarget,
  selectedCombatTargetId,
  selectedInspectorLabel,
  selectedInspectorDefender,
  selectedInspectorOnion,
  rightRailStackPanel,
  victoryObjectives,
  escapeHexes,
  inactiveEventStream,
  combatTargetOptions,
  onConfirmCombat,
  onAttemptRam,
  onDeclineRam,
  onSelectCombatTarget,
  onToggleStackMember,
  onSelectAllStackMembers,
  onClearStackSelection,
}: BattlefieldRightRailProps) {
  const shouldShowCombatPanel = isCombatPhase && activeRole === activeCombatRole

  function routeRightRailInteraction(request: InteractionRoutingRequest) {
    const decision = routeInteraction(request, (trace) => {
      logger.debug('[interaction-debug] right rail routed', {
        ts: Date.now(),
        ...trace,
      })
    })

    return decision
  }

  function routeRightRailControlAction(request: RightRailControlRequest) {
    const decision = routeRightRailControl(request, (trace) => {
      logger.debug('[interaction-debug] right rail control routed', {
        ts: Date.now(),
        ...trace,
      })
    })

    return decision
  }

  const stackSelectionPanel = rightRailStackPanel.isVisible ? (
    <section className="selection-panel panel-subtle">
      <div className="selection-panel-header">
        <div>
          <p className="eyebrow">Stack</p>
          <h2>Choose units</h2>
        </div>
        <span className="mini-tag">{rightRailStackPanel.selectedStackSelectionCount}/{rightRailStackPanel.selectedStackMembers.length}</span>
      </div>
      <div className="attacker-selection-list stack-selection-list">
        {rightRailStackPanel.selectedStackMembers.map((unit) => {
          const isSelected = rightRailStackPanel.selectedStackSelectionIds.includes(unit.id)
          const isCombatReady = activeCombatRole !== 'defender' || !('actionableModes' in unit) || unit.actionableModes.includes('fire')
          const isDisabled = isInteractionLocked || (activeCombatRole === 'defender' && !isCombatReady)
          return (
            <button
              key={unit.id}
              type="button"
              className={`attacker-card-button slim-weapon-card${isSelected ? ' is-selected' : ''}${isDisabled ? ' is-disabled' : ''}`}
              aria-pressed={isSelected}
              disabled={isDisabled}
              data-selected={isSelected}
              data-testid={`stack-member-${unit.id}`}
              onClick={() => {
                const decision = routeRightRailInteraction({
                  viewerRole: activeCombatRole ?? activeRole ?? 'defender',
                  viewerActivity: shouldShowCombatPanel ? 'active' : 'inactive',
                  phaseMode: isCombatPhase ? 'combat' : 'locked',
                  surface: 'right-rail',
                  gesture: 'primary',
                  subjectRelation: 'self',
                  subjectKind: 'stack',
                  subjectCapability: {
                    inspectable: true,
                    moveEligible: false,
                    attackerEligible: true,
                    targetEligible: false,
                  },
                  interactionMode: {
                    expandedStackEditor: true,
                  },
                })

                if (decision.intent === 'toggle-actor') {
                  onToggleStackMember(unit.id)
                }
              }}
            >
              <div className="weapon-card-name">{resolveBattlefieldUnitName(unit.type, unit.id, unit.friendlyName)}</div>
              <div className="weapon-card-stats">Toggle in stack</div>
            </button>
          )
        })}
      </div>
      <div className="combat-confirmation-actions">
        <button
          type="button"
          className="combat-confirm-button"
          disabled={isInteractionLocked}
          onClick={() => {
            const decision = routeRightRailControlAction({
              surface: 'right-rail',
              control: 'select-all-stack-members',
              enabled: !isInteractionLocked,
            })

            if (decision.intent === 'select-all-stack-members') {
              onSelectAllStackMembers()
            }
          }}
        >
          Select all
        </button>
        <button
          type="button"
          className="combat-confirm-button combat-confirm-button-secondary"
          disabled={isInteractionLocked}
          onClick={() => {
            const decision = routeRightRailControlAction({
              surface: 'right-rail',
              control: 'clear-stack-selection',
              enabled: !isInteractionLocked,
            })

            if (decision.intent === 'clear-stack-selection') {
              onClearStackSelection()
            }
          }}
        >
          Clear
        </button>
      </div>
    </section>
  ) : null

  const combatPanel = buildRightRailCombatPanelViewModel({
    activeCombatRole,
    activeRole,
    isCombatPhase,
    selectedInspectorDefender,
    selectedCombatTarget,
    combatTargetOptions,
    rightRailStackPanel,
  })

  return (
    <aside className="panel rail rail-right">
      {showInactiveEventStream ? (
        <InactiveEventStream
          entries={inactiveEventStream.entries}
          errorMessage={inactiveEventStream.errorMessage}
          isLoading={inactiveEventStream.isLoading}
          canDismiss={canDismissInactiveEventStream}
          onDismissError={inactiveEventStream.clearErrorMessage}
        />
      ) : null}
      {pendingRamPrompt !== null ? (
        <section className="section-block panel-subtle">
          <div className="card-head">
            <div>
              <p className="eyebrow">Movement</p>
              <h2>Attempt ram on {pendingRamPrompt.targetLabel}</h2>
            </div>
            <span className="mini-tag mini-tag-live">confirmation</span>
          </div>
          <div className="combat-confirmation-view ram-confirmation-view" data-testid="ram-confirmation-view">
            <div className="combat-confirmation-stats">
              <div className="combat-confirmation-stat">
                <span className="stat-label-small">Target</span>
                <strong>{pendingRamPrompt.targetLabel}</strong>
              </div>
              <div className="combat-confirmation-stat">
                <span className="stat-label-small">Action</span>
                <strong>Ram or bypass</strong>
              </div>
              <div className="combat-confirmation-stat">
                <span className="stat-label-small">Destination</span>
                <strong>{pendingRamPrompt.to.q}, {pendingRamPrompt.to.r}</strong>
              </div>
            </div>
            <p className="summary-line">Choose whether to ram the occupied hex or continue the move without ramming.</p>
            <div className="combat-confirmation-actions">
              <button className="combat-confirm-button" type="button" disabled={isInteractionLocked} onClick={() => {
                const decision = routeRightRailControlAction({
                  surface: 'right-rail',
                  control: 'attempt-ram',
                  enabled: !isInteractionLocked,
                })

                if (decision.intent === 'attempt-ram') {
                  onAttemptRam()
                }
              }}>
                Attempt ram
              </button>
              <button className="combat-confirm-button combat-confirm-button-secondary" type="button" disabled={isInteractionLocked} onClick={() => {
                const decision = routeRightRailControlAction({
                  surface: 'right-rail',
                  control: 'decline-ram',
                  enabled: !isInteractionLocked,
                })

                if (decision.intent === 'decline-ram') {
                  onDeclineRam()
                }
              }}>
                Move without ram
              </button>
            </div>
          </div>
        </section>
      ) : null}
      {selectedInspectorOnion !== null ? (
        <BattlefieldInspectorPanel
          selectedInspectorLabel={selectedInspectorLabel}
          selectedInspectorDefender={null}
          selectedInspectorOnion={selectedInspectorOnion}
          selectedStackMemberCount={0}
          activeSelectedUnitCount={activeSelectedUnitCount}
          victoryObjectives={victoryObjectives}
          escapeHexes={escapeHexes}
        />
      ) : null}
      {selectedInspectorDefender !== null ? (
        <BattlefieldInspectorPanel
          selectedInspectorLabel={selectedInspectorLabel}
          selectedInspectorDefender={selectedInspectorDefender}
          selectedInspectorOnion={null}
          selectedStackMemberCount={rightRailStackPanel.selectedStackMembers.length}
          activeSelectedUnitCount={activeSelectedUnitCount}
          victoryObjectives={victoryObjectives}
          escapeHexes={escapeHexes}
        />
      ) : null}
      {shouldShowCombatPanel && selectedInspectorOnion === null ? (
        <section className="section-block panel-subtle">
          <div className="card-head">
            <div>
              <p className="eyebrow">Combat</p>
              <h2 title="Pick a target from the list. The list only includes targets currently in the active attack range.">
                Valid Targets
              </h2>
            </div>
            <span className="mini-tag">{combatPanel.combatTargetCountLabel}</span>
          </div>
          {stackSelectionPanel}
          {combatPanel.hasSelectedTarget && selectedCombatTarget !== null ? (
            <CombatConfirmationView
              title={combatPanel.selectedCombatTargetTitle ?? `Confirm attack on ${selectedCombatTarget.label}`}
              attackStrength={selectedCombatAttackStrength}
              defenseStrength={selectedCombatTarget.defense}
              modifiers={selectedCombatTarget.modifiers}
              confirmLabel="Resolve combat"
              onConfirm={() => {
                const decision = routeRightRailControlAction({
                  surface: 'right-rail',
                  control: 'confirm-combat',
                  enabled: !isInteractionLocked,
                })

                if (decision.intent === 'confirm-combat') {
                  onConfirmCombat()
                }
              }}
              isDisabled={isInteractionLocked}
              dataTestId="combat-confirmation-view"
            />
          ) : null}
          {combatPanel.hasCombatTargets ? (
            <CombatTargetList
              targets={combatTargetOptions}
              selectedTargetId={selectedCombatTargetId}
              isDisabled={isInteractionLocked}
              onSelectTarget={(targetId) => {
                const target = combatTargetOptions.find((option) => option.id === targetId) ?? null

                const decision = routeRightRailInteraction({
                  viewerRole: activeCombatRole ?? activeRole ?? 'defender',
                  viewerActivity: shouldShowCombatPanel ? 'active' : 'inactive',
                  phaseMode: 'combat',
                  surface: 'right-rail',
                  gesture: 'primary',
                  subjectRelation: target?.kind === activeCombatRole ? 'self' : 'opponent',
                  subjectKind: targetId.includes(':') ? 'subsystem' : 'unit',
                  subjectCapability: {
                    inspectable: true,
                    moveEligible: false,
                    attackerEligible: false,
                    targetEligible: true,
                  },
                })

                if (decision.intent === 'select-target') {
                  onSelectCombatTarget(targetId)
                }
              }}
            />
          ) : (
            <p className="summary-line">No valid targets are currently in range.</p>
          )}
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
      )}
    </aside>
  )
}
