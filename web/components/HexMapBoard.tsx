import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { axialToPixel, boardPixelSize, hexCorners, pointsToString } from '../lib/hex'
import { statusTone, unitCode, type BattlefieldOnionView, type BattlefieldUnit, type TerrainHex } from '../lib/battlefieldView'
import { hexKey } from '../../shared/hex'
import { listReachableMoves } from '../../shared/movePlanner'
import { getUnitMovementAllowance } from '../../shared/unitMovement'
import './HexMapBoard.css'

import swampDestroyedSprite from '../assets/The Swamp - destroyed.png'
import swampIntactSprite from '../assets/The Swamp - intact.png'

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
  escapeHexes?: Array<{ q: number; r: number }>
  canSubmitMove?: boolean
  isSelectionLocked?: boolean
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

function shouldRenderDefender(defender: BattlefieldUnit) {
  return defender.status !== 'destroyed' || defender.type === 'Swamp'
}

function getSwampSpriteHref(status: string) {
  return status === 'destroyed' ? swampDestroyedSprite : swampIntactSprite
}

export function HexMapBoard({ scenarioMap, defenders, onion, phase, viewerRole = null, selectedUnitIds, selectedCombatTargetId, combatRangeHexKeys, combatTargetIds, escapeHexes, canSubmitMove = true, isSelectionLocked = false, onSelectUnit, onSelectCombatTarget, onDeselect, onMoveUnit }: HexMapBoardProps) {
  void viewerRole

  const terrain = new Map(scenarioMap.hexes.map((hex) => [hexKey(hex), hex.t]))
  const occupantMap = new Map<string, HexOccupant[]>()
  const escapePatternId = useId().replaceAll(':', '')
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
    if (!shouldRenderDefender(defender)) continue
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
        .filter((occupant) => occupant.id !== selectedPrimaryUnitId && (occupant.status !== 'destroyed' || occupant.type === 'Swamp'))
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
  const escapeHexSet = new Set((escapeHexes ?? []).map((hex) => hexKey(hex)))
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
              const terrainType = terrain.get(hexKey(coord))
              const cellOccupants = occupantMap.get(hexKey(coord)) ?? []
              const renderedTerrainType = terrainType
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
              const isEscapeHex = escapeHexSet.has(hexKey(coord))
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
              const terrainImg = renderedTerrainType === 1 ? '/terrain/ridges.svg' : renderedTerrainType === 2 ? '/terrain/craters.svg' : '/terrain/default.svg'
              const imgSize = HEX_SIZE * 2

              return (
                <g
                  key={`${coord.q}-${coord.r}`}
                  data-testid={`hex-cell-${coord.q}-${coord.r}`}
                  className={[
                    'hex-cell',
                      renderedTerrainType ? `hex-terrain-${renderedTerrainType}` : 'hex-terrain-default',
                    isSelected ? 'hex-cell-selected' : '',
                    isCombatTargetSelected ? 'hex-cell-selected' : '',
                    isCombatRange ? 'hex-cell-combat-range' : '',
                    isEscapeHex ? 'hex-cell-escape' : '',
                    isMoveReady ? 'hex-cell-move-ready' : '',
                    isReachable ? 'hex-cell-reachable' : '',
                    isOnion ? 'hex-cell-onion' : '',
                    cellOccupants.length > 0 ? 'hex-cell-occupied' : '',
                  ].join(' ')}
                  onClick={() => {
                    if (isSelectionLocked) {
                      return
                    }

                    onDeselect()
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault()

                    if (isSelectionLocked) {
                      return
                    }

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
                  {isEscapeHex ? (
                    <polygon
                      className="hex-shape hex-shape-escape-overlay"
                      points={polygonPoints}
                      style={{ fill: `url(#${escapePatternId})`, fillOpacity: 0.5, opacity: 0.5 }}
                      pointerEvents="none"
                    />
                  ) : null}
                  {isEscapeHex ? (
                    <polygon
                      className="hex-shape hex-shape-escape-ring"
                      points={polygonPoints}
                      fill="none"
                      pointerEvents="none"
                    />
                  ) : null}
                  {cellOccupants.map((occupant, index) => {
                    const isOccupantOnion = occupant.id === onion.id
                    const isOccupantSelected = selectedUnitSet.has(occupant.id)
                    const offset = getStackOffset(index, cellOccupants.length)
                    const isSwamp = occupant.type === 'Swamp'

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
                      : isSwamp
                        ? isDestroyed ? 'hex-unit-rect-swamp-destroyed' : 'hex-unit-rect-swamp'
                        : isDestroyed || isDisabled
                        ? 'hex-unit-rect-move-disabled'
                        : isMovementPhaseActiveSide
                          ? moveHasRemaining
                            ? 'hex-unit-rect-move-eligible'
                            : 'hex-unit-rect-move-ineligible'
                          : 'hex-unit-rect-move-inspectable'
                    const swampRectClass = isSwamp
                      ? isDestroyed || isDisabled
                        ? 'hex-unit-rect-swamp-destroyed'
                        : 'hex-unit-rect-swamp'
                      : ''
                    const unitRectX = isSwamp ? center.x - 24 : center.x - 16
                    const unitRectY = isSwamp ? center.y - 24 : center.y - 11
                    const unitRectWidth = isSwamp ? 48 : 32
                    const unitRectHeight = isSwamp ? 48 : 22
                    return (
                      <g
                        key={occupant.id}
                        data-testid={`hex-unit-${occupant.id}`}
                        data-selected={isOccupantSelected}
                        className={[
                          'hex-unit-stack',
                          isOccupantOnion ? 'hex-unit-stack-onion' : 'hex-unit-stack-defender',
                          isSwamp ? 'hex-unit-stack-swamp' : '',
                          isOccupantSelected ? 'hex-unit-stack-selected' : '',
                          isMovementPhase && movementEligibilityClass === 'hex-unit-rect-move-eligible' ? 'hex-unit-stack-move-ready' : '',
                          isDisabled ? 'hex-unit-stack-disabled' : '',
                          isSwamp ? (isDestroyed ? 'tone-destroyed' : 'tone-neutral') : `tone-${statusTone(occupant.status)}`,
                        ].join(' ')}
                        transform={`translate(${offset.dx}, ${offset.dy})`}
                        onClick={(event) => {
                          if (isSelectionLocked) {
                            event.stopPropagation()
                            return
                          }

                          event.stopPropagation()

                          onSelectUnit(occupant.id, event.ctrlKey || event.metaKey)
                        }}
                      >
                        <rect
                          className={[
                            'hex-unit-rect',
                            isSwamp ? swampRectClass : isOccupantOnion ? 'hex-unit-rect-onion' : 'hex-unit-rect-defender',
                            isOccupantSelected ? 'hex-unit-rect-selected' : '',
                            isSwamp ? '' : movementEligibilityClass,
                            isDisabled ? 'hex-unit-rect-disabled' : '',
                            isSwamp ? '' : combatEligibilityClass,
                          ].join(' ')}
                          x={unitRectX}
                          y={unitRectY}
                          width={unitRectWidth}
                          height={unitRectHeight}
                          rx={isSwamp ? 4 : 2}
                        />
                        {occupant.type === 'Swamp' ? null : (
                          <text className="hex-unit-marker" x={center.x} y={center.y + 4} textAnchor="middle">
                            {unitCode(occupant.type)}
                          </text>
                        )}
                        {occupant.type === 'Swamp' ? (
                          <image
                            href={getSwampSpriteHref(occupant.status)}
                            x={center.x - 19}
                            y={center.y - 19}
                            width={38}
                            height={38}
                            preserveAspectRatio="xMidYMid meet"
                          />
                        ) : null}
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
