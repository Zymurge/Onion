import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { axialToPixel, boardPixelSize, hexCorners, pointsToString } from '../lib/hex'
import { unitCode, type BattlefieldOnionView, type BattlefieldUnit, type TerrainHex } from '../lib/battlefieldView'
import { hexKey } from '../../shared/hex'
import { listReachableMoves } from '../../shared/movePlanner'
import { getUnitMovementAllowance } from '../../shared/unitMovement'
import './HexMapBoard.css'

type HexOccupant = BattlefieldUnit | BattlefieldOnionView

type HexMapBoardProps = {
  scenarioMap: {
    width: number
    height: number
    cells: Array<{ q: number; r: number }>
    hexes: TerrainHex[]
  }
  defenders: BattlefieldUnit[]
  onion: BattlefieldOnionView
  phase: string | null
  viewerRole?: 'onion' | 'defender' | null
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
const ZOOM_MIN = 0.5
const ZOOM_MAX = 2.0
const ZOOM_STEP = 0.05
const ZOOM_PERCENT_MIN = Math.round(ZOOM_MIN * 100)
const ZOOM_PERCENT_MAX = Math.round(ZOOM_MAX * 100)
const ZOOM_PERCENT_STEP = Math.round(ZOOM_STEP * 100)

function clampZoomPercent(value: number) {
  return Math.max(ZOOM_PERCENT_MIN, Math.min(ZOOM_PERCENT_MAX, value))
}

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

export function HexMapBoard({ scenarioMap, defenders, onion, phase, viewerRole = null, selectedUnitIds, selectedCombatTargetId, combatRangeHexKeys, combatTargetIds, canSubmitMove = true, onSelectUnit, onSelectCombatTarget, onDeselect, onMoveUnit }: HexMapBoardProps) {
  const terrain = new Map(scenarioMap.hexes.map((hex) => [hexKey(hex), hex.t]))
  const occupantMap = new Map<string, HexOccupant[]>()
  const [moveError, setMoveError] = useState<string | null>(null)
  const [zoomPercent, setZoomPercent] = useState(100)
  const scrollViewportRef = useRef<HTMLDivElement | null>(null)
  const zoomSliderRef = useRef<HTMLInputElement | null>(null)
  const previousZoomRef = useRef(1)
  const activeCombatRole = phase === 'ONION_COMBAT' ? 'onion' : phase === 'DEFENDER_COMBAT' ? 'defender' : null
  const isMovementPhase = phase === 'ONION_MOVE' || phase === 'DEFENDER_MOVE' || phase === 'GEV_SECOND_MOVE'
  const zoomLevel = zoomPercent / 100

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
  const reachableHexKeys = selectedIsEligible && selectedOccupant
    ? new Set(
        listReachableMoves({
          map: { ...scenarioMap, occupiedHexes },
          from: { q: selectedOccupant.q, r: selectedOccupant.r },
          movementAllowance: selectedAllowance,
          movingRole: selectedOccupant.id === onion.id ? 'onion' : 'defender',
          movingUnitType: selectedOccupant.type,
        }).map((move) => hexKey(move.to)),
      )
    : new Set<string>()

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

  const renderedCells = scenarioMap.cells
  const bounds = boardPixelSize(renderedCells, HEX_SIZE, MAP_PADDING)
  const scaledBounds = {
    width: bounds.width * zoomLevel,
    height: bounds.height * zoomLevel,
  }

  function adjustZoom(direction: 1 | -1) {
    setZoomPercent((current) => clampZoomPercent(current + direction * ZOOM_PERCENT_STEP))
  }

  useLayoutEffect(() => {
    const viewport = scrollViewportRef.current

    if (!viewport) {
      previousZoomRef.current = zoomLevel
      return
    }

    const previousZoom = previousZoomRef.current
    if (previousZoom === zoomLevel) {
      return
    }

    const centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / previousZoom
    const centerY = (viewport.scrollTop + viewport.clientHeight / 2) / previousZoom
    const nextScrollLeft = Math.max(0, Math.min(centerX * zoomLevel - viewport.clientWidth / 2, scaledBounds.width - viewport.clientWidth))
    const nextScrollTop = Math.max(0, Math.min(centerY * zoomLevel - viewport.clientHeight / 2, scaledBounds.height - viewport.clientHeight))

    if (typeof viewport.scrollTo === 'function') {
      viewport.scrollTo({ left: nextScrollLeft, top: nextScrollTop, behavior: 'auto' })
    } else {
      viewport.scrollLeft = nextScrollLeft
      viewport.scrollTop = nextScrollTop
    }

    previousZoomRef.current = zoomLevel
  }, [scaledBounds.height, scaledBounds.width, zoomLevel])

  useEffect(() => {
    const viewport = scrollViewportRef.current

    if (!viewport) {
      return undefined
    }

    const viewportElement = viewport

    function handleWheel(event: WheelEvent) {
      if (event.deltaX === 0 && event.deltaY === 0) {
        return
      }

      event.preventDefault()

      if (typeof viewportElement.scrollBy === 'function') {
        viewportElement.scrollBy({ left: event.deltaX, top: event.deltaY, behavior: 'auto' })
        return
      }

      viewportElement.scrollLeft += event.deltaX
      viewportElement.scrollTop += event.deltaY
    }

    viewportElement.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      viewportElement.removeEventListener('wheel', handleWheel)
    }
  }, [])

  useEffect(() => {
    const slider = zoomSliderRef.current

    if (!slider) {
      return undefined
    }

    function handleWheel(event: WheelEvent) {
      if (event.deltaY === 0) {
        return
      }

      event.preventDefault()
      adjustZoom(event.deltaY < 0 ? 1 : -1)
    }

    slider.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      slider.removeEventListener('wheel', handleWheel)
    }
  }, [])

  function getCombatTargetIdForOccupant(occupant: HexOccupant): string {
    if (activeCombatRole === 'defender' && occupant.id === onion.id) {
      return `${onion.id}:treads`
    }

    return occupant.id
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
          <g transform={`translate(${MAP_PADDING}, ${MAP_PADDING})`}>
            {renderedCells.map((coord) => {
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
              const terrainImg = terrainType === 1 ? '/terrain/ridges.svg' : terrainType === 2 ? '/terrain/craters.svg' : '/terrain/default.svg'
              const imgSize = HEX_SIZE * 2

              return (
                <g
                  key={`${coord.q}-${coord.r}`}
                  data-testid={`hex-cell-${coord.q}-${coord.r}`}
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
                    if (canSubmitMove && selectedIsEligible) {
                      setMoveError('Illegal move')
                    }
                  }}
                >
                  <clipPath id={`hex-clip-${coord.q}-${coord.r}`}><polygon points={polygonPoints} /></clipPath>
                  <image
                    href={terrainImg}
                    x={center.x - HEX_SIZE}
                    y={center.y - HEX_SIZE}
                    width={imgSize}
                    height={imgSize}
                    clipPath={`url(#hex-clip-${coord.q}-${coord.r})`}
                    preserveAspectRatio="xMidYMid slice"
                  />
                  <polygon className="hex-shape" points={polygonPoints} fill="none" />
                  {cellOccupants.map((occupant, index) => {
                    const isOccupantOnion = occupant.id === onion.id
                    const isOccupantSelected = selectedUnitSet.has(occupant.id)
                    const offset = getStackOffset(index, cellOccupants.length)

                    const isDestroyed = occupant.status === 'destroyed'
                    const isDisabled = occupant.status === 'disabled'
                    const isCombatPhase = phase === 'ONION_COMBAT' || phase === 'DEFENDER_COMBAT'
                    const isMovementPhaseActiveSide = phase === 'ONION_MOVE' ? isOccupantOnion : phase === 'DEFENDER_MOVE' || phase === 'GEV_SECOND_MOVE' ? !isOccupantOnion : false
                    const combatHasReadyAttack = isOccupantOnion
                      ? (occupant.weaponDetails ?? []).some((weapon) => weapon.status === 'ready')
                      : 'actionableModes' in occupant && occupant.actionableModes.includes('fire')
                    const moveHasRemaining = isOccupantOnion
                      ? onion.movesRemaining > 0
                      : 'move' in occupant && occupant.move > 0
                    const combatEligibilityClass = !isCombatPhase
                      ? ''
                      : isDestroyed || isDisabled
                        ? 'hex-unit-rect-combat-disabled'
                        : activeCombatRole === 'onion'
                          ? isOccupantOnion
                            ? combatHasReadyAttack
                              ? 'hex-unit-rect-combat-eligible'
                              : 'hex-unit-rect-combat-ineligible'
                            : 'hex-unit-rect-combat-inspectable'
                          : activeCombatRole === 'defender'
                            ? !isOccupantOnion
                              ? combatHasReadyAttack
                                ? 'hex-unit-rect-combat-eligible'
                                : 'hex-unit-rect-combat-ineligible'
                              : 'hex-unit-rect-combat-inspectable'
                            : ''
                    const movementEligibilityClass = !isMovementPhase
                      ? ''
                      : isDestroyed || isDisabled
                        ? 'hex-unit-rect-move-disabled'
                        : isMovementPhaseActiveSide
                          ? moveHasRemaining
                            ? 'hex-unit-rect-move-eligible'
                            : 'hex-unit-rect-move-ineligible'
                          : 'hex-unit-rect-move-inspectable'
                    return (
                      <g
                        key={occupant.id}
                        data-testid={`hex-unit-${occupant.id}`}
                        data-selected={isOccupantSelected}
                        className={[
                          'hex-unit-stack',
                          isOccupantOnion ? 'hex-unit-stack-onion' : 'hex-unit-stack-defender',
                          isOccupantSelected ? 'hex-unit-stack-selected' : '',
                          isMovementPhase && movementEligibilityClass === 'hex-unit-rect-move-eligible' ? 'hex-unit-stack-move-ready' : '',
                          isDisabled ? 'hex-unit-stack-disabled' : '',
                        ].join(' ')}
                        transform={`translate(${offset.dx}, ${offset.dy})`}
                        onClick={(event) => {
                          event.stopPropagation()

                          if (isCombatPhase && viewerRole !== activeCombatRole) {
                            onSelectUnit(occupant.id, event.ctrlKey || event.metaKey)
                            return
                          }

                          if (selectCombatTarget(occupant)) {
                            return
                          }

                          const occupantIsActiveCombatSide = activeCombatRole === 'onion' ? isOccupantOnion : activeCombatRole === 'defender' ? !isOccupantOnion : false

                          if (isCombatPhase && !occupantIsActiveCombatSide) {
                            onSelectUnit(occupant.id, event.ctrlKey || event.metaKey)
                            return
                          }

                          if (activeCombatRole === 'onion') {
                            return
                          }

                          // Always update inspector for any non-combat unit click, even if not eligible for action
                          onSelectUnit(occupant.id, event.ctrlKey || event.metaKey)
                        }}
                      >
                        <rect
                          className={[
                            'hex-unit-rect',
                            isOccupantOnion ? 'hex-unit-rect-onion' : 'hex-unit-rect-defender',
                            isOccupantSelected ? 'hex-unit-rect-selected' : '',
                            movementEligibilityClass,
                            isDisabled ? 'hex-unit-rect-disabled' : '',
                            combatEligibilityClass,
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
                        {isDisabled && (
                          <g className="hex-unit-disabled-indicator">
                            <rect
                              x={center.x - 16}
                              y={center.y - 11}
                              width={32}
                              height={22}
                              rx={2}
                              fill="#888"
                              opacity="0.18"
                            />
                            <text
                              x={center.x + 12}
                              y={center.y - 7}
                              fontSize="13"
                              fill="#b71c1c"
                              fontWeight="bold"
                              textAnchor="middle"
                              className="hex-unit-disabled-icon"
                            >
                              &#9888;
                            </text>
                          </g>
                        )}
                      </g>
                    )
                  })}
                  <text className="hex-coord" x={center.x} y={center.y + 18} textAnchor="middle">
                        {coord.q},{coord.r}
                  </text>
                </g>
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
          min={ZOOM_PERCENT_MIN}
          max={ZOOM_PERCENT_MAX}
          step={ZOOM_PERCENT_STEP}
          value={zoomPercent}
          aria-label="Map zoom"
          onChange={(event) => setZoomPercent(Number(event.target.value))}
        />
      </div>
    </div>
  )
}
