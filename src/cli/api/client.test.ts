import { describe, it, expect } from 'vitest'
import * as api from './client.js'

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
})
