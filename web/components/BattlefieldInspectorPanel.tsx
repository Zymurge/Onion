import type { ReactNode } from 'react'
import { getPrimaryWeaponStats, parseWeaponStats } from '../lib/weaponStats'
import type { BattlefieldOnionView, BattlefieldUnit } from '../lib/battlefieldView'
import type { SessionCatalog } from '../lib/sessionCatalog'
import type { TerrainType } from '../../shared/types/index'
import { getUnitDefinition } from '../../shared/unitDefinitions'
import { getUnitSpriteHref } from '../lib/unitSpriteRegistry'
import type { BattlefieldInspectorGroupHeading } from '../lib/battlefieldDisplay/types'

const terrainLabels: Record<TerrainType, string> = {
  clear: 'Clear',
  ridgeline: 'Ridgeline',
  crater: 'Crater',
}

type BattlefieldInspectorPanelProps = {
  selectedInspectorLabel: string | null
  selectedInspectorGroupHeading?: BattlefieldInspectorGroupHeading | null
  selectedInspectorGroupLabel?: string | null
  selectedInspectorDefense?: number | null
  selectedInspectorTerrainModifier?: number | null
  selectedInspectorTerrainType?: TerrainType | null
  selectedInspectorDefender: BattlefieldUnit | null
  selectedInspectorOnion: BattlefieldOnionView | null
  activeSelectedUnitCount: number
  catalog?: SessionCatalog
  dataTestId?: string
}

export function BattlefieldInspectorPanel({
  selectedInspectorLabel,
  selectedInspectorGroupHeading = null,
  selectedInspectorGroupLabel = null,
  selectedInspectorDefense = null,
  selectedInspectorTerrainModifier = null,
  selectedInspectorTerrainType = null,
  selectedInspectorDefender,
  selectedInspectorOnion,
  activeSelectedUnitCount,
  catalog,
  dataTestId = 'battlefield-inspector',
}: BattlefieldInspectorPanelProps) {
  if (selectedInspectorOnion !== null && selectedInspectorDefender !== null) {
    throw new Error('BattlefieldInspectorPanel received both onion and defender selections.')
  }

  const selectedUnit = selectedInspectorOnion ?? selectedInspectorDefender
  if (selectedUnit !== null && selectedInspectorLabel === null && selectedInspectorGroupHeading === null) {
    throw new Error(`Missing inspector label for selected unit ${selectedUnit.unitId}`)
  }

  const selectedLabel = selectedUnit !== null ? selectedInspectorLabel : null
  const subjectDataTestId = selectedUnit !== null ? `battlefield-inspector-subject-${selectedUnit.unitId}` : undefined
  const sessionUnitDefinition = selectedUnit !== null ? catalog?.unitTypes[selectedUnit.typeId] : undefined
  const fallbackUnitDefinition = selectedUnit !== null ? getUnitDefinition(selectedUnit.typeId) : undefined
  const selectedUnitDefinition = sessionUnitDefinition ?? fallbackUnitDefinition
  const selectedUnitDescription = sessionUnitDefinition?.description ?? fallbackUnitDefinition?.description
  const selectedUnitSpriteHref = selectedUnit !== null
    ? getUnitSpriteHref(
      selectedUnitDefinition?.spriteKey,
      selectedUnit.state,
      selectedUnit.role === 'onion' && (
        (selectedUnit.treads !== undefined && selectedUnit.treads < 45)
          || selectedUnit.weapons.some((weapon) => weapon.state === 'destroyed')
      ),
    )
    : undefined
  if (selectedInspectorOnion !== null) {
    return renderInspectorPanel({
      dataTestId,
      subjectDataTestId,
      label: selectedLabel,
      groupHeading: null,
      groupLabel: null,
      headerMeta: null,
      spriteHref: selectedUnitSpriteHref,
      description: selectedUnitDescription,
      body: (
        <dl className="inspector-grid inspector-grid-right">
          <div>
            <dt>Status</dt>
            <dd>{selectedInspectorOnion.state}</dd>
          </div>
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
            <dd>{selectedInspectorOnion.movesRemaining}/{selectedInspectorOnion.movesAllowed}</dd>
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
    const attackStats = getPrimaryWeaponStats(selectedInspectorDefender.weapons, catalog)
    const terrainAdjustment = selectedInspectorTerrainModifier === null
      ? ''
      : ` (${selectedInspectorTerrainModifier > 0 ? '+' : ''}${selectedInspectorTerrainModifier})`

    return renderInspectorPanel({
      dataTestId,
      subjectDataTestId,
      label: selectedLabel,
      groupHeading: selectedInspectorGroupHeading,
      groupLabel: selectedInspectorGroupLabel,
      headerMeta: null,
      spriteHref: selectedUnitSpriteHref,
      description: selectedUnitDescription,
      body: (
        <dl className="inspector-grid inspector-grid-right">
          <div>
            <dt>Status</dt>
            <dd>{selectedInspectorDefender.state}</dd>
          </div>
          <div>
            <dt>Move</dt>
            <dd>{selectedInspectorDefender.movesRemaining}/{selectedUnitDefinition?.movement ?? 0}</dd>
          </div>
          <div>
            <dt>Attack</dt>
            <dd>{attackStats.attack}</dd>
          </div>
          <div>
            <dt>Range</dt>
            <dd>{attackStats.range}</dd>
          </div>
          <div>
            <dt>Defense</dt>
            <dd>{selectedInspectorDefense ?? ''}{terrainAdjustment}</dd>
          </div>
          <div>
            <dt>Terrain</dt>
            <dd>{selectedInspectorTerrainType === null ? '' : terrainLabels[selectedInspectorTerrainType]}</dd>
          </div>
        </dl>
      ),
    })
  }

  return renderInspectorPanel({
    dataTestId,
    subjectDataTestId: undefined,
    label: null,
    groupHeading: null,
    groupLabel: null,
    headerMeta: null,
    spriteHref: undefined,
    description: undefined,
    body: <div className="empty-state">Select a unit on the map or in the rail to inspect it here.</div>,
  })
}

type InspectorPanelShellProps = {
  dataTestId: string
  subjectDataTestId: string | undefined
  label: string | null
  groupHeading: BattlefieldInspectorGroupHeading | null
  groupLabel: string | null
  headerMeta: ReactNode
  spriteHref: string | undefined
  description: string | undefined
  body: ReactNode
}

function renderInspectorPanel({ dataTestId, subjectDataTestId, label, groupHeading, groupLabel, headerMeta, spriteHref, description, body }: InspectorPanelShellProps) {
  const spriteLabel = groupHeading === null ? label : `${groupHeading.title} ${groupHeading.subtitle}`

  return (
    <section className="selection-panel panel-subtle" data-testid={dataTestId} role="region" aria-label="Inspector">
      <div className="selection-panel-header">
        <div>
          <p className="eyebrow">Inspector</p>
          {groupHeading !== null ? (
            <div className="inspector-stack-heading">
              <h2 data-testid={subjectDataTestId}>{groupHeading.title}</h2>
              <p className="inspector-stack-subtitle">{groupHeading.subtitle}</p>
              <p className="inspector-stack-selection">{groupHeading.selectionLabel}</p>
            </div>
          ) : label !== null ? <h2 data-testid={subjectDataTestId}>{label}</h2> : null}
        </div>
        {headerMeta}
      </div>
      {groupLabel !== null ? <p className="inspector-group-label" data-testid="battlefield-inspector-group">Member of {groupLabel}</p> : null}
      {spriteHref !== undefined && spriteLabel !== null ? (
        <div className="inspector-sprite-frame">
          <img className="inspector-sprite" src={spriteHref} alt={`${spriteLabel} sprite`} />
        </div>
      ) : null}
      {description !== undefined ? <p className="inspector-description">{description}</p> : null}
      {body}
    </section>
  )
}