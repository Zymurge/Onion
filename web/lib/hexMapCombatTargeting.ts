import { formatCombatTargetId } from '../../shared/combatTarget.js'
import type { BattlefieldOnionView, BattlefieldUnit } from './battlefieldView.js'

export type HexCombatOccupant = BattlefieldUnit | BattlefieldOnionView
export type CombatRole = 'onion' | 'defender' | null

/** Resolves the canonical target id represented by a map occupant. */
export function getCombatTargetIdForOccupant(
  occupant: HexCombatOccupant,
  activeCombatRole: CombatRole,
  onion: BattlefieldOnionView,
): string {
  if (activeCombatRole === 'defender' && occupant.id === onion.id) {
    return formatCombatTargetId({ kind: 'treads', onionId: onion.id })
  }

  return occupant.id
}

/** Reports whether an occupant is a legal target for the active combat role. */
export function isCombatTargetSelectable(
  occupant: HexCombatOccupant,
  activeCombatRole: CombatRole,
  onion: BattlefieldOnionView,
  combatTargetIds?: ReadonlySet<string>,
): boolean {
  const combatTargetId = getCombatTargetIdForOccupant(occupant, activeCombatRole, onion)
  const isOpponent = activeCombatRole === 'onion'
    ? occupant.id !== onion.id
    : activeCombatRole === 'defender' && occupant.id === onion.id

  return isOpponent && (combatTargetIds === undefined || combatTargetIds.has(combatTargetId))
}

/** Reports whether a cell occupant matches the current target selection. */
export function isCombatTargetSelected(
  occupant: HexCombatOccupant,
  activeCombatRole: CombatRole,
  onion: BattlefieldOnionView,
  selectedCombatTargetId: string | null | undefined,
): boolean {
  if (selectedCombatTargetId === undefined || selectedCombatTargetId === null) {
    return false
  }

  const combatTargetId = getCombatTargetIdForOccupant(occupant, activeCombatRole, onion)
  return combatTargetId === selectedCombatTargetId
    || (activeCombatRole === 'defender' && occupant.id === onion.id && (
      selectedCombatTargetId.startsWith(`${onion.id}:`) || selectedCombatTargetId.startsWith('weapon:')
    ))
}