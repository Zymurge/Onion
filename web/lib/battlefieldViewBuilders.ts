import { getUnitMovementAllowance } from '../../shared/unitMovement.js'
import type { ApiProtocolTrafficEntry } from '../../shared/apiProtocol.js'
import type { DefenderUnit, OnionUnit, TurnPhase } from '../../shared/types/index.js'
import type { BattlefieldOnionView, BattlefieldUnit, TerrainHex } from './battlefieldView.js'
import type { ServerGameSnapshot } from './gameClient.js'
import type { LiveConnectionStatus } from './gameSessionTypes.js'
import { getSessionUnitType, getSessionWeaponType, type SessionCatalog } from './sessionCatalog.js'
import { buildStackRosterIndex } from '../../shared/stackRoster.js'
import {
  resolveBattlefieldUnitName,
} from './battlefieldNaming.js'
import {
  isWeaponSelectionId,
  resolveSelectionOwnerUnitId,
  stripWeaponSelectionId,
} from './selectionIds.js'
import {
  formatAttackSummary,
  formatWeaponSummary,
  getActionableModes,
  getReadyWeaponRange,
} from './weaponStats.js'

/** Resolves the role owning a turn phase. */
export function getPhaseOwner(phase: TurnPhase | null): 'onion' | 'defender' | null {
  if (phase === null) {
    return null
  }

  if (phase.startsWith('ONION_')) {
    return 'onion'
  }

  if (phase.startsWith('DEFENDER_') || phase === 'GEV_SECOND_MOVE') {
    return 'defender'
  }

  return null
}

/** Resolves the phase-advance button label for a viewer role. */
export function getPhaseAdvanceLabel(phase: TurnPhase | null, role: 'onion' | 'defender' | null): string | null {
  if (phase === null || role === null) {
    return null
  }

  switch (phase) {
    case 'ONION_MOVE':
      return role === 'onion' ? 'Start Combat' : null
    case 'ONION_COMBAT':
      return role === 'onion' ? 'End Turn' : null
    case 'DEFENDER_MOVE':
      return role === 'defender' ? 'Start Combat' : null
    case 'DEFENDER_COMBAT':
      return role === 'defender' ? 'Begin Secondary Move' : null
    case 'GEV_SECOND_MOVE':
      return role === 'defender' ? 'End Turn' : null
    case 'DEFENDER_RECOVERY':
      return null
  }

  return null
}

/** Formats a live connection state for display. */
export function formatLiveConnectionStatus(connectionStatus: LiveConnectionStatus) {
  switch (connectionStatus) {
    case 'connected':
      return 'Connected'
    case 'connecting':
      return 'Connecting'
    case 'reconnecting':
      return 'Reconnecting'
    case 'disconnected':
      return 'Disconnected'
    case 'idle':
      return 'Idle'
  }
}

/** Formats one API traffic entry for the debug panel. */
export function formatDebugEntrySummary(entry: ApiProtocolTrafficEntry) {
  const time = new Date(entry.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const arrow = entry.direction === 'request' ? '→' : entry.direction === 'response' ? '←' : '!'
  const parts = [`[${time}]`, `${arrow} ${entry.method} ${entry.path}`]

  if (entry.status !== undefined) {
    parts.push(`status ${entry.status}`)
  }

  if (entry.message !== undefined) {
    parts.push(entry.message)
  }

  return parts.join(' ')
}

/** Reads a terrain value at a scenario-map coordinate. */
export function getTerrainValueAt(scenarioMap: { width: number; height: number; cells?: ReadonlyArray<{ q: number; r: number }>; hexes: ReadonlyArray<TerrainHex> } | null | undefined, q: number, r: number): number | undefined {
  return scenarioMap?.hexes.find((hex) => hex.q === q && hex.r === r)?.t
}

/** Resolves display defense from unit type, stack size, and terrain. */
export function getDisplayDefense(type: string, squads: number | undefined, terrainType: number | undefined): number {
  if (type === 'LittlePigs') {
    const stackSize = squads ?? 1
    return stackSize + (terrainType === 1 ? 1 : 0)
  }

  switch (type) {
    case 'BigBadWolf':
      return 4
    case 'Puss':
      return 3
    case 'Witch':
      return 2
    case 'LordFarquaad':
      return 0
    case 'Pinocchio':
      return 3
    case 'Dragon':
      return 3
    case 'Swamp':
      return 0
    default:
      return 0
  }
}

/** Builds the display model for one defender. */
export function buildBattlefieldDefenderView(
  defender: DefenderUnit,
  {
    move = 0,
    stackSize = 1,
    terrainValue,
    activePhase = null,
    activeTurnActive = false,
    catalog,
  }: {
    move?: number
    stackSize?: number
    terrainValue?: number
    activePhase?: TurnPhase | null
    activeTurnActive?: boolean
    catalog?: SessionCatalog
  } = {},
): BattlefieldUnit {
  const weapons = defender.weapons ?? []
  const unitType = defender.typeId

  return {
    id: defender.unitId,
    type: unitType,
    role: 'defender',
    unitId: defender.unitId,
    typeId: unitType,
    state: defender.state,
    friendlyName: resolveBattlefieldUnitName(unitType, defender.unitId, defender.friendlyName),
    status: defender.state,
    position: defender.position,
    q: defender.position.q,
    r: defender.position.r,
    move,
    weapons,
    weaponSummary: formatWeaponSummary(weapons),
    attack: formatAttackSummary(weapons, catalog),
    weaponDetails: weapons,
    targetRules: catalog === undefined ? undefined : getSessionUnitType(catalog, unitType)?.targetRules,
    defense: getDisplayDefense(unitType, stackSize, terrainValue),
    squads: stackSize,
    actionableModes: getActionableModes(defender.state, weapons, activeTurnActive, activePhase),
  }
}

/** Builds the display model for one Onion. */
export function buildBattlefieldOnionView(
  onion: OnionUnit,
  {
    movesAllowed = 0,
    movesRemaining = 0,
    catalog,
  }: {
    movesAllowed?: number
    movesRemaining?: number
    catalog?: SessionCatalog
  } = {},
): BattlefieldOnionView {
  return {
    id: onion.unitId,
    type: onion.typeId,
    friendlyName: resolveBattlefieldUnitName(onion.typeId, onion.unitId, onion.friendlyName),
    position: onion.position,
    status: onion.state,
    treads: onion.treads,
    movesAllowed,
    movesRemaining,
    rams: onion.ramsRemaining,
    weapons: formatWeaponSummary(onion.weapons),
    weaponDetails: onion.weapons,
    targetRules: catalog === undefined ? undefined : getSessionUnitType(catalog, onion.typeId)?.targetRules,
  }
}

/** Builds ordered defender display models from a live snapshot. */
export function buildLiveDefenders(snapshot: ServerGameSnapshot, activePhase: TurnPhase | null, activeTurnActive: boolean, catalog?: SessionCatalog): BattlefieldUnit[] {
  const authoritativeState = snapshot.authoritativeState

  if (authoritativeState === undefined) {
    return []
  }

  const movementRemainingByUnit = snapshot.movementRemainingByUnit ?? {}
  const defenderEntries = Object.entries(authoritativeState.defenders)
  const stackRosterIndex = buildStackRosterIndex(authoritativeState.stackRoster, authoritativeState.defenders)

  return defenderEntries
    .map(([defenderId, defender], index) => {
      const resolvedDefenderId = defender.unitId || defenderId
      const snapshotMovementRemaining = movementRemainingByUnit[resolvedDefenderId]
      const rosterGroup = stackRosterIndex.getUnitGroup(resolvedDefenderId)
      const stackSize = rosterGroup === null
        ? 1
        : rosterGroup.units.filter((member) => member.state !== 'destroyed').length

      return {
        ...buildBattlefieldDefenderView(defender, {
          move: activePhase === null ? 0 : snapshotMovementRemaining ?? 0,
          stackSize: Math.max(stackSize, 1),
          activePhase,
          activeTurnActive,
          catalog,
          terrainValue: getTerrainValueAt(snapshot.scenarioMap, defender.position.q, defender.position.r),
        }),
        rosterOrder: index,
      }
    })
    .sort((left, right) => {
      const destroyedDelta = Number(left.status === 'destroyed') - Number(right.status === 'destroyed')

      if (destroyedDelta !== 0) {
        return destroyedDelta
      }

      return left.rosterOrder - right.rosterOrder
    })
    .map(({ rosterOrder, ...unit }) => {
      void rosterOrder

      return unit
    })
}

/** Returns the authoritative Onion display model from a live snapshot. */
export function buildLiveOnion(snapshot: ServerGameSnapshot, activePhase: TurnPhase | null, catalog?: SessionCatalog): BattlefieldOnionView {
  return buildLiveOnions(snapshot, activePhase, catalog)[0] ?? (() => {
    throw new Error('Missing authoritative onion')
  })()
}

/** Builds all Onion display models from a live snapshot. */
export function buildLiveOnions(snapshot: ServerGameSnapshot, activePhase: TurnPhase | null, catalog?: SessionCatalog): BattlefieldOnionView[] {
  const authoritativeState = snapshot.authoritativeState

  if (authoritativeState === undefined) {
    throw new Error('Missing authoritative state')
  }

  const movementRemainingByUnit = snapshot.movementRemainingByUnit ?? {}
  return Object.values(authoritativeState.onions).map((onion) => {
    const movesAllowed = activePhase === null ? 0 : getUnitMovementAllowance(onion.typeId, activePhase, onion.treads)
    const movesRemaining = activePhase === null ? 0 : movementRemainingByUnit[onion.unitId] ?? movesAllowed
    return buildBattlefieldOnionView(onion, { movesAllowed, movesRemaining, catalog })
  })
}

/** Validates and normalizes scenario-map data from a snapshot. */
export function buildScenarioMap(snapshot: ServerGameSnapshot | null): { width: number; height: number; cells: ReadonlyArray<{ q: number; r: number }>; hexes: ReadonlyArray<TerrainHex> } | null {
  if (snapshot === null) {
    return null
  }

  if (snapshot.scenarioMap === undefined || snapshot.scenarioMap === null) {
    throw new Error('Loaded game snapshot is missing scenario map data')
  }

  if (!Array.isArray(snapshot.scenarioMap.cells)) {
    throw new Error('Loaded game snapshot is missing scenario map cells')
  }

  return {
    width: snapshot.scenarioMap.width,
    height: snapshot.scenarioMap.height,
    cells: snapshot.scenarioMap.cells,
    hexes: snapshot.scenarioMap.hexes,
  }
}

/** Builds combat range overlays from current selections and display models. */
export function buildCombatRangeSources(
  phase: TurnPhase | null,
  activeCombatRole: 'onion' | 'defender' | null,
  activeSelectedUnitIds: ReadonlyArray<string>,
  displayedDefenders: ReadonlyArray<BattlefieldUnit>,
  displayedOnion: BattlefieldOnionView | null,
  catalog?: SessionCatalog,
) {
  if (phase === null || activeCombatRole === null) {
    return []
  }

  if (activeCombatRole === 'onion') {
    if (displayedOnion === null) {
      return []
    }

    const selectedWeaponIds = new Set(activeSelectedUnitIds.filter(isWeaponSelectionId).map(stripWeaponSelectionId))

    return (displayedOnion.weaponDetails ?? [])
      .filter((weapon) => weapon.state === 'ready' && selectedWeaponIds.has(weapon.id))
      .map((weapon) => ({
        q: displayedOnion.position.q,
        r: displayedOnion.position.r,
        range: catalog === undefined ? 0 : getSessionWeaponType(catalog, weapon.typeId).range,
      }))
  }

  return displayedDefenders
    .filter((unit) => unit.status !== 'destroyed')
    .filter((unit) => activeSelectedUnitIds.some((selectionId) => resolveSelectionOwnerUnitId(selectionId) === unit.id))
    .map((unit) => ({
      q: unit.q,
      r: unit.r,
      range: getReadyWeaponRange(unit.weaponDetails, catalog),
    }))
}