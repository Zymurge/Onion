import type { BattlefieldUnit } from './battlefieldView'

export function resolveInspectorStackCount(
  selectedInspectorDefender: BattlefieldUnit,
  selectedStackMemberCount: number,
): number {
  if (selectedInspectorDefender.type === 'LittlePigs') {
    return selectedStackMemberCount > 0 ? selectedStackMemberCount : (selectedInspectorDefender.squads ?? 1)
  }

  return 1
}