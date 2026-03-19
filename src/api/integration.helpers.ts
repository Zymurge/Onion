import { expect } from 'vitest'
import { createMap, findPath, hexDistance } from '../engine/map.js'
import { getUnitDefinition, onionMovementAllowance } from '../engine/units.js'

export type HexPos = { q: number; r: number }
export type ScenarioMap = { width: number; height: number; hexes: Array<{ q: number; r: number; t: number }> }

export interface ExpectedState {
  onion: any
  defenders: Record<string, any>
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

export function buildExpectedState(initialState: any): ExpectedState {
  return {
    onion: clone(initialState.onion),
    defenders: clone(initialState.defenders),
  }
}

export async function registerAndLoginUser(app: any, username: string, password: string) {
  const registerResponse = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { username, password },
  })
  expect(registerResponse.statusCode).toBe(201)
  const { userId } = registerResponse.json()

  const loginResponse = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username, password },
  })
  expect(loginResponse.statusCode).toBe(200)
  const { token, userId: loginUserId } = loginResponse.json()
  expect(loginUserId).toBe(userId)

  return { userId, token }
}

function getNeighbors(position: HexPos): HexPos[] {
  return [
    { q: position.q + 1, r: position.r },
    { q: position.q - 1, r: position.r },
    { q: position.q, r: position.r + 1 },
    { q: position.q, r: position.r - 1 },
    { q: position.q + 1, r: position.r - 1 },
    { q: position.q - 1, r: position.r + 1 },
  ]
}

function isInBounds(map: ScenarioMap, position: HexPos): boolean {
  return position.q >= 0 && position.q < map.width && position.r >= 0 && position.r < map.height
}

function isPassableTerrain(map: ScenarioMap, position: HexPos): boolean {
  const hex = map.hexes.find((candidate) => candidate.q === position.q && candidate.r === position.r)
  return hex?.t !== 2
}

function isOccupied(state: any, position: HexPos, excludedUnitId?: string): boolean {
  if (state.onion.id !== excludedUnitId && state.onion.position.q === position.q && state.onion.position.r === position.r) {
    return true
  }

  return Object.values(state.defenders).some((defender: any) => {
    if (defender.id === excludedUnitId) return false
    return defender.position.q === position.q && defender.position.r === position.r
  })
}

export function chooseLegalAdjacentMove(map: ScenarioMap, state: any, unitId: string): HexPos | null {
  const unit = unitId === state.onion.id ? state.onion : state.defenders[unitId]
  if (!unit) return null

  for (const candidate of getNeighbors(unit.position)) {
    if (!isInBounds(map, candidate)) continue
    if (!isPassableTerrain(map, candidate)) continue
    if (isOccupied(state, candidate, unitId)) continue
    return candidate
  }

  return null
}

function movementAllowanceFor(state: any, unitId: string): number {
  if (unitId === state.onion.id) {
    return onionMovementAllowance(state.onion.treads)
  }

  const unit = state.defenders[unitId]
  if (!unit) return 0
  const definition = getUnitDefinition(unit.type)
  return definition?.movement ?? 0
}

function canCrossRidgelines(state: any, unitId: string): boolean {
  if (unitId === state.onion.id) {
    return true
  }

  const unit = state.defenders[unitId]
  if (!unit) return false
  const definition = getUnitDefinition(unit.type)
  return definition?.abilities.canCrossRidgelines === true
}

export function chooseReachableMoveToward(
  map: ScenarioMap,
  state: any,
  unitId: string,
  target: HexPos,
): HexPos | null {
  const unit = unitId === state.onion.id ? state.onion : state.defenders[unitId]
  if (!unit) return null

  const movementAllowance = movementAllowanceFor(state, unitId)
  if (movementAllowance <= 0) return null

  const engineMap = createMap(map.width, map.height, map.hexes)
  const candidates: Array<{ position: HexPos; distance: number; cost: number }> = []

  for (let q = 0; q < map.width; q++) {
    for (let r = 0; r < map.height; r++) {
      const position = { q, r }
      if (position.q === unit.position.q && position.r === unit.position.r) continue
      if (isOccupied(state, position, unitId)) continue

      const path = findPath(
        engineMap,
        unit.position,
        position,
        movementAllowance,
        canCrossRidgelines(state, unitId),
      )

      if (!path.found) continue
      if (path.path.some((step) => isOccupied(state, step, unitId))) continue

      candidates.push({
        position,
        distance: hexDistance(position, target),
        cost: path.cost,
      })
    }
  }

  candidates.sort((left, right) => {
    if (left.distance !== right.distance) return left.distance - right.distance
    if (left.cost !== right.cost) return left.cost - right.cost
    if (left.position.q !== right.position.q) return left.position.q - right.position.q
    return left.position.r - right.position.r
  })

  return candidates[0]?.position ?? null
}

export function applyActionToExpectedState(expected: ExpectedState, action: any, result: any) {
  if (!result?.ok) return

  if (action.type === 'MOVE') {
    if (expected.onion.id && action.unitId === expected.onion.id) {
      expected.onion.position = clone(action.to)
    } else if (expected.defenders[action.unitId]) {
      expected.defenders[action.unitId].position = clone(action.to)
    }
  }

  if (!result.events) return

  for (const event of result.events) {
    if (event.type === 'UNIT_STATUS_CHANGED' && expected.defenders[event.unitId]) {
      expected.defenders[event.unitId].status = event.to
    }
    if (event.type === 'UNIT_SQUADS_LOST' && expected.defenders[event.unitId]) {
      expected.defenders[event.unitId].squads = Math.max(0, (expected.defenders[event.unitId].squads ?? 1) - Number(event.amount ?? 0))
      if (expected.defenders[event.unitId].squads === 0) {
        expected.defenders[event.unitId].status = 'destroyed'
      }
    }
    if (event.type === 'ONION_TREADS_LOST') {
      expected.onion.treads = event.remaining
    }
    if (event.type === 'ONION_BATTERY_DESTROYED' && expected.onion.batteries && event.weaponType) {
      expected.onion.batteries[event.weaponType] = Math.max(0, (expected.onion.batteries[event.weaponType] || 0) - 1)
    }
  }
}

export function assertStateMatches(apiState: any, expected: ExpectedState) {
  expect(apiState.onion.position).toEqual(expected.onion.position)
  expect(apiState.onion.treads).toBe(expected.onion.treads)
  expect(apiState.onion.batteries).toEqual(expected.onion.batteries)

  for (const unitId of Object.keys(expected.defenders)) {
    expect(apiState.defenders[unitId].position).toEqual(expected.defenders[unitId].position)
    expect(apiState.defenders[unitId].status).toBe(expected.defenders[unitId].status)
  }
}
