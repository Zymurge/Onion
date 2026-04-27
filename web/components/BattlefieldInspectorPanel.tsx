import { parseAttackStats, parseWeaponStats, resolveBattlefieldUnitName } from '../lib/appViewHelpers'
import type { VictoryEscapeHex, VictoryObjectiveState } from '../../shared/apiProtocol'
import type { BattlefieldOnionView, BattlefieldUnit } from '../lib/battlefieldView'
import { resolveInspectorStackCount } from '../lib/rightRailInspector'

type BattlefieldInspectorPanelProps = {
  selectedInspectorDefender: BattlefieldUnit | null
  selectedInspectorOnion: BattlefieldOnionView | null
  selectedStackMemberCount: number
  activeSelectedUnitCount: number
  victoryObjectives: ReadonlyArray<VictoryObjectiveState>
  escapeHexes: ReadonlyArray<VictoryEscapeHex>
}

export function BattlefieldInspectorPanel({
  selectedInspectorDefender,
  selectedInspectorOnion,
  selectedStackMemberCount,
  activeSelectedUnitCount,
  victoryObjectives,
  escapeHexes,
}: BattlefieldInspectorPanelProps) {
  if (selectedInspectorOnion !== null) {
    return (
      <section className="selection-panel panel-subtle">
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
    )
  }

  if (selectedInspectorDefender !== null) {
    const stackCount = resolveInspectorStackCount(selectedInspectorDefender, selectedStackMemberCount)

    return (
      <section className="selection-panel panel-subtle">
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
            <dd>{stackCount}</dd>
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
    )
  }

  return (
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