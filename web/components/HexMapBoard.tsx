import { useEffect, useId, useMemo, useState } from 'react'
import { axialToPixel, boardPixelSize, hexCorners, pointsToString } from '../lib/hex'
import { resolveSelectionOwnerUnitId } from '../lib/selectionIds'
import { HexMapCell } from './HexMapCell'
import { hexKey } from '../../shared/hex'
import { listReachableMoves } from '../../shared/movePlanner'
import { getUnitMovementAllowance } from '../../shared/unitMovement'
import { validateMove, type MoveValidationState } from '../../shared/moveValidator'
import type { StackNamingSnapshot } from '../../shared/stackNaming'
import { buildStackRosterIndex } from '../../shared/stackRoster'
import type { DefenderMap, StackRosterState, TurnPhase } from '../../shared/types/index'
import { getBattlefieldPosition, type BattlefieldOnionView, type BattlefieldUnit, type TerrainHex } from '../lib/battlefieldView'
import {
  buildOccupantMap,
  collapseStackedOccupants,
  hasStackedOccupants,
  resolveCanonicalOccupant,
  type HexOccupant,
  type OccupantRosterIndex,
} from '../lib/hexMapOccupancy'
import { getCombatTargetIdForOccupant, isCombatTargetSelected, isCombatTargetSelectable } from '../lib/hexMapCombatTargeting'
import { routeInteraction, type InteractionRoutingRequest } from '../lib/interactionRouting'
import { useHexMapZoom } from '../lib/useHexMapZoom'
import type { SessionCatalog } from '../lib/sessionCatalog'
import logger from '../lib/logger'
import './HexMapBoard.css'

type HexMapBoardProps = {
  scenarioMap: {
    width: number
    height: number
    cells: ReadonlyArray<{ q: number; r: number }>
    hexes: ReadonlyArray<TerrainHex>
  }
  defenders: ReadonlyArray<BattlefieldUnit>
  onions: ReadonlyArray<BattlefieldOnionView>
  phase: string | null
  viewerRole?: 'onion' | 'defender' | null
  selectedUnitIds: ReadonlyArray<string>
  selectedCombatTargetId?: string | null
  combatRangeHexKeys?: ReadonlySet<string>
  combatTargetIds?: ReadonlySet<string>
  escapeHexes?: ReadonlyArray<{ q: number; r: number }>
  stackNaming?: StackNamingSnapshot
  stackRoster?: StackRosterState
  catalog?: SessionCatalog
  canSubmitMove?: boolean
  isSelectionLocked?: boolean
  onSelectUnit: (unitId: string, additive?: boolean) => void
  onSelectCombatTarget?: (targetId: string) => void
  onDeselect: () => void
  onMoveUnit: (unitId: string, to: { q: number; r: number }) => void
}

const HEX_SIZE = 36
const MAP_PADDING = 28

function buildMoveValidationState(
  phase: string | null,
  onions: ReadonlyArray<BattlefieldOnionView>,
  defenders: ReadonlyArray<BattlefieldUnit>,
  stackNaming: StackNamingSnapshot | undefined,
  stackRoster: StackRosterState | undefined,
): MoveValidationState | null {
  if (phase !== 'ONION_MOVE' && phase !== 'DEFENDER_MOVE' && phase !== 'GEV_SECOND_MOVE') {
    return null
  }

  return {
    onions: Object.fromEntries(onions.map((onion) => [onion.unitId, {
      unitId: onion.unitId,
      typeId: onion.typeId,
      role: 'onion' as const,
      friendlyName: onion.friendlyName,
      position: onion.position,
      state: onion.state,
      treads: onion.treads,
      ramsRemaining: onion.ramsRemaining,
      weapons: onion.weapons,
    }])),
    defenders: Object.fromEntries(
      defenders.map((defender) => [defender.unitId, {
        unitId: defender.unitId,
        typeId: defender.typeId,
        role: 'defender',
        friendlyName: defender.friendlyName,
        position: defender.position,
        state: defender.state,
        weapons: defender.weapons,
      }]),
    ),
    stackNaming: stackNaming ?? { groupsInUse: [], usedGroupNames: [] },
    stackRoster: stackRoster ?? { groupsById: {} },
    currentPhase: phase as TurnPhase,
    turn: 0,
  }
}

/** Renders the battlefield map and coordinates its derived state and interactions. */
export function HexMapBoard({
  scenarioMap,
  defenders,
  onions,
  phase,
  viewerRole = null,
  selectedUnitIds,
  selectedCombatTargetId,
  combatRangeHexKeys,
  combatTargetIds,
  escapeHexes,
  stackNaming,
  stackRoster,
  catalog,
  canSubmitMove = true,
  isSelectionLocked = false,
  onSelectUnit,
  onSelectCombatTarget,
  onDeselect,
  onMoveUnit,
}: HexMapBoardProps) {
  const terrain = new Map(scenarioMap.hexes.map((hex) => [hexKey(hex), hex.t]))
  const renderedCells = scenarioMap.cells
  const bounds = boardPixelSize(renderedCells, HEX_SIZE, MAP_PADDING)
  const {
    maxZoomPercent,
    minZoomPercent,
    scaledBounds,
    scrollViewportRef,
    setZoomPercent,
    stepZoomPercent,
    zoomPercent,
    zoomSliderRef,
  } = useHexMapZoom(bounds)
  const occupantMap = buildOccupantMap({ onions, defenders })
  const escapeHexSet = new Set((escapeHexes ?? []).map((hex) => hexKey(hex)))
  const stackRosterIndex = useMemo(() => {
    if (stackRoster === undefined) {
      return null
    }

    const defenderLookup = Object.fromEntries(
      defenders.map((defender) => [defender.unitId, {
        unitId: defender.unitId,
        typeId: defender.typeId,
        role: 'defender' as const,
        friendlyName: defender.friendlyName,
        position: defender.position,
        state: defender.state,
        weapons: defender.weapons,
      }]),
    ) as DefenderMap

    return buildStackRosterIndex(stackRoster, defenderLookup)
  }, [defenders, stackRoster])

  if (stackRosterIndex === null && hasStackedOccupants(defenders, catalog)) {
    throw new Error('Missing stackRoster for grouped defenders')
  }

  const escapePatternId = useId().replaceAll(':', '')
  const [moveError, setMoveError] = useState<string | null>(null)
  const isCombatPhase = phase === 'ONION_COMBAT' || phase === 'DEFENDER_COMBAT'
  const activeCombatRole = phase === 'ONION_COMBAT' ? 'onion' : phase === 'DEFENDER_COMBAT' ? 'defender' : null
  const isMovementPhase = phase === 'ONION_MOVE' || phase === 'DEFENDER_MOVE' || phase === 'GEV_SECOND_MOVE'
  const resolvedViewerRole = viewerRole ?? (phase?.startsWith('DEFENDER') ? 'defender' : 'onion')
  const resolvedViewerActivity = isSelectionLocked ? 'inactive' : 'active'
  const resolvedPhaseMode = isMovementPhase ? 'movement' : isCombatPhase ? 'combat' : 'locked'

  const selectedUnitSet = useMemo(() => {
    const selectedIds = new Set<string>()

    for (const selectionId of selectedUnitIds) {
      if (selectionId.startsWith('weapon:')) {
        selectedIds.add(onions[0]?.unitId ?? '')
        continue
      }

      selectedIds.add(resolveSelectionOwnerUnitId(selectionId))
    }

    return selectedIds
  }, [onions, selectedUnitIds])
  const selectedPrimaryUnitId = useMemo(() => {
    const directSelection = selectedUnitIds.find((selectionId) => !selectionId.startsWith('weapon:'))
    if (directSelection !== undefined) {
      return resolveSelectionOwnerUnitId(directSelection)
    }

    return selectedUnitIds.some((selectionId) => selectionId.startsWith('weapon:')) ? onions[0]?.unitId ?? null : null
  }, [onions, selectedUnitIds])
  const onion = onions.find((unit) => unit.unitId === selectedPrimaryUnitId) ?? onions[0]

  const selectedOccupant = selectedPrimaryUnitId === null
    ? null
    : onions.find((unit) => unit.unitId === selectedPrimaryUnitId) ??
      defenders.find((unit) => unit.unitId === selectedPrimaryUnitId) ?? null
  const selectedAllowance = selectedOccupant
    ? onions.some((unit) => unit.unitId === selectedOccupant.unitId)
      ? (selectedOccupant as BattlefieldOnionView).movesRemaining
      : (selectedOccupant as BattlefieldUnit).movesRemaining
    : 0
  const occupiedHexes = Array.from(occupantMap.entries())
    .flatMap(([key, occupants]) => {
      const [q, r] = key.split(',').map(Number)
      return occupants
        .filter((occupant) => occupant.unitId !== selectedPrimaryUnitId && (occupant.state !== 'destroyed' || occupant.typeId === 'Swamp'))
        .map((occupant) => ({
          q,
          r,
          role: onions.some((onionUnit) => occupant.unitId === onionUnit.unitId) ? ('onion' as const) : ('defender' as const),
          unitType: occupant.typeId,
        }))
    })
  const playerRole = canSubmitMove && phase
    ? phase.startsWith('ONION')
      ? 'onion'
      : phase.startsWith('DEFENDER') || phase === 'GEV_SECOND_MOVE'
        ? 'defender'
        : null
    : null
  const selectedIsEligible = !!(
    selectedOccupant && playerRole && isMovementPhase && selectedOccupant.state === 'operational' && selectedAllowance > 0
  )
  const reachableHexKeys = selectedIsEligible && selectedOccupant
    ? new Set(
        listReachableMoves({
          map: { ...scenarioMap, occupiedHexes },
          from: getBattlefieldPosition(selectedOccupant),
          movementAllowance: selectedAllowance,
          movingRole: onions.some((onionUnit) => selectedOccupant.unitId === onionUnit.unitId) ? 'onion' : 'defender',
          movingUnitType: selectedOccupant.typeId,
        }).map((move) => hexKey(move.to)),
      )
    : new Set<string>()

  function validateMoveTarget(to: { q: number; r: number }) {
    if (!selectedOccupant || !phase) {
      return null
    }

    const validationState = buildMoveValidationState(phase, onions, defenders, stackNaming, stackRoster)
    if (validationState === null) {
      return null
    }

    return validateMove(
      { ...scenarioMap, occupiedHexes },
      validationState,
      { type: 'MOVE', unitId: selectedOccupant.unitId, to },
    )
  }

  useEffect(() => {
    if (!moveError) return undefined

    const timeoutId = window.setTimeout(() => setMoveError(null), 3000)
    const dismiss = () => setMoveError(null)
    window.addEventListener('click', dismiss, true)

    return () => {
      window.clearTimeout(timeoutId)
      window.removeEventListener('click', dismiss, true)
    }
  }, [moveError])

  if (onion === undefined) {
    return null
  }

  function routeMapInteraction(request: InteractionRoutingRequest) {
    return routeInteraction(request, (trace) => {
      logger.debug('[interaction-debug] map routed', {
        ts: Date.now(),
        ...trace,
      })
    })
  }

  function selectCombatTarget(occupant: HexOccupant) {
    const combatTargetId = getCombatTargetIdForOccupant(occupant, activeCombatRole, onion)
    if (isCombatTargetSelectable(occupant, activeCombatRole, onion, combatTargetIds)) {
      onSelectCombatTarget?.(combatTargetId)
    }
  }

  return (
    <div className="hex-map-shell panel-subtle">
      {moveError ? (
        <div className="hex-map-toast-overlay" aria-live="polite">
          <div className="hex-map-toast" role="status">
            {moveError}
          </div>
        </div>
      ) : null}
      <div
        className="hex-map-viewport"
        data-testid="hex-map-viewport"
        ref={scrollViewportRef}
      >
        <svg
          className="hex-map-svg"
          width={scaledBounds.width}
          height={scaledBounds.height}
          viewBox={`0 0 ${bounds.width} ${bounds.height}`}
          role="img"
          aria-label="Swamp Siege hex map"
        >
          <defs>
            <pattern id={escapePatternId} width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="18" height="18" fill="rgba(155, 148, 112, 0.18)" />
              <path d="M 0 0 L 0 18" stroke="rgba(62, 84, 43, 0.88)" strokeWidth="12" strokeLinecap="square" />
            </pattern>
          </defs>
          <g transform={`translate(${MAP_PADDING}, ${MAP_PADDING})`}>
            {renderedCells.map((coord) => {
              const center = axialToPixel(coord, HEX_SIZE)
              const polygonPoints = pointsToString(hexCorners(center, HEX_SIZE - 1))
              const cellKey = hexKey(coord)
              const cellOccupants = occupantMap.get(cellKey) ?? []
              const isReachable = canSubmitMove && reachableHexKeys.has(cellKey)
              const targetSelected = cellOccupants.some((occupant) => isCombatTargetSelected(
                occupant,
                activeCombatRole,
                onion,
                selectedCombatTargetId,
              ))
              const targetOccupant = resolveCanonicalOccupant(cellOccupants, stackRosterIndex as OccupantRosterIndex | null)
              const isMoveReady = canSubmitMove && cellOccupants.some((occupant) => {
                if (!playerRole || !isMovementPhase || occupant.state !== 'operational') {
                  return false
                }

                if (occupant.unitId === onion.unitId) {
                  return onion.movesRemaining > 0 || (phase !== null && getUnitMovementAllowance('TheOnion', phase, onion.treads) > 0)
                }

                return 'movesRemaining' in occupant && (occupant.movesRemaining > 0 || (phase !== null && getUnitMovementAllowance(occupant.typeId, phase) > 0))
              })

              return (
                <HexMapCell
                  key={`${coord.q}-${coord.r}`}
                  activeCombatRole={activeCombatRole}
                  center={center}
                  cellOccupants={cellOccupants}
                  combatRange={combatRangeHexKeys?.has(cellKey) ?? false}
                  combatTargetSelected={targetSelected}
                  coord={coord}
                  escapeHex={escapeHexSet.has(cellKey)}
                  escapePatternId={escapePatternId}
                  hasSharedOccupancy={cellOccupants.length > 1}
                  isMoveReady={isMoveReady}
                  isOnion={cellOccupants.some((occupant) => occupant.unitId === onion.unitId)}
                  isReachable={isReachable}
                  isSelected={cellOccupants.some((occupant) => selectedUnitSet.has(occupant.unitId))}
                  isSelectionLocked={isSelectionLocked}
                  onBackgroundClick={() => {
                    if (isSelectionLocked) {
                      return
                    }

                    const decision = routeMapInteraction({
                      viewerRole: resolvedViewerRole,
                      viewerActivity: resolvedViewerActivity,
                      phaseMode: resolvedPhaseMode,
                      surface: 'map',
                      gesture: 'primary',
                      subjectRelation: 'background',
                      subjectKind: 'background',
                      subjectCapability: { inspectable: false, moveEligible: false, attackerEligible: false, targetEligible: false },
                    })

                    if (decision.intent === 'clear-local-selection') {
                      onDeselect()
                    }
                  }}
                  onCellContextMenu={(event) => {
                    event.preventDefault()
                    if (isSelectionLocked) {
                      return
                    }

                    const validation = validateMoveTarget(coord)
                    const destinationReachable = isReachable || validation?.valid === true
                    const decision = routeMapInteraction({
                      viewerRole: resolvedViewerRole,
                      viewerActivity: resolvedViewerActivity,
                      phaseMode: resolvedPhaseMode,
                      surface: 'map',
                      gesture: 'secondary',
                      subjectRelation: cellOccupants.length > 0 ? 'opponent' : 'background',
                      subjectKind: 'hex',
                      subjectCapability: {
                        inspectable: cellOccupants.some((occupant) => occupant.state !== 'destroyed'),
                        moveEligible: selectedIsEligible,
                        attackerEligible: false,
                        targetEligible: targetOccupant !== undefined && isCombatTargetSelectable(targetOccupant, activeCombatRole, onion, combatTargetIds),
                      },
                      interactionMode: { destinationReachable },
                    })

                    if (decision.intent === 'select-target' && targetOccupant !== undefined) {
                      selectCombatTarget(targetOccupant)
                      return
                    }

                    if (decision.intent === 'submit-move' && canSubmitMove && selectedIsEligible && selectedOccupant !== null) {
                      onMoveUnit(selectedOccupant.unitId, coord)
                      return
                    }

                    if (decision.intent === 'show-illegal-local-feedback' && canSubmitMove && selectedIsEligible) {
                      setMoveError(validation !== null && validation.valid === false ? validation.error : 'Illegal move')
                    }
                  }}
                  onion={onion}
                  phase={phase}
                  polygonPoints={polygonPoints}
                  renderedOccupants={collapseStackedOccupants(cellOccupants, stackRosterIndex as OccupantRosterIndex | null)}
                  renderedTerrainType={terrain.get(cellKey)}
                  resolvedPhaseMode={resolvedPhaseMode}
                  resolvedViewerActivity={resolvedViewerActivity}
                  resolvedViewerRole={resolvedViewerRole}
                  routeMapInteraction={routeMapInteraction}
                  rosterIndex={stackRosterIndex as OccupantRosterIndex | null}
                  selectedUnitIds={selectedUnitSet}
                  stackNaming={stackNaming}
                  onDeselect={onDeselect}
                  onSelectUnit={onSelectUnit}
                />
              )
            })}
          </g>
        </svg>
      </div>
      <div className="hex-map-zoom-control">
        <input
          ref={zoomSliderRef}
          id="hex-map-zoom-slider"
          className="hex-map-zoom-slider"
          type="range"
          min={minZoomPercent}
          max={maxZoomPercent}
          step={stepZoomPercent}
          value={zoomPercent}
          aria-label="Map zoom"
          onChange={(event) => setZoomPercent(Number(event.target.value))}
        />
      </div>
    </div>
  )
}