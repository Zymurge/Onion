# Temporary App Refactor Plan

Status: completed and archived. The authoritative pre-refactor implementation
was [web/App.tsx.ref](../../web/App.tsx.ref). The completed orchestration target
is [web/App.tsx](../../web/App.tsx).

## Refactor Review

The target dependency flow was:

`session -> events -> gate -> interaction -> display -> notifications -> commands`

The extraction followed ownership boundaries rather than the line order in the
reference implementation. The highest-risk contracts were:

- Server snapshots remain authoritative. WebSocket events are refresh hints only.
- One App instance maps to one game session.
- Turn handoff remains inactive -> acknowledgement -> active.
- Invalid snapshots are terminal and render the aborted screen.
- Transport failures remain recoverable and dismissible.
- Existing `data-testid` hooks remain unchanged.

The extraction also consolidated duplicate turn-transition telemetry, clarified
terminal invalid-snapshot handling, and preserved the existing test IDs.

## Completed Work

The TDD sequence completed all planned boundaries. Each phase used the same
loop: add a focused failing test, implement the smallest module needed by that
test, port the corresponding behavior, run focused and app regression tests,
and run the web build.

### 1. Characterize Existing Behavior

The existing App orchestration, UI, live-refresh, and fake-backend suites were
used as the regression baseline. Missing assertions covered injected-client
precedence, one diagnostic per game, one telemetry record per transition,
transport-error dismissal, and terminal snapshot failure.

### 2. Transport and Idle Fallbacks

Created `web/lib/appRequestTransportAdapter.ts` and
`web/lib/appIdleSessionFallbacks.ts`, with focused tests for successful calls,
error propagation, logging metadata, diagnostic passthrough, and no-op idle
behavior.

### 3. Authentication Redirect

Created `web/lib/appAuthRedirect.ts` with tests for missing, expired, and future
sessions, scheduled cleanup, injected navigation, storage clearing, and
redirect-once behavior.

### 4. Session Wiring

Created `web/lib/appSessionWiring.ts` with tests for injected-client,
connected-session, persisted-session, and idle fallback precedence, controller
disposal, auto-load behavior, and live-event-source fallback.

### 5. Turn Handoff Gate

Created `web/lib/appTurnHandoffGate.ts` with tests for inactive,
active-unacknowledged, and acknowledged-active states, including turn-key
changes, inactive-event clearing, remote `GAME_ABORTED`, and lifecycle
termination.

### 6. Notification Policy

Created `web/lib/appNotificationPolicy.ts` with tests for action-error
precedence, dismissal keys, error reappearance, game-over dismissal, and
non-dismissible snapshot failures.

### 7. Commands and Interaction Callbacks

Created `web/lib/appCommands.ts` for shell controls, combat, phase, refresh,
acknowledgement, ram, debug, and dismissal handlers. Command decisions and
callback invocation have focused coverage, while rendered behavior remains
covered by the orchestration suite.

### 8. Client Diagnostics

Created `web/lib/appClientDiagnostics.ts` with tests for one
`CLIENT_SESSION_READY` report per game, one `SNAPSHOT_INVALID` report per game,
controller abort behavior, payloads, and diagnostic submission failures.

### 9. Debug Telemetry

Created `web/lib/appDebugTelemetry.ts` with tests for initial logging, change
gating, no-op renders, browser guards, retained payload fields, and exactly one
record per transition.

### 10. Shell Components

Created and tested `GameAbortedScreen`, `AppOverlayLayer`, and
`AppShellLayout`. The layout accepts grouped props and is the single fan-out
point to the header, rails, and stage.

### 11. Reassemble App

Reassembled `web/App.tsx` as a thin composition layer limited to hook ordering,
terminal and pre-session branching, and shell composition. Existing test IDs
were preserved, including `app-shell`, `app-ready`, `session-sync-probe`,
`game-aborted`, and `app-<state>-state`.

## Validation

The completed refactor passed the full web suite, web production build, web
lint, E2E typecheck, and the full E2E suite. The pre-extraction implementation
remains temporarily available at `web/App.tsx.ref` for PR comparison and can be
removed after review.

## Validation Gates

After each phase, the focused test and web build were run. After reassembly,
the full web suite, web build, web lint, E2E suite, and `git diff --check` were
run.