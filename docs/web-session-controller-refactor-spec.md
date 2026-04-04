# Web Session Controller Refactor Spec

Status: Proposed
Date: 2026-04-04
Branch: `feature/websocket-live-updates`

## Purpose

Define a one-time refactor that removes transport and live-sync knowledge from the web app shell and replaces it with a single-game session controller boundary.

This spec is intentionally narrow. It is not a general frontend roadmap. It covers one refactor only:

1. make `App.tsx` substantially thinner
2. hide WebSocket versus REST concerns from the app layer
3. move sequencing, batching, timing, and refresh policy into a testable session module
4. create a clean seam for a fake backend that can drive client tests without browser WebSocket stubbing

## Problem Statement

The current web client has a transport seam, but not a session seam.

Today:

1. `web/src/lib/gameClient.ts` provides a useful transport contract.
2. `web/src/lib/httpGameClient.ts` maps HTTP requests into domain snapshots.
3. `web/src/lib/liveGameClient.ts` manages socket connection state and event metadata.
4. `web/src/App.tsx` still owns the hard part: live refresh timing, event sequencing, stale snapshot rejection, retry behavior, and session-level orchestration.

That leads to two architectural problems:

1. the app shell has become a state machine
2. a fake backend is harder to plug in because tests must currently coordinate React state, timers, HTTP responses, and fake socket events at once

## Locked Decisions

1. One app instance maps to exactly one game session.
2. The app layer must not know whether updates arrive via WebSocket, polling, or any later transport.
3. The app layer must not know about event batching, resume timing, event sequence bookkeeping, or reconnect policy.
4. The refactor should prefer delegation and encapsulation over adding another large hook inside `App.tsx`.

## Goals

1. Introduce a single-session controller boundary above the transport seam.
2. Keep authoritative game state server-driven.
3. Make live sync behavior testable without React rendering.
4. Make transport replaceable with a fake request transport and fake live event source.
5. Reduce `App.tsx` to presentation and UI-only orchestration.

## Non-Goals

1. No gameplay rule migration into the client.
2. No redesign of backend payloads unless required to support the new seam.
3. No broad UI redesign.
4. No attempt to fix the full test suite in this refactor.
5. No multi-game session support.

## Target Architecture

The target shape is a three-layer model.

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
7. expose one stable subscribe and getSnapshot API for React
8. normalize transport errors into domain-facing session state

This is the layer where fake backends become easy to plug in.

### 3. Transport Layer

This remains split into focused ports.

Responsibilities:

1. request transport: load snapshot, submit action, perform refresh
2. live event source: connect, disconnect, resume, and publish raw live messages plus connection diagnostics

The transport layer must not decide the app's refresh policy.

## Proposed Module Layout

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

## Proposed Contracts

The exact names can change, but the shape should remain close to this.

```ts
export type GameSessionViewState = {
  status: 'idle' | 'loading' | 'ready' | 'refreshing' | 'error'
  snapshot: GameSnapshot | null
  session: GameSessionContext | null
  liveConnection: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  lastAppliedEventSeq: number | null
  lastAppliedEventType: string | null
  lastUpdatedAt: Date | null
  error: GameClientSeamError | null
}

export type GameSessionController = {
  subscribe(listener: (state: GameSessionViewState) => void): () => void
  getSnapshot(): GameSessionViewState
  load(): Promise<void>
  refresh(reason?: 'manual' | 'live-event' | 'phase-retry'): Promise<void>
  submitAction(action: GameAction): Promise<void>
  dispose(): void
}

export type GameRequestTransport = {
  getState(gameId: number): Promise<GameStateEnvelope>
  submitAction(gameId: number, action: GameAction): Promise<GameSnapshot>
}

export type LiveEventSource = {
  subscribe(listener: (event: LiveSessionSignal) => void): () => void
  connect(gameId: number): void
  disconnect(gameId: number): void
  getConnectionState(gameId: number): LiveConnectionStatus
}

export type LiveSessionSignal =
  | { kind: 'connection'; status: LiveConnectionStatus; gameId: number }
  | { kind: 'snapshot'; gameId: number; eventSeq: number | null }
  | { kind: 'event'; gameId: number; eventSeq: number; eventType: string }
  | { kind: 'error'; gameId: number; message: string }
```

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

## Recommended Synchronization Strategies

There are two credible designs.

### Option A: Snapshot-Driven Sync Triggered By Live Events

Model:

1. live events are treated as sync hints
2. the controller uses them to decide when to fetch a fresh authoritative snapshot
3. rendering remains based on server snapshots, not locally replayed event projections

Pros:

1. simpler correctness model
2. easier to reason about with the current backend contract
3. lower risk of client and server rule drift
4. phase transitions remain authoritative and consistent
5. easier rollback because the client never becomes a partial rules engine
6. smaller refactor footprint for this branch

Cons:

1. extra network round trips after live events
2. UI responsiveness depends on refresh timing and quiet-window tuning
3. bursty events may still collapse into coarse-grained updates rather than immediate local transitions
4. some live events become metadata instead of directly visible state changes

Best fit when:

1. server authority matters more than low-latency local animation
2. the backend already exposes a reliable snapshot endpoint
3. the team wants the smallest risky change now

### Option B: Event-Applied Client Projection With Snapshot Reconciliation

Model:

1. live events are applied directly to a client-side projection
2. snapshots are used to initialize state and periodically reconcile drift
3. the controller becomes responsible for event application semantics

Pros:

1. lower perceived latency
2. fewer refresh round trips in steady-state play
3. more fluid live feedback if the event model is complete and stable
4. can support richer incremental UI transitions later

Cons:

1. much higher complexity
2. requires stable and complete event semantics for every state change that matters to rendering
3. increases risk of divergence between server state and client projection
4. expands the controller into a projection engine
5. makes fake backends and controller tests more complex, not less
6. harder to land safely in a one-time refactor focused on encapsulation

Best fit when:

1. the event model is already comprehensive and trusted as the primary state stream
2. low-latency incremental updates are a product requirement
3. the team is willing to invest in a larger synchronization engine

### Recommendation

Choose Option A for this refactor.

Reasoning:

1. it directly satisfies the encapsulation goal
2. it removes live-sync policy from `App.tsx` without introducing a projection engine
3. it preserves server authority with the least architectural risk
4. it still leaves room to evolve toward Option B later if event completeness and latency needs justify it

This should be treated as the default architecture, not as a temporary tie.

Option B is explicitly deferred unless one or more of the following become true:

1. measured latency or refresh volume becomes a real product problem
2. the event stream becomes complete enough to support projection without hidden snapshot dependencies
3. richer live interaction is required beyond what a human-paced turn-based game needs

Until then, prefer a simpler authoritative snapshot model and keep the controller free of event-application semantics.

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

Exit criteria:

1. no unresolved ambiguity about single-game scope
2. sync strategy selected

### Phase 1: Split Transport Ports

Deliverables:

1. introduce `GameRequestTransport` and `LiveEventSource`
2. narrow `liveGameClient.ts` so it behaves as a live event source plus diagnostics emitter
3. keep current behavior working behind adapter shims if needed

Exit criteria:

1. no app code depends on raw WebSocket-like objects
2. transport responsibilities are clearly separated from refresh policy

### Phase 2: Implement Session Controller

Deliverables:

1. controller state model
2. controller subscribe and getSnapshot API
3. internal refresh scheduling, coalescing, retry, and stale rejection logic moved out of `App.tsx`
4. `useGameSession` hook as a thin React adapter around the controller

Exit criteria:

1. live sync logic no longer lives in `App.tsx`
2. the controller can be exercised without React rendering

### Phase 3: Shrink App And Extract Presentation Modules

Deliverables:

1. `App.tsx` updated to consume the controller only
2. utility extraction for pure battlefield view helpers if needed
3. component extraction for connection gate, header, and debug diagnostics if it reduces shell complexity without blocking the controller work

Exit criteria:

1. app no longer checks whether the client is "live"
2. app no longer owns refresh timers or event sequence refs

### Phase 4: Add Fake Backend Harness

Deliverables:

1. fake request transport
2. fake live event source
3. reusable deterministic session fixtures

Exit criteria:

1. controller and future app tests can drive live behavior without browser WebSocket stubs

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

Implementation should follow a red-green-refactor loop once coding begins, but this document intentionally stops at architecture and execution planning.

When implementation starts:

1. lock the contract first
2. add focused controller-level tests around the chosen sync strategy
3. then rewire the app against the controller
