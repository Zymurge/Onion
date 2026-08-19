import { describe, expect, it } from 'vitest'

import { loadConfig } from '#server/config/loadConfig'

const validEnvironment = {
  PORT: '4310',
  HOST: '127.0.0.1',
  DATABASE_URL: 'postgres://user:password@localhost:5432/onion',
  JWT_SECRET: 'test-jwt-secret-that-is-long-enough',
  NODE_ENV: 'production',
  LOG_LEVEL: 'info',
  SCENARIOS_DIR: '/srv/onion/scenarios',
}

describe('loadConfig', () => {
  it('loads and normalizes all required server values', () => {
    expect(loadConfig({
      ...validEnvironment,
      HOST: ' 0.0.0.0 ',
      DATABASE_URL: ' postgres://user:password@localhost:5432/onion ',
      SCENARIOS_DIR: ' /srv/onion/scenarios ',
    })).toEqual({
      port: 4310,
      host: '0.0.0.0',
      databaseUrl: 'postgres://user:password@localhost:5432/onion',
      jwtSecret: 'test-jwt-secret-that-is-long-enough',
      nodeEnv: 'production',
      logLevel: 'info',
      scenariosDir: '/srv/onion/scenarios',
    })
  })

  for (const key of Object.keys(validEnvironment)) {
    it(`rejects a missing ${key}`, () => {
      const environment = { ...validEnvironment }
      delete environment[key as keyof typeof environment]

      expect(() => loadConfig(environment)).toThrow(new RegExp(`required.*${key}`))
    })
  }

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ ...validEnvironment, PORT: 'not-a-port' })).toThrow(/PORT/)
  })

  it('rejects an unsupported environment or log level', () => {
    expect(() => loadConfig({ ...validEnvironment, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/)
    expect(() => loadConfig({ ...validEnvironment, LOG_LEVEL: 'verbose' })).toThrow(/LOG_LEVEL/)
  })

  it('does not supply defaults for blank required values', () => {
    expect(() => loadConfig({ ...validEnvironment, HOST: ' ' })).toThrow(/HOST/)
    expect(() => loadConfig({ ...validEnvironment, SCENARIOS_DIR: '' })).toThrow(/SCENARIOS_DIR/)
  })
})
