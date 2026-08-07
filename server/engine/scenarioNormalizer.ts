import type { InitialState } from '#server/engine/scenarioSchema'
import type { DefenderUnit, GameState, OnionUnit, Weapon, WeaponType } from '#shared/types/index'
import logger from '#server/logger'
import { buildFriendlyName, getUnitDefinition } from '#shared/unitDefinitions'
import { buildStackGroupKey, createStackNamingEngine } from '#shared/stackNaming'
import type { StackRosterState } from '#shared/types/index'

type DefenderEntry = InitialState['defenders'][string]

type DefenderStackGroupEntry = Extract<DefenderEntry, { kind: 'stack-group' }>

function isStackGroupEntry(entry: DefenderEntry): entry is DefenderStackGroupEntry {
  return 'kind' in entry && entry.kind === 'stack-group'
}

function buildStackUnitIdBase(groupKey: string): string {
  return groupKey.replace(/-(?:stack|group)-\d+$/i, '') || groupKey
}

function buildWeaponInstance(weaponType: WeaponType, id: string): Weapon {
  return {
    id,
    typeId: weaponType.typeId,
    state: 'ready',
    friendlyName: buildFriendlyName(weaponType.friendlyNameTemplate ?? weaponType.name, id),
  }
}

function buildUnitWeapons(definition: ReturnType<typeof getUnitDefinition>): Weapon[] {
  return definition?.weapons.map((weapon) => {
    const separatorIndex = weapon.typeId.lastIndexOf('.')
    const id = separatorIndex === -1 ? weapon.typeId : weapon.typeId.slice(separatorIndex + 1)
    return buildWeaponInstance(weapon, id)
  }) ?? []
}

/**
 * Normalize a scenario initialState into the canonical runtime GameState.
 * Assumes initialState has already been validated by Zod.
 */
export function normalizeInitialStateToGameState(initial: InitialState): GameState {
  const onions: Record<string, OnionUnit> = {}
  for (const [unitId, entry] of Object.entries(initial.onions)) {
    const onionDefinition = getUnitDefinition(entry.type as any)
    if (!onionDefinition) {
      logger.error({ type: entry.type, unitId }, 'normalizeInitialStateToGameState: unknown onion type')
      throw new Error(`Unknown onion type: ${entry.type}`)
    }

    if (onionDefinition.role !== 'onion') {
      throw new Error(`Unit type is not an onion: ${entry.type}`)
    }

    onions[unitId] = {
      unitId,
      typeId: entry.type,
      role: 'onion',
      friendlyName: buildFriendlyName(onionDefinition.friendlyNameTemplate ?? `${onionDefinition.name} {{ordinal}}`, unitId),
      position: entry.position,
      treads: onionDefinition.treads,
      ramsRemaining: onionDefinition.ramsPerTurn,
      state: (entry.status ?? 'operational') as OnionUnit['state'],
      weapons: buildUnitWeapons(onionDefinition),
    }
  }

  const defenders: Record<string, DefenderUnit> = {}
  const stackRoster: StackRosterState = { groupsById: {} }
  const stackNamingEngine = createStackNamingEngine()
  const nextStackUnitOrdinalByBase = new Map<string, number>()

  for (const [key, def] of Object.entries(initial.defenders) as Array<[string, DefenderEntry]>) {
    if (isStackGroupEntry(def)) {
      const defenderDefinition = getUnitDefinition(def.unitType as any)
      if (!defenderDefinition) {
        logger.error({ type: def.unitType, key }, 'normalizeInitialStateToGameState: unknown stack-group unit type')
        throw new Error(`Unknown defender type: ${def.unitType}`)
      }

      if (defenderDefinition.role !== 'defender') {
        throw new Error(`Unit type is not a defender: ${def.unitType}`)
      }

      const unitIds: string[] = []
      const unitIdBase = buildStackUnitIdBase(key)
      const nextOrdinal = nextStackUnitOrdinalByBase.get(unitIdBase) ?? 0
      for (let index = 0; index < def.count; index += 1) {
        const unitId = `${unitIdBase}-${nextOrdinal + index + 1}`
        unitIds.push(unitId)
        defenders[unitId] = {
          unitId,
          typeId: def.unitType,
          role: 'defender',
          friendlyName: buildFriendlyName(defenderDefinition.friendlyNameTemplate ?? `${defenderDefinition.name} {{ordinal}}`, unitId),
          position: def.position,
          state: (def.status ?? 'operational') as DefenderUnit['state'],
          weapons: buildUnitWeapons(defenderDefinition),
        }
      }
      nextStackUnitOrdinalByBase.set(unitIdBase, nextOrdinal + def.count)

      const groupKey = buildStackGroupKey(def.unitType, def.position)
      const firstUnitFriendlyName = defenders[unitIds[0]]?.friendlyName
      const canonicalGroupName = stackNamingEngine.resolveGroupName(groupKey, def.unitType, unitIds[0], firstUnitFriendlyName, unitIds.length)

      if (def.groupName !== undefined && def.groupName.trim().length > 0 && def.groupName !== canonicalGroupName) {
        logger.error({ key, groupKey, expected: canonicalGroupName, actual: def.groupName }, 'normalizeInitialStateToGameState: conflicting stack group name')
        throw new Error(`Conflicting stack group name for ${key}: expected ${canonicalGroupName}, received ${def.groupName}`)
      }

      stackRoster.groupsById[groupKey] = {
        groupName: canonicalGroupName,
        unitType: def.unitType,
        position: def.position,
        unitIds,
      }
      continue
    }

    const defenderDefinition = getUnitDefinition(def.type as any)
    if (!defenderDefinition) {
      logger.error({ type: def.type, key }, 'normalizeInitialStateToGameState: unknown defender type')
      throw new Error(`Unknown defender type: ${def.type}`)
    }

    if (defenderDefinition.role !== 'defender') {
      throw new Error(`Unit type is not a defender: ${def.type}`)
    }

    defenders[key] = {
      unitId: key,
      typeId: def.type,
      role: 'defender',
      friendlyName: buildFriendlyName(defenderDefinition.friendlyNameTemplate ?? `${defenderDefinition.name} {{ordinal}}`, key),
      position: def.position,
      state: (def.status ?? 'operational') as DefenderUnit['state'],
      weapons: buildUnitWeapons(defenderDefinition),
    }
  }

  return {
    onions,
    defenders,
    stackRoster,
    stackNaming: stackNamingEngine.snapshot(),
    currentPhase: 'ONION_MOVE',
    turn: 1,
  }
}
