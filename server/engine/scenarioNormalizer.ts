import type { InitialState } from '#server/engine/scenarioSchema'
import type { DefenderUnit, EngineGameState, OnionUnit } from '#server/engine/units'
import { getUnitDefinition } from '#server/engine/units'
import logger from '#server/logger'
import { buildFriendlyName } from '#shared/unitDefinitions'
import { buildStackGroupKey, createStackNamingEngine } from '#shared/stackNaming'
import type { StackRosterState } from '#shared/types/index'

type DefenderEntry = InitialState['defenders'][string]

type DefenderStackGroupEntry = {
  kind: 'stack-group'
  unitType: string
  position: { q: number; r: number }
  count: number
  groupName?: string
  status?: string
}

function isStackGroupEntry(entry: DefenderEntry): entry is DefenderStackGroupEntry {
  return 'kind' in entry && entry.kind === 'stack-group'
}

/**
 * Normalize a scenario initialState into a valid EngineGameState.
 * Assumes initialState has already been validated by Zod.
 * Throws if required fields are missing or invalid.
 */
export function normalizeInitialStateToGameState(initial: InitialState): EngineGameState {
  const onionDefinition = getUnitDefinition(initial.onion.type as any)
  if (!onionDefinition) {
    logger.error({ type: initial.onion.type }, 'normalizeInitialStateToGameState: unknown onion type')
    throw new Error(`Unknown onion type: ${initial.onion.type}`)
  }

  // Assign onion ID and status
  const onion: OnionUnit & {
    missiles: number
    batteries: { main: number; secondary: number; ap: number }
  } = {
    id: 'onion-1',
    type: initial.onion.type as any, // Cast for now; engine will check
    friendlyName: buildFriendlyName(onionDefinition.friendlyNameTemplate ?? `${onionDefinition.name} {{ordinal}}`, 'onion-1'),
    position: initial.onion.position,
    treads: initial.onion.treads,
    status: (initial.onion.status ?? 'operational') as OnionUnit['status'],
    weapons: onionDefinition.weapons.map((weapon) => ({
      ...weapon,
      friendlyName: buildFriendlyName(weapon.friendlyNameTemplate ?? weapon.name, weapon.id),
    })),
    missiles: initial.onion.missiles,
    batteries: { ...initial.onion.batteries },
  }

  // Assign defender IDs and fill defaults
  const defenders: Record<string, DefenderUnit> = {}
  const stackRoster: StackRosterState = { groupsById: {} }
  const stackNamingEngine = createStackNamingEngine()

  for (const [key, def] of Object.entries(initial.defenders) as Array<[string, DefenderEntry]>) {
    if (isStackGroupEntry(def)) {
      const defenderDefinition = getUnitDefinition(def.unitType as any)
      if (!defenderDefinition) {
        logger.error({ type: def.unitType, key }, 'normalizeInitialStateToGameState: unknown stack-group unit type')
        throw new Error(`Unknown defender type: ${def.unitType}`)
      }

      const unitIds: string[] = []
      for (let index = 0; index < def.count; index += 1) {
        const unitId = `${key}-${index + 1}`
        unitIds.push(unitId)
        defenders[unitId] = {
          id: unitId,
          type: def.unitType as any,
          friendlyName: buildFriendlyName(defenderDefinition.friendlyNameTemplate ?? `${defenderDefinition.name} {{ordinal}}`, unitId),
          position: def.position,
          status: (def.status ?? 'operational') as DefenderUnit['status'],
          weapons: defenderDefinition.weapons.map((weapon) => ({
            ...weapon,
            friendlyName: buildFriendlyName(weapon.friendlyNameTemplate ?? weapon.name, weapon.id),
          })),
        }
      }

      const groupKey = buildStackGroupKey(def.unitType, def.position)
      const firstUnitFriendlyName = defenders[unitIds[0]]?.friendlyName
      const resolvedGroupName = def.groupName?.trim().length
        ? def.groupName
        : stackNamingEngine.resolveGroupName(groupKey, def.unitType, unitIds[0], firstUnitFriendlyName, unitIds.length)

      stackRoster.groupsById[groupKey] = {
        groupId: groupKey,
        groupName: resolvedGroupName,
        unitType: def.unitType,
        position: def.position,
        unitIds,
        units: unitIds.map((unitId) => ({
          id: unitId,
          status: defenders[unitId].status,
          friendlyName: defenders[unitId].friendlyName ?? unitId,
          weapons: defenders[unitId].weapons,
          targetRules: defenders[unitId].targetRules,
        })),
      }
      continue
    }

    const defenderDefinition = getUnitDefinition(def.type as any)
    if (!defenderDefinition) {
      logger.error({ type: def.type, key }, 'normalizeInitialStateToGameState: unknown defender type')
      throw new Error(`Unknown defender type: ${def.type}`)
    }
    defenders[key] = {
      id: key,
      type: def.type as any,
      friendlyName: buildFriendlyName(defenderDefinition.friendlyNameTemplate ?? `${defenderDefinition.name} {{ordinal}}`, key),
      position: def.position,
      status: (def.status ?? 'operational') as DefenderUnit['status'],
      weapons: defenderDefinition.weapons.map((weapon) => ({
        ...weapon,
        friendlyName: buildFriendlyName(weapon.friendlyNameTemplate ?? weapon.name, weapon.id),
      })),
      ...(def.squads !== undefined ? { squads: def.squads } : {}),
    }
  }

  return {
    onion,
    defenders,
    stackRoster,
    stackNaming: stackNamingEngine.snapshot(),
    ramsThisTurn: 0,
    currentPhase: 'ONION_MOVE',
    turn: 1,
  }
}
