import type { FastifyInstance, FastifyPluginAsync } from 'fastify'

import { createGameRouteContext, type GameRouteOptions } from './context.js'
import { registerLifecycleRoutes } from './lifecycleRoutes.js'
import { registerLobbyRoutes } from './lobbyRoutes.js'
import { registerStateRoutes } from './stateRoutes.js'
import { registerActionRoutes } from './actionRoutes.js'
import { registerWebSocketRoutes } from './websocketRoutes.js'
import { registerDiagnosticRoutes } from './diagnosticRoutes.js'
import { registerEventRoutes } from './eventRoutes.js'

/** Registers the complete game API route surface in Fastify order. */
export const gameRoutes: FastifyPluginAsync<GameRouteOptions> = async (app: FastifyInstance, opts) => {
	const routeContext = createGameRouteContext(opts)
	await registerLifecycleRoutes(app, routeContext)
	await registerLobbyRoutes(app, routeContext)
	await registerStateRoutes(app, routeContext)
	await registerWebSocketRoutes(app, routeContext)
	await registerDiagnosticRoutes(app, routeContext)
	await registerActionRoutes(app, routeContext)
	await registerEventRoutes(app, routeContext)
}

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