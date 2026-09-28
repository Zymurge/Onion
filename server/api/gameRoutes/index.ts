/** Fastify game route plugin retained as the public route registration entry point. */
export { gameRoutes } from '#server/api/games'
/** Creates the shared context used by game HTTP and WebSocket handlers. */
export { createGameRouteContext } from './context.js'
export type { GameRouteContext, GameRouteOptions } from './context.js'
/** Registers create, join, and start routes. */
export { registerLifecycleRoutes } from './lifecycleRoutes.js'
/** Registers lobby listing and match-management routes. */
export { registerLobbyRoutes } from './lobbyRoutes.js'
/** Registers the authenticated current-game state route. */
export { registerStateRoutes } from './stateRoutes.js'
/** Registers the authenticated per-game WebSocket stream. */
export { registerWebSocketRoutes } from './websocketRoutes.js'
/** Registers the client snapshot diagnostic endpoint. */
export { registerDiagnosticRoutes } from './diagnosticRoutes.js'
/** Registers the authenticated persisted-event polling endpoint. */
export { registerEventRoutes } from './eventRoutes.js'