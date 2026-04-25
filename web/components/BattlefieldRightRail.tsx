import { CombatConfirmationView } from './CombatConfirmationView'
import { CombatTargetList } from './CombatTargetList'
import { InactiveEventStream } from './InactiveEventStream'
import { parseAttackStats, parseWeaponStats, resolveBattlefieldUnitName } from '../lib/appViewHelpers'
import type { BattlefieldOnionView, BattlefieldUnit } from '../lib/battlefieldView'
import type { TimelineEvent } from '../lib/battlefieldView'
import type { CombatTargetOption } from '../lib/combatPreview'
import type { VictoryEscapeHex, VictoryObjectiveState } from '../../shared/apiProtocol'

type RamPrompt = {
  unitId: string
  to: { q: number; r: number }
  targetLabel: string
}

type BattlefieldRightRailProps = {
  activeCombatRole: 'onion' | 'defender' | null
  activeRole: 'onion' | 'defender' | null
  activeSelectedUnitIds: string[]
  activeSelectedUnitCount: number
  isCombatPhase: boolean
  showInactiveEventStream: boolean
  isInteractionLocked: boolean
  canDismissInactiveEventStream: boolean
  pendingRamPrompt: RamPrompt | null
  selectedCombatAttackCount: number
  selectedCombatAttackStrength: number
  selectedCombatTarget: CombatTargetOption | null
  selectedCombatTargetId: string | null
  selectedInspectorDefender: BattlefieldUnit | null
  selectedInspectorOnion: BattlefieldOnionView | null
  rightRailStackPanel: {
    isVisible: boolean
    selectedStackMembers: ReadonlyArray<BattlefieldUnit | BattlefieldOnionView>
    selectedStackSelectionCount: number
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
  onSelectUnit: (unitId: string, additive?: boolean) => void
  onDeselect: () => void
}

export function BattlefieldRightRail({
  activeCombatRole,
  activeRole,
  activeSelectedUnitIds,
  activeSelectedUnitCount,
  isCombatPhase,
  showInactiveEventStream,
  isInteractionLocked,
  canDismissInactiveEventStream,
  pendingRamPrompt,
  selectedCombatAttackCount,
  selectedCombatAttackStrength,
  selectedCombatTarget,
  selectedCombatTargetId,
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
  onSelectUnit,
  onDeselect,
}: BattlefieldRightRailProps) {
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
          const isSelected = activeSelectedUnitIds.includes(unit.id)
          return (
            <button
              key={unit.id}
              type="button"
              className={`attacker-card-button slim-weapon-card${isSelected ? ' is-selected' : ''}`}
              aria-pressed={isSelected}
              disabled={isInteractionLocked}
              data-selected={isSelected}
              data-testid={`stack-member-${unit.id}`}
              onClick={() => onSelectUnit(unit.id, true)}
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
          onClick={() => onSelectUnit(rightRailStackPanel.selectedStackMembers[0].id, false)}
        >
          Select all
        </button>
        <button
          type="button"
          className="combat-confirm-button combat-confirm-button-secondary"
          disabled={isInteractionLocked}
          onClick={onDeselect}
        >
          Clear
        </button>
      </div>
    </section>
  ) : null

  const shouldShowCombatPanel =
    isCombatPhase &&
    activeRole === activeCombatRole &&
    selectedInspectorDefender === null

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
              <button className="combat-confirm-button" type="button" disabled={isInteractionLocked} onClick={onAttemptRam}>
                Attempt ram
              </button>
              <button className="combat-confirm-button combat-confirm-button-secondary" type="button" disabled={isInteractionLocked} onClick={onDeclineRam}>
                Move without ram
              </button>
            </div>
          </div>
        </section>
      ) : null}
      {selectedInspectorOnion !== null ? (
        <section className="selection-panel panel-subtle">
          {stackSelectionPanel}
          <div className="selection-panel-header">
            <div>
              <p className="eyebrow">Inspector</p>
              <h2>{resolveBattlefieldUnitName(selectedInspectorOnion.type, selectedInspectorOnion.id, selectedInspectorOnion.friendlyName)}</h2>
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
      ) : shouldShowCombatPanel ? (
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
          {stackSelectionPanel}
          {selectedCombatTarget !== null ? (
            <CombatConfirmationView
              title={`Confirm attack on ${selectedCombatTarget.label}`}
              attackStrength={selectedCombatAttackStrength}
              defenseStrength={selectedCombatTarget.defense}
              modifiers={selectedCombatTarget.modifiers}
              confirmLabel="Resolve combat"
              onConfirm={onConfirmCombat}
              isDisabled={isInteractionLocked}
              dataTestId="combat-confirmation-view"
            />
          ) : null}
          {combatTargetOptions.length > 0 ? (
            <CombatTargetList
              targets={combatTargetOptions}
              selectedTargetId={selectedCombatTargetId}
              selectedCombatAttackCount={selectedCombatAttackCount}
              isDisabled={isInteractionLocked}
              onSelectTarget={onSelectCombatTarget}
            />
          ) : (
            <p className="summary-line">No valid targets are currently in range.</p>
          )}
        </section>
      ) : selectedInspectorDefender !== null ? (
        <section className="selection-panel panel-subtle">
          {stackSelectionPanel}
          <div className="selection-panel-header">
            <div>
              <p className="eyebrow">Inspector</p>
              <h2>{resolveBattlefieldUnitName(selectedInspectorDefender.type, selectedInspectorDefender.id, selectedInspectorDefender.friendlyName)}</h2>
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
              <dd>{activeSelectedUnitCount}</dd>
            </div>
          </dl>
          {selectedInspectorDefender.type === 'Swamp' && victoryObjectives.length > 0 ? (
            <div className="section-block">
              <div className="card-head">
                <div>
                  <p className="eyebrow">Victory</p>
                  <h3>Victory Conditions</h3>
                </div>
                <span className="mini-tag">{victoryObjectives.filter((objective) => objective.completed).length}/{victoryObjectives.length} objectives</span>
              </div>
              <div className="inspector-objective-list">
                {victoryObjectives.map((objective) => (
                  <div className={`inspector-objective-item${objective.completed ? ' is-complete' : ''}`} key={objective.id}>
                    <div className="summary-line">
                      <strong>{objective.label}</strong>
                    </div>
                    <div className="summary-line">
                      {objective.required ? 'Required' : 'Optional'} {objective.completed ? 'complete' : 'incomplete'}
                    </div>
                  </div>
                ))}
              </div>
              <div className="inspector-victory-summary">
                <div className="summary-line"><strong>Onion (Attacker) Victory:</strong></div>
                <ul className="victory-list">
                  <li>All defending units destroyed: <em>Complete Onion victory</em></li>
                  <li>Swamp destroyed and Onion escapes: <em>Onion victory</em></li>
                  <li>Swamp and Onion both destroyed: <em>Marginal Onion victory</em></li>
                </ul>
                <div className="summary-line"><strong>Defender Victory:</strong></div>
                <ul className="victory-list">
                  <li>Swamp survives, Onion destroyed, 30+ attack strength survive: <em>Complete defense victory</em></li>
                  <li>Swamp survives, Onion destroyed: <em>Defense victory</em></li>
                  <li>Swamp survives, Onion escapes: <em>Marginal defense victory</em></li>
                </ul>
              </div>
              {escapeHexes.length > 0 ? (
                <div className="inspector-escape-footer">
                  <span className="inspector-escape-footer-label">Escape hexes</span>
                  <span className="inspector-escape-footer-list">
                    {escapeHexes.map((hex) => `${hex.q}, ${hex.r}`).join(' · ')}
                  </span>
                  <span className="mini-tag">{escapeHexes.length}</span>
                </div>
              ) : null}
            </div>
          ) : null}
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
