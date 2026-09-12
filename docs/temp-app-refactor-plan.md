# Temporary App Refactor Plan

Status: transient implementation roadmap. The authoritative pre-refactor implementation is [web/App.tsx.ref](../web/App.tsx.ref). The compact orchestration target is [web/App.tsx](../web/App.tsx).

## Refactor Review

The target dependency flow is:

`session -> events -> gate -> interaction -> display -> notifications -> commands`

The extraction must follow ownership boundaries rather than the line order in the reference file. The highest-risk contracts are:

- Server snapshots remain authoritative. WebSocket events are refresh hints only.
- One App instance maps to one game session.
- Turn handoff remains inactive -> acknowledgement -> active.
- Invalid snapshots are terminal and render the aborted screen.
- Transport failures remain recoverable and dismissible.
- Existing `data-testid` hooks remain unchanged.

The reference contains two near-duplicate turn-transition telemetry effects. They must become one change-gated effect and produce one transition record per state change. The documentation statement that all errors are dismissible should also be reconciled with the terminal invalid-snapshot rule.

## TDD Sequence

Each phase follows the same loop:

1. Add a focused failing test for the new module contract.
2. Implement the smallest module needed by that test.
3. Port only the corresponding behavior from `web/App.tsx.ref`.
4. Run the focused test and the relevant existing app regression tests.
5. Run the web build before moving to the next ownership boundary.

The scaffold imports intentionally missing modules, so focused module tests are the first executable checkpoints. Full typecheck and app integration validation become green once the complete set of contracts exists.

### 1. Characterize existing behavior

Use the current suites as the regression baseline:

- [App.orchestration.test.tsx](../test/web/app/orchestration/App.orchestration.test.tsx)
- [App.ui.test.tsx](../test/web/app/App.ui.test.tsx)
- [App.live-refresh.test.tsx](../test/web/app/flows/App.live-refresh.test.tsx)
- [App.fake-backend.test.tsx](../test/web/app/flows/App.fake-backend.test.tsx)

Add only missing assertions for injected-client precedence, one diagnostic per game, one telemetry record per transition, transport-error dismissal, and terminal snapshot failure.

### 2. Transport and idle fallbacks

Create:

- `web/lib/appRequestTransportAdapter.ts`
- `web/lib/appIdleSessionFallbacks.ts`

Port the request adapter and idle controller/state from the reference. Test successful calls, error propagation, logging metadata, diagnostic passthrough, and no-op idle behavior in:

- `test/web/lib/appRequestTransportAdapter.test.ts`
- `test/web/lib/appIdleSessionFallbacks.test.ts`

### 3. Authentication redirect

Create `web/lib/appAuthRedirect.ts` from the auth expiry and 401 handling. Test missing, expired, and future sessions, scheduled cleanup, injected navigation, storage clearing, and redirect-once behavior in `test/web/lib/appAuthRedirect.test.tsx`.

### 4. Session wiring

Create `web/lib/appSessionWiring.ts`. Its grouped result should expose auth session, binding, controller, session state, turn state, active game ID, controlled-session status, and the connected-session setter.

Test binding precedence in `test/web/lib/appSessionWiring.test.tsx`:

1. Injected `gameClient` plus `gameId`.
2. Connected session from `ConnectGate`.
3. Persisted authenticated session.
4. Idle fallback.

Also test controller disposal, auto-load behavior, and the live-event-source fallback.

### 5. Turn handoff gate

Create `web/lib/appTurnHandoffGate.ts` from the acknowledgement key, remote abort, and lock derivation logic. Test inactive, active-unacknowledged, and acknowledged-active states in `test/web/lib/appTurnHandoffGate.test.tsx`, including turn-key changes, clearing inactive events, remote `GAME_ABORTED`, and lifecycle termination.

### 6. Notification policy

Create `web/lib/appNotificationPolicy.ts`. Keep snapshot validation errors separate from recoverable session transport errors. Test action-error precedence, dismissal keys, error reappearance, game-over dismissal, and non-dismissible snapshot failures in `test/web/lib/appNotificationPolicy.test.ts`.

### 7. Commands and interaction callbacks

Create `web/lib/appCommands.ts` from the shell-control, combat, phase, refresh, acknowledgement, ram, debug, and dismissal handlers. Preserve `routeShellControl`, `buildCombatCommitAction`, and `buildEndPhaseCommitAction`.

Test command decisions and callback invocation in `test/web/lib/appCommands.test.ts`. Keep rendered interaction behavior covered by the existing orchestration suite.

### 8. Client diagnostics

Create `web/lib/appClientDiagnostics.ts` from the ready-session and invalid-snapshot effects. Test one `CLIENT_SESSION_READY` report per game, one `SNAPSHOT_INVALID` report per game, controller abort behavior, report payloads, and diagnostic submission failures in `test/web/lib/appClientDiagnostics.test.tsx`.

### 9. Debug telemetry

Create `web/lib/appDebugTelemetry.ts` from the reload and turn-transition effects. Test initial logging, change gating, no-op renders, browser guards, retained payload fields, and exactly one record per transition in `test/web/lib/appDebugTelemetry.test.tsx`.

Use one timestamp field consistently and do not silently discard useful fields from either former effect.

### 10. Shell components

Create and test:

- `web/components/GameAbortedScreen.tsx`
- `web/components/AppOverlayLayer.tsx`
- `web/components/AppShellLayout.tsx`

Add focused component tests for terminal messaging, overlay precedence, toast rendering, stable test IDs, and grouped-prop fan-out. `AppShellLayout` accepts grouped objects and is the only place that converts them to flat child props.

### 11. Reassemble App

Remove the corresponding implementation from the reference incrementally and keep `App.tsx` limited to hook ordering, terminal/pre-session branching, and composition. Preserve the test IDs:

- `app-shell`
- `app-ready`
- `session-sync-probe`
- `game-aborted`
- `app-<state>-state`

## Validation Gates

After each phase:

```bash
pnpm exec vitest run <focused-test-file>
pnpm web:build
```

After reassembly:

```bash
pnpm exec vitest run 'test/web/**/*.test.ts*'
pnpm web:build
pnpm web:lint
pnpm test:e2e
git diff --check
```

Delete or archive this document when the extraction is complete and the permanent web UI documentation reflects the final contracts.