export type SessionRole = 'onion' | 'defender'

import type { EventEnvelope, GameState } from '../../types/index.js'
import type { ScenarioDetail } from '../api/client.js'

export type SessionStore = {
  baseUrl: string | null
  token: string | null
  userId: string | null
  username: string | null
  gameId: string | null
  role: SessionRole | null
  lastEventSeq: number | null
  scenarioId: string | null
  phase: string | null
  turnNumber: number | null
  winner: 'onion' | 'defender' | null
  gameState: GameState | null
  scenario: ScenarioDetail | null
  events: EventEnvelope[]
}

export function createSessionStore(): SessionStore {
  return {
    baseUrl: process.env.ONION_API_URL ?? 'http://localhost:3000',
    token: null,
    userId: null,
    username: null,
    gameId: null,
    role: null,
    lastEventSeq: null,
    scenarioId: null,
    phase: null,
    turnNumber: null,
    winner: null,
    gameState: null,
    scenario: null,
    events: [],
  }
}