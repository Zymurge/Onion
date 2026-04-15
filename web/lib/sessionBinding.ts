import type { GameRequestTransport, LiveEventSource } from './gameSessionTypes'

export type SessionBinding = {
  gameId: number
  requestTransport: GameRequestTransport
  liveEventSource: LiveEventSource
}
