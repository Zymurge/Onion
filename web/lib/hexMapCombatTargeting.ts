import { formatCombatTargetId } from '../../shared/combatTarget.js'
import type { BattlefieldOnionView, BattlefieldUnit } from './battlefieldView.js'
import type { OccupantRosterIndex } from './hexMapOccupancy.js'

export type HexCombatOccupant = BattlefieldUnit | BattlefieldOnionView
export type CombatRole = 'onion' | 'defender' | null

/** Resolves the canonical target id represented by a map occupant. */
export function getCombatTargetIdForOccupant(
  occupant: HexCombatOccupant,
  activeCombatRole: CombatRole,
  onion: BattlefieldOnionView,
  rosterIndex?: OccupantRosterIndex | null,
): string {
  if (activeCombatRole === 'defender' && occupant.unitId === onion.unitId) {
    return formatCombatTargetId({ kind: 'treads', onionId: onion.unitId })
  }

  if (activeCombatRole === 'onion') {
    const rosterGroup = rosterIndex?.getUnitGroup(occupant.unitId) ?? null
    if (rosterGroup !== null) {
      return rosterGroup.groupId
    }
  }

  return occupant.unitId
}

/** Reports whether an occupant is a legal target for the active combat role. */
export function isCombatTargetSelectable(
  occupant: HexCombatOccupant,
  activeCombatRole: CombatRole,
  onion: BattlefieldOnionView,
  combatTargetIds?: ReadonlySet<string>,
  rosterIndex?: OccupantRosterIndex | null,
): boolean {
  const combatTargetId = getCombatTargetIdForOccupant(occupant, activeCombatRole, onion, rosterIndex)
  const isOpponent = activeCombatRole === 'onion'
    ? occupant.unitId !== onion.unitId
    : activeCombatRole === 'defender' && occupant.unitId === onion.unitId

  return isOpponent && (combatTargetIds === undefined || combatTargetIds.has(combatTargetId))
}

/** Reports whether a cell occupant matches the current target selection. */
export function isCombatTargetSelected(
  occupant: HexCombatOccupant,
  activeCombatRole: CombatRole,
  onion: BattlefieldOnionView,
  selectedCombatTargetId: string | null | undefined,
  rosterIndex?: OccupantRosterIndex | null,
): boolean {
  if (selectedCombatTargetId === undefined || selectedCombatTargetId === null) {
    return false
  }

  const combatTargetId = getCombatTargetIdForOccupant(occupant, activeCombatRole, onion, rosterIndex)
  return combatTargetId === selectedCombatTargetId
    || (activeCombatRole === 'defender' && occupant.unitId === onion.unitId && (
      selectedCombatTargetId.startsWith(`${onion.unitId}:`) || selectedCombatTargetId.startsWith('weapon:')
    ))
}