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
| Unit or weapon numbers, ram profile, stack-size limit, or terrain flags | `shared/config/unitCatalog.json` | `shared/unitDefinitions.ts`. Do not take these numbers from [game-rules.md](game-rules.md) |
| Movement legality | `shared/movementRules.ts` | `shared/moveValidator.ts` |
| Stack membership, split, or merge | `shared/stackRoster.ts` | Do not infer membership from co-location or from [game-rules.md](game-rules.md) |
| Combat odds and modifiers | `shared/combatCalculator.ts` | `shared/staticRules.ts` owns the ridgeline defense bonus |
| CRT letters | `server/engine/combat.ts` CRT constant | The table in [game-rules.md](game-rules.md) currently matches. It does not override the code |
| Onion tread movement bands | `shared/movementAllowance.ts` | Catalog `treadsPerMove` is declared but not read by that function |
| Stack damage, one missile per turn, or Onion subsystem results | `server/engine/combat.ts` | [game-rules.md](game-rules.md) describes the same behavior. Do not edit the prose alone |
| Phases and recovery | [game-rules.md](game-rules.md) L203-L223 | `server/engine/game.ts` is the API path. `server/engine/phases.ts` owns phase order, but its advance function is a second mutator. |
| Victory objectives | [scenario-schema.md](scenario-schema.md) | `server/api/gamesHelpers.ts` selects the winner. `server/engine/phases.ts` is only the no-objective immobilized-Onion fallback. The victory prose in [game-rules.md](game-rules.md) does not override the scenario |
| Scenario JSON authoring | [scenario-schema.md](scenario-schema.md) | `scenarios/` and `server/engine/scenarioSchema.ts` |
| Invalid snapshots or read retry | [snapshot-deprecation-policy.md](snapshot-deprecation-policy.md) | Do not also load the API or web copies |
| Account registration or login | [user-account-spec.md](user-account-spec.md) | `server/api/auth.ts` |
| Register or login transport | [api-contract.md](api-contract.md) L49-L84 | `server/api/auth.ts` |
| Create, list, join, or start a game | [api-contract.md](api-contract.md) L130-L222 | `server/api/games.ts` |
| Fetch one game | [api-contract.md](api-contract.md) L223-L291 | `server/api/games.ts` |
| Submit an action | [api-contract.md](api-contract.md) L292-L336, then one command row | `server/api/games.ts` |
| MOVE command | [api-contract.md](api-contract.md) L356-L368 | `server/engine/movement.ts` |
| FIRE command | [api-contract.md](api-contract.md) L369-L412 and L421-L459 | `server/engine/combat.ts` |
| END_PHASE command | [api-contract.md](api-contract.md) L413-L420 | `server/api/games.ts` |
| Event polling | [api-contract.md](api-contract.md) L337-L355 | `server/api/games.ts` |
| Event envelope | [api-contract.md](api-contract.md) L464-L476, then one event family below | `shared/websocketProtocol.ts` |
| Movement events | [api-contract.md](api-contract.md) L477-L483 | `server/api/games.ts` |
| Combat events | [api-contract.md](api-contract.md) L484-L496 | `server/api/games.ts` |
| State-change events | [api-contract.md](api-contract.md) L497-L507 | `server/api/games.ts` |
| Phase and game events | [api-contract.md](api-contract.md) L508-L520 | `server/api/games.ts` |
| Sync events, including SESSION_INIT | [api-contract.md](api-contract.md) L521-L533 | `shared/websocketProtocol.ts` |
| Scenario map requirement | [api-contract.md](api-contract.md) L460-L463 | `shared/scenarioMap.ts` |
| Error body or error code | [api-contract.md](api-contract.md) L612-L642 | `server/api/` |
| Board snapshot fields | [api-contract.md](api-contract.md) L559-L611 | `shared/types/` |
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
| `shared/stackRoster.ts` | Owns canonical membership and split, merge, move, and relocate transitions. | |
| `shared/stackNaming.ts` | Owns group labels and naming snapshots. | `D+M`: `StackNamingEngine` mutates its own naming state. |
| `shared/combatCalculator.ts` | Decides attack strength, defense strength, modifiers, and CRT odds bands. | |
| `shared/staticRules.ts` | Owns the ridgeline defense bonus and the calculator's static rules bundle. | |
| `shared/targetRules.ts` | Decides whether a weapon may target a unit type. | |
| `shared/rammingCalculator.ts` | Decides ram tread cost and destruction outcome. | |
| `shared/combatTarget.ts` | Formats and parses tread and subsystem target ids. | |
| `shared/hex.ts` | Owns axial distance, neighbors, and hex keys. | `UNCLEAR`: same filename as `web/lib/hex.ts`, which owns pixel layout. |
| `shared/scenarioMap.ts` | Materializes an authored map and tests position membership. | |
| `shared/unitState.ts` | Looks up live units and reports weapon availability. | `D+M`: weapon destruction mutates the unit. `DUP`: second-move, immobile, and defense helpers overlap the movement facade and combat calculator. |
| `shared/unitWeapons.ts` | Mutates one weapon list for spend, recharge, and destroy. | `D+M` |
| `shared/apiProtocol.ts` | Defines REST success, failure, and game-response types. | `UNCLEAR`: also contains a fetch client and debug traffic log. Production web calls use `web/lib/httpGameClient.ts`. |
| `shared/websocketProtocol.ts` | Defines WebSocket message shapes. | |
| `shared/types/` | Defines canonical game, command, and event types. | |
| `server/engine/movement.ts` | Adapts engine state to the shared move validator and applies the accepted plan. | `D+M`. `WRAP`: occupancy, blocking, traverse, rammed-unit, and ramming exports are not the live legality path. |
| `server/engine/combat.ts` | Validates FIRE, rolls the CRT, and applies damage. | `D+M`. `WRAP`: `calculateEngineCombatOdds` delegates to the shared odds band. |
| `server/engine/map.ts` | Builds the engine map and tests hex membership. | `WRAP`: pathfinding, line of sight, and movement cost are test-only legacy. |
| `server/engine/phases.ts` | Owns phase order, phase actor, and in-place recovery. | `D+M`. `DUP`: its advance function is not the API path, and its victory check is only the no-objective fallback. |
| `server/engine/game.ts` | Advances a match phase for the API and emits phase events. | `D+M`. `DUP`: repeats phase maintenance instead of calling `phases.ts`. |
| `server/engine/scenarioSchema.ts` | Validates authored scenario JSON. | |
| `server/engine/scenarioNormalizer.ts` | Builds the initial game state from scenario deployments. | |
| `server/engine/units.ts` | Re-exports catalog, unit-state, and allowance helpers. | `WRAP`: not an owner. |
| `server/engine/index.ts` | Re-exports the engine surface, including legacy map and movement helpers. | `WRAP` |
| `server/api/games.ts` | Owns game HTTP and WebSocket routes, authorization, and persistence of engine results. | `UNCLEAR`: one plugin mixes transport with action orchestration. |
| `server/api/gamesHelpers.ts` | Builds responses and action events, translates scenarios, and selects the winner. | `DUP`: scenario victory lives here, not in `phases.ts`. `UNCLEAR`: weapon type is also inferred from id prefixes. |
| `server/api/auth.ts` | Owns registration and login routes. | |
| `server/api/scenarios.ts` | Owns scenario list and detail routes. | |
| `server/db/` | Stores users and matches through the adapter contract. | |
| `server/app.ts` | Composes the HTTP server, routes, and database adapter. | |
| `web/lib/gameSessionTypes.ts` | Defines the session controller and transport contracts. | |
| `web/lib/gameSessionController.ts` | Loads the authoritative snapshot and owns refresh, sequencing, and cleanup. | |
| `web/lib/useGameSession.ts` | Adapts the session controller to React. | |
| `web/lib/appSessionWiring.ts` | Selects one session binding and constructs the active controller. | |
| `web/lib/useConnectionGate.ts` | Authenticates and creates the interactive session binding. | |
| `web/lib/httpGameClient.ts` | Maps production HTTP requests, retries, and response validation. | |
| `web/lib/liveEventSource.ts` | Parses WebSocket events and reports connection state. | |
| `web/lib/gameClient.ts` | Holds the legacy request seam and shared action types. | `WRAP`: still used by the HTTP client; not a second transport policy. |
| `web/lib/liveGameClient.ts` | Combines the legacy request client with the live event source. | `WRAP`: no production caller. |
| `web/lib/interactionRouting.ts` | Decides map and subject interaction intent. | |
| `web/lib/shellControlRouting.ts` | Decides which header controls are enabled. | |
| `web/lib/rightRailControlRouting.ts` | Decides which right-rail controls are enabled. | |
| `web/lib/appCommands.ts` | Turns shell decisions into submitted actions. | |
| `web/lib/useBattlefieldInteractionState.ts` | Owns local selection, prompts, and interaction-triggered submissions. | |
| `web/lib/selectionIds.ts` | Parses UI selection aliases and translates combat targets. | Aliases are not unit identity. |
| `web/lib/stackSelection.ts` | Resolves roster-backed members and phase-visible projections. | Not a membership owner. |
| `web/lib/rightRailSelection.ts` | Builds stack selection models and MOVE or FIRE payloads. | |
| `web/lib/commitActionBuilders.ts` | Adapts selections into the right-rail commit payloads. | Not a second command authority. |
| `web/lib/useBattlefieldDisplayState.ts` | Orchestrates display state and validates the client snapshot boundary. | |
| `web/lib/battlefieldViewBuilders.ts` | Builds live unit, map, and range display models. | |
| `web/lib/battlefieldGroupProjection.ts` | Projects the shared roster index for rails and the board. | |
| `web/lib/battlefieldNaming.ts` | Resolves display labels from shared naming data. | Does not own group identity. |
| `web/lib/hex.ts` | Converts axial coordinates to pixel layout. | `UNCLEAR`: same filename as `shared/hex.ts`. |
| `web/lib/combatOdds.ts` | Formats preview odds through the shared CRT band. | `WRAP` |
| `web/lib/combatPreview.ts` | Builds combat target options for display. | |
| `web/lib/sessionCatalog.ts` | Reads the catalog payload supplied to the session. | Not a second numeric catalog. |
| `web/lib/useInactiveEventStream.ts` | Polls inactive-player events and builds timeline presentation. | `UNCLEAR`: one hook owns both polling and display formatting. |
