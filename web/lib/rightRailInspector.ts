import type { BattlefieldDefenderView } from './battlefieldView'

export function resolveInspectorStackCount(
  selectedInspectorDefender: BattlefieldDefenderView,
  selectedStackMemberCount: number,
): number {
  if (selectedInspectorDefender.typeId === 'LittlePigs') {
    if (selectedStackMemberCount <= 0) {
      throw new Error(`Missing stack member count for grouped unit ${selectedInspectorDefender.unitId}`)
    }

    return selectedStackMemberCount
  }

  return 1
}