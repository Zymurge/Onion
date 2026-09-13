# Web UI Lobby and Game Session Specification

## Purpose

Define the authenticated lobby, game-summary views, and boundary between lobby
coordination and a playable game window.

## Endpoint Surface

The lobby uses these authenticated endpoints, with runtime configuration loaded
from `GET /config`:

- `GET /config`
- `GET /games`
- `GET /games/open`
- `POST /games`
- `POST /games/{id}/join`
- `POST /games/{id}/start`
- `GET /games/{id}`
- `GET /games/{id}/ws`

The full payload contract is in [api-contract.md](../api-contract.md).

## Lifecycle and Actions

- The lobby is available only to authenticated users.
- The dashboard lists the user's game summaries from `GET /games`.
- The open-game view lists waiting games with one available role from
  `GET /games/open` and excludes the caller's own games.
- Creating a game sends the selected scenario and role to `POST /games`.
  Joining sends `POST /games/{id}/join`; the server assigns the remaining role.
- The server-owned lifecycle is `waiting`, `ready`, `active`, or `completed`.
  The client derives labels and actions from the latest status and host fields:
  `waiting` means an opponent is needed, `ready` means both roles are filled,
  `active` means gameplay may be opened, and `completed` means read-only review.
- A ready host sees `Start Game`. A ready non-host sees a non-actionable ready
  state. Starting sends authenticated `POST /games/{id}/start`.
- Open-game discovery contains only currently joinable waiting games. When a
  game leaves `waiting`, it is removed on the next authoritative refresh.

## Lobby Freshness and Convergence

- Lobby summaries are authoritative REST data. The client does not maintain a
  competing lifecycle model or infer status from mutation responses or event
  timing.
- Lobby views fetch immediately on entry and poll while visible, using
  `lobbyPollIntervalMs` from `GET /config`. The deployed default is 3000 ms.
- Polling is paused or substantially reduced while hidden and refreshes
  immediately when focus or visibility returns.
- Successful create, join, and start operations trigger a refresh. Join and
  start conflicts such as `409` also trigger a refresh so stale buttons and rows
  converge with the server.
- Polling avoids overlapping requests and ignores results after unmount.
- Recoverable loading and transport errors do not replace the latest known
  summaries with inferred defaults.
- The current lobby transport is REST polling. The game WebSocket remains
  scoped to one game.

## Lobby-to-Game Handoff

- Active and completed games open at `/game/{id}` in a dedicated browser window
  or tab when possible, while the lobby remains usable.
- A successful join or host start hands the returned game ID to the same
  navigation path. A joined game may still be `ready`, so its game window
  remains locked until the host starts it.
- If popup blocking prevents the new window, the client falls back to
  same-window navigation.
- The game window uses the existing authentication bootstrap and URL game ID.
- Duplicate-window tracking, focus-existing behavior, browser window registries,
  and cross-window messaging are outside the current contract.

## Game-Window Lifecycle Gate

- A game window must not present an actionable battlefield unless its latest
  authoritative snapshot has `status === 'active'`.
- `waiting` and `ready` render a locked waiting or handoff state. `active`
  enables battlefield and turn/role interaction rules. `completed` remains
  available for read-only review.
- If a game window is open while a host starts the match, its per-game WebSocket
  treats `STARTED` as a refresh hint. The client fetches the authoritative
  snapshot and unlocks gameplay only after it reports `active`.
- No full-page reload or lobby WebSocket is required for ready-to-active
  handoff.
- Phase and role determine turn ownership only after the lifecycle gate allows
  play. No gameplay action may be submitted before `active`.

## Deferred Coordination

The permanent UI contract does not require a lobby WebSocket, socket
multiplexer, duplicate-window suppression, focus-existing behavior,
`BroadcastChannel`, `localStorage` coordination, automatic lobby navigation, or
cross-window logout propagation. Those remain documented as future work in
[the multi-window lobby work item](../work-items/multi-window-lobby-spec.md).
