# Web UI Architecture and State Specification

## Purpose

Define the client architecture and state boundaries shared by the lobby,
gameplay, interaction, and event-display areas.

## Application Architecture

- The web client is a React + TypeScript SPA in `web/`.
- Shared domain contracts are reused from the backend/shared layer where
  possible.
- The backend remains the source of truth for game rules, turn phases,
  lifecycle, and action validation.
- Rendering is based on authoritative server state, not optimistic local
  simulation.
- One game window owns one game session. The per-game WebSocket is scoped to
  that game.

## Endpoint Dependencies

The browser also uses these shared endpoints:

- `GET /scenarios` and `GET /scenarios/{id}` for game creation and scenario
  preview.
- `POST /auth/register` and `POST /auth/login` for account access.
- `GET /games/{id}` for the authoritative game snapshot.
- `POST /games/{id}/actions` for committed gameplay commands.
- `GET /games/{id}/events?after={seq}` for missed or historical game events.

Lobby-specific endpoints are owned by the
[lobby and session specification](lobby-and-session-spec.md). Payload shapes
and authentication requirements are defined in
[api-contract.md](../api-contract.md).

## Authoritative State

- `GameState`, `status`, `phase`, `turnNumber`, and `eventSeq` come from server
  snapshots and sequenced events.
- Unit roster, positions, and unit status come from authoritative game state.
- Terrain, dimensions, and coordinate bounds come from the active scenario map
  snapshot.
- The latest successful `GET /games/{id}` response is the source of truth.
- Events are sequenced server signals and refresh hints, not a second state
  model. The client does not infer state from event arrival order or apply
  optimistic authoritative updates.
- Server-derived state is never mutated in place; the UI reconciles from
  snapshots and refreshes.

## Snapshot Synchronization

When required server data is unavailable, the client requests the latest state
with `GET /games/{id}`. Only transient transport failures or retryable server
responses (`408`, `429`, `500`, `502`, `503`, or `504`) may cause a bounded retry
of state or event `GET` requests.

The client does not automatically retry malformed responses, invalid snapshots,
action submissions, diagnostic submissions, or non-retryable HTTP failures.
Action requests are non-idempotent because the server may have applied an
operation before its response was lost. The client does not retry because of a
phase or event race.

The match WebSocket carries live signals for one game. It never becomes a
second authoritative state model or a mixed lobby-and-game bus.

## State Ownership

### Server State

The server owns lifecycle, phase, turn, roster, positions, unit status, event
sequence, victory, and action legality.

### Interaction State

The client owns selected map unit or hex, draft action fields, targeting,
prompts, dismissal state, panel visibility, layout preferences, and loading or
submission state.

### Derived View State

Selectors and view builders derive display state from the authoritative snapshot
plus interaction state. Derived state stays pure and must not be written back
into the snapshot.

### Sync State

Session synchronization owns connection status, explicit latest-state refreshes,
transport retry bookkeeping, and event cursors. It does not resolve server-side
races or invent missing authoritative data.

## Stable UI Identity

- Selection state uses stable unit IDs.
- Map occupants, rail items, and hex cells expose stable `data-testid` hooks
  keyed by unit ID or coordinate.
- The right rail is the default inspector surface in every phase.
- Any unselected unit can be inspected regardless of owner.
- Destroyed Swamp units remain in map state and remain inspectable.
- During combat, the right rail may combine inspection with targeting and
  confirmation; inactive players remain inspection-only.
