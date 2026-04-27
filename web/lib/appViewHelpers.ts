import { getUnitMovementAllowance, getUnitRamCapacity } from '../../shared/unitMovement'
import type { TargetRules, TurnPhase, UnitStatus, Weapon } from '../../shared/types/index'
import type { ApiProtocolTrafficEntry } from '../../shared/apiProtocol'
import type { BattlefieldOnionView, BattlefieldUnit, Mode, TerrainHex } from './battlefieldView'
import type { GameSnapshot, StackActionSelection } from './gameClient'
import type { LiveConnectionStatus } from './gameSessionTypes'
import { buildFriendlyName } from '../../shared/unitDefinitions'
import type { StackNamingSnapshot } from '../../shared/stackNaming'
import { buildStackGroupKey, resolveStackLabel, resolveStackLabelFromSnapshot } from '../../shared/stackNaming'
import { resolveSelectionName } from './resolveSelectionName'

export function resolveBattlefieldUnitName(unitType: string, unitId: string | undefined, friendlyName?: string): string {
  return resolveSelectionName({
    kind: 'unit',
    unitId,
    unitType,
    friendlyName,
  })
}

export function isBattlefieldUnitCombatReady(unit: { actionableModes: ReadonlyArray<Mode> }): boolean {
  return unit.actionableModes.includes('fire')
}

const STACK_MEMBER_SELECTION_PREFIX = 'stack-member:'

export function getBattlefieldStackSize(unit: { squads?: number }): number {
  return Math.max(unit.squads ?? 1, 1)
}

export function resolveBattlefieldStackLabel(
  unitType: string,
  unitId: string | undefined,
  friendlyName?: string,
  stackSize = 1,
  groupKey?: string,
  stackNaming?: StackNamingSnapshot,
): string {
  if (groupKey !== undefined) {
    if (stackNaming !== undefined) {
      return resolveSelectionName({ kind: 'group', groupKey, stackNaming })
    }

    return resolveStackLabelFromSnapshot(stackNaming, groupKey, unitType, unitId, friendlyName, stackSize)
  }

  return resolveStackLabel(unitType, unitId, friendlyName, stackSize)
}

export function resolveBattlefieldDisplayName(
  unit: {
    id: string
    type: string
    q: number
    r: number
    friendlyName?: string
    squads?: number
  },
  stackNaming?: StackNamingSnapshot,
): string {
  if (stackNaming !== undefined) {
    const groupKey = buildStackGroupKey(unit.type, { q: unit.q, r: unit.r })
    const group = stackNaming.groupsInUse.find((entry) => entry.groupKey === groupKey)
    if (group !== undefined) {
      return resolveSelectionName({ kind: 'group', groupKey: group.groupKey, stackNaming })
    }
  }

  const stackSize = getBattlefieldStackSize(unit)
  if (stackSize > 1) {
    return resolveStackLabel(unit.type, unit.id, unit.friendlyName, stackSize)
  }

  return resolveSelectionName({
    kind: 'unit',
    unitId: unit.id,
    unitType: unit.type,
    friendlyName: unit.friendlyName,
  })
}

type StackSourceUnit = {
  id: string
  type: string
  position: { q: number; r: number }
  status: string
  squads?: number
}

type StackSourceState = {
  onion?: StackSourceUnit | null
  defenders?: Record<string, StackSourceUnit>
  stackRoster?: {
    groupsById?: Record<string, {
      unitIds?: string[]
    }>
  }
}

export function resolveBattlefieldStackMemberIds(state: StackSourceState | null | undefined, unitId: string): string[] {
  if (state === null || state === undefined) {
    return [unitId]
  }

  if (state.onion !== undefined && state.onion !== null && state.onion.id === unitId) {
    return [state.onion.id]
  }

  const selectedUnit = state.defenders?.[unitId]
  if (selectedUnit === undefined) {
    return [unitId]
  }

  const rosterGroups = Object.values(state.stackRoster?.groupsById ?? {})
  for (const group of rosterGroups) {
    const unitIds = group.unitIds ?? []
    if (!unitIds.includes(unitId)) {
      continue
    }

    const activeMemberIds = unitIds.filter((memberId) => state.defenders?.[memberId]?.status !== 'destroyed')
    if (activeMemberIds.length > 0) {
      return activeMemberIds
    }

    return [unitId]
  }

  return [unitId]
}

export function buildStackMemberSelectionId(unitId: string, memberIndex: number): string {
  return `${STACK_MEMBER_SELECTION_PREFIX}${unitId}:${memberIndex}`
}

export function isStackMemberSelectionId(selectionId: string): boolean {
  return selectionId.startsWith(STACK_MEMBER_SELECTION_PREFIX)
}

export function parseStackMemberSelectionId(selectionId: string): { unitId: string; memberIndex: number } | null {
  const match = /^stack-member:([^:]+):(\d+)$/.exec(selectionId)
  if (match === null) {
    return null
  }

  return {
    unitId: match[1],
    memberIndex: Number.parseInt(match[2], 10),
  }
}

export function resolveSelectionOwnerUnitId(selectionId: string): string {
  return parseStackMemberSelectionId(selectionId)?.unitId ?? selectionId
}

export function resolveBattlefieldStackSelectionIds(state: StackSourceState | null | undefined, unitId: string): string[] {
  return resolveBattlefieldStackMemberIds(state, unitId)
}

export function countSelectedBattlefieldStackMembers(
  state: StackSourceState | null | undefined,
  unitId: string,
  selectedUnitIds: ReadonlyArray<string>,
): number {
  const stackedUnitIds = resolveBattlefieldStackMemberIds(state, unitId)
  if (stackedUnitIds.length > 1) {
    return stackedUnitIds.filter((memberId) => selectedUnitIds.includes(memberId)).length
  }

  return selectedUnitIds.some((selectionId) => resolveSelectionOwnerUnitId(selectionId) === unitId) ? 1 : 0
}

export function countSelectedBattlefieldStackGroups(
  state: StackSourceState | null | undefined,
  selectedUnitIds: ReadonlyArray<string>,
): number {
  const selectedGroupKeys = new Set<string>()

  for (const selectedUnitId of selectedUnitIds) {
    const resolvedUnitId = resolveSelectionOwnerUnitId(selectedUnitId)
    const selectedGroupIds = resolveBattlefieldStackMemberIds(state, resolvedUnitId)
    selectedGroupKeys.add(selectedGroupIds.join('|'))
  }

  return selectedGroupKeys.size
}

export function buildClientStackSelection(
  state: StackSourceState | null | undefined,
  anchorUnitId: string | null,
  selectedUnitIds: string[],
): StackActionSelection | null {
  if (anchorUnitId === null) {
    return null
  }

  const availableUnitIds = resolveBattlefieldStackSelectionIds(state, anchorUnitId)
  if (availableUnitIds.length <= 1) {
    return null
  }

  const filteredSelectedUnitIds = selectedUnitIds.filter((unitId) => availableUnitIds.includes(unitId))

  return {
    anchorUnitId,
    availableUnitIds,
    selectedUnitIds: filteredSelectedUnitIds.length > 0 ? filteredSelectedUnitIds : availableUnitIds,
  }
}

export function resolveBattlefieldWeaponName(weapon: Weapon): string {
  const explicitFriendlyName = weapon.friendlyName?.trim()
  if (explicitFriendlyName !== undefined && explicitFriendlyName.length > 0) {
    return explicitFriendlyName
  }

  if (weapon.friendlyNameTemplate !== undefined) {
    return buildFriendlyName(weapon.friendlyNameTemplate, weapon.id)
  }

  return weapon.name
}

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

export function parseWeaponStats(weaponString: string) {
  const weapons = weaponString.split(',').map((w) => w.trim())
  let operationalWeapons = 0
  let operationalMissiles = 0

  for (const weapon of weapons) {
    if (weapon.includes('ready')) {
      if (weapon.toLowerCase().includes('missile')) {
        operationalMissiles++
      } else {
        operationalWeapons++
      }
    }
  }

  return { operationalWeapons, operationalMissiles }
}

export function parseAttackStats(attackString: string) {
  const parts = attackString.split('/')
  const damage = parts[0].trim()
  const range = parts[1]?.includes('rng') ? parts[1].trim().replace('rng', '').trim() : '0'
  return { damage, range }
}

export function formatWeaponSummary(weapons: ReadonlyArray<Weapon> | undefined) {
  if (weapons === undefined || weapons.length === 0) {
    return 'n/a'
  }

  return weapons.map((weapon) => `${weapon.id}: ${weapon.status}`).join(', ')
}

export function formatAttackSummary(weapons: ReadonlyArray<Weapon> | undefined) {
  if (weapons === undefined || weapons.length === 0) {
    return '0 / rng 0'
  }

  const primaryWeapon = weapons.reduce((strongest, weapon) => {
    if (weapon.attack > strongest.attack) {
      return weapon
    }

    if (weapon.attack === strongest.attack && weapon.range > strongest.range) {
      return weapon
    }

    return strongest
  })

  return `${primaryWeapon.attack} / rng ${primaryWeapon.range}`
}

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

export function getReadyWeaponRange(weapons: ReadonlyArray<Weapon> | undefined): number {
  if (weapons === undefined || weapons.length === 0) {
    return 0
  }

  return weapons
    .filter((weapon) => weapon.status === 'ready')
    .reduce((maxRange, weapon) => Math.max(maxRange, weapon.range), 0)
}

export function parseRangeValue(rangeText: string): number {
  const parsedRange = Number.parseInt(rangeText, 10)
  return Number.isNaN(parsedRange) ? 0 : parsedRange
}

export function getTerrainValueAt(scenarioMap: { width: number; height: number; cells?: Array<{ q: number; r: number }>; hexes: TerrainHex[] } | null | undefined, q: number, r: number): number | undefined {
  return scenarioMap?.hexes.find((hex) => hex.q === q && hex.r === r)?.t
}

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

export function isWeaponSelectionId(selectionId: string) {
  return selectionId.startsWith('weapon:')
}

export function stripWeaponSelectionId(selectionId: string) {
  return selectionId.replace(/^weapon:/, '')
}

export function buildWeaponSelectionId(weaponId: string) {
  return `weapon:${weaponId}`
}

export function buildCombatTargetActionId(targetId: string, onionId: string | undefined): string {
  if (targetId.startsWith('weapon:')) {
    return stripWeaponSelectionId(targetId)
  }

  if (targetId.endsWith(':treads')) {
    return onionId ?? targetId
  }

  return targetId
}

export function normalizeSelectionIds(selectedIds: readonly string[] | null | undefined, allowedIds: readonly string[]): string[] {
  const allowedIdSet = new Set(allowedIds)
  return Array.from(new Set((selectedIds ?? []).filter((selectionId) => allowedIdSet.has(selectionId))))
}

export function getActionableModes(status: UnitStatus | undefined, weapons: ReadonlyArray<Weapon> | undefined, activeTurnActive: boolean, activePhase: TurnPhase | null): Mode[] {
  if (status === 'destroyed' || status === 'disabled') {
    return []
  }

  const hasReadyWeapon = (weapons ?? []).some((weapon) => weapon.status === 'ready')
  if (activePhase === 'DEFENDER_COMBAT') {
    return hasReadyWeapon ? ['fire', 'combined'] : []
  }

  if (activePhase === 'ONION_COMBAT') {
    return []
  }

  if (!activeTurnActive) {
    return []
  }

  return hasReadyWeapon ? ['fire', 'combined'] : []
}

export function buildLiveDefenders(snapshot: GameSnapshot, activePhase: TurnPhase | null, activeTurnActive: boolean): BattlefieldUnit[] {
  const authoritativeState = snapshot.authoritativeState

  if (authoritativeState === undefined) {
    return []
  }

  const movementRemainingByUnit = snapshot.movementRemainingByUnit ?? {}
  const defenderEntries = Object.entries(
    authoritativeState.defenders as Record<
      string,
      {
        id?: string
        type: string
        status: UnitStatus
        position: { q: number; r: number }
        weapons?: ReadonlyArray<Weapon>
        squads?: number
        friendlyName?: string
        targetRules?: TargetRules
      }
    >,
  )

  return defenderEntries
    .map(([defenderId, defender], index) => {
      const resolvedDefenderId = defender.id ?? defenderId
      const snapshotMovementRemaining = movementRemainingByUnit[resolvedDefenderId]

      return {
        id: resolvedDefenderId,
        type: defender.type,
      friendlyName: resolveBattlefieldUnitName(defender.type, resolvedDefenderId, defender.friendlyName),
        status: defender.status,
        q: defender.position.q,
        r: defender.position.r,
        move: activePhase === null ? 0 : snapshotMovementRemaining ?? 0,
        weapons: formatWeaponSummary(defender.weapons),
        attack: formatAttackSummary(defender.weapons),
        weaponDetails: defender.weapons ?? [],
        targetRules: defender.targetRules,
        defense: getDisplayDefense(defender.type, defender.squads, getTerrainValueAt(snapshot.scenarioMap, defender.position.q, defender.position.r)),
        squads: defender.squads,
        actionableModes: getActionableModes(defender.status, defender.weapons, activeTurnActive, activePhase),
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

export function buildLiveOnion(snapshot: GameSnapshot, activePhase: TurnPhase | null): BattlefieldOnionView {
  const authoritativeState = snapshot.authoritativeState

  if (authoritativeState === undefined) {
    throw new Error('Missing authoritative state')
  }

  const onion = authoritativeState.onion
  const movementRemainingByUnit = snapshot.movementRemainingByUnit ?? {}
  const movesAllowed = activePhase === null ? 0 : getUnitMovementAllowance('TheOnion', activePhase, onion.treads)
  const movesRemaining = activePhase === null ? 0 : movementRemainingByUnit[onion.id ?? 'onion-1'] ?? movesAllowed
  const ramCapacity = getUnitRamCapacity(onion.type ?? 'TheOnion')
  const ramsRemaining = Math.max(ramCapacity - (authoritativeState.ramsThisTurn ?? 0), 0)

  return {
    id: onion.id ?? 'onion-1',
    type: onion.type ?? 'TheOnion',
    friendlyName: resolveBattlefieldUnitName(onion.type ?? 'TheOnion', onion.id ?? 'onion-1', onion.friendlyName),
    q: onion.position.q,
    r: onion.position.r,
    status: onion.status ?? 'operational',
    treads: onion.treads,
    movesAllowed,
    movesRemaining,
    rams: ramsRemaining,
    weapons: formatWeaponSummary(onion.weapons),
    weaponDetails: onion.weapons ?? [],
    targetRules: onion.targetRules,
  }
}

export function buildScenarioMap(snapshot: GameSnapshot | null): { width: number; height: number; cells: Array<{ q: number; r: number }>; hexes: TerrainHex[] } | null {
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

export function buildCombatRangeSources(
  phase: TurnPhase | null,
  activeCombatRole: 'onion' | 'defender' | null,
  activeSelectedUnitIds: ReadonlyArray<string>,
  displayedDefenders: ReadonlyArray<BattlefieldUnit>,
  displayedOnion: BattlefieldOnionView | null,
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
      .filter((weapon) => weapon.status === 'ready' && selectedWeaponIds.has(weapon.id))
      .map((weapon) => ({
        q: displayedOnion.q,
        r: displayedOnion.r,
        range: weapon.range,
      }))
  }

  return displayedDefenders
    .filter((unit) => unit.status !== 'destroyed')
    .filter((unit) => activeSelectedUnitIds.some((selectionId) => resolveSelectionOwnerUnitId(selectionId) === unit.id))
    .map((unit) => ({
      q: unit.q,
      r: unit.r,
      range: getReadyWeaponRange(unit.weaponDetails),
    }))
}