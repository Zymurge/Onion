# Onion API Contract (v1)

## Transport Strategy

The protocol uses a unified **command/event model** independent of transport:

- **Commands** (client → server): typed action objects submitted by the active player.
- **Events** (server → client): typed, sequenced records of everything
  that happened as a result.

### Phase 1 — Pure REST

All communication is over HTTP. The Phase 1 CLI is designed for manual
testing and can operate without background polling.

| Direction | Mechanism |
| :--- | :--- |
| Submit action | `POST /games/{id}/actions` |
| Get your action's results | Response body of the POST |
| Get event history or missed actions | `GET /games/{id}/events?after={seq}` |

Manual refresh or optional polling can use the same events route.

### Authoritative Snapshot and Retry Policy

The server is the single authority for match state. Each accepted action is
processed in turn order and its resulting events receive monotonically
increasing sequence numbers. Clients must not infer a competing state from
event timing, local simulation, or cached projections.

When a client does not have the server data required to render or continue a
session, it requests the latest state with `GET /games/{id}`. A successful
response is authoritative, regardless of when a previously delivered event or
response arrived. Event sequence numbers are delivery and inspection cursors;
they are not a client-side snapshot versioning or conflict-resolution scheme.

Retries are transport-only:

- A client may retry a state or event `GET` after a transient network failure or
  a retryable server response (`408`, `429`, `500`, `502`, `503`, or `504`).
- Other HTTP error responses, malformed responses, and semantically invalid
  snapshots are not retried.
- Action `POST` requests are not automatically retried because the server may
  have applied the action before the response was lost.
- Diagnostic `POST` requests are not automatically retried.
- Clients do not retry for event or phase races. Concurrent game operations are
  outside this protocol model; the server sequences accepted operations.

If a state refresh still returns an invalid snapshot, the client reports the
diagnostic and aborts the session for both participants. There is no snapshot
repair, fallback snapshot, migration, or client-side recovery model.

### Phase 2+ — WebSocket (additive, not replacing)

A WS connection to `ws://host/games/{id}/ws` carries the same JSON
shapes. Commands are sent as WS messages; events are pushed by the
server. No game logic changes. REST endpoints remain for non-real-time
use.

---

## Authentication

All game endpoints require an `Authorization: Bearer <JWT>` header. Tokens are
signed and verified by the server using the configured JWT secret. Browser
WebSocket clients may provide the same JWT in the `token` query parameter
because browser WebSocket APIs cannot set arbitrary Authorization headers.

### `POST /auth/register`

```text
Request:  { "username": string, "email": string, "password": string }
Response: { "username": string, "token": string (signed JWT) }
Errors:   409 USERNAME_TAKEN if username taken
          409 EMAIL_TAKEN if email taken
          400 INVALID_INPUT for schema validation errors
            400 PAYLOAD_TOO_LARGE if payload exceeds 16KB
              (note: Fastify test injector returns 400,
              production returns 413)
          400 MALFORMED_JSON if request body is not valid JSON
          500 INTERNAL_ERROR for unexpected backend errors
```

### `POST /auth/login`

```text
Request:  { "email": string, "password": string }
Response: { "username": string, "token": string (signed JWT) }
Errors:   401 if credentials invalid
          400 INVALID_INPUT for schema validation errors
            400 PAYLOAD_TOO_LARGE if payload exceeds 16KB
              (note: Fastify test injector returns 400,
              production returns 413)
          400 MALFORMED_JSON if request body is not valid JSON
          500 INTERNAL_ERROR for unexpected backend errors
```

---

## Scenarios

### `GET /scenarios`

Returns the list of loadable scenarios (scenario files bundled with the engine).

```text
Response: [
  { "id": string, "name": string, "displayName": string, "description": string }
]
```

### `GET /scenarios/{id}`

Returns the full scenario definition (matches
`scenario-schema.md` v1 shape, including `displayName`).

```text
Response: { ...full scenario JSON }
Errors:   404 if not found
            400 PAYLOAD_TOO_LARGE if payload exceeds 16KB
              (note: Fastify test injector returns 400,
              production returns 413)
          400 MALFORMED_JSON if request body is not valid JSON
          500 INTERNAL_ERROR for unexpected backend errors
```

---

## Games

### `POST /games`

Create a new game. The caller is assigned a role.

```text
Request:  { "scenarioId": string, "role": "onion" | "defender" }
Response: { "gameId": number, "role": "onion" | "defender" }
Errors:   400 INVALID_INPUT if role is not "onion" or "defender"
          404 NOT_FOUND if scenarioId does not match a known scenario
            400 PAYLOAD_TOO_LARGE if payload exceeds 16KB
              (note: Fastify test injector returns 400,
              production returns 413)
          400 MALFORMED_JSON if request body is not valid JSON
          500 INTERNAL_ERROR for unexpected backend errors
```

The `gameId` may be shared out-of-band, or the second player may discover the
game through the web lobby's open-game list.

### `GET /games`

List lightweight summaries for games in which the authenticated caller is a
participant. The response does not include full game state or event history.

```text
Response: { "games": Array<{
  "gameId": number,
  "scenarioId": string,
  "scenarioDisplayName": string,
  "phase": TurnPhase,
  "turnNumber": number,
  "winner": string | null,
  "status": "waiting" | "ready" | "active" | "completed",
  "hostUserId": string,
  "role": "onion" | "defender"
}> }
```

### `GET /games/open`

List waiting games with exactly one unfilled player slot. The caller's own games
are excluded. The response contains only lobby-safe summary data.

```text
Response: { "games": Array<{
  "gameId": number,
  "scenarioId": string,
  "scenarioDisplayName": string,
  "creatorRole": "onion" | "defender",
  "openRole": "onion" | "defender"
}> }
```

### `POST /games/{id}/join`

Join an existing game as the remaining role.

```text
Request:  {} (empty — role is inferred as whichever is unfilled)
Response: { "gameId": number, "role": "onion" | "defender" }
Errors:   404 game not found
          409 game already full
          400 cannot join your own game
            400 PAYLOAD_TOO_LARGE if payload exceeds 16KB
              (note: Fastify test injector returns 400,
              production returns 413)
          400 MALFORMED_JSON if request body is not valid JSON
          500 INTERNAL_ERROR for unexpected backend errors
```

### `POST /games/{id}/start`

Start a full ready game. Only the authenticated host may start the game.

```text
Request:  {} (empty)
Response: { "gameId": number, "status": "active", "event": EventEnvelope }
Errors:   401 unauthorized
          403 NOT_HOST if the caller is not the host
          404 game not found
          409 GAME_NOT_READY if both player slots are not filled
          409 GAME_ALREADY_STARTED if the game is already active or completed
```

The match lifecycle is `waiting` while a player slot is open, `ready` once
both roles are filled, `active` after the authenticated host starts the match,
and `completed` after a winner is persisted. Gameplay actions are accepted
only while the match is `active`.

### `GET /games/{id}`

Full current game state. Suitable for initial render and reconnect.

This response contains dynamic game state only. Static unit and weapon catalogs
are sent separately in the WebSocket `SESSION_INIT` message and are not included
in this response or in `GameState`.

```json
{
  "gameId":      number,
  "scenarioId":  string,
  "scenarioName": string,
  "scenarioDisplayName": string,
  "phase":       TurnPhase,
  "turnNumber":  number,
  "winner":      "onion" | "defender" | null,
  "aborted":     boolean,
  "players": {
    "onion":    string,   // userId
    "defender": string    // userId
  },
  "scenarioMap": {
    "width": number,
    "height": number,
    "cells": [ { "q": number, "r": number } ], // required, canonical geometry
    "hexes": [ { "q": number, "r": number, "t": number } ]
  },
  "state": GameState,
  "eventSeq":    number   // highest event sequence number so far
}
```

Current `GameState` stack roster shape:

```json
{
  "stackRoster": {
    "groupsById": {
      "stack-1": {
        "groupName": "Little Pigs group 1",
        "unitType": "LittlePigs",
        "position": { "q": 4, "r": 4 },
        "unitIds": ["pigs-1", "pigs-2"]
      }
    }
  }
}
```

Notes:

- `groupsById` is the canonical stack/group metadata map. The record key is the group id.
- The roster wrapper is always present in game state, even when `groupsById` is empty.
- `groupKey`, `unitIds`, and member ordinals are helper-derived and do not need to be persisted.
- `group.units` is a convenience projection derived by shared helpers from the canonical unit maps when UI or messaging needs member detail.
- `friendlyName` on a unit is stable and does not change when the unit changes groups.
- `groupName` is the only stack-level display label used by rails, combat UI, and event text.
- Per-unit runtime movement spend is stored on the unit record itself via `movementSpent[phase]`.

**Notes:**

- `scenarioMap` is always required and must include a non-empty `cells` array. There is no fallback or compatibility logic for missing geometry.
- All clients and tests must require `cells` for board geometry.
- `hexes` contains terrain/type info for each cell.
- `width` and `height` are provided for convenience but are not used for geometry.

---

## Actions

### `POST /games/{id}/actions`

Submit a command for the active player. The server validates phase,
player identity, and move legality before applying.

```text
Request:  Command  (see Command Types below)
Response: {
  "ok":     true,
  "seq":    number,    // highest event seq produced by this action; 0 if no events
  "events": Event[],   // events generated by this action (may be empty)
  "state":  GameState  // full updated game state
}
Errors:
  400 {
    "ok":           false,
    "error":        string,       // human-readable
    "code":         string,       // machine-readable (see Error Codes)
    "detailCode"?:  string,       // optional machine-readable subcode
                                   // for granular error details
                                   // (e.g., "NO_PATH",
                                   // "BLOCKED_BY_UNIT")
    "currentPhase": TurnPhase     // always present; helps CLI give
                                   // useful feedback
  }                               // malformed or invalid input
                                  // (INVALID_INPUT,
                                  // COMMAND_INVALID, etc)
  422                             // well-formed but invalid action
                                  // (currently surfaced as
                                  // MOVE_INVALID + detailCode)
  403                             — not your turn
  409                             — game already over
  413                             — PAYLOAD_TOO_LARGE if payload exceeds 16KB
  400                             — MALFORMED_JSON if request body is
                                  not valid JSON
  500                             — INTERNAL_ERROR for unexpected backend errors
```

`seq` duplicates `events.at(-1).seq` for the non-empty case. It is
included so clients have a definite event fence even when `events` is
empty, and so they do not need to traverse the array to find the latest
sequence number.

### `GET /games/{id}/events?after={seq}`

Fetch events that occurred after a given sequence number. Phase 1
clients can use this for manual refresh, event inspection, or optional
polling.

```text
Query:    after (number, required) — last seq the client has seen
Response: { "events": Event[] }
```

The client should seed `after` from `GET /games/{id}` → `eventSeq` on first connect.

`GAME_ABORTED` is a terminal event. Once present, subsequent state responses
include `aborted: true`, both participants must stop submitting actions, and
clients must render their terminal aborted-session state.

---

## Command Types

All commands are submitted as the body of `POST /games/{id}/actions`.

### Onion Movement Phase (`ONION_MOVE`)

#### Move Onion

```json
{ "type": "MOVE", "movers": [string, ...], "to": { "q": number, "r": number } }
```

Ramming is resolved as part of `MOVE` path execution (up to 2 rams per
turn), not as a separate command.

### Combat Actions

Combat uses a single `FIRE` command shape for both Onion and defender attacks.

```json
{ "type": "FIRE", "attackers": [string, ...], "targetId": string, "onionId": string }
```

`attackers` contains one or more attacker IDs. For Onion, each entry is a weapon id. For defenders, each entry is a unit id. The engine resolves whether the command is valid for the current phase and target.

`FIRE` with multiple attackers is legal when attacking a weapon or unit target, but not when targeting Onion treads. In that case, each attacker must fire separately.

#### Combat Target IDs

`targetId` is a cross-layer wire identifier. The server is authoritative for
target legality, but all clients and event consumers must use the same target
identity:

- Defender units, defender stacks, and individually targetable weapons use the
  opaque IDs supplied by the game state, such as `wolf-1`, `LittlePigs:3,2`, or
  `main`.
- Onion treads use the explicit structured form `{onionId}:treads`, such as
  `onion-1:treads`.
- A bare Onion unit ID is not a tread target. `onion-1` must not be submitted
  when the intended target is the Onion's treads.
- The `:treads` suffix is exact. Clients must not add whitespace, extra
  suffixes, or a different subsystem spelling.

The canonical tread target is preserved in successful responses and combat
events. `FIRE_RESOLVED` and `ONION_TREADS_LOST` include the canonical
`targetId` and its corresponding `targetFriendlyName` (for example,
`The Onion treads`).

Example defender attack against Onion treads:

```json
{
  "type": "FIRE",
  "attackers": ["wolf-1"],
  "targetId": "onion-1:treads",
  "onionId": "onion-1"
}
```

### Movement Commands

#### Move a unit

```json
{ "type": "MOVE", "movers": [string, ...], "to": { "q": number, "r": number } }
```

---

## Combat Error Handling

Combat actions return structured errors:

- HTTP 400 for malformed input, schema errors, or unsupported commands.
- HTTP 422 for well-formed but invalid combat actions
  (e.g., illegal target, exhausted weapon, multi-attacker fire on treads).
- Response body includes `detailCode` for granular error
  (e.g., `NO_TARGET`, `WEAPON_EXHAUSTED`,
  `MULTI_ATTACK_TREAD_TARGET`).

Unsupported action command types are rejected with:

```json
{
  "ok": false,
  "error": "Unknown command type: <type>",
  "code": "COMMAND_INVALID",
  "detailCode": "UNKNOWN_COMMAND <type>",
  "currentPhase": "<phase>"
}
```

**Example error response:**

```json
{
  "ok": false,
  "error": "Multi-attacker fire is not allowed on Onion treads.",
  "code": "MOVE_INVALID",
  "detailCode": "MULTI_ATTACK_TREAD_TARGET",
  "currentPhase": "DEFENDER_COMBAT"
}
```

All errors include `detailCode` for granular client feedback.

---

## Scenario Map Loading (MOVE Route)

## Scenario Map Loading

All routes and clients require the canonical `scenarioMap` with a non-empty `cells` array. There is no fallback or compatibility logic for missing geometry fields. All geometry and pathfinding must use the `cells` array.

### Any Phase

**End phase explicitly** (advance to next phase without exhausting all moves/attacks)

```json
{ "type": "END_PHASE" }
```

---

## Event Types

All events share a base envelope:

```typescript
{
  seq:       number,   // monotonically increasing per match
  type:      string,   // event type identifier
  timestamp: string,   // ISO 8601
  ...payload
}
```

### Movement Events

```text
ONION_MOVED       { from: HexPos, to: HexPos }
UNIT_MOVED        { unitId: string, from: HexPos, to: HexPos }
```

### Combat Events

```text
WEAPON_FIRED      { weaponType: string, weaponIndex: number, targetId: string,
                    attackStrength: number, defenseStrength: number,
                    roll: number, result: "NE" | "D" | "X" }

FIRE_RESOLVED     { attackers: string[], targetId: string,
                    targetFriendlyName: string,
                    attackStrength: number, defenseStrength: number,
                    roll: number, result: "NE" | "D" | "X" }
```

### State Change Events

```text
UNIT_STATUS_CHANGED   { unitId: string, from: UnitStatus, to: UnitStatus }
UNIT_SQUADS_LOST      { unitId: string, amount: number }
ONION_TREADS_LOST     { onionId: string, targetId: string,
                        targetFriendlyName: string,
                        amount: number, remaining: number }
ONION_WEAPON_DESTROYED { weaponId: string, weaponType: string }
```

### Phase / Game Events

```text
PLAYER_JOINED     { userId: string, role: "onion" | "defender" }
PHASE_CHANGED     { from: TurnPhase, to: TurnPhase, turnNumber: number }
GAME_OVER         { winner: "onion" | "defender", reason: string }
GAME_ABORTED      { reason: string, causeId: string }
```

PLAYER_JOINED is emitted when a player successfully joins a game
(either as onion or defender). The event includes the joining user's ID
and their assigned role.

### Sync Event

```text
SESSION_INIT      { unitTypes: UnitTypeCatalog, weaponTypes: WeaponTypeCatalog }
STATE_SNAPSHOT    { state: GameState }
```

`SESSION_INIT` is sent when a WebSocket session is established and carries static
catalog data. `STATE_SNAPSHOT` is sent on WS reconnect and carries dynamic state
only. REST `GET /games/{id}` likewise returns dynamic state only.

---

## Shared Types

### `TurnPhase` (enum)

```text
"ONION_MOVE"
"ONION_COMBAT"
"DEFENDER_RECOVERY"
"DEFENDER_MOVE"
"DEFENDER_COMBAT"
"GEV_SECOND_MOVE"
```

### `HexPos`

```typescript
{ q: number, r: number }
```

### `UnitStatus`

```text
"operational" | "disabled" | "recovering"
```

### `GameState`

The mutable board snapshot stored in `game_state` JSONB. Derived from
`initialState` in the scenario at game creation.

```typescript
{
  onions: {
    [unitId: string]: {
      unitId: string,
      typeId: string,
      position: HexPos,
      state: UnitState,
      treads: number,
      weapons: Array<{
        id: string,
        typeId: string,
        weaponClass: "main" | "secondary" | "ap" | "missile",
        state: "ready" | "spent" | "destroyed",
        friendlyName: string,
        ammo?: number
      }>,
      movementSpent: Partial<Record<TurnPhase, number>>,
      ramsRemaining: number
    }
  },
  defenders: {
    [unitId: string]: {
      unitId: string,
      typeId:   string,
      position: HexPos,
      state:    UnitState,
      friendlyName: string,
      movementSpent: Partial<Record<TurnPhase, number>>
    }
  },
  stackRoster: {
    groupsById: {
      [groupId: string]: {
        groupName: string,
        unitType: string,
        position: HexPos,
        unitIds: string[]
      }
    }
  }
}
```

`stackRoster` is the canonical source of stack membership and group identity. `defenders` is a unit projection and must not be used to infer stack membership from co-location. Remaining movement is derived from each unit's authoritative `movementSpent` state and the current phase.

---

## Error Response Shape

```typescript
{
  "ok":           false,
  "error":        string,      // human-readable description
  "code":         string,      // machine-readable (e.g. "WRONG_PHASE", "ILLEGAL_MOVE")
  "currentPhase": TurnPhase    // always present on action errors;
                                // omitted on auth/404 errors
}
```

### Known Error Codes

| Code | Meaning |
| :--- | :--- |
| `WRONG_PHASE` | Action type not valid in the current phase |
| `NOT_YOUR_TURN` | Authenticated user is not the active player |
| `ILLEGAL_MOVE` | Destination is unreachable, blocked, or out of range |
| `MOVE_INVALID` | Well-formed but invalid move command (HTTP 422) |
| `UNIT_NOT_FOUND` | `unitId` does not exist in this game |
| `WEAPON_EXHAUSTED` | Targeted weapon already destroyed/used |
| `RAM_LIMIT_REACHED` | Onion has already rammed twice this turn |
| `MULTI_ATTACK_TREAD_TARGET` | Multi-attacker fire on Onion treads is illegal |
| `GAME_OVER` | Match is already decided |
| `GAME_FULL` | Both player slots are taken |
| `INVALID_INPUT` | Input failed schema validation or required fields missing |
| `COMMAND_INVALID` | Action command type is unsupported or invalid |
| `PAYLOAD_TOO_LARGE` | Request body exceeded 16KB limit |
| `MALFORMED_JSON` | Request body was not valid JSON |
| `INTERNAL_ERROR` | Unexpected backend/server error |
