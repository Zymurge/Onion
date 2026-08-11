import { describe, expect, it } from 'vitest'
import { resolveBattlefieldStacksExpandable } from '../../../web/lib/stackSelection'

describe('stackSelection', () => {
  it('allows active defenders to expand stacks during movement or combat', () => {
    expect(resolveBattlefieldStacksExpandable({
      activeRole: 'defender',
      activeTurnActive: true,
      isCombatPhase: true,
      isMovementPhase: false,
    })).toBe(true)
  })
})