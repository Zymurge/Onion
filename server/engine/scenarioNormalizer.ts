import type { InitialState, Deployment, Scenario } from '#server/engine/scenarioSchema'
import type { DefenderUnit, GameState, OnionUnit, UnitTypeBase, Weapon, WeaponType } from '#shared/types/index'
import logger from '#server/logger'
import { buildFriendlyName, getUnitTypeCatalog } from '#shared/unitDefinitions'
import { buildStackGroupKey, createStackNamingEngine } from '#shared/stackNaming/index'
import type { StackRosterState } from '#shared/types/index'
import { getResolvedUnitTypeId, resolveScenarioDefinitions } from '#server/engine/scenarioDefinitions'

type StackGroupDeployment = Extract<Deployment, { kind: 'stack-group' }>

function isStackGroupEntry(entry: Deployment): entry is StackGroupDeployment {
  return 'kind' in entry && entry.kind === 'stack-group'
}

function buildStackUnitIdBase(groupKey: string): string {
  return groupKey.replace(/-(?:stack|group)-\d+$/i, '') || groupKey
}

function buildWeaponInstance(weaponType: WeaponType, id: string, ammo?: number): Weapon {
  return {
    id,
    typeId: weaponType.typeId,
    weaponClass: weaponType.weaponClass,
    state: 'ready',
    friendlyName: buildFriendlyName(weaponType.friendlyNameTemplate ?? weaponType.name, id),
    ...(ammo === undefined ? {} : { ammo }),
  }
}

function buildUnitWeapons(
  definition: UnitTypeBase,
  deploymentKey: string,
  startingAmmoByWeaponType: Record<string, number> | undefined,
): Weapon[] {
  const overrides = startingAmmoByWeaponType ?? {}
  const weaponsByTypeId = new Map(definition.weapons.map((weapon) => [weapon.typeId, weapon]))

  for (const [weaponTypeId, ammo] of Object.entries(overrides)) {
    const weaponType = weaponsByTypeId.get(weaponTypeId)
    if (weaponType === undefined) {
      throw new Error(`Deployment ${deploymentKey} does not own weapon type ${weaponTypeId}`)
    }

    if (weaponType.maxAmmo === undefined) {
      throw new Error(`Deployment ${deploymentKey} cannot override unlimited weapon type ${weaponTypeId}`)
    }

    if (ammo > weaponType.maxAmmo) {
      throw new Error(`Deployment ${deploymentKey} sets ${weaponTypeId} ammo to ${ammo}, above maxAmmo ${weaponType.maxAmmo}`)
    }
  }

  return definition.weapons.flatMap((weapon) => {
    const separatorIndex = weapon.typeId.lastIndexOf('.')
    const weaponName = separatorIndex === -1 ? weapon.typeId : weapon.typeId.slice(separatorIndex + 1)
    const ammo = weapon.maxAmmo === undefined
      ? undefined
      : overrides[weapon.typeId] ?? weapon.maxAmmo
    const quantity = definition.weaponQuantities[weapon.typeId] ?? weapon.defaultQuantity ?? 1
    return Array.from({ length: quantity }, (_unused, index) => {
      const id = `${weaponName}-${index + 1}`
      const runtimeWeapon = definition.typeId.includes(':')
        ? { ...weapon, typeId: `${definition.typeId}:${weapon.typeId}` }
        : weapon
      return buildWeaponInstance(runtimeWeapon, id, ammo)
    })
  })
}

function buildRuntimeUnit(
  definition: UnitTypeBase,
  deployment: Deployment,
  unitId: string,
  collectionRole: 'onion' | 'defender',
): OnionUnit | DefenderUnit {
  if (deployment.startingTreads !== undefined && definition.maxTreads !== undefined && deployment.startingTreads > definition.maxTreads) {
    throw new Error(`Deployment ${unitId} sets startingTreads to ${deployment.startingTreads}, above maxTreads ${definition.maxTreads}`)
  }

  const unit = {
    unitId,
    typeId: definition.typeId,
    role: collectionRole,
    side: deployment.side,
    friendlyName: buildFriendlyName(definition.friendlyNameTemplate ?? `${definition.name} {{ordinal}}`, unitId),
    position: deployment.position,
    state: deployment.status ?? 'operational',
    weapons: buildUnitWeapons(definition, unitId, deployment.startingAmmoByWeaponType),
    ...(definition.maxTreads === undefined ? {} : { treads: deployment.startingTreads ?? definition.maxTreads }),
    ...(definition.ramsPerTurn === undefined ? {} : { ramsRemaining: definition.ramsPerTurn }),
  } satisfies Omit<OnionUnit, 'role'> & { role: 'onion' | 'defender' }

  return unit as OnionUnit | DefenderUnit
}

function addRuntimeUnit(
  unitId: string,
  deployment: Deployment,
  definition: UnitTypeBase,
  onions: Record<string, OnionUnit>,
  defenders: Record<string, DefenderUnit>,
): void {
  if (Object.hasOwn(onions, unitId) || Object.hasOwn(defenders, unitId)) {
    throw new Error(`Duplicate generated unit ID: ${unitId}`)
  }

  if (deployment.side === 'onion') {
    onions[unitId] = buildRuntimeUnit(definition, deployment, unitId, 'onion') as OnionUnit
  } else {
    defenders[unitId] = buildRuntimeUnit(definition, deployment, unitId, 'defender') as DefenderUnit
  }
}

/** Normalize validated scenario deployments into the canonical runtime GameState. */
export function normalizeInitialStateToGameState(
  initial: InitialState,
  scenarioId?: string,
  scenarioUnitTypes?: Scenario['unitTypes'],
): GameState {
  const resolvedDefinitions = scenarioId === undefined
    ? { unitTypes: getUnitTypeCatalog() }
    : resolveScenarioDefinitions(scenarioId, scenarioUnitTypes)
  const onions: Record<string, OnionUnit> = {}
  const defenders: Record<string, DefenderUnit> = {}
  const stackRoster: StackRosterState = { groupsById: {} }
  const stackNamingEngine = createStackNamingEngine()
  const nextStackUnitOrdinalByBase = new Map<string, number>()

  for (const [key, deployment] of Object.entries(initial.deployments)) {
    const authoredTypeId = isStackGroupEntry(deployment) ? deployment.unitType : deployment.type
    const typeId = getResolvedUnitTypeId(scenarioId, authoredTypeId, scenarioUnitTypes)
    let definition: UnitTypeBase
    try {
      definition = resolvedDefinitions.unitTypes[typeId]
      if (definition === undefined) {
        throw new Error(`Unknown unit type: ${authoredTypeId}`)
      }
    } catch (error) {
      logger.error({ type: typeId, key }, 'normalizeInitialStateToGameState: unknown unit type')
      throw error
    }

    if (!isStackGroupEntry(deployment)) {
      addRuntimeUnit(key, deployment, definition, onions, defenders)
      continue
    }

    const unitIds: string[] = []
    const unitIdBase = buildStackUnitIdBase(key)
    const nextOrdinal = nextStackUnitOrdinalByBase.get(unitIdBase) ?? 0
    for (let index = 0; index < deployment.count; index += 1) {
      const unitId = `${unitIdBase}-${nextOrdinal + index + 1}`
      addRuntimeUnit(unitId, deployment, definition, onions, defenders)
      unitIds.push(unitId)
    }
    nextStackUnitOrdinalByBase.set(unitIdBase, nextOrdinal + deployment.count)

    const groupKey = buildStackGroupKey(typeId, deployment.position)
    const firstUnit = onions[unitIds[0]] ?? defenders[unitIds[0]]
    const firstUnitFriendlyName = firstUnit?.friendlyName
    const canonicalGroupName = stackNamingEngine.resolveGroupName(
      groupKey,
      typeId,
      unitIds[0],
      firstUnitFriendlyName,
      unitIds.length,
    )

    if (deployment.groupName !== undefined && deployment.groupName.trim().length > 0 && deployment.groupName !== canonicalGroupName) {
      logger.error({ key, groupKey, expected: canonicalGroupName, actual: deployment.groupName }, 'normalizeInitialStateToGameState: conflicting stack group name')
      throw new Error(`Conflicting stack group name for ${key}: expected ${canonicalGroupName}, received ${deployment.groupName}`)
    }

    stackRoster.groupsById[groupKey] = {
      groupName: canonicalGroupName,
      unitType: typeId,
      position: deployment.position,
      unitIds,
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
