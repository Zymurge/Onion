import { describe, it, expect } from 'vitest'
import * as api from '#server/cli/api/client'

describe('formatApiError', () => {
  it('formats error with code and message', () => {
    const err = api.formatApiError({
      status: 400,
      body: { error: 'fail', code: 'E_FAIL' },
      message: 'Bad request',
      ok: false,
    })
    expect(err).toMatch(/E_FAIL/)
    expect(err).toMatch(/fail/)
  })

  it('formats unknown error', () => {
    const err = api.formatApiError({ status: 500, body: {}, message: 'fail', ok: false })
    expect(err).toMatch(/fail/)
  })

  it('includes duplicate attacker hint', () => {
    const err = api.formatApiError({
      status: 422,
      body: { code: 'MOVE_INVALID', detailCode: 'DUPLICATE_ATTACKER', error: "Duplicate attacker 'wolf-1'" },
      message: 'Duplicate attacker',
      ok: false,
    })
    expect(err).toMatch(/DUPLICATE_ATTACKER/)
    expect(err).toMatch(/remove duplicate attackers/)
  })

  it('includes out-of-range attacker-order hint', () => {
    const err = api.formatApiError({
      status: 422,
      body: { code: 'MOVE_INVALID', detailCode: 'TARGET_OUT_OF_RANGE', error: "Attacker 'missile_1' is out of range" },
      message: 'Out of range',
      ok: false,
    })
    expect(err).toMatch(/TARGET_OUT_OF_RANGE/)
    expect(err).toMatch(/validated left-to-right/)
  })
})
