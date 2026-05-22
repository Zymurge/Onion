import type { BattlefieldUnit } from './battlefieldView'

export function resolveInspectorStackCount(
  selectedInspectorDefender: BattlefieldUnit,
  selectedStackMemberCount: number,
): number {
  if (selectedInspectorDefender.type === 'LittlePigs') {
    if (selectedStackMemberCount <= 0) {
      throw new Error(`Missing stack member count for grouped unit ${selectedInspectorDefender.id}`)
    }

    return selectedStackMemberCount
  }

  return 1
}