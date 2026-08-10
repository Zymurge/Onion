import { describe, expect, it } from 'vitest'
import { createE2ERamRollsFactory } from '#server/engine/e2eRamRolls'

describe('createE2ERamRollsFactory', () => {
  it('returns an isolated finite queue for each game', () => {
    const factory = createE2ERamRollsFactory('1, 6')
    expect(factory).toBeDefined()

    const first = factory!()
    const second = factory!()
    expect([first.next(), first.next()]).toEqual([1, 6])
    expect(second.next()).toBe(1)
    expect(() => first.next()).toThrow(/exhausted/)
  })

  it('rejects invalid configured rolls and ignores an absent configuration', () => {
    expect(createE2ERamRollsFactory(undefined)).toBeUndefined()
    expect(() => createE2ERamRollsFactory('1,7')).toThrow(/integer between 1 and 6/)
  })

  it('uses a scenario-specific sequence when one is configured', () => {
    const factory = createE2ERamRollsFactory('1', 'e2e-failed-ram-01=6')

    expect(factory!('e2e-failed-ram-01').next()).toBe(6)
    expect(factory!('e2e-ram-01').next()).toBe(1)
  })
})