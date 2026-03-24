import { axialToPixel, boardPixelSize, hexCorners, hexKey, pointsToString } from '../lib/hex'
import { terrainCode, unitCode, type BattlefieldUnit, type Mode, type TerrainHex } from '../mockBattlefield'
import './HexMapBoard.css'

type OnionView = {
  id: string
  type: string
  q: number
  r: number
  status: string
}

type HexMapBoardProps = {
  scenarioMap: {
    width: number
    height: number
    hexes: TerrainHex[]
  }
  defenders: BattlefieldUnit[]
  onion: OnionView
  mode: Mode
  selectedUnitId: string
  onSelectUnit: (unitId: string) => void
}

const HEX_SIZE = 36
const MAP_PADDING = 28

export function HexMapBoard({ scenarioMap, defenders, onion, mode, selectedUnitId, onSelectUnit }: HexMapBoardProps) {
  const terrain = new Map(scenarioMap.hexes.map((hex) => [hexKey(hex), hex.t]))
  const occupantMap = new Map<string, BattlefieldUnit | OnionView>()

  occupantMap.set(hexKey(onion), onion)
  for (const defender of defenders) {
    if (defender.status === 'destroyed') continue
    occupantMap.set(hexKey(defender), defender)
  }

  const bounds = boardPixelSize(scenarioMap.width, scenarioMap.height, HEX_SIZE, MAP_PADDING)

  return (
    <div className="hex-map-shell panel-subtle">
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
              const occupant = occupantMap.get(hexKey(coord))
              const isOnion = occupant?.id === onion.id
              const isSelected = occupant?.id === selectedUnitId
              const isActionable = Boolean(
                occupant &&
                  occupant.id !== onion.id &&
                  'actionableModes' in occupant &&
                  occupant.actionableModes.includes(mode),
              )
              const unitMarker = occupant ? unitCode(occupant.type) : null

              return (
                <g
                  key={`${q}-${r}`}
                  className={[
                    'hex-cell',
                    terrainType ? `hex-terrain-${terrainType}` : 'hex-terrain-default',
                    isSelected ? 'hex-cell-selected' : '',
                    isActionable ? 'hex-cell-actionable' : '',
                    isOnion ? 'hex-cell-onion' : '',
                    occupant ? 'hex-cell-occupied' : '',
                  ].join(' ')}
                  onClick={() => {
                    if (occupant && occupant.id !== onion.id && 'actionableModes' in occupant) {
                      onSelectUnit(occupant.id)
                    }
                  }}
                >
                  <polygon className="hex-shape" points={polygonPoints} />
                  {occupant ? (
                    <>
                      <rect
                        className={[
                          'hex-unit-rect',
                          isOnion ? 'hex-unit-rect-onion' : 'hex-unit-rect-defender',
                          isActionable ? 'hex-unit-rect-actionable' : '',
                        ].join(' ')}
                        x={center.x - 16}
                        y={center.y - 11}
                        width={32}
                        height={22}
                        rx={2}
                      />
                      <text className="hex-unit-marker" x={center.x} y={center.y + 4} textAnchor="middle">
                        {unitMarker}
                      </text>
                    </>
                  ) : null}
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
