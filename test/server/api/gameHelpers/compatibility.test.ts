import { describe, expect, it } from 'vitest'

import { buildSessionInitPayload, parseGameId } from '#server/api/gamesHelpers'

describe('gamesHelpers compatibility barrel', () => {
  it('continues to expose extracted helpers through the legacy import path', () => {
    expect(parseGameId('12')).toBe(12)
    expect(buildSessionInitPayload()).toHaveProperty('unitTypes')
  })
})
