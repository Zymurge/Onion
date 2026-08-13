import type { MouseEvent } from 'react'
import { HexMapUnitMarker } from './HexMapUnitMarker'
import type { BattlefieldOnionView } from '../lib/battlefieldView'
import type { HexOccupant, OccupantRosterIndex } from '../lib/hexMapOccupancy'
import type {
  InteractionPhaseMode,
  InteractionRoutingDecision,
  InteractionRoutingRequest,
  InteractionViewerActivity,
  InteractionViewerRole,
} from '../lib/interactionRouting'
import type { StackNamingSnapshot } from '../../shared/stackNaming'

type HexMapCellProps = {
  activeCombatRole: 'onion' | 'defender' | null
  center: { x: number; y: number }
  cellOccupants: ReadonlyArray<HexOccupant>
  combatRange: boolean
  combatTargetSelected: boolean
  coord: { q: number; r: number }
  escapeHex: boolean
  escapePatternId: string
  hasSharedOccupancy: boolean
  isMoveReady: boolean
  isOnion: boolean
  isReachable: boolean
  isSelected: boolean
  isSelectionLocked: boolean
  onBackgroundClick: () => void
  onCellContextMenu: (event: MouseEvent<SVGGElement>) => void
  onion: BattlefieldOnionView
  phase: string | null
  polygonPoints: string
  renderedOccupants: ReadonlyArray<HexOccupant>
  renderedTerrainType?: number
  resolvedPhaseMode: InteractionPhaseMode
  resolvedViewerActivity: InteractionViewerActivity
  resolvedViewerRole: InteractionViewerRole
  routeMapInteraction: (request: InteractionRoutingRequest) => InteractionRoutingDecision
  rosterIndex: OccupantRosterIndex | null
  selectedUnitIds: ReadonlySet<string>
  stackNaming?: StackNamingSnapshot
  onDeselect: () => void
  onSelectUnit: (unitId: string, additive?: boolean) => void
}

function terrainImage(terrainType?: number): string {
  return terrainType === 1 ? '/terrain/ridges.svg' : terrainType === 2 ? '/terrain/craters.svg' : '/terrain/default.svg'
}

/** Renders terrain, overlays, and occupant markers for one map cell. */
export function HexMapCell({
  activeCombatRole,
  center,
  cellOccupants,
  combatRange,
  combatTargetSelected,
  coord,
  escapeHex,
  escapePatternId,
  hasSharedOccupancy,
  isMoveReady,
  isOnion,
  isReachable,
  isSelected,
  isSelectionLocked,
  onBackgroundClick,
  onCellContextMenu,
  onion,
  phase,
  polygonPoints,
  renderedOccupants,
  renderedTerrainType,
  resolvedPhaseMode,
  resolvedViewerActivity,
  resolvedViewerRole,
  routeMapInteraction,
  rosterIndex,
  selectedUnitIds,
  stackNaming,
  onDeselect,
  onSelectUnit,
}: HexMapCellProps) {
  const imgSize = 72

  return (
    <g
      data-testid={`hex-cell-${coord.q}-${coord.r}`}
      className={[
        'hex-cell',
        renderedTerrainType ? `hex-terrain-${renderedTerrainType}` : 'hex-terrain-default',
        isSelected ? 'hex-cell-selected' : '',
        combatTargetSelected ? 'hex-cell-selected' : '',
        combatRange ? 'hex-cell-combat-range' : '',
        escapeHex ? 'hex-cell-escape' : '',
        isMoveReady ? 'hex-cell-move-ready' : '',
        isReachable ? 'hex-cell-reachable' : '',
        isOnion ? 'hex-cell-onion' : '',
        cellOccupants.length > 0 ? 'hex-cell-occupied' : '',
        hasSharedOccupancy ? 'hex-cell-shared-occupancy' : '',
      ].join(' ')}
      onClick={onBackgroundClick}
      onContextMenu={onCellContextMenu}
    >
      <clipPath id={`hex-clip-${coord.q}-${coord.r}`}><polygon points={polygonPoints} /></clipPath>
      <image
        href={terrainImage(renderedTerrainType)}
        x={center.x - 36}
        y={center.y - 36}
        width={imgSize}
        height={imgSize}
        clipPath={`url(#hex-clip-${coord.q}-${coord.r})`}
        preserveAspectRatio="xMidYMid slice"
      />
      <polygon className="hex-shape" points={polygonPoints} fill="none" />
      {escapeHex ? (
        <>
          <polygon
            className="hex-shape hex-shape-escape-overlay"
            points={polygonPoints}
            style={{ fill: `url(#${escapePatternId})`, fillOpacity: 0.5, opacity: 0.5 }}
            pointerEvents="none"
          />
          <polygon
            className="hex-shape hex-shape-escape-ring"
            points={polygonPoints}
            fill="none"
            pointerEvents="none"
          />
        </>
      ) : null}
      {hasSharedOccupancy ? (
        <polygon
          className="hex-shape hex-shared-occupancy-ring"
          points={polygonPoints}
          fill="none"
          pointerEvents="none"
        />
      ) : null}
      {renderedOccupants.map((occupant, index) => {
        const rosterGroup = rosterIndex?.getUnitGroup(occupant.unitId) ?? null
        const isOccupantSelected = rosterGroup !== null
          ? rosterGroup.unitIds.some((unitId) => selectedUnitIds.has(unitId))
          : selectedUnitIds.has(occupant.unitId)
        const combatMembers = rosterGroup === null
          ? [occupant]
          : rosterGroup.unitIds
            .map((unitId) => cellOccupants.find((cellOccupant) => cellOccupant.unitId === unitId))
            .filter((member): member is HexOccupant => member !== undefined)

        return (
          <HexMapUnitMarker
            key={occupant.unitId}
            activeCombatRole={activeCombatRole}
            center={center}
            combatMembers={combatMembers}
            isCombatPhase={activeCombatRole !== null}
            isMovementPhase={phase === 'ONION_MOVE' || phase === 'DEFENDER_MOVE' || phase === 'GEV_SECOND_MOVE'}
            isOccupantSelected={isOccupantSelected}
            isSelectionLocked={isSelectionLocked}
            occupant={occupant}
            offsetIndex={index}
            renderedOccupantCount={renderedOccupants.length}
            onion={onion}
            phase={phase}
            resolvedPhaseMode={resolvedPhaseMode}
            resolvedViewerActivity={resolvedViewerActivity}
            resolvedViewerRole={resolvedViewerRole}
            routeMapInteraction={routeMapInteraction}
            rosterGroup={rosterGroup}
            stackNaming={stackNaming}
            onDeselect={onDeselect}
            onSelectUnit={onSelectUnit}
          />
        )
      })}
      <text className="hex-coord" x={center.x} y={center.y + 18} textAnchor="middle">
        {coord.q},{coord.r}
      </text>
    </g>
  )
}