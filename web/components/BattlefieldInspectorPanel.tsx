import type { ReactNode } from 'react'
import { getPrimaryWeaponStats, parseWeaponStats } from '../lib/weaponStats'
import type { BattlefieldOnionView, BattlefieldUnit } from '../lib/battlefieldView'
import { resolveInspectorStackCount } from '../lib/rightRailInspector'
import type { SessionCatalog } from '../lib/sessionCatalog'

type BattlefieldInspectorPanelProps = {
  selectedInspectorLabel: string | null
  selectedInspectorDefender: BattlefieldUnit | null
  selectedInspectorOnion: BattlefieldOnionView | null
  selectedStackMemberCount: number
  activeSelectedUnitCount: number
  catalog?: SessionCatalog
  dataTestId?: string
}

export function BattlefieldInspectorPanel({
  selectedInspectorLabel,
  selectedInspectorDefender,
  selectedInspectorOnion,
  selectedStackMemberCount,
  activeSelectedUnitCount,
  catalog,
  dataTestId = 'battlefield-inspector',
}: BattlefieldInspectorPanelProps) {
  if (selectedInspectorOnion !== null && selectedInspectorDefender !== null) {
    throw new Error('BattlefieldInspectorPanel received both onion and defender selections.')
  }

  const selectedUnit = selectedInspectorOnion ?? selectedInspectorDefender
  if (selectedUnit !== null && selectedInspectorLabel === null) {
    throw new Error(`Missing inspector label for selected unit ${selectedUnit.unitId}`)
  }

  const selectedLabel = selectedUnit !== null ? selectedInspectorLabel : null
  const subjectDataTestId = selectedUnit !== null ? `battlefield-inspector-subject-${selectedUnit.unitId}` : undefined

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
            <dd>{selectedInspectorOnion.ramsRemaining}</dd>
          </div>
          <div>
            <dt>Weapons</dt>
            <dd>{parseWeaponStats(selectedInspectorOnion.weapons).operationalWeapons}</dd>
          </div>
          <div>
            <dt>Missiles</dt>
            <dd>{parseWeaponStats(selectedInspectorOnion.weapons).operationalMissiles}</dd>
          </div>
        </dl>
      ),
    })
  }

  if (selectedInspectorDefender !== null) {
    const stackCount = resolveInspectorStackCount(selectedInspectorDefender, selectedStackMemberCount)
    const attackStats = getPrimaryWeaponStats(selectedInspectorDefender.weapons, catalog)

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
              <dd>{selectedInspectorDefender.state}</dd>
            </div>
            <div>
              <dt>Damage</dt>
              <dd>{attackStats.attack}</dd>
            </div>
            <div>
              <dt>Range</dt>
              <dd>{attackStats.range}</dd>
            </div>
            <div>
              <dt>Move</dt>
              <dd>{selectedInspectorDefender.movesRemaining}</dd>
            </div>
            <div>
              <dt>Selected</dt>
              <dd>{activeSelectedUnitCount}</dd>
            </div>
          </dl>
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