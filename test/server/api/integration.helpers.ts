import { expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { getNeighbors, hexDistance, type HexPos } from '#shared/hex'
import { translateScenarioCoord } from '#shared/scenarioMap'
import { getUnitTypeCatalog } from '#shared/unitDefinitions'
import type { Command, DefenderUnit, EventEnvelope, GameState, OnionUnit, StackRosterGroupState } from '#shared/types/index'
import type { Deployment, InitialState } from '#server/engine/scenarioSchema'
import { getUnitDefinition, onionMovementAllowance } from '#server/engine/units'
import { listReachableMoves, type MoveMapSnapshot } from '#shared/movePlanner'

export type ScenarioMap = { width: number; height: number; cells: Array<{ q: number; r: number }>; hexes: Array<{ q: number; r: number; t: number }> }

type ScenarioStackRosterGroup = Pick<StackRosterGroupState, 'unitIds'>
type ExpectedOnion = Pick<OnionUnit, 'unitId' | 'typeId' | 'state' | 'position' | 'treads'>
type ExpectedDefender = Pick<DefenderUnit, 'unitId' | 'typeId' | 'state' | 'position' | 'weapons'> & { squads?: number }
type ExpectedStateInput = InitialState & {
  stackRoster?: { groupsById?: Record<string, ScenarioStackRosterGroup> }
}

export interface ExpectedState {
  onions: Record<string, ExpectedOnion>
  defenders: Record<string, ExpectedDefender>
  stackRoster?: {
    groupsById: Record<string, ScenarioStackRosterGroup>
  }
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

export function buildExpectedState(initialState: ExpectedStateInput): ExpectedState {
  const radius = translateScenarioCoord.lastRadius
  if (radius === undefined) {
    throw new Error('translateScenarioCoord.lastRadius is undefined')
  }

  const onions: Record<string, ExpectedOnion> = {}
  const defenders: Record<string, ExpectedDefender> = {}
  const deployments = Object.entries(initialState.deployments) as Array<[string, Deployment]>
  // Track ordinals for each stack group type to ensure unique IDs across multiple groups
  const stackOrdinals: Record<string, number> = {}
  for (const [key, def] of deployments) {
    const unitType = 'kind' in def ? def.unitType : def.type
    const definition = getUnitTypeCatalog()[unitType]
    if (definition === undefined) {
      throw new Error(`Unknown unit type: ${unitType}`)
    }

    if ('kind' in def) {
      const count = def.count
      const position = translateScenarioCoord(def.position, radius)
      // Use the same base as scenarioNormalizer
      const unitIdBase = unitType === 'LittlePigs' ? 'pigs' : unitType.toLowerCase()
      const ordinal = stackOrdinals[unitIdBase] || 0
      for (let i = 1; i <= count; i++) {
        const unitId = `${unitIdBase}-${ordinal + i}`
        const expectedUnit = {
          unitId,
          typeId: unitType,
          position,
          state: def.status ?? 'operational',
          weapons: [],
        }
        if (def.side === 'onion') {
          onions[unitId] = { ...expectedUnit, treads: definition.treads }
        } else {
          defenders[unitId] = expectedUnit
        }
      }
      stackOrdinals[unitIdBase] = ordinal + count
    } else {
      const position = translateScenarioCoord(def.position, radius)
      const expectedUnit = {
        unitId: key,
        typeId: def.type,
        position,
        state: def.status ?? 'operational',
        weapons: [],
      }
      if (def.side === 'onion') {
        onions[key] = { ...expectedUnit, treads: definition.treads }
      } else {
        defenders[key] = expectedUnit
      }
    }
  }

  const stackRoster = initialState.stackRoster?.groupsById
    ? { groupsById: clone(initialState.stackRoster.groupsById) }
    : undefined

  return { onions, defenders, stackRoster }
}

export async function registerAndLoginUser(app: FastifyInstance, username: string, password: string) {
  const registerResponse = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { username, email: `${username}@example.com`, password },
  })
  expect(registerResponse.statusCode).toBe(201)

  const loginResponse = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username, password },
  })
  expect(loginResponse.statusCode).toBe(200)
  const { token, userId: loginUserId } = loginResponse.json()

  return { userId: loginUserId, token }
}

function isInBounds(map: ScenarioMap, position: HexPos): boolean {
  return map.cells.some((cell) => cell.q === position.q && cell.r === position.r)
}

function isPassableTerrain(map: ScenarioMap, position: HexPos): boolean {
  const hex = map.hexes.find((candidate) => candidate.q === position.q && candidate.r === position.r)
  return hex?.t !== 2
}

function isOccupied(state: GameState, position: HexPos, excludedUnitId?: string): boolean {
  const onionAtPosition = Object.values(state.onions ?? {}).some((onion) => (
    onion.unitId !== excludedUnitId && onion.position.q === position.q && onion.position.r === position.r
  ))
  if (onionAtPosition) return true

  return Object.values(state.defenders).some((defender) => {
    if (defender.unitId === excludedUnitId) return false
    return defender.position.q === position.q && defender.position.r === position.r
  })
}

export function chooseLegalAdjacentMove(map: ScenarioMap, state: GameState, unitId: string): HexPos | null {
  const unit = state.onions?.[unitId] ?? state.defenders[unitId]
  if (!unit) return null

  for (const candidate of getNeighbors(unit.position)) {
    if (!isInBounds(map, candidate)) continue
    if (!isPassableTerrain(map, candidate)) continue
    if (isOccupied(state, candidate, unitId)) continue
    return candidate
  }

  return null
}

function movementAllowanceFor(state: GameState, unitId: string): number {
  const onion = state.onions?.[unitId]
  if (onion) {
    return onionMovementAllowance(onion.treads ?? 0)
  }

  const unit = state.defenders[unitId]
  if (!unit) return 0
  const definition = getUnitDefinition(unit.typeId)
  return definition?.movement ?? 0
}

function buildMoveMapSnapshot(map: ScenarioMap, state: GameState, unitId: string): MoveMapSnapshot {
  const occupiedHexes: NonNullable<MoveMapSnapshot['occupiedHexes']> = [
    ...Object.values(state.onions ?? {})
      .filter((onion) => onion.unitId !== unitId)
      .map((onion) => ({
        q: onion.position.q,
        r: onion.position.r,
        role: 'onion' as const,
        unitType: onion.typeId,
        squads: 1,
      })),
    ...Object.entries(state.defenders)
      .filter(([defenderId, defender]) => defenderId !== unitId && defender.unitId !== unitId)
      .map(([, defender]) => ({
        q: defender.position.q,
        r: defender.position.r,
        role: 'defender' as const,
        unitType: defender.typeId,
        squads: getUnitDefinition(defender.typeId)?.squads,
      })),
  ]

  return {
    width: map.width,
    height: map.height,
    cells: map.cells,
    hexes: map.hexes,
    occupiedHexes,
  }
}

export function chooseReachableMoveToward(
  map: ScenarioMap,
  state: GameState,
  unitId: string,
  target: HexPos,
): HexPos | null {
  const unit = state.onions?.[unitId] ?? state.defenders[unitId]
  if (!unit) return null

  const movementAllowance = movementAllowanceFor(state, unitId)
  if (movementAllowance <= 0) return null

  const moveMap = buildMoveMapSnapshot(map, state, unitId)
  const reachableMoves = listReachableMoves({
    map: moveMap,
    from: unit.position,
    movementAllowance,
    movingRole: state.onions?.[unitId] ? 'onion' : 'defender',
    movingUnitType: unit.typeId,
    incomingSquads: getUnitDefinition(unit.typeId)?.squads,
  })

  const candidates: Array<{ position: HexPos; distance: number; cost: number }> = []

  for (const move of reachableMoves) {
    if (isOccupied(state, move.to, unitId)) continue

    candidates.push({
      position: move.to,
      distance: hexDistance(move.to, target),
      cost: move.cost,
    })
  }

  candidates.sort((left, right) => {
    if (left.distance !== right.distance) return left.distance - right.distance
    if (left.cost !== right.cost) return left.cost - right.cost
    if (left.position.q !== right.position.q) return left.position.q - right.position.q
    return left.position.r - right.position.r
  })

  return candidates[0]?.position ?? null
}

type ExpectedAction =
  | { type: 'MOVE'; movers?: ReadonlyArray<string>; unitId?: string; to: HexPos }
  | Extract<Command, { type: 'FIRE' }>
  | Extract<Command, { type: 'END_PHASE' }>
type ActionResult = { ok?: boolean; events?: EventEnvelope[] }

export function applyActionToExpectedState(expected: ExpectedState, action: ExpectedAction, result: ActionResult) {
  if (!result?.ok) return

  if (action.type === 'MOVE') {
    const moverIds = 'movers' in action && Array.isArray(action.movers)
      ? action.movers
      : 'unitId' in action && typeof action.unitId === 'string'
        ? [action.unitId]
        : []

    for (const moverId of moverIds) {
      if (expected.onions[moverId]) {
        expected.onions[moverId].position = clone(action.to)
      } else if (expected.defenders[moverId]) {
        expected.defenders[moverId].position = clone(action.to)
      }
    }
  }

  if (!result.events) return

  for (const event of result.events) {
    if (event.type === 'FIRE_RESOLVED' && Array.isArray(event.attackers)) {
      for (const attacker of event.attackers.filter((value): value is string => typeof value === 'string')) {
        // If attacker is a defender unit ID, mark their first ready weapon as spent
        if (expected.defenders[attacker] && expected.defenders[attacker].weapons) {
          const defender = expected.defenders[attacker]
          for (const weapon of defender.weapons) {
            if (weapon.state === 'ready') {
              weapon.state = 'spent'
              break // Only mark the first ready weapon
            }
          }
        }
      }
    }

    if (event.type === 'UNIT_STATUS_CHANGED' && typeof event.unitId === 'string' && typeof event.to === 'string' && expected.defenders[event.unitId]) {
      expected.defenders[event.unitId].state = event.to as DefenderUnit['state']
    }
    if (event.type === 'UNIT_SQUADS_LOST' && typeof event.unitId === 'string' && expected.defenders[event.unitId]) {
      expected.defenders[event.unitId].squads = Math.max(0, (expected.defenders[event.unitId].squads ?? 1) - Number(event.amount ?? 0))
      if (expected.defenders[event.unitId].squads === 0) {
        expected.defenders[event.unitId].state = 'destroyed'
      }
    }
    if (event.type === 'ONION_TREADS_LOST') {
      const actionOnionId = 'onionId' in action ? action.onionId : undefined
      const onionId = typeof event.unitId === 'string' ? event.unitId : actionOnionId ?? Object.keys(expected.onions)[0]
      if (expected.onions[onionId] && typeof event.remaining === 'number') expected.onions[onionId].treads = event.remaining
    }
  }
}

export function assertStateMatches(apiState: GameState, expected: ExpectedState) {
  const actualOnionIds = Object.keys(apiState.onions || {}).sort()
  const expectedOnionIds = Object.keys(expected.onions).sort()
  expect(actualOnionIds, `Onion unit IDs mismatch\nExpected: ${JSON.stringify(expectedOnionIds)}\nActual: ${JSON.stringify(actualOnionIds)}`).toEqual(expectedOnionIds)

  for (const unitId of expectedOnionIds) {
    const actualOnion = apiState.onions[unitId]
    const expectedOnion = expected.onions[unitId]
    expect(actualOnion, `apiState.onions missing unitId: ${unitId}`).toBeTruthy()
    expect(actualOnion.position).toEqual(expectedOnion.position)
    expect(actualOnion.unitId).toBe(unitId)
    expect(actualOnion.typeId).toBe(expectedOnion.typeId)
    expect(actualOnion.state).toBe(expectedOnion.state)
    if (expectedOnion.treads !== undefined) expect(actualOnion.treads).toBe(expectedOnion.treads)
  }

  // Check all expected individual defenders are present and match, order-insensitive
  const expectedUnitIds = Object.keys(expected.defenders).sort()
  const actualUnitIds = Object.keys(apiState.defenders || {}).sort()
  expect(actualUnitIds, `Defender unit IDs mismatch\nExpected: ${JSON.stringify(expectedUnitIds)}\nActual: ${JSON.stringify(actualUnitIds)}`).toEqual(expectedUnitIds)

  for (const unitId of expectedUnitIds) {
    expect(apiState.defenders[unitId], `apiState.defenders missing unitId: ${unitId}`).toBeTruthy()
    // Compare position and status for each unit
    expect(apiState.defenders[unitId].position, `Missing position for unitId: ${unitId}`).toBeDefined()
    expect(apiState.defenders[unitId].position).toEqual(expected.defenders[unitId].position)
    expect(apiState.defenders[unitId].unitId).toBe(unitId)
    expect(apiState.defenders[unitId].typeId).toBe(expected.defenders[unitId].typeId)
    expect(apiState.defenders[unitId].state).toBe(expected.defenders[unitId].state)
  }

  // If expected.stackRoster exists, check stack groups and memberships
  if (expected.stackRoster && expected.stackRoster.groupsById) {
    expect(apiState.stackRoster && apiState.stackRoster.groupsById, 'apiState.stackRoster.groupsById missing').toBeTruthy()
    for (const [groupId, expectedGroup] of Object.entries(expected.stackRoster.groupsById as Record<string, ScenarioStackRosterGroup>)) {
      const actualGroup = apiState.stackRoster.groupsById[groupId]
      expect(actualGroup, `Missing stack group ${groupId} in apiState.stackRoster`).toBeTruthy()
      // Compare unitIds as sets (order-insensitive)
      const expectedUnitIds = (expectedGroup.unitIds || []).slice().sort()
      const actualUnitIds = (actualGroup.unitIds || []).slice().sort()
      expect(actualUnitIds, `Stack group ${groupId} unitIds mismatch\nExpected: ${JSON.stringify(expectedUnitIds)}\nActual: ${JSON.stringify(actualUnitIds)}`).toEqual(expectedUnitIds)
    }
  }
}
