import { describe, expect, it } from 'vitest'
import { getPhaseAdvanceLabel, getPhaseOwner } from '../../../web/lib/battlefieldViewBuilders'

describe('battlefieldViewBuilders', () => {
  it('resolves phase ownership and advancement labels', () => {
    expect(getPhaseOwner('DEFENDER_COMBAT')).toBe('defender')
    expect(getPhaseAdvanceLabel('ONION_MOVE', 'onion')).toBe('Start Combat')
  })
})