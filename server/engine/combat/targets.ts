import { hexDistance } from '#shared/axialHex'
import type { GameMap } from '#server/engine/map'
import { formatCombatTargetId } from '#shared/combatTarget'
import type { GameState, GameUnit } from '#shared/types/index'
import { getAvailableWeapons } from '#shared/unitState'
import { getWeaponType } from '#shared/unitDefinitions'

/**
 * Get every live target within the firing unit's maximum weapon range.
 *
 * Onion targets are defender ids. Defender targets are explicit Onion tread
 * ids so the caller can distinguish a tread attack from a subsystem attack.
 */
export function getValidTargets(
  _map: GameMap,
  state: GameState,
  firingUnit: GameUnit,
): string[] {
  const maxRange = Math.max(...getAvailableWeapons(firingUnit).map((weapon) => getWeaponType(weapon.typeId).range), 0)
  const results: string[] = []

  if (firingUnit.role === 'onion') {
    for (const [id, unit] of Object.entries(state.defenders)) {
      if (unit.state === 'destroyed') continue
      if (hexDistance(firingUnit.position, unit.position) <= maxRange) {
        results.push(id)
      }
    }
  } else {
    for (const onion of Object.values(state.onions)) {
      if (hexDistance(firingUnit.position, onion.position) <= maxRange) {
        results.push(formatCombatTargetId({ kind: 'treads', onionId: onion.unitId }))
      }
    }
  }

  return results
}