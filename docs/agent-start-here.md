# Onion

Onion is an open-source, Shrek-themed reimplementation of the public-rule portions of Ogre. One player controls the Onion. The other defends with conventional units. The current game is the Mark III scenario, played in the web client against an authoritative server.

## How to read specs

Load only the row that matches the task. Do not open neighboring specs, archives, work-items, or generated HTML for extra context. If a task crosses two rows, load those two and stop. Skip the Ownership matrix unless the task is which module owns a behavior.

When a row names a line range, read only that range. Do not read the rest of that file.

## Default Rule

Do not read:

- docs/archive
- docs/work-items
- generated docs, i.e. docs/api/
- [cli-spec.md](cli-spec.md) and `server/cli/`
- [configuration.md](configuration.md) and server environment loading
- test output
- coverage reports

unless explicitly directed.

## Spec Maintenance

When introducing or renaming source files it is imperative to update this document to reflect those changes.

## Task router

| Task | Load | Code |
| --- | --- | --- |
| Version scope or deferred work | [v1-v2-scope.md](work-items/v1-v2-scope.md) | Read this before selecting adjacent work. Do not implement V2 items unless the user explicitly expands scope. |
| Unit or weapon numbers, ram profile, stack-size limit, or terrain flags | `shared/config/unitCatalog.json` | `shared/unitDefinitions.ts`. Do not take these numbers from [game-rules.md](game-rules.md) |
| Movement legality | `shared/movementRules.ts` | `shared/moveValidator.ts` |
| Stack membership, split, or merge | `shared/stackRoster/index.ts` | Do not infer membership from co-location or from [game-rules.md](game-rules.md) |
| Combat odds and modifiers | `shared/combatCalculator.ts` | `shared/staticRules.ts` owns the ridgeline defense bonus |
| CRT letters | `server/engine/combat/rolls.ts` CRT constant | The table in [game-rules.md](game-rules.md) currently matches. It does not override the code |
| Onion tread movement bands | `shared/movementAllowance.ts` | Catalog `treadsPerMove` is declared but not read by that function |
| Stack damage or one missile per turn | `server/engine/combat/actions.ts` | [game-rules.md](game-rules.md) describes the same behavior. Do not edit the prose alone |
| Onion subsystem or target-specific damage results | `server/engine/combat/outcomes.ts` | [game-rules.md](game-rules.md) describes the same behavior. Do not edit the prose alone |
| Phases and recovery | [game-rules.md](game-rules.md) `## Turn Structure` and `### Unit Status Lifecycle` | `server/engine/game.ts` owns phase advancement, recovery maintenance, and phase events. `server/engine/phases.ts` owns phase order, actors, and reusable cleanup helpers. |
| Victory objectives | [scenario-schema.md](scenario-schema.md) | `server/engine/victory.ts` evaluates explicit, role-owned objectives. `server/api/gameHelpers/victory.ts` adapts the evaluator to API responses. The victory prose in [game-rules.md](game-rules.md) does not override the scenario |
| Scenario JSON authoring | [scenario-schema.md](scenario-schema.md) | `scenarios/` and `server/engine/scenarioSchema.ts` |
| Invalid snapshots or read retry | [snapshot-deprecation-policy.md](snapshot-deprecation-policy.md) | Do not also load the API or web copies |
| Account registration or login | [user-account-spec.md](user-account-spec.md) | `server/api/auth.ts` |
| Register or login transport | [api-contract.md](api-contract.md) `### POST /auth/register` and `### POST /auth/login` | `server/api/auth.ts` |
| Game API route registration or ownership | [api-contract.md](api-contract.md) | Start at `server/api/gameRoutes/index.ts`, then load the smallest route-family module named below |
| Create, list, join, or start a game | [api-contract.md](api-contract.md) `## Games`, using the named `POST /games`, `GET /games`, `GET /games/open`, `POST /games/{id}/join`, and `POST /games/{id}/start` headings | `server/api/gameRoutes/index.ts`, then `lifecycleRoutes.ts` or `lobbyRoutes.ts` |
| Fetch one game | [api-contract.md](api-contract.md) `### GET /games/{id}` | `server/api/gameRoutes/stateRoutes.ts` |
| Snapshot freshness and conditional refresh | [api-contract.md](api-contract.md) `### Snapshot refresh` and `### GET /games/{id}` | `server/api/gameRoutes/stateRoutes.ts`, `server/db/`, `shared/apiProtocol.ts`, `web/lib/httpGameClient.ts`; `eventSeq` remains the event cursor |
| Submit an action | [api-contract.md](api-contract.md) `### POST /games/{id}/actions`, then one command heading | `server/api/gameRoutes/actionRoutes.ts`, then the matching `actionHandlers/` module |
| MOVE command | [api-contract.md](api-contract.md) `### MOVE` | `server/engine/movement.ts` |
| FIRE command | [api-contract.md](api-contract.md) `### FIRE` and `#### Combat Target IDs` | `server/engine/combat/actions.ts` |
| END_PHASE command | [api-contract.md](api-contract.md) `### END_PHASE` | `server/api/gameRoutes/actionHandlers/endPhase.ts` |
| Event polling | [api-contract.md](api-contract.md) `### GET /games/{id}/events?after={seq}` | `server/api/gameRoutes/eventRoutes.ts` |
| Event envelope | [api-contract.md](api-contract.md) `## Event Types`, then one event family heading | `shared/websocketProtocol.ts` |
| Movement events | [api-contract.md](api-contract.md) `### Movement Events` | `server/api/gameRoutes/actionHandlers/move.ts` |
| Combat events | [api-contract.md](api-contract.md) `### Combat Events` | `server/api/gameRoutes/actionHandlers/fire.ts` |
| State-change events | [api-contract.md](api-contract.md) `### State Change Events` | `server/api/gameRoutes/actionHandlers/move.ts` or `fire.ts` |
| Phase and game events | [api-contract.md](api-contract.md) `### Phase / Game Events` | `server/api/gameRoutes/actionHandlers/endPhase.ts` |
| Sync events, including SESSION_INIT | [api-contract.md](api-contract.md) `### Sync Event` | `server/api/gameRoutes/websocketRoutes.ts` and `shared/websocketProtocol.ts` |
| Per-game WebSocket stream | [api-contract.md](api-contract.md) `### Sync Event` | `server/api/gameRoutes/websocketRoutes.ts` |
| Client snapshot diagnostics | [api-contract.md](api-contract.md) | `server/api/gameRoutes/diagnosticRoutes.ts` |
| Scenario parsing, loading, or map checks for game API | [scenario-schema.md](scenario-schema.md) | `server/api/gameHelpers/scenario.ts` |
| Game state response projection | [api-contract.md](api-contract.md) `### GET /games/{id}` | `server/api/gameHelpers/stateProjection.ts` |
| API victory adaptation | [scenario-schema.md](scenario-schema.md) | `server/api/gameHelpers/victory.ts`, with evaluation owned by `server/engine/victory.ts` |
| MOVE or FIRE event construction | [api-contract.md](api-contract.md) `### Movement Events` and `### Combat Events` | `server/api/gameHelpers/eventBuilders.ts` |
| Successful action response construction | [api-contract.md](api-contract.md) `### POST /games/{id}/actions` | `server/api/gameHelpers/actionResponses.ts` |
| WebSocket protocol parsing or serialization | [api-contract.md](api-contract.md) `### Sync Event` | `server/api/gameHelpers/protocol.ts` |
| Action or event delivery logging | [api-contract.md](api-contract.md) | `server/api/gameHelpers/logging.ts` |
| Game ID parsing | [api-contract.md](api-contract.md) | `server/api/gameHelpers/ids.ts` |
| Game API helper catalog or cross-helper entry point | [api-contract.md](api-contract.md) | `server/api/gameHelpers/index.ts`, then the owning helper module |
| Scenario map requirement | [api-contract.md](api-contract.md) `## Scenario Map` | `shared/scenarioMap.ts` |
| Error body or error code | [api-contract.md](api-contract.md) `## Error Response Shape` and `### Known Error Codes` | `server/api/` |
| Board snapshot fields | [api-contract.md](api-contract.md) `## Shared Types` and `### GameState` | `shared/types/` |
| Web lobby, board, combat UI, turn display, or client errors | [web-ui-spec.md](web-ui-spec.md), then the one area spec it names. Skip Future State | The module that area spec names |
| Match storage or migrations | [persistence.md](persistence.md) | `server/db/` |
| Which test to add or run | [testing-strategy.md](testing-strategy.md) through the layer map only. Skip the editor-troubleshooting section | The one test directory in that row |

Weapon and unit data live in `shared/config/unitCatalog.json` and `shared/unitDefinitions.ts`, not in the rules prose. Scenario JSON does not author targeting restrictions.

## Ownership matrix

Read this section only when choosing a module. One sentence is the responsibility. A flag means do not treat that file as the only, or the canonical, owner.

Flags: `D+M` decides and mutates in one module. `DUP` has a second implementation. `WRAP` is a compatibility surface. `UNCLEAR` mixes jobs an agent can misread.

Edit the shared rule for a decision. Edit the execution owner only for mutation, adaptation, or transport. Do not add behavior to a `WRAP` row.

| Module | Responsibility | Flags |
| --- | --- | --- |
| `shared/config/unitCatalog.json` | Stores unit, weapon, ram, stack-size, and terrain-flag numbers. | `DUP`: `treadsPerMove` is declared and not read. |
| `shared/unitDefinitions.ts` | Parses the catalog and exposes definition accessors. | |
| `shared/movementRules.ts` | Decides terrain access, move cost, and occupied-hex legality. | |
| `shared/movementAllowance.ts` | Decides Onion tread-band movement allowance. | `DUP`: hardcodes the 15-tread bands instead of reading the catalog. |
| `shared/unitMovement.ts` | Exposes phase-aware allowance and movement-spent counters. | `D+M`: spent-counter helpers mutate units. `WRAP`: ridgeline crossing delegates to `movementRules.ts`. |
| `shared/moveValidator.ts` | Validates one move command against the shared movement rules. | |
| `shared/movePlanner.ts` | Finds legal paths and reachable hexes. | |
| `shared/stackRoster/index.ts` | Owns canonical membership and split, merge, move, and relocate transitions. | |
| `shared/stackNaming/index.ts` | Owns group labels and naming snapshots. | `D+M`: `StackNamingEngine` mutates its own naming state. |
| `shared/combatCalculator.ts` | Decides attack strength, defense strength, modifiers, and CRT odds bands. | |
| `shared/staticRules.ts` | Owns the ridgeline defense bonus and the calculator's static rules bundle. | |
| `shared/targetRules.ts` | Decides whether a weapon may target a unit type. | |
| `shared/rammingCalculator.ts` | Decides ram tread cost and destruction outcome. | |
| `shared/combatTarget.ts` | Formats and parses tread and subsystem target ids. | |
| `shared/axialHex.ts` | Owns axial distance, neighbors, and hex keys. | |
| `shared/scenarioMap.ts` | Materializes an authored map and tests position membership. | |
| `shared/unitState.ts` | Looks up live units and reports weapon availability. | `D+M`: weapon destruction mutates the unit. `DUP`: second-move, immobile, and defense helpers overlap the movement facade and combat calculator. |
| `shared/unitWeapons.ts` | Mutates one weapon list for spend, recharge, and destroy. | `D+M` |
| `shared/apiProtocol.ts` | Defines REST success, failure, and game-response types. | `UNCLEAR`: also contains a fetch client and debug traffic log. Production web calls use `web/lib/httpGameClient.ts`. |
| `shared/protocolSchemas.ts` | Owns runtime Zod schemas for commands, game snapshots, action responses, and unchanged conditional-read envelopes. | |
| `shared/websocketProtocol.ts` | Defines WebSocket message shapes. | |
| `shared/types/` | Defines canonical game, command, and event types. | |
| `server/engine/movement.ts` | Adapts engine state to the shared move validator and applies the accepted plan. | `D+M`: owns movement execution, state mutation, ramming application, and stack reconciliation. |
| `server/engine/combat/index.ts` | Re-exports the public combat engine surface. | `WRAP` |
| `server/engine/combat/actions.ts` | Validates FIRE commands and executes accepted plans against live state. | `D+M` |
| `server/engine/combat/outcomes.ts` | Resolves target-specific CRT effects and applies combat damage. | `D+M` |
| `server/engine/combat/rolls.ts` | Owns CRT lookup, die rolling, and engine odds delegation. | `WRAP`: `calculateEngineCombatOdds` delegates to the shared odds band. |
| `server/engine/combat/targets.ts` | Finds live targets within a firing unit's maximum range. | |
| `server/engine/combat/types.ts` | Defines combat plans, validation results, rolls, and outcome contracts. | |
| `server/engine/map.ts` | Builds the engine map and tests hex membership. | `D+M`: owns engine map construction and membership; `hasLineOfSight` remains an unused deprecated compatibility helper. |
| `server/engine/phases.ts` | Owns phase order, phase actor, and reusable destroyed-unit cleanup helpers. | `D+M`: cleanup helpers mutate the supplied state. |
| `server/engine/victory.ts` | Evaluates scenario objectives with map, state, turn, and event context, then selects the winning role. | `D+M` |
| `server/engine/game.ts` | Owns phase advancement, recovery maintenance, state metadata, and phase events for the API. | `D+M` |
| `server/engine/scenarioSchema.ts` | Validates authored scenario JSON. | |
| `server/engine/scenarioNormalizer.ts` | Builds the initial game state from scenario deployments. | |
| `server/engine/units.ts` | Re-exports catalog, unit-state, and allowance helpers. | `WRAP`: not an owner. |
| `server/engine/index.ts` | Re-exports the active engine surface. | `WRAP` |
| `server/api/gameRoutes/lifecycleRoutes.ts` | Owns create, join, and start route registration and lifecycle persistence. | |
| `server/api/gameRoutes/lobbyRoutes.ts` | Owns active/history/open listings and archive, restore, and delete management. | `D+M`: delete also closes live sockets and broadcasts `GAME_DELETED`. |
| `server/api/gameRoutes/stateRoutes.ts` | Owns authenticated current-game state projection and conditional snapshot freshness reads. | |
| `server/api/gameRoutes/actionRoutes.ts` | Owns action authorization, lifecycle guards, command dispatch, and shared action error mapping. | |
| `server/api/gameRoutes/actionHandlers/endPhase.ts` | Owns END_PHASE execution, persistence, event logging, and broadcast adaptation. | `D+M` |
| `server/api/gameRoutes/actionHandlers/move.ts` | Owns MOVE validation, execution, persistence, event logging, and broadcast adaptation. | `D+M` |
| `server/api/gameRoutes/actionHandlers/fire.ts` | Owns FIRE validation, execution, persistence, event logging, and broadcast adaptation. | `D+M` |
| `server/api/gameRoutes/actionHandlers/types.ts` | Defines the typed context and response boundary shared by action handlers. | |
| `server/api/gameRoutes/websocketRoutes.ts` | Owns authenticated per-game WebSocket setup, session initialization, snapshots, presence, resume, and event delivery. | `D+M`: connection and presence lifecycle is coordinated here and in `context.ts`. |
| `server/api/gameRoutes/diagnosticRoutes.ts` | Owns client snapshot diagnostic validation, logging, and terminal abort-event emission. | `D+M` |
| `server/api/gameRoutes/eventRoutes.ts` | Owns authenticated persisted-event polling and exclusive sequence-cursor reads. | |
| `server/api/gameRoutes/context.ts` | Owns per-plugin live connection, presence, broadcast, and deterministic-roll context. | `D+M`: context-owned maps track active connections and timers. |
| `server/api/gameRoutes/index.ts` | Registers the complete game plugin in Fastify order and exposes the route context and route-family registrars. | |
| `server/api/gameHelpers/actionResponses.ts` | Builds successful action response payloads, including the client-visible snapshot revision, from persisted match metadata and post-action state. | |
| `server/api/gameHelpers/eventBuilders.ts` | Adapts engine combat and movement results into API event envelopes. | |
| `server/api/gameHelpers/ids.ts` | Parses positive safe game ids from route parameters. | |
| `server/api/gameHelpers/logging.ts` | Emits structured action and event delivery logs. | |
| `server/api/gameHelpers/protocol.ts` | Builds session catalogs and serializes or parses WebSocket envelopes. | |
| `server/api/gameHelpers/scenario.ts` | Validates, translates, loads, and projects scenario snapshots for API use. | |
| `server/api/gameHelpers/stateProjection.ts` | Clones engine state and projects persisted matches into client-facing state responses. | |
| `server/api/gameHelpers/victory.ts` | Adapts canonical engine victory evaluation to API objective states and user ids. | `WRAP`: evaluation remains owned by `server/engine/victory.ts`. |
| `server/api/gameHelpers/index.ts` | Catalogs the extracted game API helpers for layer-level imports. | `WRAP`: delegates to the owning helper modules. |
| `server/api/auth.ts` | Owns registration and login routes. | |
| `server/api/scenarios.ts` | Owns scenario list and detail routes. | |
| `server/db/` | Stores users, matches, and monotonic client-visible snapshot revisions through the adapter contract and migrations. | |
| `scripts/benchmark-projection.ts` | Measures server snapshot and action-response projection cost for the architecture review. | `WRAP`: measurement only; it does not own projection behavior. |
| `server/app.ts` | Composes the HTTP server, routes, and database adapter. | |
| `web/lib/gameSessionTypes.ts` | Defines the session controller and transport contracts. | |
| `web/lib/gameSessionController.ts` | Loads the authoritative snapshot and owns refresh, sequencing, and cleanup. | |
| `web/lib/useGameSession.ts` | Adapts the session controller to React. | |
| `web/lib/appSessionWiring.ts` | Selects one session binding and constructs the active controller. | |
| `web/lib/useConnectionGate.ts` | Authenticates and creates the interactive session binding. | |
| `web/lib/httpGameClient.ts` | Maps production HTTP requests, retries, response validation, and the snapshot revision cursor. | |
| `web/lib/liveEventSource.ts` | Parses WebSocket events and reports connection state. | |
| `web/lib/gameClient.ts` | Holds the legacy request seam and shared action types. | `WRAP`: still used by the HTTP client; not a second transport policy. |
| `web/lib/liveGameClient.ts` | Combines the legacy request client with the live event source. | `WRAP`: no production caller. |
| `web/lib/interactionRouting.ts` | Decides map and subject interaction intent. | |
| `web/lib/shellControlRouting.ts` | Decides which header controls are enabled. | |
| `web/lib/rightRailControlRouting.ts` | Decides which right-rail controls are enabled. | |
| `web/lib/appCommands.ts` | Turns shell decisions into submitted actions. | |
| `web/lib/battlefieldInteraction/index.ts` | Public battlefield interaction hook and contract entry point. | |
| `web/lib/battlefieldInteraction/types.ts` | Defines interaction inputs, client-local state, prompts, and controller result contracts. | |
| `web/lib/battlefieldInteraction/useBattlefieldInteractionState.ts` | Owns React state, effects, prompts, and interaction-triggered submissions; does not own stack membership. | |
| `web/lib/battlefieldInteraction/selection.ts` | Filters snapshot selections and projects phase-visible stack selection sources. | Stack membership remains owned by `stackSelection.ts`. |
| `web/lib/battlefieldInteraction/movement.ts` | Builds move-map snapshots and detects ram prompts. | |
| `web/lib/selectionIds.ts` | Parses UI selection aliases and translates combat targets. | Aliases are not unit identity. |
| `web/lib/stackSelection.ts` | Resolves roster-backed members and phase-visible projections. | Not a membership owner. |
| `web/lib/rightRailSelection.ts` | Builds stack selection models and MOVE or FIRE payloads. | |
| `web/lib/commitActionBuilders.ts` | Adapts selections into the right-rail commit payloads. | Not a second command authority. |
| `web/lib/battlefieldDisplay/index.ts` | Public battlefield display state and snapshot-validation entry point. | |
| `web/lib/battlefieldDisplay/useBattlefieldDisplayState.ts` | Owns the React memo wrapper for display state. | |
| `web/lib/battlefieldDisplay/snapshotValidation.ts` | Validates snapshot completeness and canonical stack projection. | |
| `web/lib/battlefieldDisplay/snapshotHandoff.ts` | Builds the locked combat-to-move handoff snapshot. | |
| `web/lib/battlefieldDisplay/projection.ts` | Builds the pure battlefield display model. | |
| `web/lib/battlefieldViewBuilders.ts` | Builds live unit, map, and range display models. | |
| `web/lib/battlefieldGroupProjection.ts` | Projects the shared roster index for rails and the board. | |
| `web/lib/battlefieldNaming.ts` | Resolves display labels from shared naming data. | Does not own group identity. |
| `web/lib/hexPixelLayout.ts` | Converts axial coordinates to pixel layout. | |
| `web/lib/combatOdds.ts` | Formats preview odds through the shared CRT band. | `WRAP` |
| `web/lib/combatPreview.ts` | Builds combat target options for display. | |
| `web/lib/sessionCatalog.ts` | Reads the catalog payload supplied to the session. | Not a second numeric catalog. |
| `web/lib/inactiveEvents/index.ts` | Public inactive-event stream and timeline entry point. | |
| `web/lib/inactiveEvents/useInactiveEventStream.ts` | Polls and buffers inactive-player events, owns React state, effects, and dismissal. | |
| `web/lib/inactiveEvents/timeline.ts` | Groups inactive events into display-ready timeline entries. | |
| `web/lib/inactiveEvents/formatting.ts` | Builds inactive-event summaries, detail lines, and connection-noise filtering. | |
