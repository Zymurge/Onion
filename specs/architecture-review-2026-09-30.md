# Architecture Review - 2026-09-30

## Scope and Method

This review covers the authoritative-state projection pipeline, client session synchronization, combat and movement rule alignment, React projection cost, test architecture, and API boundary handling. It is based on committed `main` at `c565b1d`; the unrelated `.gitignore` and `captures` worktree changes were not modified.

Focused baseline validation passed 122 tests across engine combat, battlefield display, session control, live event source, and action routing. The findings below are therefore gaps in current behavior or coverage, not summaries of already-failing tests.

## Implementation Status

1. Request-secret redaction: implemented in `server/logging/requestLog.ts` and `server/app.ts`. Debug payloads, error diagnostics, and Fastify's automatic request serializer no longer emit passwords, authorization headers, cookies, or credential query parameters. Focused coverage is in `test/server/logging/requestLog.test.ts`.
2. Canonical combat and movement adapters: implemented. Stack combat uses live members for target state and defense. Defender preview strength and readiness ignore spent or empty weapons. Map validation preserves movement spend and counts a selected batch against destination stack capacity.
3. Reconnect and bounded refresh policy: implemented. The live event source now reconnects with bounded jittered backoff, resumes from the retained event cursor, and cancels reconnects on explicit disconnect. The session controller ignores stale failures and bounds transient live refresh retries with exponential delay.
4. Runtime HTTP schemas: completed. Command and snapshot boundary validation is complete, with malformed inputs rejected deterministically, canonical snapshots reusing semantic validation, and focused contract coverage in the server and HTTP adapter tests.
5. Combat projection performance: not started.

## A. Executive Summary

1. **Stop logging credentials and tokens.** The global debug hook records complete headers, query strings, and request bodies. At debug level this exposes bearer tokens, WebSocket query tokens, and login or registration passwords. This is the highest-urgency and cheapest repair.
2. **Bring live combat and movement legality back to one runtime model.** Server stack combat can reject a surviving stack after its first member is destroyed, while client defender attack strength and movement validation omit runtime state that the server uses. These are user-visible correctness defects caused by adapters drifting around otherwise healthy shared calculators.
3. **Make synchronization self-healing but bounded.** Unexpected WebSocket closure does not reconnect until another user action calls `connect()`, while failed live refreshes can retry forever and stale failures can overwrite newer success. Reconnection, request versioning, and retry budgets need one explicit owner.

## B. Prioritized Findings

### 1. High - Debug request logging exposes secrets

- **Files and symbols:** [`server/app.ts`](../server/app.ts), `getDebugRequestData`, global `preValidation`, and global error handler.
- **Evidence:** `getDebugRequestData` returns raw `query`, `headers`, and `body`; every request is passed through it before validation. That includes `Authorization: Bearer ...`, `/:id/ws?token=...`, and authentication payload passwords. The error handler logs the same fields again.
- **Failure mode:** Enabling `LOG_LEVEL=debug` writes reusable credentials and plaintext passwords to application logs. Debug logging is a supported production configuration value, so this is not limited to tests.
- **Impact:** Log readers or a log-system compromise become account/session compromise paths. Secret retention also complicates incident response and privacy obligations.
- **Recommendation:** Replace request-object logging with an allowlist of safe metadata and configure Pino redaction for `authorization`, `query.token`, `body.password`, cookies, and future credential fields. Prefer a short-lived WebSocket ticket over a JWT query parameter as a separate protocol hardening item.
- **Focused test:** Capture logger output for register/login, authenticated REST, and WebSocket upgrade requests using sentinel secrets; assert no sentinel appears in success or error logs.
- **Effort:** Small.

### 2. High - A partially destroyed stack can become untargetable and retain dead-member defense

- **Files and symbols:** [`server/engine/combat/actions.ts`](../server/engine/combat/actions.ts), `validateCombatAction`, `buildCombatCalculatorInput`, and `executeCombatAction`.
- **Evidence:** Group validation builds `members` from all roster IDs and chooses `members[0]` as representative. If that first member was destroyed by a prior `D`, the synthetic target state is `destroyed` even when later members survive, so validation returns `NO_TARGET`. The calculator also receives raw `group.unitIds.length`, while execution filters destroyed members and the web preview computes live stack size.
- **Failure mode:** An Onion attack destroys or disables the first live member; a second legal attack against the surviving stack is rejected, or its defense is calculated using destroyed members.
- **Impact:** Core combat can become impossible or resolve at incorrect odds. Client and server visibly disagree about a legal target.
- **Recommendation:** Resolve one canonical live-member list before validation. Use the first non-destroyed member as representative and the live count as stack size. Keep roster lifecycle semantics unchanged unless rules explicitly require immediate removal.
- **Focused test:** Execute two sequential `FIRE` actions against a two-member stack where the first result destroys member one; assert the stack remains targetable and defense drops to the surviving count.
- **Effort:** Small.

### 3. High - Unexpected WebSocket disconnects do not reconnect automatically

- **Files and symbols:** [`web/lib/liveEventSource.ts`](../web/lib/liveEventSource.ts), `createLiveEventSource`, especially `socket.onclose` and `socket.onerror`; [`web/lib/gameSessionController.ts`](../web/lib/gameSessionController.ts), `loadOrRefresh` and `submitAction`.
- **Evidence:** Close/error handlers delete the socket and emit `disconnected` but schedule no reconnect. A new socket is created only when an external caller invokes `connect()`, currently during load, manual refresh, or action submission. Existing “reconnect” tests explicitly call `connect()` again.
- **Failure mode:** Connectivity drops while the opponent acts. No user action occurs locally, so no new connection is made; turn-change events are missed and the authoritative snapshot remains stale indefinitely.
- **Impact:** A player can remain stuck on an inactive turn until manual refresh or another action happens. This contradicts the real-time/reconnection behavior in `turn-and-events-spec.md`.
- **Recommendation:** Add bounded exponential reconnect with jitter in the live event source, retain the last event cursor, send `RESUME` after reopening, and cancel timers on explicit disconnect/dispose. Keep authoritative snapshot refresh in the controller.
- **Focused test:** Unexpected close -> reconnect timer -> reopened socket sends the retained `RESUME` cursor -> missed event schedules one authoritative refresh; explicit disconnect must cancel the timer.
- **Effort:** Medium.

### 4. Medium - Session refresh lifecycle can retry forever and let stale failures overwrite newer success

- **Files and symbols:** [`web/lib/gameSessionController.ts`](../web/lib/gameSessionController.ts), `refreshLiveSnapshot`, `loadOrRefresh`, `submitAction`, and `shouldAcceptSnapshot`.
- **Evidence:** Successful responses are guarded by `requestVersion`, but catch blocks set error state without checking their captured version. Separately, a failed live refresh leaves the observed cursor ahead of the snapshot; `finally` immediately schedules another refresh after the quiet window, with no retry classification or attempt budget.
- **Failure mode:** Request B succeeds, then older request A rejects and changes the UI to `error` despite the newer snapshot. During an outage or malformed response, live refresh can generate two-attempt GET cycles every 500 ms indefinitely.
- **Impact:** False error overlays, unnecessary request load, and violation of the repository’s bounded transient-retry policy.
- **Recommendation:** Gate failures by request version, define one controller-owned retry state with classification/backoff/maximum attempts, and stop retrying 4xx, malformed, or invalid snapshots. Coordinate this with WebSocket reconnect so only one layer owns each retry.
- **Focused test:** Deferred A/B requests where B succeeds before A rejects; permanent 500, 401, and malformed snapshots must stop at the documented budget; transient failure must recover without losing the last valid snapshot.
- **Effort:** Medium.

### 5. Medium - Defender combat preview counts spent or empty weapons

- **Files and symbols:** [`web/lib/battlefieldDisplay/projection.ts`](../web/lib/battlefieldDisplay/projection.ts), `selectedCombatAttackStrength`; [`web/lib/weaponStats.ts`](../web/lib/weaponStats.ts), readiness helpers; [`shared/unitState.ts`](../shared/unitState.ts), `getAvailableWeapons`; [`server/engine/combat/actions.ts`](../server/engine/combat/actions.ts), defender validation and calculator input.
- **Evidence:** The display projection sums every catalog weapon on each selected defender. The server contributes only runtime weapons returned by `getAvailableWeapons`, which excludes spent, destroyed, and zero-ammo weapons. Web readiness currently checks only `state === 'ready'`, not ammo.
- **Failure mode:** A unit with one ready and one spent weapon remains selectable but shows inflated attack/odds; a nominally ready zero-ammo weapon can make a unit appear actionable and in range although the server rejects it.
- **Impact:** Resolve Combat presents a legal-looking action with incorrect strength or sends an action the server rejects.
- **Recommendation:** Introduce one ammo-aware live-weapon contribution helper in shared code and use it for readiness, range, attack strength, preview input, and server validation adapters.
- **Focused test:** Mixed ready/spent and ready/ammo-zero defenders must produce identical client preview strength/range and server combat plan values.
- **Effort:** Medium.

### 6. Medium - Local movement validation reconstructs units without movement spent and validates only one member

- **Files and symbols:** [`web/components/HexMapBoard.tsx`](../web/components/HexMapBoard.tsx), `buildMoveValidationState` and `validateMoveTarget`; [`shared/moveValidator.ts`](../shared/moveValidator.ts), `validateMove`; [`server/api/gameRoutes/actionHandlers/move.ts`](../server/api/gameRoutes/actionHandlers/move.ts), `handleMove`.
- **Evidence:** Battlefield views retain authoritative unit data, but `buildMoveValidationState` reconstructs units without `movementSpent`. The shared validator therefore computes full phase allowance. It also validates `incomingMembers = 1`, while the submitted command may move several selected stack members and the server validates them sequentially against changing state.
- **Failure mode:** Right-click can locally approve a destination beyond remaining allowance or beyond destination stack capacity for the selected group; the server then rejects the apparently legal move.
- **Impact:** Misleading board highlights/actions and avoidable round trips during a primary workflow.
- **Recommendation:** Preserve canonical movement-spend fields in the client adapter and add a shared batch-move validation contract used by both preview and server execution.
- **Focused test:** Partially moved unit cannot submit a non-highlighted destination; multi-member move must account for every member’s allowance and destination capacity.
- **Effort:** Medium.

### 7. Medium - Runtime protocol validation is inconsistent and sometimes masks invalid data

- **Files and symbols:** [`server/api/gameRoutes/actionRoutes.ts`](../server/api/gameRoutes/actionRoutes.ts), action dispatcher; [`server/api/gameRoutes/actionHandlers/move.ts`](../server/api/gameRoutes/actionHandlers/move.ts), `handleMove`; [`web/lib/httpGameClient.ts`](../web/lib/httpGameClient.ts), `normalizePhase` and snapshot mapping.
- **Evidence:** `Body: Command` is compile-time only; the route validates `type` but not discriminated payload fields. A `MOVE` with non-array `movers` reaches `[...new Set(command.movers)]` and becomes a 500 instead of documented 400. On reads, an absent or unknown phase is silently converted to `DEFENDER_MOVE`, bypassing the later fail-loud snapshot validator.
- **Failure mode:** Malformed clients trigger internal errors, while malformed server snapshots can put the UI into the wrong phase rather than terminate as invalid.
- **Impact:** Weak diagnostics, contract drift, and incorrect UI authority at the network boundary.
- **Recommendation:** Define shared strict runtime schemas for command and snapshot envelopes. Reject malformed commands with 400 and invalid snapshots with `GameClientSeamError`; never invent a phase.
- **Focused test:** Table-test missing/wrong fields for all command variants and invalid phase values in HTTP 200 responses.
- **Effort:** Medium.

### 8. Medium - Display projection repeats full combat-context construction and its memo input is unstable

- **Files and symbols:** [`web/lib/battlefieldDisplay/projection.ts`](../web/lib/battlefieldDisplay/projection.ts), `buildBattlefieldDisplayModel`; [`web/lib/combatPreview.ts`](../web/lib/combatPreview.ts), `buildCombatTargetOptions`; [`web/lib/battlefieldInteraction/useBattlefieldInteractionState.ts`](../web/lib/battlefieldInteraction/useBattlefieldInteractionState.ts), returned `interactionState`; [`web/lib/battlefieldDisplay/useBattlefieldDisplayState.ts`](../web/lib/battlefieldDisplay/useBattlefieldDisplayState.ts), memoization.
- **Evidence:** One projection builds target options globally, once per Onion weapon, and once per eligible defender. Each call filters/canonicalizes the roster, rebuilds indexes and lookups, and scans terrain/units. The interaction hook creates a new `interactionState` object on every parent render, invalidating the projection memo even when its fields did not change.
- **Failure mode:** Work approaches quadratic behavior as units/weapons grow and repeats on unrelated App renders such as connection, notification, or event-stream updates.
- **Impact:** UI latency risk in larger scenarios and increasingly difficult performance diagnosis.
- **Recommendation:** Build a snapshot-scoped combat projection context once (unit, terrain, roster, and catalog lookups), calculate per-attacker availability in bulk, and stabilize or field-depend the memo input. Optimize only after adding measurements.
- **Focused test:** Add a representative large-scenario benchmark or invocation-count test and React profiler regression threshold; verify identical target options before/after extraction.
- **Effort:** Large.

## C. Architecture Observations

### Healthy abstractions

- The server remains authoritative; interaction state is local and the display model is a pure function. This matches the architecture specification.
- Shared `combatCalculator`, `moveValidator`, target rules, movement allowance, and stack-roster modules are good domain boundaries.
- `GameSessionController` already coalesces live hints and rejects stale successful snapshots.
- Canonical stack validation fails loudly and has strong negative tests.
- REST writes are not retried, while read transport retries are bounded.

### Unclear or drifting ownership

- Retry ownership is split: HTTP retries individual reads, the controller reschedules refreshes indefinitely, and the live source does not reconnect itself.
- Shared calculators are canonical, but client/server adapters independently choose live weapons, stack members, movement fields, and group sizes. Most current rule drift occurs in these adapters.
- Snapshot validation is split between partial HTTP checks and full display validation; the `normalizePhase` fallback conflicts with fail-loud policy.
- Selection pruning owns identity existence, but not continued action eligibility. That leaves stale same-phase selections possible after runtime weapon state changes.

### Boundaries to preserve

- Keep action legality and authoritative mutation on the server.
- Keep events as refresh hints, not a second client state model.
- Keep pure shared rule calculators free of HTTP, React, and persistence concerns.
- Keep interaction state separate from snapshots and avoid optimistic authoritative mutation.
- Keep canonical stack membership in `stackRoster`, not inferred from co-location.

## D. Ranked Roadmap

### 1. Redact all request secrets

- **Goal:** Ensure credentials never enter logs.
- **Modules:** `server/app.ts`, logger configuration, focused server logging tests.
- **Benefit:** Closes the highest-impact security exposure with minimal change.
- **Risk:** Low; diagnostics become less verbose, so retain safe request IDs, route, method, status, and error metadata.
- **Validation:** Focused log-capture tests, `pnpm exec eslint server/app.ts <test-file>`, and `pnpm exec tsc --noEmit`.

### 2. Repair canonical live combat and movement adapters

- **Goal:** Make server stack resolution and client previews consume the same live members, weapons, ammo, and movement-spend facts.
- **Modules:** `server/engine/combat/actions.ts`, `shared/unitState.ts` or a new narrow shared contribution helper, `web/lib/battlefieldDisplay/projection.ts`, `web/lib/weaponStats.ts`, `web/components/HexMapBoard.tsx`, `shared/moveValidator.ts`.
- **Benefit:** Removes several user-visible false legal/illegal states and incorrect odds.
- **Risk:** Medium because combat and stack rules are central; split server stack repair from client adapter consolidation if needed.
- **Validation:** Engine combat regressions, display projection mixed-state tests, HexMapBoard partial/batch movement tests, then relevant integration scenarios.

### 3. Unify reconnect and bounded refresh policy

- **Goal:** Recover automatically from dropped sockets without request storms or stale error state.
- **Modules:** `web/lib/liveEventSource.ts`, `web/lib/gameSessionController.ts`, transport/session contract tests, `snapshot-deprecation-policy.md` if timing details need specification.
- **Benefit:** Reliable turn handoff and predictable outage behavior.
- **Risk:** Medium; timer cancellation and duplicate refreshes require deterministic fake-timer tests.
- **Validation:** Contract tests for unexpected close/resume, stale rejection, retry exhaustion, disposal, and recovery; existing session suites.

### 4. Enforce runtime schemas at HTTP boundaries - Complete

- **Goal:** Reject malformed commands and snapshots deterministically without fallbacks.
- **Modules:** shared protocol schema module, `actionRoutes.ts`, `httpGameClient.ts`, API contract tests.
- **Benefit:** Better security posture, diagnostics, and compatibility guarantees.
- **Risk:** Medium; strict schemas can reveal noncanonical fixtures and clients.
- **Validation:** malformed command tables, invalid successful-response tables, server API integration tests, and HTTP adapter contract tests.

### 5. Build and measure a snapshot-scoped combat projection context

- **Goal:** Remove repeated roster/terrain/unit reconstruction from derived rendering.
- **Modules:** `battlefieldDisplay/projection.ts`, `combatPreview.ts`, interaction/display memo boundaries.
- **Benefit:** Lower render cost and clearer ownership for availability calculations.
- **Risk:** Medium-high if combined with behavior changes; require parity tests first.
- **Validation:** target-option parity suite, representative scenario benchmark, React profiler measurement, web test suite.

## E. Highest-Leverage First Item

**Redact request secrets first.** It is the only finding that can expose credentials outside the game process, it affects every authenticated route, and it is a small isolated change with a straightforward negative test. It should be completed before larger correctness refactors. Immediately after that, repair partially destroyed stack targeting because it is the highest-severity gameplay defect and also narrowly testable.

## Validation Performed

The following focused suites passed, 122 tests total:

- `test/server/engine/combat.test.ts`
- `test/web/lib/useBattlefieldDisplayState.test.tsx`
- `test/web/lib/session/gameSessionController.test.ts`
- `test/web/lib/transport/liveEventSource.contract.test.ts`
- `test/server/api/games.actions.phase.test.ts`

No product code was changed during this review.
