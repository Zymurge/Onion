import type { InitialState, Deployment } from '#server/engine/scenarioSchema'
import type { DefenderUnit, GameState, OnionUnit, UnitTypeBase, Weapon, WeaponType } from '#shared/types/index'
import logger from '#server/logger'
import { buildFriendlyName, getRequiredUnitDefinition } from '#shared/unitDefinitions'
import { buildStackGroupKey, createStackNamingEngine } from '#shared/stackNaming'
import type { StackRosterState } from '#shared/types/index'

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

  return definition.weapons.map((weapon) => {
    const separatorIndex = weapon.typeId.lastIndexOf('.')
    const id = separatorIndex === -1 ? weapon.typeId : weapon.typeId.slice(separatorIndex + 1)
    const ammo = weapon.maxAmmo === undefined
      ? undefined
      : overrides[weapon.typeId] ?? weapon.maxAmmo
    return buildWeaponInstance(weapon, id, ammo)
  })
}

function buildRuntimeUnit(
  definition: UnitTypeBase,
  deployment: Deployment,
  unitId: string,
  collectionRole: 'onion' | 'defender',
): OnionUnit | DefenderUnit {
  const unit = {
    unitId,
    typeId: definition.typeId,
    role: collectionRole,
    side: deployment.side,
    friendlyName: buildFriendlyName(definition.friendlyNameTemplate ?? `${definition.name} {{ordinal}}`, unitId),
    position: deployment.position,
    state: deployment.status ?? 'operational',
    weapons: buildUnitWeapons(definition, unitId, deployment.startingAmmoByWeaponType),
    ...(definition.treads === undefined ? {} : { treads: definition.treads }),
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
export function normalizeInitialStateToGameState(initial: InitialState): GameState {
  const onions: Record<string, OnionUnit> = {}
  const defenders: Record<string, DefenderUnit> = {}
  const stackRoster: StackRosterState = { groupsById: {} }
  const stackNamingEngine = createStackNamingEngine()
  const nextStackUnitOrdinalByBase = new Map<string, number>()

  for (const [key, deployment] of Object.entries(initial.deployments)) {
    const typeId = isStackGroupEntry(deployment) ? deployment.unitType : deployment.type
    let definition: UnitTypeBase
    try {
      definition = getRequiredUnitDefinition(typeId)
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

    const groupKey = buildStackGroupKey(deployment.unitType, deployment.position)
    const firstUnit = onions[unitIds[0]] ?? defenders[unitIds[0]]
    const firstUnitFriendlyName = firstUnit?.friendlyName
    const canonicalGroupName = stackNamingEngine.resolveGroupName(
      groupKey,
      deployment.unitType,
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
      unitType: deployment.unitType,
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
