import { CombatConfirmationView } from './CombatConfirmationView'
import { CombatTargetList } from './CombatTargetList'
import { parseAttackStats, parseWeaponStats } from '../lib/appViewHelpers'
import type { BattlefieldOnionView, BattlefieldUnit } from '../lib/battlefieldView'
import type { CombatTargetOption } from '../lib/combatPreview'

type BattlefieldRightRailProps = {
  activeCombatRole: 'onion' | 'defender' | null
  activeRole: 'onion' | 'defender' | null
  activeSelectedUnitCount: number
  isCombatPhase: boolean
  selectedCombatAttackCount: number
  selectedCombatAttackStrength: number
  selectedCombatTarget: CombatTargetOption | null
  selectedCombatTargetId: string | null
  selectedInspectorDefender: BattlefieldUnit | null
  selectedInspectorOnion: BattlefieldOnionView | null
  combatTargetOptions: ReadonlyArray<CombatTargetOption>
  onConfirmCombat: () => void
  onSelectCombatTarget: (targetId: string) => void
}

export function BattlefieldRightRail({
  activeCombatRole,
  activeRole,
  activeSelectedUnitCount,
  isCombatPhase,
  selectedCombatAttackCount,
  selectedCombatAttackStrength,
  selectedCombatTarget,
  selectedCombatTargetId,
  selectedInspectorDefender,
  selectedInspectorOnion,
  combatTargetOptions,
  onConfirmCombat,
  onSelectCombatTarget,
}: BattlefieldRightRailProps) {
  return (
    <aside className="panel rail rail-right">
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
              onConfirm={onConfirmCombat}
              dataTestId="combat-confirmation-view"
            />
          ) : null}
          {combatTargetOptions.length > 0 ? (
            <CombatTargetList
              targets={combatTargetOptions}
              selectedTargetId={selectedCombatTargetId}
              selectedCombatAttackCount={selectedCombatAttackCount}
              onSelectTarget={onSelectCombatTarget}
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
              <dd>{activeSelectedUnitCount}</dd>
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
      )}
    </aside>
  )
}
