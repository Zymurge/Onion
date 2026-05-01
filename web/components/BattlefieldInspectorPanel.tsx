import type { ReactNode } from 'react'
import { parseAttackStats, parseWeaponStats, resolveBattlefieldUnitName } from '../lib/appViewHelpers'
import type { VictoryEscapeHex, VictoryObjectiveState } from '../../shared/apiProtocol'
import type { BattlefieldOnionView, BattlefieldUnit } from '../lib/battlefieldView'
import { resolveInspectorStackCount } from '../lib/rightRailInspector'

type BattlefieldInspectorPanelProps = {
  selectedInspectorLabel: string | null
  selectedInspectorDefender: BattlefieldUnit | null
  selectedInspectorOnion: BattlefieldOnionView | null
  selectedStackMemberCount: number
  activeSelectedUnitCount: number
  victoryObjectives: ReadonlyArray<VictoryObjectiveState>
  escapeHexes: ReadonlyArray<VictoryEscapeHex>
  dataTestId?: string
}

export function BattlefieldInspectorPanel({
  selectedInspectorLabel,
  selectedInspectorDefender,
  selectedInspectorOnion,
  selectedStackMemberCount,
  activeSelectedUnitCount,
  victoryObjectives,
  escapeHexes,
  dataTestId = 'battlefield-inspector',
}: BattlefieldInspectorPanelProps) {
  if (selectedInspectorOnion !== null && selectedInspectorDefender !== null) {
    throw new Error('BattlefieldInspectorPanel received both onion and defender selections.')
  }

  const selectedUnit = selectedInspectorOnion ?? selectedInspectorDefender
  const selectedLabel = selectedUnit !== null ? selectedInspectorLabel ?? resolveBattlefieldUnitName(selectedUnit.type, selectedUnit.id, selectedUnit.friendlyName) : null
  const subjectDataTestId = selectedUnit !== null ? `battlefield-inspector-subject-${selectedUnit.id}` : undefined

  if (selectedInspectorOnion !== null) {
    return renderInspectorPanel({
      dataTestId,
      subjectDataTestId,
      label: selectedLabel,
      headerMeta: <span className="mini-tag">Selected</span>,
      body: (
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
      ),
    })
  }

  if (selectedInspectorDefender !== null) {
    const stackCount = resolveInspectorStackCount(selectedInspectorDefender, selectedStackMemberCount)
    const attackStats = parseAttackStats(selectedInspectorDefender.attack)
    const completedVictoryObjectives = victoryObjectives.filter((objective) => objective.completed)

    return renderInspectorPanel({
      dataTestId,
      subjectDataTestId,
      label: selectedLabel,
      headerMeta: <span className="mini-tag">Selected</span>,
      body: (
        <>
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
              <dd>{attackStats.damage}</dd>
            </div>
            <div>
              <dt>Range</dt>
              <dd>{attackStats.range}</dd>
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
                  <span className="mini-tag">{completedVictoryObjectives.length}/{victoryObjectives.length} objectives</span>
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
        </>
      ),
    })
  }

  return renderInspectorPanel({
    dataTestId,
    subjectDataTestId: undefined,
    label: null,
    headerMeta: null,
    body: <div className="empty-state">Select a unit on the map or in the rail to inspect it here.</div>,
  })
}

type InspectorPanelShellProps = {
  dataTestId: string
  subjectDataTestId: string | undefined
  label: string | null
  headerMeta: ReactNode
  body: ReactNode
}

function renderInspectorPanel({ dataTestId, subjectDataTestId, label, headerMeta, body }: InspectorPanelShellProps) {
  return (
    <section className="selection-panel panel-subtle" data-testid={dataTestId} role="region" aria-label="Inspector">
      <div className="selection-panel-header">
        <div>
          <p className="eyebrow">Inspector</p>
          {label !== null ? <h2 data-testid={subjectDataTestId}>{label}</h2> : null}
        </div>
        {headerMeta}
      </div>
      {body}
    </section>
  )
}