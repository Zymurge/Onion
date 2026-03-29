import { useEffect, useMemo, useState } from 'react'
import { axialToPixel, boardPixelSize, hexCorners, hexKey, pointsToString } from '../lib/hex'
import { unitCode, type BattlefieldOnionView, type BattlefieldUnit, type TerrainHex, isUnitMoveEligible } from '../lib/battlefieldView'
import { canUnitCrossRidgelines } from '../../../src/shared/unitMovement'
import { listReachableMoves } from '../../../src/shared/movePlanner'
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
  canSubmitMove?: boolean
  onSelectUnit: (unitId: string, additive?: boolean) => void
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

export function HexMapBoard({ scenarioMap, defenders, onion, phase, selectedUnitIds, canSubmitMove = true, onSelectUnit, onDeselect, onMoveUnit }: HexMapBoardProps) {
  const terrain = new Map(scenarioMap.hexes.map((hex) => [hexKey(hex), hex.t]))
  const occupantMap = new Map<string, HexOccupant[]>()
  const [moveError, setMoveError] = useState<{ message: string; x: number; y: number } | null>(null)

  const selectedUnitSet = useMemo(() => new Set(selectedUnitIds), [selectedUnitIds])
  const selectedPrimaryUnitId = selectedUnitIds[0] ?? ''

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
  const isMovementPhase = phase === 'ONION_MOVE' || phase === 'DEFENDER_MOVE' || phase === 'GEV_SECOND_MOVE'
  const selectedIsEligible = !!(selectedOccupant && playerRole && isUnitMoveEligible(selectedOccupant, phase, playerRole))
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

  const bounds = boardPixelSize(scenarioMap.width, scenarioMap.height, HEX_SIZE, MAP_PADDING)

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
          {Array.from({ length: scenarioMap.height }, (_, r) =>
            Array.from({ length: scenarioMap.width }, (_, q) => {
              const coord = { q, r }
              const center = axialToPixel(coord, HEX_SIZE)
              const polygonPoints = pointsToString(hexCorners(center, HEX_SIZE - 1))
              const terrainType = terrain.get(hexKey(coord))
              const cellOccupants = occupantMap.get(hexKey(coord)) ?? []
              const isOnion = cellOccupants.some((occupant) => occupant.id === onion.id)
              const isSelected = cellOccupants.some((occupant) => selectedUnitSet.has(occupant.id))
              const isMoveReady = canSubmitMove && cellOccupants.some(
                (occupant) => playerRole && isUnitMoveEligible(occupant, phase, playerRole)
              )
              const isReachable = canSubmitMove && reachableHexKeys.has(hexKey(coord))


              // Pick SVG image for terrain
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
                  <clipPath id={`hex-clip-${q}-${r}`}><polygon points={polygonPoints} /></clipPath>
                  <image
                    href={terrainImg}
                    x={center.x - HEX_SIZE}
                    y={center.y - HEX_SIZE}
                    width={imgSize}
                    height={imgSize}
                    clipPath={`url(#hex-clip-${q}-${r})`}
                    preserveAspectRatio="xMidYMid slice"
                  />
                  <polygon className="hex-shape" points={polygonPoints} fill="none" />
                  {cellOccupants.map((occupant, index) => {
                    const isOccupantOnion = occupant.id === onion.id
                    const isOccupantSelected = selectedUnitSet.has(occupant.id)
                    const offset = getStackOffset(index, cellOccupants.length)
                    const moveRemaining = isOccupantOnion ? onion.movesRemaining : 'move' in occupant ? occupant.move : 0

                    return (
                      <g
                        key={occupant.id}
                        data-testid={`hex-unit-${occupant.id}`}
                        className={[
                          'hex-unit-stack',
                          isOccupantOnion ? 'hex-unit-stack-onion' : 'hex-unit-stack-defender',
                          isOccupantSelected ? 'hex-unit-stack-selected' : '',
                          isMovementPhase && occupant.status === 'operational' && moveRemaining > 0 ? 'hex-unit-stack-move-ready' : '',
                        ].join(' ')}
                        transform={`translate(${offset.dx}, ${offset.dy})`}
                        onClick={(event) => {
                          event.stopPropagation()
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
                    {q},{r}
                  </text>
                </g>
              )
            }),
          )}
        </g>
      </svg>
    </div>
  )
}
