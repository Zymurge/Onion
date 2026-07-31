import { getUnitMovementAllowance } from '../../shared/unitMovement.js'
import type { DefenderMap, DefenderUnit, GameState, OnionUnit, TurnPhase, UnitState, UnitStatus, Weapon } from '../../shared/types/index.js'
import type { ApiProtocolTrafficEntry } from '../../shared/apiProtocol.js'
import type { BattlefieldOnionView, BattlefieldUnit, Mode, TerrainHex } from './battlefieldView.js'
import type { ServerGameSnapshot, StackActionSelection } from './gameClient.js'
import type { LiveConnectionStatus } from './gameSessionTypes.js'
import { buildFriendlyName, getUnitDefinition, getWeaponType, isUnitTypeStackable } from '../../shared/unitDefinitions.js'
import { formatCombatTargetId } from '../../shared/combatTarget.js'
import type { StackNamingSnapshot } from '../../shared/stackNaming.js'
import { buildStackGroupKey, resolveStackLabel } from '../../shared/stackNaming.js'
import type { StackRosterState } from '../../shared/types/index.js'
import { buildStackRosterIndex } from '../../shared/stackRoster.js'
import { resolveSelectionName } from './resolveSelectionName.js'

function isStackableUnitType(unitType: string | undefined): boolean {
  if (unitType === undefined) {
    return false
  }

  return isUnitTypeStackable(unitType)
}

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
    if (stackNaming === undefined) {
      throw new Error(`Missing stackNaming for grouped unit ${unitId ?? unitType} at ${groupKey}`)
    }

    return resolveSelectionName({ kind: 'group', groupKey, stackNaming })
  }

  return resolveStackLabel(unitType, unitId, friendlyName, stackSize)
}

export function resolveBattlefieldDisplayName(
  unit: {
    id: string
    type: string
    position?: { q: number; r: number }
    q?: number
    r?: number
    friendlyName?: string
    squads?: number
  },
  stackNaming?: StackNamingSnapshot,
): string {
  const position = unit.position ?? { q: unit.q ?? 0, r: unit.r ?? 0 }

  if (stackNaming !== undefined) {
    const groupKey = buildStackGroupKey(unit.type, position)
    const group = stackNaming.groupsInUse.find((entry) => entry.groupKey === groupKey)
    if (group !== undefined) {
      return resolveSelectionName({ kind: 'group', groupKey: group.groupKey, stackNaming })
    }

    if (getBattlefieldStackSize(unit) > 1) {
      throw new Error(`Missing stackNaming entry for grouped unit ${unit.id} at ${groupKey}`)
    }
  }

  return resolveSelectionName({
    kind: 'unit',
    unitId: unit.id,
    unitType: unit.type,
    friendlyName: unit.friendlyName,
  })
}

export function resolveBattlefieldFriendlyName(
  unit: {
    id: string
    type: string
    position?: { q: number; r: number }
    q?: number
    r?: number
    friendlyName?: string
  },
  stackNaming?: StackNamingSnapshot,
  stackRoster?: StackRosterState,
): string {
  const position = unit.position ?? { q: unit.q ?? 0, r: unit.r ?? 0 }
  const groupKey = buildStackGroupKey(unit.type, position)
  const rosterGroup = stackRoster === undefined
    ? null
    : Object.entries(stackRoster.groupsById ?? {})
      .map(([groupId, group]) => ({ groupId, group }))
      .find(({ group }) => Array.isArray(group.unitIds) && group.unitIds.includes(unit.id))
      ?.group ?? null
  const isStackable = isStackableUnitType(unit.type)
  const namingGroup = stackNaming?.groupsInUse.find((entry) => entry.groupKey === groupKey) ?? null

  if (isStackable) {
    if (stackRoster === undefined) {
      return resolveBattlefieldUnitName(unit.type, unit.id, unit.friendlyName)
    }

    if (stackNaming === undefined) {
      throw new Error(`Missing stackNaming for grouped unit ${unit.id}`)
    }

    if (rosterGroup === null) {
      throw new Error(`Missing roster group for grouped unit ${unit.id} at ${groupKey}`)
    }

    if (namingGroup === null) {
      throw new Error(`Missing stackNaming entry for grouped unit ${unit.id} at ${groupKey}`)
    }

    if (rosterGroup.groupName !== namingGroup.groupName) {
      throw new Error(`Conflicting stacked-unit labels for ${unit.id}: roster=${rosterGroup.groupName}, naming=${namingGroup.groupName}`)
    }

    return resolveSelectionName({ kind: 'group', groupKey: namingGroup.groupKey, stackNaming })
  }

  return resolveBattlefieldUnitName(unit.type, unit.id, unit.friendlyName)
}

export type StackSourceUnit = {
  unitId: string
  typeId: string
  position: { q: number; r: number }
  state: UnitState
  squads?: number
}

/** Canonical web-facing source state for stack membership resolution. */
export type WebStackSourceState = {
  onions?: Record<string, StackSourceUnit>
  defenders?: Record<string, StackSourceUnit>
  stackRoster?: StackRosterState
}

function toStackSourceUnit(unit: StackSourceUnit, squads?: number): StackSourceUnit {
  return {
    unitId: unit.unitId,
    typeId: unit.typeId,
    position: unit.position,
    state: unit.state,
    squads,
  }
}

export function getAuthoritativeOnion(state: GameState): OnionUnit {
  const onion = Object.values(state.onions)[0]
  if (onion === undefined) {
    throw new Error('Missing authoritative onion')
  }

  return onion
}

export function buildWebStackSourceState(state: GameState): WebStackSourceState {
  const onions = Object.fromEntries(
    Object.values(state.onions).map((onion) => [onion.unitId, toStackSourceUnit(onion)]),
  )
  const defenders = Object.fromEntries(
    Object.values(state.defenders).map((defender) => {
      const definition = getUnitDefinition(defender.typeId)
      return [defender.unitId, toStackSourceUnit(defender, definition?.role === 'defender' ? definition.squads : undefined)]
    }),
  )

  return {
    onions,
    defenders,
    stackRoster: state.stackRoster,
  }
}

export function resolveBattlefieldStackMemberIds(state: WebStackSourceState | null | undefined, unitId: string): string[] {
  if (state === null || state === undefined) {
    return [unitId]
  }

  if (state.onions?.[unitId] !== undefined) {
    return [unitId]
  }

  const selectedUnit = state.defenders?.[unitId]
  if (selectedUnit === undefined) {
    return [unitId]
  }

  if (!isStackableUnitType(selectedUnit.typeId)) {
    return [unitId]
  }

  if (state.stackRoster === undefined) {
    throw new Error(`Missing stackRoster for grouped unit ${unitId}`)
  }

  const stackRosterIndex = buildStackRosterIndex(
    state.stackRoster,
    state.defenders as DefenderMap | undefined,
  )
  const group = stackRosterIndex.getUnitGroup(unitId)
  if (group === null) {
    throw new Error(`Missing stackRoster entry for grouped unit ${unitId}`)
  }

  const activeMemberIds = group.units
    .filter((member) => member.state !== 'destroyed')
    .map((member) => member.unitId)
  return activeMemberIds.length > 0 ? activeMemberIds : [unitId]
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

export function resolveBattlefieldStackSelectionIds(state: WebStackSourceState | null | undefined, unitId: string): string[] {
  return resolveBattlefieldStackMemberIds(state, unitId)
}

export function countSelectedBattlefieldStackMembers(
  state: WebStackSourceState | null | undefined,
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
  state: WebStackSourceState | null | undefined,
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

export function resolveBattlefieldStacksExpandable({
  activeRole,
  activeTurnActive,
  isCombatPhase,
  isMovementPhase,
}: {
  activeRole: 'onion' | 'defender' | null
  activeTurnActive: boolean
  isCombatPhase: boolean
  isMovementPhase: boolean
}): boolean {
  return activeTurnActive && activeRole === 'defender' && (isCombatPhase || isMovementPhase)
}

export function shouldExpandBattlefieldStackGroup({
  memberCount,
  selectedCount,
  stacksExpandable,
}: {
  memberCount: number
  selectedCount: number
  stacksExpandable: boolean
}): boolean {
  return memberCount > 1 && selectedCount > 0 && stacksExpandable
}

export function buildClientStackSelection(
  state: WebStackSourceState | null | undefined,
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
  return getWeaponType(weapon.typeId).name
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

  return weapons.map((weapon) => `${weapon.id}: ${weapon.state}`).join(', ')
}

export function isBattlefieldWeaponReady(weapon: Weapon): boolean {
  return weapon.state === 'ready'
}

export function getBattlefieldWeaponAttack(weapon: Weapon): number {
  return getWeaponType(weapon.typeId).attack
}

export function formatAttackSummary(weapons: ReadonlyArray<Weapon> | undefined) {
  if (weapons === undefined || weapons.length === 0) {
    return '0 / rng 0'
  }

  const primaryWeapon = weapons.reduce((strongest, weapon) => {
    const weaponType = getWeaponType(weapon.typeId)
    const strongestType = getWeaponType(strongest.typeId)
    if (weaponType.attack > strongestType.attack) {
      return weapon
    }

    if (weaponType.attack === strongestType.attack && weaponType.range > strongestType.range) {
      return weapon
    }

    return strongest
  })

  const primaryWeaponType = getWeaponType(primaryWeapon.typeId)
  return `${primaryWeaponType.attack} / rng ${primaryWeaponType.range}`
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
    .filter((weapon) => weapon.state === 'ready')
    .reduce((maxRange, weapon) => Math.max(maxRange, getWeaponType(weapon.typeId).range), 0)
}

export function parseRangeValue(rangeText: string): number {
  const parsedRange = Number.parseInt(rangeText, 10)
  return Number.isNaN(parsedRange) ? 0 : parsedRange
}

export function getTerrainValueAt(scenarioMap: { width: number; height: number; cells?: ReadonlyArray<{ q: number; r: number }>; hexes: ReadonlyArray<TerrainHex> } | null | undefined, q: number, r: number): number | undefined {
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

  if (onionId !== undefined && targetId === onionId) {
    return formatCombatTargetId({ kind: 'treads', onionId })
  }

  return targetId
}

export function normalizeSelectionIds(selectedIds: readonly string[] | null | undefined, allowedIds: readonly string[]): string[] {
  const allowedIdSet = new Set(allowedIds)
  return Array.from(new Set((selectedIds ?? []).filter((selectionId) => allowedIdSet.has(selectionId))))
}

export function getActionableModes(status: UnitState | undefined, weapons: ReadonlyArray<Weapon> | undefined, activeTurnActive: boolean, activePhase: TurnPhase | null): Mode[] {
  if (status === 'destroyed' || status === 'disabled') {
    return []
  }

  const hasReadyWeapon = (weapons ?? []).some((weapon) => weapon.state === 'ready')
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

export function buildBattlefieldDefenderView(
  defender: DefenderUnit & { squads?: number },
  {
    move = 0,
    terrainValue,
    activePhase = null,
    activeTurnActive = false,
  }: {
    move?: number
    terrainValue?: number
    activePhase?: TurnPhase | null
    activeTurnActive?: boolean
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
    attack: formatAttackSummary(weapons),
    weaponDetails: weapons,
    targetRules: getUnitDefinition(unitType)?.targetRules,
    defense: getDisplayDefense(unitType, defender.squads, terrainValue),
    squads: defender.squads,
    actionableModes: getActionableModes(defender.state, weapons, activeTurnActive, activePhase),
  }
}

export function buildBattlefieldOnionView(
  onion: OnionUnit,
  {
    movesAllowed = 0,
    movesRemaining = 0,
  }: {
    movesAllowed?: number
    movesRemaining?: number
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
    targetRules: getUnitDefinition(onion.typeId)?.targetRules,
  }
}

export function buildLiveDefenders(snapshot: ServerGameSnapshot, activePhase: TurnPhase | null, activeTurnActive: boolean): BattlefieldUnit[] {
  const authoritativeState = snapshot.authoritativeState

  if (authoritativeState === undefined) {
    return []
  }

  const movementRemainingByUnit = snapshot.movementRemainingByUnit ?? {}
  const defenderEntries = Object.entries(authoritativeState.defenders)

  return defenderEntries
    .map(([defenderId, defender], index) => {
      const canonicalDefender = defender as DefenderUnit & { squads?: number }
      const resolvedDefenderId = canonicalDefender.unitId || defenderId
      const snapshotMovementRemaining = movementRemainingByUnit[resolvedDefenderId]

      return {
        ...buildBattlefieldDefenderView(canonicalDefender, {
          move: activePhase === null ? 0 : snapshotMovementRemaining ?? 0,
          activePhase,
          activeTurnActive,
          terrainValue: getTerrainValueAt(snapshot.scenarioMap, canonicalDefender.position.q, canonicalDefender.position.r),
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

export function buildLiveOnion(snapshot: ServerGameSnapshot, activePhase: TurnPhase | null): BattlefieldOnionView {
  const authoritativeState = snapshot.authoritativeState

  if (authoritativeState === undefined) {
    throw new Error('Missing authoritative state')
  }

  const onion = getAuthoritativeOnion(authoritativeState)

  const movementRemainingByUnit = snapshot.movementRemainingByUnit ?? {}
  const movesAllowed = activePhase === null ? 0 : getUnitMovementAllowance(onion.typeId, activePhase, onion.treads)
  const movesRemaining = activePhase === null ? 0 : movementRemainingByUnit[onion.unitId] ?? movesAllowed

  return buildBattlefieldOnionView(onion, { movesAllowed, movesRemaining })
}

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
      .filter((weapon) => weapon.state === 'ready' && selectedWeaponIds.has(weapon.id))
      .map((weapon) => ({
        q: displayedOnion.position.q,
        r: displayedOnion.position.r,
        range: getWeaponType(weapon.typeId).range,
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