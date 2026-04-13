# Onion Web Game Project Overview

- Well-formed but invalid move commands (e.g., illegal movement, blocked path) return HTTP 422 with code MOVE_INVALID.
- Malformed or schema-invalid input returns HTTP 400 with code INVALID_INPUT.
- Unsupported action command types return HTTP 400 with code COMMAND_INVALID and detailCode `UNKNOWN_COMMAND <command>`.

## Project Description

This project aims to create a web-based digital implementation of the classic board game Ogre (now renamed Onion),
as designed by Steve Jackson. The game will be developed as an open-source project using publicly available
information about the game's rules, mechanics, and components. Any elements that are copyrighted or
proprietary will be adapted or replaced to ensure the project remains compliant with open-source licensing and
intellectual property laws.

Onion is an asymmetrical tactical wargame set in a near-future sci-fi setting where one player controls a massive
cybernetic tank called the "Onion" against another player's defensive force of conventional military units such as
tanks, infantry, and artillery.

## Implementation Phases

| Phase | Focus | Key Deliverables |
| :--- | :--- | :--- |
| **1 — Core** | Working game | Engine, REST+WS API, PostgreSQL, CLI client, 2 humans matched manually |
| **2 — Lobby** | Self-service matchmaking | Game creation, join-by-code or invite link, basic session listing |
| **3 — AI** | Automated opponent | Go-based Swamp Brain service connected as a standard API player |

## Technical Architecture

The "Onion" project is a distributed system designed for persistent, multiplayer play across diverse client types (CLI, Web, AI).

### Backend (The Onion Engine)

- **Language**: Node.js with TypeScript.
- **Framework**: Fastify.
- **Rules Engine**: A functional core that processes player intents (e.g., `MoveUnit`, `FireWeapon`) by mutating `EngineGameState` in place. All engine functions (`executeOnionMovement`, `executeUnitFire`, `advancePhase`, etc.) take a state reference and modify it directly. Persistence is handled at the API layer, which snapshots the mutated state after each action.
- **Phase State Machine**: Turn phases advance in strict server-enforced order. Actions submitted out of phase are rejected with an error. The six phases per turn cycle:

  | # | Phase | Actor | Side-effects on entry |
  | :- | :--- | :--- | :--- |
  | 1 | `ONION_MOVE` | Onion player | `turn++`; `ramsThisTurn = 0`; `disabled → recovering` |
  | 2 | `ONION_COMBAT` | Onion player | — |
  | 3 | `DEFENDER_RECOVERY` | Engine (auto) | `recovering → operational`; immediately advances to `DEFENDER_MOVE` |
  | 4 | `DEFENDER_MOVE` | Defender player | — |
  | 5 | `DEFENDER_COMBAT` | Defender player | — |
  | 6 | `GEV_SECOND_MOVE` | Defender player (Big Bad Wolf only) | — |

  Phase transitions are handled by `advancePhase(state)` in `src/engine/phases.ts`. It mutates `EngineGameState` in place, applies any entry side-effects for the new phase, and auto-advances through engine-controlled phases (`DEFENDER_RECOVERY`) without waiting for player input.

- **`EngineGameState`** (defined in `src/engine/units.ts`) is the engine's authoritative mutable game state. It contains:
  - `onion: OnionUnit` — position, treads, weapon statuses
  - `defenders: Record<string, DefenderUnit>` — all conventional units keyed by ID
  - `currentPhase: TurnPhase` — which phase is currently active
  - `turn: number` — current turn number (1-based; incremented on entry to `ONION_MOVE`)
  - `ramsThisTurn: number` — how many times the Onion has rammed this turn (max 2; reset on entry to `ONION_MOVE`)

- **Unit Disabled/Recovery flow**: Defender units hit by a "D" (Disabled) combat result are set to `status: 'disabled'`. The `UnitStatus` lifecycle is:

  ```text
  operational  ←─────────────────────────────────────────┐
      │                                                   │
      │ (D result from combat)                            │
      ▼                                                   │
   disabled  ──[entry to ONION_MOVE]──►  recovering  ──[DEFENDER_RECOVERY]──►  operational
  ```

  This means a unit disabled during the Onion's combat phase cannot act during that same defender turn. It transitions to `recovering` at the start of the *next* turn (entry to `ONION_MOVE`), and becomes `operational` again during that turn's `DEFENDER_RECOVERY` phase — just in time for `DEFENDER_MOVE`. A unit that enters turn N already in `recovering` (disabled on turn N-1) is fully operational by turn N's `DEFENDER_MOVE`.

- **API Protocol**:
  - **REST**: Slow/administrative operations — register, login, create game, join game, get game state.
  - **WebSocket**: Real-time turn events — submit action, receive state updates, phase transitions, combat roll results. Both players connect to the same match channel.
- **Manual Matching (Phase 1)**: Player A calls `POST /games` with a scenario ID, receives a numeric `gameId`. Player B calls `POST /games/{id}/join`. No lobby UI required — `gameId` is shared out-of-band. **[DONE]**
- **Persistence**: PostgreSQL. Core tables:
  - `users` — id, username, hashed password, created_at.
  - `matches` — id, scenario_id, scenario_snapshot, onion_player_id, defender_player_id, current_phase, turn_number, winner, created_at.
  - `game_state` — match_id (FK), state JSONB, updated_at.
- **`game_state` JSONB Shape**: A mutable copy of the scenario's `initialState`, evolved in place by gameplay. Contains: Onion position/treads/batteries/missiles, all defender unit positions/statuses. Victory conditions and map terrain remain static in the `matches` row (copied from scenario at game creation) and are never stored in `game_state`.
- **Authentication**: JWT (stateless). Issued on login, required for all game API calls. Simple and infrastructure-free for Phase 1. Future phases can layer in refresh tokens or third-party OAuth if needed.

### Frontend (Client Tier)

- **Phase 1 — CLI**: Built with **Node.js** and **TypeScript** as a simple REST-driven command-line client. It uses prompt-driven commands plus a minimal offset-grid text map to prove end-to-end gameplay with two human players in two shell instances.
- **Phase 2+ — Web UI**: React SPA sharing TypeScript types with the engine. Reuses the existing hex-grid JS implementation once reviewed.

---
**Status:**

- Manual matching: **done**
- Web UI Phase 0: **done**
- Web UI Phase 1: **partial**
- Action affordance and turn presentation: **done**

### AI Tier (The Swamp Brain)

- **Phase**: 3 — deferred until core game and lobby are stable.
- **Design**: Runs as a separate service, connecting to the engine as a standard API player over the same WebSocket interface used by humans.
- **Language**: Go (penciled in for tactical tree-search performance).

### Testing Strategy

The canonical layer map lives in [testing-strategy.md](testing-strategy.md). This project still uses TDD and Vitest, but the per-layer responsibilities now live in that dedicated doc.

#### Test Organization and Execution

Tests are organized into separate fast and slower suites so the default regression run stays responsive while still covering the contract and persistence layers.

#### Integration Smoke Suite (Standard Regression)

The standard regression run includes two integration smoke tracks:

- **Regular smoke flow** (`swamp-siege-01`): runs the modular phase/turn orchestrator for at least 5 full turns and validates phase sequencing plus state synchronization.
- **Endgame smoke flow** (`smoke-endgame-01`): runs a bounded tread-focus assault loop and validates that a terminal condition is reached, including `GAME_OVER` rejection after winner lock-in.

These smoke tests run as part of the default Vitest regression suite, so both paths are continuously covered on local runs and CI.

#### Database Abstraction Layer (DAL)

The `DbAdapter` interface provides a clean separation between business logic and storage implementation:

- **Interface**: `src/db/adapter.ts` defines the contract with methods for user auth, match CRUD, state updates, and event queries.
- **In-Memory Implementation**: `InMemoryDb` for unit tests — stores data in Maps, no external dependencies.
- **PostgreSQL Implementation**: `PostgresDb` for production — executes SQL queries against a real database.
- **Benefits**: Easy to test (swap implementations), future-proof (can add Redis caching without changing routes), clear boundaries (routes call named operations, not raw SQL).

#### Test Coverage Goals

- **API Routes**: 100% coverage of success and error paths. Tests use Fastify's `app.inject()` for HTTP simulation without network.
- **DAL Layer**: Full integration test coverage for SQL execution. Unit tests cover the in-memory implementation.
- **Engine Logic**: Pure functions tested in isolation. No I/O in engine tests.
- **Error Handling**: All error codes and edge cases covered, including malformed input, auth failures, and business rule violations.

#### Test Execution in CI/CD

- Unit tests run on every commit (fast feedback).
- Integration tests run on PRs and main branch (slower but comprehensive).
- Coverage reports generated for both test suites.

### Infrastructure

- **Local and VM deployment**: Docker Compose. A single `docker-compose.yml` covers both local dev and production on the Debian server — one command to bring up the engine and PostgreSQL together.
- **Target environments**: Developer laptop (Debian), self-hosted Debian VM. Managed cloud services are out of scope until scale demands it (KISS).
- **Future cloud path**: If needed, the Compose setup maps cleanly to a single VM on any cloud provider without rearchitecting.

## Game Mechanics Summary

Core rules are derived from the public domain portions of the [OGRE Designer's Edition Rulebook (v6.0)](https://www.sjgames.com/ogre/kickstarter/ogre_rulebook.pdf) by Steve Jackson Games, adapted and renamed for this project. Detailed rule mappings are in [game-rules.md](game-rules.md).

- Hexagonal grid map with terrain features (ridgelines, craters).
- Web-based interface to manage turns and combat logic.
- Integration with JSON-based scenario configurations.
- An API interface to the game engine service to allow multiple client types to play.
- An AI engine that can play either side, via the API.

*Note: The initial implementation will focus on the Mark III scenario. Some scenario-configurable concepts may initially be hard-coded.*

Detailed rules and unit mappings can be found in [game-rules.md](game-rules.md). For a sample turn walkthrough, check out [example-turn.md](example-turn.md).

## Upcoming Major Features (Epics)

### Stacked Unit Management

**TODO:** See docs/todo.md (Epic: Stacked unit management)

*Planned:* Add UI and logic for selecting, splitting, and combining units in a stack; support for independent and combined moves and combat actions. Backend and scenario schema impacts to be defined. This section will be fleshed out when feature work begins.

### Game Lobby & Matchmaking

**TODO:** See docs/todo.md (Epic: Game lobby for creation and joining)

*Planned:* Add self-service matchmaking, game creation, join-by-code/invite, and session listing. Backend contract and UI flow to be specified. This section will be expanded when implementation starts.

### JWT Authentication Migration

**TODO:** See docs/todo.md (Epic: JWT authentication)

*Planned:* Migrate to @fastify/jwt for authentication. Update API contract and error codes as needed. Details will be added when migration is scheduled.

### Error Handling Improvements

**TODO:** See docs/todo.md (Epic: Improve error handling)

*Planned:* Improve error handling in both UI and backend. Add error overlays, normalize API error responses, and clarify error flows. This section will be detailed during implementation.

### Shared Data Model for Units & Weapons

**TODO:** See docs/todo.md (Epic: Externalize unit and weapon definitions)

*Planned:* Externalize unit and weapon definitions so types, stats, and target rules can move to a shared data file or schema. Details to be defined when this work is prioritized.

## Name Changes

To avoid proprietary issues and add a fun, thematic twist, we'll rename elements using Shrek-inspired names:

- **The Onion**: Massive autonomous tank (Ogre).
- **Big Bad Wolf**: Ground Effect Vehicle (GEV).
- **Lord Farquaad**: Howitzer (Stationary artillery).
- **Puss**: Heavy Tank.
- **Witch**: Missile Tank.
- **Pinocchio**: Light Tank.
- **Dragon**: Superheavy Tank.
- **Little Pigs**: Infantry squads.
- **Castle**: Command Post.

## Next Steps (Phase 1)

- **Project scaffolding**: Initialize Node.js/TypeScript repo structure, Fastify server, and Docker Compose dev environment.
- **Turn engine**: Implement the state machine for movement, combat, and recovery phases against the scenario schema.
- **API surface**: Define REST endpoints for game creation, player actions, state sync, and event inspection. WebSocket support can be added later without changing the command/event model.
- **CLI client**: Build the minimal TypeScript terminal client described in [cli-spec.md](cli-spec.md).

### Future Work TODOs

- **Authentication hardening**: Replace current stub bearer token auth (`stub.{userId}`) with real JWT validation via `@fastify/jwt` once client integration stabilizes.
