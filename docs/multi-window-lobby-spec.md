# Multi-Window Lobby and Game Session Specification

## Purpose

Define the short-term and long-term path for keeping the lobby fresh while
players use dedicated browser windows for gameplay.

This specification covers:

- lobby freshness while games are waiting, ready, active, or completed
- opening gameplay in a dedicated browser window
- preserving the existing per-game WebSocket model
- deferring advanced multi-window coordination until it is justified

This specification does not redesign the rules engine, match event protocol,
or host-controlled start lifecycle. Those remain as implemented.

## Product Model

The intended browser model is:

```text
Lobby window  -------------------------------  persistent match desk
   | create / join / start / open
   v
Game window for match N  -------------------  one match only
   | REST snapshots + /games/N/ws
   v
active play / completed review
```

- One lobby window remains open as the user's operations desk.
- Each opened match uses a dedicated game window at `/game/{id}`.
- The short-term implementation supports one dedicated game window per player
  session path while the lobby remains usable through polling.
- Support for multiple concurrent game windows and special cross-window
  coordination is deferred to the long term.

### Lifecycle

```text
waiting -> ready -> active -> completed
```

| Status | Lobby meaning | Game window meaning |
| :--- | :--- | :--- |
| `waiting` | Waiting for an opponent | Optional waiting view only; no gameplay |
| `ready` | Host can start; other participant waits | Waiting/ready view; no gameplay |
| `active` | Game can be opened | Full battlefield and actions |
| `completed` | Completed game can be reviewed | Read-only or game-over view |

## Architectural Decisions

### Match transport remains game-scoped

Continue using `GET /games/{id}/ws` only inside a game window.

- REST remains authoritative for lobby lists and game snapshots.
- The match WebSocket remains a live hint stream that triggers snapshot
  refreshes.
- Match event sequence numbers, resume behavior, and `SESSION_INIT` catalog
  data remain scoped to one game.

### Lobby freshness initially uses polling

The dashboard and open-game screens use REST polling rather than a lobby
WebSocket in the first implementation.

Polling is supplemented by immediate refreshes when useful:

- initial page load
- window focus
- document visibility restoration
- successful create, join, or start operations
- join or start conflict responses such as `409`

### No lobby bus in the game WebSocket

The existing game WebSocket must not become a mixed lobby-and-game session bus.
Lobby status and discovery are user/list concerns. Match events and per-match
resume cursors are gameplay concerns.

A dedicated user/lobby live channel may be added later if polling becomes
insufficient, but it will remain logically separate from the match channel.

### Simple window handoff initially

The lobby window remains on the dashboard or open-game screen when a game is
opened.

Short term, the client may use `window.open` to open `/game/{id}` and fall back
to same-window navigation when a popup is blocked. Duplicate-window detection,
focus-existing behavior, and a browser window registry are long-term work.

### Gameplay is lifecycle-gated

A game window must not present an actionable battlefield unless the authoritative
snapshot has `status === 'active'`.

Phase and role determine whose turn it is only after the lifecycle permits
play. In particular:

- `waiting` and `ready` show a locked waiting or handoff view
- `active` enables the existing battlefield behavior
- `completed` remains read-only

## Short-Term Scope

### Goals

1. Keep the lobby fresh without requiring manual reloads.
2. Let the host start a ready game from the lobby.
3. Open gameplay in a dedicated game window while leaving the lobby open.
4. Let a participant who is already in `/game/{id}` transition from `ready` to
   `active` through the existing match WebSocket and snapshot refresh path.
5. Make lobby polling cadence configurable through standard configuration and
   expose it to the browser runtime.
6. Recover cleanly from common join and start races.

### Non-goals

The following are explicitly outside the short-term implementation:

- lobby WebSocket or SSE
- a multi-game controller or socket multiplexer
- duplicate-window suppression or focus-existing behavior
- cross-window `BroadcastChannel` or `localStorage` coordination
- automatic navigation away from the lobby when another match changes
- private or invite-only games
- leave, cancel, rematch, or host transfer
- user-controlled ready-up

## Long-Term Scope

### Dedicated user/lobby live channel

Add a separate user or lobby channel only when polling latency becomes a
meaningful product problem.

Possible coarse messages include:

- `MATCH_UPSERTED`
- `MATCH_STARTED`
- `OPEN_GAMES_CHANGED`
- `MATCH_REMOVED`
- optional `YOUR_TURN` summary notifications

Lobby messages should invalidate or refresh REST list queries. They should not
become a second authoritative state model.

The target logical separation remains:

- lobby window: user-scoped match summaries and discovery updates
- game window: one match's event stream and snapshot refreshes

One physical connection with separate logical subscriptions could be considered
as a later implementation optimization, but it must not merge the domain
contracts.

### Multi-window coordination

After the basic model is stable, consider:

- opening or focusing an existing game window for a match
- avoiding accidental duplicate game windows
- propagating logout and authentication expiry across windows
- nudging an already-open waiting game window when the match starts
- showing turn and ready badges for multiple matches in the lobby
- tracking which matches have open game windows

These features are convenience and coordination improvements. They must not make
browser messaging the source of truth; REST snapshots and match WebSockets
remain authoritative or authoritative-adjacent as currently defined.

## Configuration

### Lobby polling interval

Add a first-class polling interval to the standard configuration path.

Recommended names:

- server/environment: `LOBBY_POLL_INTERVAL_MS`
- browser runtime: `lobbyPollIntervalMs`

Requirements:

- Resolve the value through `server/config/loadConfig.ts`.
- Validate it as a positive integer number of milliseconds.
- Include it in the standard deployment configuration documentation and
  environment example.
- Push it into the browser through the existing runtime configuration path.
- Deliver the resolved value to browsers through `GET /config`.
- Keep the value independent from the gameplay live-refresh quiet window.

The initial default is 3000 milliseconds. It may be tuned for deployment through
the same configuration value.

### Polling behavior

The lobby should:

- fetch immediately on mount
- poll while the document is visible
- pause or substantially reduce polling while hidden
- fetch immediately when focus or visibility returns
- avoid overlapping requests
- ignore results after unmount
- refresh after create, join, and start mutations
- refresh after a `409` conflict so the UI converges with server state

## Short-Term Implementation Sequence

Each step has a goal, an implementation outline, and a definition of done.
The steps should be completed in order.

### Step 1: Establish the plan and acceptance baseline [DONE]

**Goal:** Make the polling and multi-window approach the documented plan of
record.

**Implementation:**

- Add this specification under `docs/`.
- Link it from the lobby and web UI specifications where appropriate.
- Document dedicated game-window handoff.
- Document that gameplay requires `status === 'active'`.
- Document polling as the initial lobby freshness mechanism.
- Document the lobby live channel and advanced multi-window work as deferred.

**Done when:**

- Short-term and long-term boundaries are explicit.
- Existing documentation does not imply that lobby freshness or dedicated
  window handoff is already complete.
- The plan has a stable link from the relevant project documentation.

### Step 2: Gate the game window by lifecycle status [DONE]

**Goal:** A game window never presents playable controls before the match is
active.

**Implementation:**

- Thread authoritative snapshot status into App and derived display state.
- Make `waiting` and `ready` render a waiting or handoff surface.
- Disable or withhold move, fire, end-phase, and equivalent controls before
  `active`.
- Preserve existing loading, connection, error, and completed-game behavior.
- Keep phase and role checks for turn ownership after the lifecycle gate.

**Tests:**

- A ready snapshot renders non-playable UI.
- An active snapshot enables normal turn affordances.
- A ready-to-active snapshot refresh unlocks the battlefield.
- No gameplay action can be submitted while lifecycle status is not active.

**Done when:**

- Opening `/game/{id}` for a ready match cannot issue gameplay actions through
  the UI.
- Status, not only phase and role, controls playability.
- Focused web tests cover waiting, ready, active, and completed behavior.

### Step 3: Verify the in-game ready-to-active handoff [DONE]

**Goal:** A participant already inside a game window sees the match become
playable after the host starts it.

**Implementation:**

- Confirm that `STARTED` is broadcast to connected match WebSocket clients.
- Confirm that the session controller treats the event as a refresh hint.
- Confirm that the controller fetches and accepts the active snapshot.
- Confirm that the lifecycle gate reevaluates after the snapshot is applied.
- Keep the implementation on the existing match transport.

**Tests:**

- Start with a ready snapshot and emit a `STARTED` signal.
- Assert that a current active snapshot is requested and applied.
- Assert that waiting controls remain locked before the active snapshot.
- Assert that the battlefield becomes actionable only after the active snapshot.

**Done when:**

- An already-open ready game window transitions without a full page reload.
- No lobby WebSocket or new cross-window transport is needed for this path.

### Step 4: Add the polling interval to configuration [DONE]

**Goal:** Lobby polling cadence is managed configuration rather than a
component-level constant.

**Implementation:**

- Add `LOBBY_POLL_INTERVAL_MS` to the standard server config schema.
- Validate missing, malformed, zero, negative, and non-integer values as
  required by the project's configuration policy.
- Add the value to the environment example and configuration documentation.
- Extend `WebRuntimeConfig` with `lobbyPollIntervalMs`.
- Resolve the value through the existing browser bootstrap path.
- Provide a documented default and test override behavior.

**Tests:**

- Valid configuration values are accepted.
- Invalid values are rejected.
- Browser runtime config resolves the expected precedence.
- The resolved value is available to lobby components.

**Done when:**

- One named configuration value controls lobby polling end to end.
- Server and browser documentation agree on the name and behavior.
- Lobby components do not hard-code their interval.

### Step 5: Implement polling for lobby lists [DONE]

**Goal:** Dashboard and open-game views converge without manual reloads.

**Implementation:**

- Extract or share a refresh function for dashboard and open-game requests.
- Start with an immediate fetch.
- Schedule interval refreshes using `lobbyPollIntervalMs`.
- Pause or reduce polling when the document is hidden.
- Refresh on focus and visibility restoration.
- Refresh after successful create, join, and start operations.
- Refresh after join or start conflicts such as `409`.
- Guard against overlapping requests and stale unmounted responses.
- Keep status-driven labels and actions based on the latest server list.
- Correct any count that describes all games as active when statuses differ.

**Tests:**

- Initial list loading works as before.
- Interval polling fetches updated lists.
- Hidden documents do not continue frequent polling.
- Focus or visibility restoration triggers a refresh.
- Mutation success triggers a refresh.
- A `409` triggers a refresh and removes stale actions.
- Unmount cancels or ignores in-flight work.

**Done when:**

- Two users can complete create, join, ready, start, and open using the lobby
  without manual page reloads.
- Lobby polling cadence comes from runtime configuration.
- No lobby WebSocket is required.

### Step 6: Add dedicated game-window handoff [DONE]

**Goal:** Starting or opening a game leaves the lobby available in its original
window.

**Implementation:**

- Add a small navigation helper for lobby-to-game handoff.
- Attempt to open `/game/{id}` in a new browser window or tab.
- Provide a same-window fallback when popup blocking prevents the new window.
- Use the helper after a successful host start.
- Use the helper for active and completed `Open Game` actions.
- Preserve the existing auth bootstrap from shared browser storage and URL
  game IDs.
- Do not add duplicate-window tracking or focus-existing logic yet.

**Tests:**

- Start success uses the correct game URL.
- Open Game uses the same navigation helper.
- Popup-blocked behavior still reaches the game.
- The lobby remains usable in the normal dedicated-window path.

**Done when:**

- The normal flow leaves the lobby window open and opens gameplay separately.
- Each player can have the lobby and one dedicated game window.
- Advanced multi-window plumbing remains deferred and documented.

### Step 7: Harden stale and conflicting lobby actions [DONE]

**Goal:** Concurrent users do not leave the lobby showing dead buttons or false
state.

**Implementation:**

- Handle joining a game that became full or non-waiting.
- Handle starting a game that is no longer ready, is already active, or is not
  hosted by the current user.
- Refresh the affected lists after those errors.
- Remove games from open discovery when they leave `waiting`.
- Ensure dashboard actions match refreshed status:
  - `waiting`: waiting
  - `ready` host: start
  - `ready` participant: ready/non-actionable
  - `active` or `completed`: open
- Preserve in-flight button protection.

**Tests:**

- Join and start conflict codes surface correctly.
- Conflict responses cause list refresh.
- Ready non-host users never see a start action.
- Active and completed rows offer open behavior.
- Open-game discovery excludes games that are no longer joinable.

**Done when:**

- Common races self-correct without a hard reload.
- Actions are derived from the latest authoritative summaries.

### Step 8: Run short-term verification and close the docs

**Goal:** Prove the short-term package across focused tests and a browser smoke
flow.

**Verification flow:**

1. User A opens the lobby window and creates a game.
2. User B opens the lobby and joins from open games.
3. Both lobby views show the ready state through polling.
4. User A starts the match.
5. User A's dedicated game window opens.
6. User B's lobby view changes to active through polling.
7. User B opens a dedicated game window.
8. Both game windows show the active battlefield and obey turn ownership.
9. Optionally, User B opens a ready game window before User A starts it and
   verifies the live ready-to-active handoff.

**Done when:**

- Focused unit, component, configuration, and integration tests pass.
- The two-user browser flow passes.
- Documentation marks short-term polling and dedicated-window support as done.
- Lobby WebSocket and advanced multi-window coordination remain clearly
  deferred.

## Long-Term Backlog

Implement these only after short-term behavior is stable and product pressure
justifies the additional complexity.

1. Add a dedicated user/lobby live channel for coarse list invalidation.
2. Add open-or-focus behavior for existing game windows.
3. Prevent accidental duplicate game windows.
4. Propagate logout and authentication expiry across windows.
5. Send optional cross-window nudges to already-open waiting game windows.
6. Show multi-match turn, ready, and notification badges in the lobby.
7. Remove the legacy `ready` field from `GET /games` after all clients use
   lifecycle `status`.
8. Add leave/cancel, host transfer, rematch, private games, invite codes, and
   explicit ready-up if product scope requires them.

## Transport End State

```text
                    +----------------------+
                    |   REST authoritative |
                    | lists + snapshots    |
                    +----------^-----------+
                               |
         +---------------------+----------------------+
         |                                            |
+--------+--------+                        +----------+---------+
| Lobby window    |                        | Game window N      |
| poll or lobby WS|                        | /games/N/ws hints  |
| summaries only  |                        | one controller     |
+-----------------+                        +--------------------+
```

Short term uses polling on the left and the existing per-game WebSocket on the
right, with lifecycle gating and simple new-window handoff.

Long term may replace or supplement left-side polling with a dedicated lobby
channel. It must not require every game window to subscribe to every other game,
and it must not make browser cross-window messages authoritative.

## Risks and Mitigations

| Risk | Mitigation |
| :--- | :--- |
| Popup blocking prevents a new game window | Fall back to same-window navigation and expose a clear game link |
| Polling feels too slow | Refresh on focus/visibility and after mutations; tune the configured interval |
| Hidden tabs waste requests | Pause or reduce polling while hidden |
| Ready games look playable | Implement lifecycle gating before handoff polish |
| Polling requests overlap | Track in-flight work and ignore stale responses |
| Lobby and match concerns become mixed | Keep lobby summaries and match event streams as separate contracts |
| Multi-window work expands prematurely | Defer registries, BroadcastChannel, and socket multiplexing |
| Server and browser config drift | Use one named setting with loader, bootstrap, and documentation tests |

## Success Criteria

### Short-term success

- The lobby remains useful without manual reloads.
- Each player can keep the lobby open and play in one dedicated game window.
- Gameplay is available only after the server reports `active`.
- Polling cadence is configurable through standard configuration and browser
  runtime config.
- No lobby WebSocket or advanced multi-window manager is required.

### Long-term success

- Multiple concurrent game windows are easy to operate.
- Lobby updates can be push-driven when polling is no longer sufficient.
- Lobby and match transports remain separate logical concerns.
- Multi-match awareness does not require the lobby to open every match socket.
- REST snapshots remain the source of truth for both lobby and gameplay state.
