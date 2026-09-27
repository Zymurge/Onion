# Onion

Onion is an open-source, Shrek-themed reimplementation of the public-rule portions of Ogre. One player controls the Onion. The other defends with conventional units. The current game is the Mark III scenario, played in the web client against an authoritative server.

## How to read specs

Load only the row that matches the task. Do not open neighboring specs, archives, work-items, or generated HTML for extra context. If a task crosses two rows, load those two and stop.

When a row names a line range, read only that range. Do not read the rest of that file.

## Task router

| Task | Load | Code |
| --- | --- | --- |
| Names and unit stats | [game-rules.md](game-rules.md) L24-L50 | `shared/config/unitCatalog.json` |
| Victory | [game-rules.md](game-rules.md) L51-L86 | `server/engine/phases.ts` |
| Movement, terrain, and ramming | [game-rules.md](game-rules.md) L123-L145 | `shared/moveValidator.ts` |
| Combat results | [game-rules.md](game-rules.md) L146-L172 | `shared/combatCalculator.ts` |
| Onion subsystems | [game-rules.md](game-rules.md) L173-L195 | `shared/unitDefinitions.ts` |
| Phases and recovery | [game-rules.md](game-rules.md) L196-L216 | `server/engine/phases.ts` |
| Scenario JSON authoring | [scenario-schema.md](scenario-schema.md) | `scenarios/` and `server/engine/scenarioSchema.ts` |
| Invalid snapshots or read retry | [snapshot-deprecation-policy.md](snapshot-deprecation-policy.md) | Do not also load the API or web copies |
| Account registration or login | [user-account-spec.md](user-account-spec.md) | `server/api/auth.ts` |
| Register or login transport | [api-contract.md](api-contract.md) L77-L112 | `server/api/auth.ts` |
| Create, list, join, start, or fetch a game | [api-contract.md](api-contract.md) L158-L319 | `server/api/games.ts` |
| Submit one action | [api-contract.md](api-contract.md) L320-L383, then the one command range below | `server/api/games.ts` |
| Move command | [api-contract.md](api-contract.md) L388-L398 and L443-L452 | `server/engine/movement.ts` |
| Fire command | [api-contract.md](api-contract.md) L399-L442 and L453-L491 | `server/engine/combat.ts` |
| Event polling or an event shape | [api-contract.md](api-contract.md) L365-L383 and L508-L577 | `server/api/games.ts` |
| Error body or error code | [api-contract.md](api-contract.md) L656-L686 | `server/api/` |
| Board snapshot fields | [api-contract.md](api-contract.md) L603-L655 | `shared/types/` |
| Web lobby, board, combat UI, turn display, or client errors | [web-ui-spec.md](web-ui-spec.md), then the one area spec it names. Skip Future State | The module that area spec names |
| Match storage or migrations | [persistence.md](persistence.md) | `server/db/` |
| Which test to add or run | [testing-strategy.md](testing-strategy.md) through the layer map only. Skip the editor-troubleshooting section | The one test directory in that row |

Weapon and unit data live in `shared/config/unitCatalog.json` and `shared/unitDefinitions.ts`, not in the rules prose. Scenario JSON does not author targeting restrictions.

## Do not load unless the task names it

- [cli-spec.md](cli-spec.md) and `server/cli/`
- [configuration.md](configuration.md) and server environment loading
- `docs/archive/`, `docs/work-items/`, and generated `docs/api/` HTML
- Coverage reports and `web/App.tsx.ref`

