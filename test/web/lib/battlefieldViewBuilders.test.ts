import { describe, expect, it } from 'vitest'
import { makeDefender, makeOnion, makeScenarioSnapshot, makeWeapon, type ScenarioSnapshotOptions } from '#test/utils/gameStateUtils'
import { getUnitTypeCatalog, getWeaponTypeCatalog } from '#shared/unitDefinitions'
import { createSessionCatalog } from '../../../web/lib/sessionCatalog'
import {
  buildBattlefieldDefenderView,
  buildBattlefieldOnionView,
  buildCombatRangeSources,
  buildLiveDefenders,
  buildLiveOnion,
  buildLiveOnions,
  buildScenarioMap,
  getDisplayDefense,
  getPhaseAdvanceLabel,
  getPhaseOwner,
  getTerrainValueAt,
} from '../../../web/lib/battlefieldViewBuilders'
import type { ServerGameSnapshot } from '../../../web/lib/gameClient'
import { isUnitMoveEligible } from '../../../web/lib/battlefieldView'
import { makeMixedSideInitialState } from '#test/utils/mixedSideScenario'
import { normalizeInitialStateToGameState } from '#server/engine/scenarioNormalizer'

const catalog = createSessionCatalog(getUnitTypeCatalog(), getWeaponTypeCatalog())

function createLiveSnapshot(overrides: ScenarioSnapshotOptions = {}): ServerGameSnapshot {
  const { authoritativeState, scenarioMap, ...snapshotOverrides } = overrides
  const snapshot = makeScenarioSnapshot({
    gameId: 123,
    phase: 'DEFENDER_MOVE',
    scenarioName: 'Builder scenario',
    lastEventSeq: 4,
    ...snapshotOverrides,
    authoritativeState: {
      onions: {
        'onion-1': makeOnion({ unitId: 'onion-1', position: { q: 0, r: 0 } }),
      },
      defenders: {
        'pigs-1': makeDefender({ unitId: 'pigs-1', typeId: 'LittlePigs', position: { q: 1, r: 1 }, state: 'operational' }),
        'pigs-2': makeDefender({ unitId: 'pigs-2', typeId: 'LittlePigs', position: { q: 1, r: 1 }, state: 'destroyed' }),
        'wolf-1': makeDefender({ unitId: 'wolf-1', typeId: 'BigBadWolf', position: { q: 2, r: 2 }, state: 'operational', movementSpent: { DEFENDER_MOVE: 4 } }),
      },
      ...authoritativeState,
    },
    scenarioMap: {
      width: 3,
      height: 3,
      cells: [{ q: 0, r: 0 }, { q: 1, r: 1 }, { q: 2, r: 2 }],
      hexes: [{ q: 0, r: 0, t: 0 }, { q: 1, r: 1, t: 1 }, { q: 2, r: 2, t: 2 }],
      ...scenarioMap,
    },
  })

  return {
    ...snapshot,
    ...('authoritativeState' in overrides && authoritativeState === undefined ? { authoritativeState: undefined } : {}),
    ...('scenarioMap' in overrides && scenarioMap === undefined ? { scenarioMap: undefined } : {}),
  }
}

describe('battlefieldViewBuilders', () => {
  it('resolves phase ownership and advancement labels', () => {
    expect(getPhaseOwner('DEFENDER_COMBAT')).toBe('defender')
    expect(getPhaseAdvanceLabel('ONION_MOVE', 'onion')).toBe('Start Combat')
  })

  it('projects defenders with canonical dynamic fields and contextual movement data', () => {
    const view = buildBattlefieldDefenderView(
      makeDefender({
        unitId: 'pigs-1',
        typeId: 'LittlePigs',
        position: { q: 2, r: 3 },
        state: 'operational',
        weapons: [makeWeapon({ id: 'rifle-1', typeId: 'LittlePigs.rifle' })],
      }),
      { move: 2, stackSize: 3, activePhase: 'DEFENDER_MOVE', activeTurnActive: true },
    )

    expect(view).toMatchObject({
      unitId: 'pigs-1',
      typeId: 'LittlePigs',
      state: 'operational',
      position: { q: 2, r: 3 },
      movesRemaining: 2,
      stackSize: 3,
      weapons: [{ id: 'rifle-1', typeId: 'LittlePigs.rifle' }],
    })
    expect(view).not.toHaveProperty('id')
    expect(view).not.toHaveProperty('type')
    expect(view).not.toHaveProperty('status')
    expect(view).not.toHaveProperty('move')
    expect(view).not.toHaveProperty('q')
    expect(view).not.toHaveProperty('r')
    expect(isUnitMoveEligible(view, 'DEFENDER_MOVE', 'defender')).toBe(true)
  })

  it('projects onions with canonical dynamic fields and contextual movement data', () => {
    const view = buildBattlefieldOnionView(
      makeOnion({
        unitId: 'onion-1',
        position: { q: 1, r: 4 },
        state: 'operational',
        weapons: [makeWeapon({ id: 'main-1', typeId: 'TheOnion.main' })],
      }),
      { movesAllowed: 3, movesRemaining: 1 },
    )

    expect(view).toMatchObject({
      unitId: 'onion-1',
      typeId: 'TheOnion',
      state: 'operational',
      position: { q: 1, r: 4 },
      movesAllowed: 3,
      movesRemaining: 1,
      ramsRemaining: 2,
      weapons: [{ id: 'main-1', typeId: 'TheOnion.main' }],
    })
    expect(view).not.toHaveProperty('id')
    expect(view).not.toHaveProperty('type')
    expect(view).not.toHaveProperty('status')
    expect(view).not.toHaveProperty('rams')
    expect(isUnitMoveEligible(view, 'ONION_MOVE', 'onion')).toBe(true)
  })

  it('orders live defenders with operational units before destroyed units and resolves stack size', () => {
    const views = buildLiveDefenders(createLiveSnapshot(), 'DEFENDER_MOVE', true)

    expect(views.map((unit) => unit.unitId)).toEqual(['pigs-1', 'wolf-1', 'pigs-2'])
    expect(views.find((unit) => unit.unitId === 'pigs-1')).toMatchObject({ stackSize: 1, movesRemaining: 1 })
    expect(views.find((unit) => unit.unitId === 'wolf-1')).toMatchObject({ stackSize: 1, movesRemaining: 0 })
    expect(buildLiveDefenders(createLiveSnapshot({ authoritativeState: undefined }), 'DEFENDER_MOVE', true)).toEqual([])
  })

  it('derives Onion movement allowance and rejects snapshots without authoritative state', () => {
    const snapshot = createLiveSnapshot({ phase: 'ONION_MOVE' })
    const onion = buildLiveOnion(snapshot, 'ONION_MOVE')

    expect(onion.movesAllowed).toBeGreaterThan(0)
    expect(onion.movesRemaining).toBe(onion.movesAllowed)
    expect(buildLiveOnions(createLiveSnapshot(), null)[0]?.movesAllowed).toBe(0)
    expect(() => buildLiveOnions(createLiveSnapshot({ authoritativeState: undefined }), 'ONION_MOVE')).toThrow('Missing authoritative state')
    expect(() => buildLiveOnion(createLiveSnapshot({ authoritativeState: { onions: {}, defenders: {} } }), 'ONION_MOVE')).toThrow('Missing authoritative onion')
  })

  it('projects mixed-side runtime units with side-aware movement allowances', () => {
    const state = normalizeInitialStateToGameState(makeMixedSideInitialState())
    const snapshot = createLiveSnapshot({
      phase: 'ONION_MOVE',
      authoritativeState: state,
    })

    const onionSidePuss = buildLiveOnions(snapshot, 'ONION_MOVE').find((unit) => unit.unitId === 'onion-puss')
    const defenderSideOnion = buildLiveDefenders(snapshot, 'DEFENDER_MOVE', true).find((unit) => unit.unitId === 'defender-onion')

    expect(onionSidePuss).toMatchObject({
      typeId: 'Puss',
      role: 'onion',
      side: 'onion',
      movesAllowed: 3,
      movesRemaining: 3,
    })
    expect(defenderSideOnion).toMatchObject({
      typeId: 'TheOnion',
      role: 'defender',
      side: 'defender',
      movesRemaining: 3,
    })
  })

  it('validates and reads scenario map data', () => {
    const snapshot = createLiveSnapshot()

    expect(buildScenarioMap(null)).toBeNull()
    expect(buildScenarioMap(snapshot)).toEqual(snapshot.scenarioMap)
    expect(getTerrainValueAt(snapshot.scenarioMap, 1, 1)).toBe(1)
    expect(getTerrainValueAt(snapshot.scenarioMap, 9, 9)).toBeUndefined()
    expect(() => buildScenarioMap(createLiveSnapshot({ scenarioMap: undefined }))).toThrow('missing scenario map data')
    expect(() => buildScenarioMap(createLiveSnapshot({ scenarioMap: { ...snapshot.scenarioMap!, cells: undefined as never } }))).toThrow('missing scenario map cells')
  })

  it('computes display defense from unit type, squads, and terrain', () => {
    expect(getDisplayDefense('LittlePigs', 3, 1)).toBe(4)
    expect(getDisplayDefense('LittlePigs', undefined, 0)).toBe(1)
    expect(getDisplayDefense('BigBadWolf', undefined, undefined)).toBe(4)
    expect(getDisplayDefense('unknown', undefined, undefined)).toBe(0)
  })

  it('builds combat ranges only from selected ready weapons and live defenders', () => {
    const onion = buildBattlefieldOnionView(makeOnion({
      position: { q: 0, r: 0 },
      weapons: [
        makeWeapon({ id: 'ready', typeId: 'TheOnion.main', state: 'ready' }),
        makeWeapon({ id: 'spent', typeId: 'TheOnion.secondary_1', state: 'spent' }),
      ],
    }))
    const defender = buildBattlefieldDefenderView(makeDefender({
      unitId: 'pigs-1',
      position: { q: 1, r: 1 },
      weapons: [makeWeapon({ id: 'ready', typeId: 'LittlePigs.rifle', state: 'ready' })],
    }), { activePhase: 'DEFENDER_COMBAT', activeTurnActive: true })
    const destroyed = buildBattlefieldDefenderView(makeDefender({ unitId: 'destroyed', state: 'destroyed' }))

    expect(buildCombatRangeSources('ONION_COMBAT', 'onion', ['weapon:ready', 'weapon:spent'], [], onion, catalog)).toEqual([
      { q: 0, r: 0, range: expect.any(Number) },
    ])
    expect(buildCombatRangeSources('DEFENDER_COMBAT', 'defender', ['pigs-1'], [defender, destroyed], onion, catalog)).toEqual([
      { q: 1, r: 1, range: expect.any(Number) },
    ])
    expect(buildCombatRangeSources(null, null, [], [], null, catalog)).toEqual([])
    expect(buildCombatRangeSources('ONION_COMBAT', 'onion', ['weapon:ready'], [], null, catalog)).toEqual([])
  })
})