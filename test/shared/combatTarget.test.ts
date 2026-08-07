import { describe, expect, it } from 'vitest'

import { formatCombatTargetId, parseCombatTargetId } from '#shared/combatTarget'

describe('combat target IDs', () => {
  it('parses an explicit Onion treads target', () => {
    expect(parseCombatTargetId('onion-1:treads')).toEqual({
      kind: 'treads',
      onionId: 'onion-1',
    })
  })

  it('formats an explicit Onion treads target', () => {
    expect(formatCombatTargetId({ kind: 'treads', onionId: 'onion-1' })).toBe('onion-1:treads')
  })

  it('round-trips an explicit Onion treads target', () => {
    const targetId = 'onion-1:treads'

    expect(formatCombatTargetId(parseCombatTargetId(targetId)!)).toBe(targetId)
  })

  it('does not interpret a bare Onion ID as a treads target', () => {
    expect(parseCombatTargetId('onion-1')).toBeNull()
  })

  it('does not interpret a weapon ID as a treads target', () => {
    expect(parseCombatTargetId('main')).toBeNull()
  })

  it.each([
    ':treads',
    'onion-1:',
    'onion-1:weapon',
    'onion-1:tracks',
    'onion-1:treads:extra',
  ])('rejects malformed or unrelated structured target %s', (targetId) => {
    expect(parseCombatTargetId(targetId)).toBeNull()
  })
})
