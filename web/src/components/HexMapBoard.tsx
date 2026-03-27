import { axialToPixel, boardPixelSize, hexCorners, hexKey, pointsToString } from '../lib/hex'
import { unitCode, type BattlefieldOnionView, type BattlefieldUnit, type Mode, type TerrainHex } from '../lib/battlefieldView'
import './HexMapBoard.css'

type HexMapBoardProps = {
  scenarioMap: {
    width: number
    height: number
    hexes: TerrainHex[]
  }
  defenders: BattlefieldUnit[]
  onion: BattlefieldOnionView
  mode: Mode
  selectedUnitId: string
  onSelectUnit: (unitId: string) => void
}

const HEX_SIZE = 36
const MAP_PADDING = 28

export function HexMapBoard({ scenarioMap, defenders, onion, mode, selectedUnitId, onSelectUnit }: HexMapBoardProps) {
  const terrain = new Map(scenarioMap.hexes.map((hex) => [hexKey(hex), hex.t]))
  const occupantMap = new Map<string, BattlefieldUnit | BattlefieldOnionView>()

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
