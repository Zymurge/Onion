# Web Session Controller Refactor Spec

Status: Plan of record
Date: 2026-04-04
Branch: `feature/web-session-controller-refactor`

## Purpose

This refactor removes transport and live-sync knowledge from `App.tsx` and moves it into a single-game session controller boundary.

The authoritative contract for the refactor lives in [web/src/lib/gameSessionTypes.ts](../web/src/lib/gameSessionTypes.ts).

## Goals

1. Keep the web app scoped to one game session at a time.
2. Keep transport and live-sync policy out of `App.tsx`.
3. Use server snapshots as the authoritative render source.
4. Make the session boundary testable without React rendering.
5. Keep the contract, transport seam, controller, and fake backend split into small, explicit files.

## Non-Goals

1. No gameplay rule migration into the client.
2. No redesign of backend payloads unless required to support the new seam.
3. No broad UI redesign.
4. No attempt to fix the full test suite in this refactor.
5. No multi-game session support.

## Actionable Checklist

- [x] Move the contract into [web/src/lib/gameSessionTypes.ts](../web/src/lib/gameSessionTypes.ts)
- [ ] Add red transport contract tests for `GameRequestTransport` and `LiveEventSource`
- [ ] Implement the transport split
- [ ] Add red controller tests for `GameSessionController`
- [ ] Implement the controller and `useGameSession`
- [ ] Rewire `App.tsx` to consume the controller
- [ ] Add the fake backend harness
- [ ] Migrate broad App functional tests onto the fake backend harness

## Target Architecture

The target shape is a three-layer model.

The authoritative contract for the controller, transport, and live signals lives in [web/src/lib/gameSessionTypes.ts](../web/src/lib/gameSessionTypes.ts).

### 1. App Layer

Responsibilities:

1. render the current view state
2. own purely local UI state such as popup layout, debug panel visibility, and transient form input values
3. translate UI events into controller calls

The app must not own:

1. transport detection
2. connection lifecycle policy
3. refresh debouncing
4. live event sequence tracking
5. stale snapshot rejection
6. reconnect or resume behavior

### 2. Session Controller Layer

This is the new primary seam.

Responsibilities:

1. load and maintain the current game session snapshot
2. subscribe to the live event source
3. decide when an incoming live signal requires a refresh
4. coalesce bursts of events
5. reject stale refreshes and stale event-derived updates
6. manage retry policy for phase-change refresh races
7. expose one stable subscribe and getSnapshot API for consumers
8. normalize transport errors into domain-facing session state

This is the layer where fake backends become easy to plug in.

### 3. Transport Layer

This remains split into focused ports.

Responsibilities:

1. request transport: load snapshot, submit action, perform refresh
2. live event source: connect, disconnect, resume, and publish raw live messages plus connection diagnostics

The transport layer must not decide the app's refresh policy.

## Proposed Module Layout

The module layout below is locked for this refactor's planning and TDD work.

Rules:

1. these paths are the default implementation targets for the parallel workstreams
2. additive helper modules are allowed if they stay under the same ownership boundary
3. renaming or collapsing the primary modules below requires updating this spec first so agent scopes do not drift

### New Modules

1. `web/src/lib/gameSessionController.ts`
2. `web/src/lib/gameSessionTypes.ts`
3. `web/src/lib/liveEventSource.ts`
4. `web/src/lib/fakeGameBackend.ts`
5. `web/src/lib/useGameSession.ts`

### Existing Modules To Narrow

1. `web/src/lib/liveGameClient.ts`
2. `web/src/lib/httpGameClient.ts`
3. `web/src/App.tsx`

### Existing Modules To Leave Stable If Possible

1. `web/src/lib/gameClient.ts`
2. shared protocol and domain types under `src/shared` and `src/types`

## Session Ownership Rules

The controller owns session state. The app owns UI state.

### Controller-Owned State

1. current authoritative snapshot
2. session role
3. live connection status
4. last applied live sequence
5. refresh timer and quiet window logic
6. queueing and retry flags
7. stale snapshot rejection
8. normalized session error state

### App-Owned State

1. debug popup visibility and layout
2. connection gate form field drafts
3. ephemeral open and close UI state
4. any purely visual toggles that do not affect session correctness

### Explicitly Remove From Transport-Owned Snapshot

The following should not remain embedded in the transport's cached snapshot state:

1. selected unit ids
2. selected combat target id
3. pending combat confirmation UI state
4. other UI-local affordance state

Those belong either in the app layer or in a separate UI-focused controller if one is introduced later.

## Sync Implementation Plan

Implement snapshot-driven synchronization in the session controller.

Controller behavior to build:

1. treat live signals as refresh hints
2. keep the authoritative state in server snapshots
3. track the latest applied event sequence and event type
4. coalesce bursts of live signals into a single refresh window
5. reject stale refresh results that arrive behind a newer live signal
6. retry the phase-change refresh path when the controller observes a phase transition race
7. surface connection state and normalized transport errors through the session snapshot

## Fake Backend Design

The fake backend should not emulate the browser `WebSocket` API directly.

Instead it should implement the same ports used by the controller.

### Fake Request Transport

Capabilities:

1. seed initial snapshot
2. return queued refresh snapshots
3. record submitted actions
4. inject transport failures

### Fake Live Event Source

Capabilities:

1. emit connection state changes
2. emit live events with explicit sequence numbers
3. emit snapshot signals
4. emit errors
5. simulate reconnect and resume conditions

This yields deterministic controller tests and cleaner app tests.

## Migration Plan

This refactor should land in a few explicit phases.

### Phase 0: Freeze Contract And Boundaries

Deliverables:

1. this spec
2. agreed controller contract
3. agreed ownership split between app, controller, and transport
4. locked file layout for the initial implementation workstreams
5. transport contract tests defined as the first red step

Exit criteria:

1. no unresolved ambiguity about single-game scope
2. sync strategy selected
3. transport contract tests exist and fail for the intended transport seam

### Phase 1: Split Transport Ports

Deliverables:

1. introduce `GameRequestTransport` and `LiveEventSource`
2. narrow `liveGameClient.ts` so it behaves as a live event source plus diagnostics emitter
3. keep current behavior working behind adapter shims if needed
4. add transport contract tests covering request loading, action submission, live connect/disconnect, and diagnostics

Exit criteria:

1. no app code depends on raw WebSocket-like objects
2. transport responsibilities are clearly separated from refresh policy
3. the transport contract tests pass
4. the transport contract tests cover request loading, action submission, live connect/disconnect, and diagnostics

### Phase 2: Implement Session Controller

Deliverables:

1. controller state model
2. controller subscribe and getSnapshot API
3. internal refresh scheduling, coalescing, retry, and stale rejection logic moved out of `App.tsx`
4. `useGameSession` hook as a thin React adapter around the controller
5. add controller behavior tests covering live-hint refresh, stale refresh rejection, phase-retry handling, and normalized errors

Exit criteria:

1. live sync logic no longer lives in `App.tsx`
2. the controller can be exercised without React rendering
3. controller contract and behavior tests pass
4. controller tests cover live-hint refresh, stale refresh rejection, phase-retry handling, and normalized errors

### Phase 3: Shrink App And Extract Presentation Modules

Deliverables:

1. `App.tsx` updated to consume the controller only
2. utility extraction for pure battlefield view helpers if needed
3. component extraction for connection gate, header, and debug diagnostics if it reduces shell complexity without blocking the controller work
4. only the minimal App test updates needed to keep delegation coverage intact before the fake backend harness lands
5. narrow App tests that verify controller wiring and UI-only state

Exit criteria:

1. app no longer checks whether the client is "live"
2. app no longer owns refresh timers or event sequence refs
3. App tests at this phase do not reintroduce transport or synchronization policy assertions
4. the remaining App tests only validate controller wiring and UI-only state

### Phase 4: Add Fake Backend Harness

Deliverables:

1. fake request transport
2. fake live event source
3. reusable deterministic session fixtures
4. migrated App functional tests for controller-driven live behavior
5. broad App functional tests migrated off browser WebSocket stubs and live-client state shims

Exit criteria:

1. controller and future app tests can drive live behavior without browser WebSocket stubs
2. broad App orchestration coverage runs through fake ports rather than live-client state shims
3. fake backend tests cover the full controller and App flow used by the refactor

## TDD Plan

Implementation follows red-green-refactor, with the phase blocks above carrying the test work and pass criteria.

Overview:

1. Write transport contract tests before Phase 1 implementation.
2. Write controller behavior tests before Phase 2 implementation.
3. Keep Phase 3 App tests narrow and delegation-focused.
4. Move broad App functional coverage to Phase 4 after the fake backend harness exists.

## Parallel Agent Plan

This refactor can use multiple synchronous coding agents, but only if their file ownership is explicit.

The canonical source for model-selection guidance and workstream prompt text is `.copilot/agent.md`.

Consult that file before assigning work so model choice stays consistent with current cost and complexity guidance, including:

1. when to use `GPT-5.4`
2. when to use `GPT-5.3-Codex`
3. when `GPT-5.4 mini` is appropriate as a lower-cost implementation model
4. when to escalate from lower-cost models for architecture or state-machine work
5. the current copyable prompt text for each refactor workstream

### Serial Gate

Before parallel work starts, one lead change must land first:

1. lock the contract and file layout from this spec

That serial gate now includes these explicit testing decisions:

1. transport contract tests are the first required red step before Phase 1 implementation
2. broad App functional-test rewrites are deferred until Phase 4 introduces the fake backend harness
3. only narrow App wiring tests may move earlier

After that, the following work can proceed with low overlap.

### Agent 1: Transport Port Extraction

Objective:

1. separate request transport from live event source without changing app behavior yet

Primary files:

1. `web/src/lib/gameClient.ts`
2. `web/src/lib/httpGameClient.ts`
3. `web/src/lib/liveGameClient.ts`
4. new `web/src/lib/liveEventSource.ts`

Constraints:

1. do not modify `App.tsx` except import compatibility shims if unavoidable
2. do not move refresh policy into transport

Done criteria:

1. transport ports exist and compile
2. live transport exposes signals, not app policy

### Agent 2: Session Controller Implementation

Objective:

1. build the single-game session controller and React adapter without doing presentation refactors

Primary files:

1. new `web/src/lib/gameSessionTypes.ts`
2. new `web/src/lib/gameSessionController.ts`
3. new `web/src/lib/useGameSession.ts`

Constraints:

1. own refresh timing, queueing, stale rejection, and retry here
2. do not add gameplay rules or client-side projection logic

Done criteria:

1. the controller is independent from React component rendering
2. the public API is sufficient for `App.tsx` to stop managing live sync internals

### Agent 3: App Delegation And Shell Reduction

Objective:

1. rewire `App.tsx` to consume the controller and delete transport-specific orchestration

Primary files:

1. `web/src/App.tsx`
2. optional extracted presentation modules under `web/src/components`
3. optional pure helper extraction under `web/src/lib`

Constraints:

1. do not re-implement sync policy in hooks inside `App.tsx`
2. keep ownership of purely visual UI state in the app

Done criteria:

1. app no longer references live event sequences, retry refs, or quiet-window timers
2. app only calls controller methods and renders controller state

### Agent 4: Fake Backend Harness

Objective:

1. provide a deterministic fake backend that uses controller ports rather than browser socket primitives

Primary files:

1. new `web/src/lib/fakeGameBackend.ts`
2. supporting fixtures under `web/src/lib` or `web/src/test`

Constraints:

1. fake the ports, not the browser `WebSocket` API
2. keep it reusable for both controller tests and future app tests

Done criteria:

1. the fake can emit connection changes, events, snapshots, and transport failures
2. the fake records submitted actions for assertions

## Recommended Execution Order

1. land the spec and contract decision
2. run Agent 1 and Agent 2 in parallel if the contract names are fixed up front
3. run Agent 3 after Agent 2 is stable enough to wire into the app
4. run Agent 4 after Agent 2 contract names are stable

Before assigning any of those workstreams, check `.copilot/agent.md` for the latest model guidance and `GPT-5.4 mini` caveats so lower-cost models are only used where the contract is already stable.

If agent concurrency must be maximized while reducing merge risk:

1. Agent 1 and Agent 2 first
2. Agent 4 next
3. Agent 3 last

That sequence minimizes simultaneous edits to `App.tsx`.

## Risks

1. hidden coupling between app combat flows and the existing snapshot shape may surface once UI-local state is removed from transport-owned data
2. if the live event stream lacks enough information for reliable refresh triggering, the controller may need a slightly richer signal contract
3. extracting presentation helpers at the same time as session orchestration can create avoidable merge conflicts if not scoped tightly

## Rollback Strategy

1. keep the current `createLiveGameClient` adapter available behind a compatibility layer until the controller is fully wired
2. land the refactor in phases so the app can temporarily consume controller-backed state while transport adapters remain stable underneath
3. avoid deleting old transport exports until the app migration is complete

## Acceptance Criteria

The refactor is complete when all of the following are true:

1. `App.tsx` has no knowledge of WebSocket versus REST
2. `App.tsx` has no event sequencing refs, live refresh timers, or retry flags
3. session synchronization logic is concentrated in a standalone controller module
4. the controller can be driven by a fake request transport and fake live event source
5. the architecture supports deterministic client tests without browser-level socket stubbing

## Delivery Notes

This document now locks the serial-gate contract, file layout, and TDD sequencing for the refactor.

When implementation starts:

1. write the transport contract tests first and make them fail
2. implement the transport split until those tests pass
3. write focused controller-level tests around the chosen sync strategy
4. then rewire the app against the controller
5. defer broad App orchestration-test rewrites until the fake backend harness is available
