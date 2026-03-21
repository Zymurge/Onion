import type { SessionRole } from './session/store.js'

export type CliCommand =
  | { kind: 'help'; topic?: string }
  | { kind: 'exit' }
  | { kind: 'status' }
  | { kind: 'debug'; enabled?: boolean }
  | { kind: 'config-show' }
  | { kind: 'config-set-url'; url: string }
  | { kind: 'register'; username: string; password: string }
  | { kind: 'login'; username: string; password: string }
  | { kind: 'scenarios' }
  | { kind: 'scenario-show'; scenarioId: string }
  | { kind: 'game-create'; scenarioId: string; role: SessionRole }
  | { kind: 'game-join'; gameId: string }
  | { kind: 'game-load'; gameId: string }
  | { kind: 'refresh' }
  | { kind: 'show'; target?: 'map' | 'state' | 'units' | 'onion' | 'defenders' | 'events' }
  | { kind: 'events'; after?: number }
  | { kind: 'move'; unitId: string; to: { q: number; r: number } }
  | { kind: 'fire-weapon'; weaponType: 'main' | 'secondary' | 'ap' | 'missile'; weaponIndex: number; targetId: string }
  | { kind: 'fire-unit'; unitId: string; targetId: string }
  | { kind: 'combined-fire'; unitIds: string[]; targetId: string }
  | { kind: 'end-phase' }

export type ParseResult =
  | { ok: true; command: CliCommand }
  | { ok: false; error: string }