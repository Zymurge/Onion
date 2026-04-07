import { useEffect, useMemo, useState } from 'react'
import { axialToPixel, boardPixelSize, hexCorners, pointsToString } from '../lib/hex'
import { unitCode, type BattlefieldOnionView, type BattlefieldUnit, type TerrainHex, isUnitMoveEligible } from '../lib/battlefieldView'
import { hexKey } from '../../../src/shared/hex'
import { listReachableMoves } from '../../../src/shared/movePlanner'
import { canUnitCrossRidgelines, getUnitMovementAllowance } from '../../../src/shared/unitMovement'
import './HexMapBoard.css'

type HexOccupant = BattlefieldUnit | BattlefieldOnionView

type HexMapBoardProps = {
  scenarioMap: {
    width: number
    height: number
    hexes: TerrainHex[]
  }
  defenders: BattlefieldUnit[]
  onion: BattlefieldOnionView
  phase: string | null
  selectedUnitIds: string[]
  selectedCombatTargetId?: string | null
  combatRangeHexKeys?: ReadonlySet<string>
  combatTargetIds?: ReadonlySet<string>
  canSubmitMove?: boolean
  onSelectUnit: (unitId: string, additive?: boolean) => void
  onSelectCombatTarget?: (targetId: string) => void
  onDeselect: () => void
  onMoveUnit: (unitId: string, to: { q: number; r: number }) => void
}

const HEX_SIZE = 36
const MAP_PADDING = 28

function getStackOffset(index: number, total: number): { dx: number; dy: number } {
  if (total <= 1) {
    return { dx: 0, dy: 0 }
  }

  if (total === 2) {
    return { dx: 0, dy: index === 0 ? -11 : 11 }
  }

  const radius = 11
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2
  return {
    dx: Math.round(Math.cos(angle) * radius),
    dy: Math.round(Math.sin(angle) * radius),
  }
}

export function HexMapBoard({ scenarioMap, defenders, onion, phase, selectedUnitIds, selectedCombatTargetId, combatRangeHexKeys, combatTargetIds, canSubmitMove = true, onSelectUnit, onSelectCombatTarget, onDeselect, onMoveUnit }: HexMapBoardProps) {
  const terrain = new Map(scenarioMap.hexes.map((hex) => [hexKey(hex), hex.t]))
  const occupantMap = new Map<string, HexOccupant[]>()
  const [moveError, setMoveError] = useState<{ message: string; x: number; y: number } | null>(null)
  const activeCombatRole = phase === 'ONION_COMBAT' ? 'onion' : phase === 'DEFENDER_COMBAT' ? 'defender' : null
  const isMovementPhase = phase === 'ONION_MOVE' || phase === 'DEFENDER_MOVE' || phase === 'GEV_SECOND_MOVE'

  const selectedUnitSet = useMemo(() => {
    const selectedIds = new Set<string>()

    for (const selectionId of selectedUnitIds) {
      if (selectionId.startsWith('weapon:')) {
        selectedIds.add(onion.id)
        continue
      }

      selectedIds.add(selectionId)
    }

    return selectedIds
  }, [onion.id, selectedUnitIds])
  const selectedPrimaryUnitId = useMemo(() => {
    const directSelection = selectedUnitIds.find((selectionId) => !selectionId.startsWith('weapon:'))
    if (directSelection !== undefined) {
      return directSelection
    }

    return selectedUnitIds.some((selectionId) => selectionId.startsWith('weapon:')) ? onion.id : ''
  }, [onion.id, selectedUnitIds])

  occupantMap.set(hexKey(onion), [onion])
  for (const defender of defenders) {
    if (defender.status === 'destroyed') continue
    const key = hexKey(defender)
    const occupants = occupantMap.get(key) ?? []
    occupants.push(defender)
    occupantMap.set(key, occupants)
  }

  const selectedOccupant =
    selectedPrimaryUnitId === onion.id
      ? onion
      : defenders.find((unit) => unit.id === selectedPrimaryUnitId) ?? null
  const selectedAllowance = selectedOccupant
    ? selectedOccupant.id === onion.id
      ? onion.movesRemaining
      : 'move' in selectedOccupant
        ? selectedOccupant.move
        : 0
    : 0
  const selectedCanCrossRidgelines = selectedOccupant ? canUnitCrossRidgelines(selectedOccupant.type) : false
  const occupiedHexes = Array.from(occupantMap.entries())
    .flatMap(([key, occupants]) => {
      const [q, r] = key.split(',').map(Number)
      return occupants
        .filter((occupant) => occupant.id !== selectedPrimaryUnitId && occupant.status !== 'destroyed')
        .map((occupant) => ({
          q,
          r,
          role: occupant.id === onion.id ? ('onion' as const) : ('defender' as const),
          unitType: occupant.type,
        }))
    })
  const playerRole = canSubmitMove && phase && (phase.startsWith('ONION') ? 'onion' : phase.startsWith('DEFENDER') || phase === 'GEV_SECOND_MOVE' ? 'defender' : null)
  const selectedIsEligible = !!(selectedOccupant && playerRole && isMovementPhase && selectedOccupant.status === 'operational' && selectedAllowance > 0)
  const reachableMoves =
    selectedIsEligible
      ? listReachableMoves({
          map: { ...scenarioMap, occupiedHexes },
          from: { q: selectedOccupant.q, r: selectedOccupant.r },
          movementAllowance: selectedAllowance,
          canCrossRidgelines: selectedCanCrossRidgelines,
          movingRole: selectedOccupant.id === onion.id ? 'onion' : 'defender',
          movingUnitType: selectedOccupant.type,
        })
      : []
  const reachableHexKeys = useMemo(() => new Set(reachableMoves.map((move) => hexKey(move.to))), [reachableMoves])

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

  const renderedCells = scenarioMap.hexes.map((hex) => ({ q: hex.q, r: hex.r }))
  const bounds = boardPixelSize(renderedCells, HEX_SIZE, MAP_PADDING)

  function getCombatTargetIdForOccupant(occupant: HexOccupant): string {
    if (activeCombatRole === 'defender' && occupant.id === onion.id) {
      return `${onion.id}:treads`
    }

    return occupant.id
  }

  function canSelectOccupant(occupant: HexOccupant): boolean {
    if (activeCombatRole === null) {
      return true
    }

    const combatTargetId = getCombatTargetIdForOccupant(occupant)

    if (activeCombatRole === 'onion') {
      return occupant.id !== onion.id && (combatTargetIds === undefined || combatTargetIds.has(combatTargetId))
    }

    if (occupant.id === onion.id) {
      return combatTargetIds === undefined || combatTargetIds.has(combatTargetId)
    }

    return true
  }

  function selectCombatTarget(occupant: HexOccupant) {
    const combatTargetId = getCombatTargetIdForOccupant(occupant)

    if (activeCombatRole === 'onion' && occupant.id !== onion.id && (combatTargetIds === undefined || combatTargetIds.has(combatTargetId))) {
      onSelectCombatTarget?.(combatTargetId)
      return true
    }

    if (activeCombatRole === 'defender' && occupant.id === onion.id && (combatTargetIds === undefined || combatTargetIds.has(combatTargetId))) {
      onSelectCombatTarget?.(combatTargetId)
      return true
    }

    return false
  }

  return (
    <div className="hex-map-shell panel-subtle">
      {moveError ? (
        <div className="hex-map-toast" style={{ left: moveError.x + 12, top: moveError.y + 12 }} role="status">
          {moveError.message}
        </div>
      ) : null}
      <svg
        className="hex-map-svg"
        width={bounds.width}
        height={bounds.height}
        viewBox={`0 0 ${bounds.width} ${bounds.height}`}
        role="img"
        aria-label="Swamp Siege hex map"
      >
        <g transform={`translate(${MAP_PADDING}, ${MAP_PADDING})`}>
          {scenarioMap.hexes.map((hex) => {
            const coord = { q: hex.q, r: hex.r }
            const center = axialToPixel(coord, HEX_SIZE)
            const polygonPoints = pointsToString(hexCorners(center, HEX_SIZE - 1))
            const terrainType = terrain.get(hexKey(coord))
            const cellOccupants = occupantMap.get(hexKey(coord)) ?? []
            const isOnion = cellOccupants.some((occupant) => occupant.id === onion.id)
            const isSelected = cellOccupants.some((occupant) => selectedUnitSet.has(occupant.id))
            const isCombatTargetSelected = selectedCombatTargetId !== undefined && selectedCombatTargetId !== null && cellOccupants.some((occupant) => {
              const combatTargetId = getCombatTargetIdForOccupant(occupant)

              return combatTargetId === selectedCombatTargetId
                || (activeCombatRole === 'defender' && occupant.id === onion.id && (
                  selectedCombatTargetId.startsWith(`${onion.id}:`) || selectedCombatTargetId.startsWith('weapon:')
                ))
            })
            const isCombatRange = combatRangeHexKeys?.has(hexKey(coord)) ?? false
            const isMoveReady = canSubmitMove && cellOccupants.some((occupant) => {
              if (!playerRole || !isMovementPhase || occupant.status !== 'operational') {
                return false
              }

              if (occupant.id === onion.id) {
                return onion.movesRemaining > 0 || (phase !== null && getUnitMovementAllowance('TheOnion', phase, onion.treads) > 0)
              }

              if (!('move' in occupant)) {
                return false
              }

              return occupant.move > 0 || (phase !== null && getUnitMovementAllowance(occupant.type, phase) > 0)
            })
            const isReachable = canSubmitMove && reachableHexKeys.has(hexKey(coord))
            return (
              <g
                key={`${hex.q}-${hex.r}`}
                data-testid={`hex-cell-${hex.q}-${hex.r}`}
              let terrainImg = '/terrain/default.svg';
              if (terrainType === 1) terrainImg = '/terrain/ridges.svg';
              else if (terrainType === 2) terrainImg = '/terrain/craters.svg';
              // else if (terrainType === 3) ...

              // The SVG image is sized to fit the hex
              const imgSize = HEX_SIZE * 2;
              return (
                <g
                  key={`${q}-${r}`}
                  data-testid={`hex-cell-${q}-${r}`}
                  className={[
                    'hex-cell',
                    terrainType ? `hex-terrain-${terrainType}` : 'hex-terrain-default',
                    isSelected ? 'hex-cell-selected' : '',
                    isCombatTargetSelected ? 'hex-cell-selected' : '',
                    isCombatRange ? 'hex-cell-combat-range' : '',
                    isMoveReady ? 'hex-cell-move-ready' : '',
                    isReachable ? 'hex-cell-reachable' : '',
                    isOnion ? 'hex-cell-onion' : '',
                    cellOccupants.length > 0 ? 'hex-cell-occupied' : '',
                  ].join(' ')}
                onClick={() => {
                  onDeselect()
                }}
                onContextMenu={(event) => {
                  event.preventDefault()

                  if (cellOccupants.some((occupant) => selectCombatTarget(occupant))) {
                    return
                  }

                  if (!selectedIsEligible || !canSubmitMove) {
                    return
                  }
                  if (isReachable) {
                    onMoveUnit(selectedOccupant.id, coord)
                    return
                  }
                  // Only show error toast if move controls are enabled and selected unit is eligible
                  if (canSubmitMove && selectedIsEligible) {
                    setMoveError({ message: 'Illegal move', x: event.clientX, y: event.clientY })
                  }
                }}
              >
                <clipPath id={`hex-clip-${hex.q}-${hex.r}`}><polygon points={polygonPoints} /></clipPath>
                <image
                  href={terrainImg}
                  x={center.x - HEX_SIZE}
                  y={center.y - HEX_SIZE}
                  width={imgSize}
                  height={imgSize}
                  clipPath={`url(#hex-clip-${hex.q}-${hex.r})`}
                  preserveAspectRatio="xMidYMid slice"
                />
                <polygon className="hex-shape" points={polygonPoints} fill="none" />
                {cellOccupants.map((occupant, index) => {
                    const isOccupantOnion = occupant.id === onion.id
                    const isOccupantSelected = selectedUnitSet.has(occupant.id)
                    const offset = getStackOffset(index, cellOccupants.length)
                    const moveRemaining = isOccupantOnion
                      ? onion.movesRemaining
                      : 'move' in occupant
                        ? occupant.move
                        : 0

                    return (
                      <g
                        key={occupant.id}
                        data-testid={`hex-unit-${occupant.id}`}
                        data-selected={isOccupantSelected}
                        className={[
                          'hex-unit-stack',
                          isOccupantOnion ? 'hex-unit-stack-onion' : 'hex-unit-stack-defender',
                          isOccupantSelected ? 'hex-unit-stack-selected' : '',
                          isMovementPhase && occupant.status === 'operational' && moveRemaining > 0 ? 'hex-unit-stack-move-ready' : '',
                        ].join(' ')}
                        transform={`translate(${offset.dx}, ${offset.dy})`}
                        onClick={(event) => {
                          if (!canSelectOccupant(occupant)) {
                            event.stopPropagation()
                            return
                          }

                          event.stopPropagation()
                          if (activeCombatRole === 'onion' && occupant.id !== onion.id) {
                            if (onSelectCombatTarget !== undefined) {
                              onSelectCombatTarget(getCombatTargetIdForOccupant(occupant))
                            }

                            return
                          }

                          if (activeCombatRole === 'defender' && occupant.id === onion.id) {
                            if (onSelectCombatTarget !== undefined) {
                              onSelectCombatTarget(getCombatTargetIdForOccupant(occupant))
                            }

                            return
                          }

                          onSelectUnit(occupant.id, event.ctrlKey || event.metaKey)
                        }}
                      >
                        <rect
                          className={[
                            'hex-unit-rect',
                            isOccupantOnion ? 'hex-unit-rect-onion' : 'hex-unit-rect-defender',
                            isOccupantSelected ? 'hex-unit-rect-selected' : '',
                            isMovementPhase && occupant.status === 'operational' && moveRemaining > 0 ? 'hex-unit-rect-move-ready' : '',
                          ].join(' ')}
                          x={center.x - 16}
                          y={center.y - 11}
                          width={32}
                          height={22}
                          rx={2}
                        />
                        <text className="hex-unit-marker" x={center.x} y={center.y + 4} textAnchor="middle">
                          {unitCode(occupant.type)}
                        </text>
                      </g>
                    )
                  })}
                <text className="hex-coord" x={center.x} y={center.y + 18} textAnchor="middle">
                  {hex.q},{hex.r}
                </text>
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}
