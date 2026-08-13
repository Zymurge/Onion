import { describe, expect, it } from 'vitest'
import {
  buildCombatTargetActionId,
  buildWeaponSelectionId,
  isWeaponSelectionId,
  normalizeSelectionIds,
  parseStackMemberSelectionId,
  resolveSelectionOwnerUnitId,
  stripWeaponSelectionId,
} from '../../../web/lib/selectionIds'

describe('selectionIds', () => {
  it('round-trips weapon selections and resolves their action ID', () => {
    const selectionId = buildWeaponSelectionId('cannon-1')

    expect(isWeaponSelectionId(selectionId)).toBe(true)
    expect(stripWeaponSelectionId(selectionId)).toBe('cannon-1')
    expect(buildCombatTargetActionId(selectionId, undefined)).toBe('cannon-1')
  })

  it('resolves stack-member selection ownership', () => {
    expect(parseStackMemberSelectionId('stack-member:pigs-1:2')).toEqual({
      unitId: 'pigs-1',
      memberIndex: 2,
    })
    expect(resolveSelectionOwnerUnitId('stack-member:pigs-1:2')).toBe('pigs-1')
  })

  it('normalizes selections to unique allowed IDs', () => {
    expect(normalizeSelectionIds(['a', 'a', 'b'], ['a'])).toEqual(['a'])
  })
})