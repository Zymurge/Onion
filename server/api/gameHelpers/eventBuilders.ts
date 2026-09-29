import type { CombatExecutionResult } from '#server/engine/combat/index'
import type { MovementResult } from '#server/engine/movement'
import { formatCombatTargetId, parseCombatTargetId } from '#shared/combatTarget'
import type { Command, EventEnvelope, GameState, SingleUnitMoveCommand, TurnPhase } from '#shared/types/index'
import { getOnionOrDefender } from '#shared/unitState'

function resolveUnitFriendlyName(state: GameState, unitId: string): string {
  const lookup = getOnionOrDefender(unitId, state)
  if (lookup.kind === 'onion' && lookup.unitId !== undefined) {
    return state.onions[lookup.unitId]?.friendlyName ?? unitId
  }

  if (lookup.kind === 'defender' && lookup.unitId !== undefined) {
    const defender = state.defenders[lookup.unitId]
    if (defender === undefined) {
      return unitId
    }

    const stackGroup = Object.values(state.stackRoster.groupsById).find((group) => group.unitIds.includes(lookup.unitId!))
    if (stackGroup !== undefined) {
      return stackGroup.groupName
    }

    return defender.friendlyName
  }

  return unitId
}

function resolveIndividualUnitFriendlyName(state: GameState, unitId: string): string {
  const lookup = getOnionOrDefender(unitId, state)
  if (lookup.kind === 'onion' && lookup.unitId !== undefined) {
    return state.onions[lookup.unitId]?.friendlyName ?? unitId
  }

  if (lookup.kind === 'defender' && lookup.unitId !== undefined) {
    return state.defenders[lookup.unitId]?.friendlyName ?? unitId
  }

  return unitId
}

function resolveWeaponFriendlyName(state: GameState, weaponId: string, ownerOnionId?: string): string {
  if (ownerOnionId !== undefined) {
    const ownerWeapon = state.onions[ownerOnionId]?.weapons.find((weapon) => weapon.id === weaponId)
    if (ownerWeapon) {
      return ownerWeapon.friendlyName
    }
  }

  for (const onion of Object.values(state.onions)) {
    const onionWeapon = onion.weapons.find((weapon) => weapon.id === weaponId)
    if (onionWeapon) {
      return onionWeapon.friendlyName
    }
  }

  for (const defender of Object.values(state.defenders)) {
    const weapon = defender.weapons.find((candidate) => candidate.id === weaponId)
    if (weapon) {
      return weapon.friendlyName
    }
  }

  return weaponId
}

function resolveCombatParticipantFriendlyName(state: GameState, attackerId: string): string {
  const unitFriendlyName = resolveUnitFriendlyName(state, attackerId)
  return unitFriendlyName !== attackerId ? unitFriendlyName : resolveWeaponFriendlyName(state, attackerId)
}

function resolveTargetFriendlyName(state: GameState, targetId: string, ownerOnionId?: string): string {
  const parsedTarget = parseCombatTargetId(targetId)
  if (parsedTarget?.kind === 'treads') {
    return `${resolveUnitFriendlyName(state, parsedTarget.onionId)} treads`
  }

  const unitFriendlyName = resolveUnitFriendlyName(state, targetId)
  return unitFriendlyName !== targetId ? unitFriendlyName : resolveWeaponFriendlyName(state, targetId, ownerOnionId)
}

/**
 * Classifies a weapon instance id for event presentation.
 *
 * This is a display-only prefix classifier; catalog weapon definitions remain
 * authoritative for weapon behavior and statistics.
 *
 * @param weaponId Weapon instance id from an action result.
 * @returns The display weapon class or the original id when no known prefix matches.
 */
export function getWeaponTypeFromId(weaponId: string) {
  if (weaponId === 'main') return 'main'
  if (weaponId.startsWith('secondary_')) return 'secondary'
  if (weaponId.startsWith('ap_')) return 'ap'
  if (weaponId.startsWith('missile_')) return 'missile'
  return weaponId
}

/**
 * Builds ordered FIRE-related events, including friendly names and damage details.
 *
 * @param startSeq Sequence number assigned to the first event.
 * @param command Validated FIRE command that produced the result.
 * @param result Engine combat result and applied effects.
 * @param state Authoritative state used to resolve names and remaining values.
 * @param phase Optional phase included in each emitted event.
 * @returns Events in persistence and broadcast order.
 * @throws Error when the command references an Onion absent from state.
 */
export function buildCombatEvents(
  startSeq: number,
  command: Extract<Command, { type: 'FIRE' }>,
  result: CombatExecutionResult,
  state: GameState,
  phase?: TurnPhase,
): EventEnvelope[] {
  const timestamp = new Date().toISOString()
  let seq = startSeq
  const events: EventEnvelope[] = []
  const onionId = command.onionId
  const onion = state.onions[onionId]
  if (onion === undefined) {
    throw new Error(`Onion '${onionId}' was not found while building combat events`)
  }
  const attackerFriendlyNames = command.attackers.map((attackerId) => resolveCombatParticipantFriendlyName(state, attackerId))
  const targetFriendlyName = resolveTargetFriendlyName(state, result.targetId, onionId)

  events.push({
    seq: seq++,
    type: 'FIRE_RESOLVED',
    timestamp,
    ...(phase === undefined ? {} : { phase }),
    attackers: command.attackers,
    onionId,
    attackerFriendlyNames,
    targetId: result.targetId,
    targetFriendlyName,
    roll: result.roll?.roll,
    outcome: result.roll?.result,
    odds: result.roll?.odds,
  })

  if (result.treadsLost !== undefined) {
    events.push({
      seq: seq++,
      type: 'ONION_TREADS_LOST',
      timestamp,
      ...(phase === undefined ? {} : { phase }),
      onionId,
      targetId: result.targetId,
      targetFriendlyName,
      amount: result.treadsLost,
      remaining: onion.treads,
    })
  }

  if (result.destroyedWeaponId) {
    events.push({
      seq: seq++,
      type: 'ONION_WEAPON_DESTROYED',
      timestamp,
      ...(phase === undefined ? {} : { phase }),
      onionId,
      weaponId: result.destroyedWeaponId,
      weaponFriendlyName: resolveWeaponFriendlyName(state, result.destroyedWeaponId, onionId),
      weaponType: getWeaponTypeFromId(result.destroyedWeaponId),
    })
  }

  for (const statusChange of result.statusChanges ?? []) {
    events.push({
      seq: seq++,
      type: 'UNIT_STATUS_CHANGED',
      timestamp,
      ...(phase === undefined ? {} : { phase }),
      unitId: statusChange.unitId,
      unitFriendlyName: resolveIndividualUnitFriendlyName(state, statusChange.unitId),
      from: statusChange.from,
      to: statusChange.to,
    })
  }

  if (result.squadsLost !== undefined) {
    events.push({
      seq: seq++,
      type: 'UNIT_SQUADS_LOST',
      timestamp,
      ...(phase === undefined ? {} : { phase }),
      unitId: result.targetId,
      unitFriendlyName: resolveIndividualUnitFriendlyName(state, result.targetId),
      amount: result.squadsLost,
    })
  }

  return events
}

/**
 * Builds ordered movement, ram, tread-loss, and destruction events.
 *
 * @param startSeq Sequence number assigned to the first event.
 * @param moveUnitId Canonical unit id for the moved unit.
 * @param command Validated MOVE command that produced the result.
 * @param result Engine movement result and applied effects.
 * @param state Authoritative state used to resolve names and remaining values.
 * @param phase Optional phase included in each emitted event.
 * @returns Events in persistence and broadcast order.
 */
export function buildMoveEvents(
  startSeq: number,
  moveUnitId: string,
  command: SingleUnitMoveCommand,
  result: MovementResult,
  state: GameState,
  phase?: TurnPhase,
): EventEnvelope[] {
  const timestamp = new Date().toISOString()
  let seq = startSeq
  const canonicalMoveUnitId = moveUnitId
  const movedUnit = getOnionOrDefender(canonicalMoveUnitId, state)
  const isOnionMove = movedUnit.kind === 'onion'
  const onion = isOnionMove ? state.onions[canonicalMoveUnitId] : undefined
  const moveUnitFriendlyName = resolveUnitFriendlyName(state, canonicalMoveUnitId)
  const events: EventEnvelope[] = [{
    seq: seq++,
    type: isOnionMove ? 'ONION_MOVED' : 'UNIT_MOVED',
    timestamp,
    ...(phase === undefined ? {} : { phase }),
    unitFriendlyName: moveUnitFriendlyName,
    ...(isOnionMove
      ? { onionId: canonicalMoveUnitId, to: command.to }
      : { unitId: canonicalMoveUnitId, to: command.to }),
  }]

  const rammedUnitIds = result.rammedUnitIds ?? []
  const rammedUnitResults = Array.isArray(result.rammedUnitResults) ? result.rammedUnitResults : []
  const destroyedUnitIds = rammedUnitResults.length > 0
    ? rammedUnitResults
      .filter((ramResult: { outcome?: { effect?: string } }) => ramResult.outcome?.effect === 'destroyed')
      .map((ramResult: { unitId: string }) => ramResult.unitId)
    : result.destroyedUnits ?? []
  if (rammedUnitIds.length > 0 || destroyedUnitIds.length > 0 || (result.treadDamage ?? 0) > 0) {
    events.push({
      seq: seq++,
      type: 'MOVE_RESOLVED',
      timestamp,
      ...(phase === undefined ? {} : { phase }),
      ...(isOnionMove ? { onionId: canonicalMoveUnitId } : {}),
      unitId: canonicalMoveUnitId,
      unitFriendlyName: moveUnitFriendlyName,
      rammedUnitIds,
      rammedUnitFriendlyNames: rammedUnitIds.map((unitId: string) => resolveUnitFriendlyName(state, unitId)),
      rammedUnitResults: rammedUnitResults.map((ramResult: { unitId: string; unitType: string; outcome: { effect: string; roll: number; treadCost: number } }) => ({
        unitId: ramResult.unitId,
        unitFriendlyName: resolveUnitFriendlyName(state, ramResult.unitId),
        unitType: ramResult.unitType,
        effect: ramResult.outcome.effect,
        roll: ramResult.outcome.roll,
        treadCost: ramResult.outcome.treadCost,
      })),
      destroyedUnitIds,
      destroyedUnitFriendlyNames: destroyedUnitIds.map((unitId: string) => resolveUnitFriendlyName(state, unitId)),
      treadDamage: result.treadDamage ?? 0,
    })
  }

  if (result.treadDamage !== undefined && result.treadDamage > 0) {
    const treadTargetId = formatCombatTargetId({ kind: 'treads', onionId: canonicalMoveUnitId })
    events.push({
      seq: seq++,
      type: 'ONION_TREADS_LOST',
      timestamp,
      ...(phase === undefined ? {} : { phase }),
      onionId: canonicalMoveUnitId,
      targetId: treadTargetId,
      targetFriendlyName: resolveTargetFriendlyName(state, treadTargetId),
      amount: result.treadDamage,
      remaining: onion?.treads,
    })
  }

  for (const destroyedId of destroyedUnitIds) {
    events.push({
      seq: seq++,
      type: 'UNIT_STATUS_CHANGED',
      timestamp,
      ...(phase === undefined ? {} : { phase }),
      unitId: destroyedId,
      unitFriendlyName: resolveUnitFriendlyName(state, destroyedId),
      from: 'operational',
      to: 'destroyed',
    })
  }

  return events
}