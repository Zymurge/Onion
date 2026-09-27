# Onion

Onion is an open-source, Shrek-themed reimplementation of the public-rule portions of Ogre. One player controls the Onion. The other defends with conventional units. The current game is the Mark III scenario, played in the web client against an authoritative server.

## How to read specs

Load only the row that matches the task. Do not open neighboring specs, archives, work-items, or generated HTML for extra context. If a task crosses two rows, load those two and stop.

When a row names a line range, read only that range. Do not read the rest of that file.

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
| Phases and recovery | [game-rules.md](game-rules.md) L203-L223 | `server/engine/phases.ts` |
| Victory objectives | [scenario-schema.md](scenario-schema.md) | `server/engine/phases.ts`. The victory prose in [game-rules.md](game-rules.md) does not override the scenario |
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

## Do not load unless the task names it

- [cli-spec.md](cli-spec.md) and `server/cli/`
- [configuration.md](configuration.md) and server environment loading
- `docs/archive/`, `docs/work-items/`, and generated `docs/api/` HTML
- Coverage reports and `web/App.tsx.ref`
