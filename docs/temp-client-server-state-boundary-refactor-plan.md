# Client/Server State Boundary Refactor Plan

**Status:** Proposed
**Date:** 2026-04-25
**Branch:** `feature/stacking-refactor`

## Purpose

Re-establish a hard architectural boundary between backend-authoritative game state and browser-local UI state before more effort is spent debugging the current mixed model.

This plan treats the backend as the authority for all committed game-state changes and treats the browser as the owner of only transient per-user interaction state, transport/sync state, and pure derived view models.

This document is transient planning guidance. Once the migration lands, permanent docs such as the web UI and architecture docs must be updated and this plan can be retired.

## Decision Summary

The governing rule is:

- preparation is client-local
- commit is backend-authoritative
- refresh and live updates are synchronization, not game-state mutation
- inactive-player interaction is inspection only and remains client-local

In practical terms:

- Selecting and deselecting units, stack members, combat targets, inspector focus, and similar preparation steps are client-only.
- Committed actions such as move submission, resolve combat, and phase advance are backend-owned and must round trip through the server.
- Hard reload must reconstruct the app from a fresh backend snapshot plus empty local interaction state.
- The client must not persist UI-local selection state inside the same model used for backend-authoritative game state.

## Why Change Now

The current model already treats the backend as the rules authority, but the browser still mixes local interaction fields into the same snapshot-shaped object used for server data. This creates ambiguity during debugging and encourages accidental coupling between:

1. authoritative match state
2. transient interaction state
3. derived battlefield view state
4. live-sync bookkeeping

That ambiguity has already shown up in stack-selection, reload, and commit-path bugs.

Because the game is turn-based and gated on human reaction speed, the design should optimize first for simplicity, correctness, and reload safety rather than minimizing round trips.

## Non-Goals

This refactor does not aim to:

1. move gameplay rule validation into the client
2. make every hover or click a server mutation
3. redesign the overall UI layout
4. change combat or movement rules as part of the state-boundary work
5. replace the session controller transport seam with a new framework

## Target State Model

The frontend should have four explicit state categories with hard ownership boundaries.

### 1. Server Snapshot

This is the only browser model that represents authoritative game state.

Contents:

- game id
- phase
- turn number
- winner
- last event sequence
- authoritative game state
- movement remaining by unit
- objectives and escape hexes
- scenario map

Rules:

- Comes only from backend responses.
- Never includes UI-local selection state.
- Never includes pending target selection, inspector focus, or panel toggles.
- Hard reload reconstructs from this model alone.

Current owners to narrow:

- `web/lib/gameClient.ts`
- `web/lib/httpGameClient.ts`
- `web/lib/gameSessionController.ts`

### 2. Interaction State

This is client-local per-user prep state.

Contents:

- selected unit ids
- selected combat target id
- inspector focus if distinct from selection
- stack-member toggle state
- pending ram prompt
- local action error overlays
- local confirmation visibility or dismissed-toasts state

Rules:

- Never sent to the backend except by translation into a committed command.
- Never merged into the server snapshot model.
- Can be reset safely on hard reload.
- Exists to support preparation, not authority.

Current owner to keep and narrow:

- `web/lib/useBattlefieldInteractionState.ts`

### 3. Derived View State

This is pure computed state from:

- server snapshot
- interaction state
- sync state when needed for disable/lock behavior

Contents:

- actionable unit lists
- stack selection panels
- target lists
- attack totals and range overlays
- inspector content
- button enablement and disable reasons
- inactive-player derived displays

Rules:

- Pure derivation only.
- No side effects.
- Recomputable at any time from inputs.
- Must not persist hidden authority.

Current owners to narrow and simplify:

- `web/lib/useBattlefieldDisplayState.ts`
- `web/lib/appViewHelpers.ts`
- `web/lib/rightRailSelection.ts`
- combat-preview and battlefield view helpers

### 4. Sync State

This is client-local transport and refresh bookkeeping.

Contents:

- connection status
- refresh in-flight flags
- last observed event sequence
- last applied event sequence
- stale-detection state
- quiet-window and retry bookkeeping
- normalized transport errors

Rules:

- Not game state.
- Not interaction state.
- Must remain separate from the server snapshot and view-model layers.

Current owner:

- `web/lib/gameSessionController.ts`

## Hard Ownership Rules

### Backend-Owned

The backend owns:

1. move legality
2. combat legality
3. combat and movement spent tracking
4. phase advancement
5. final authoritative unit statuses and weapon statuses
6. event sequencing
7. persisted match state

### Client-Owned

The client owns:

1. selection and deselection before commit
2. inspector focus
3. stack expansion and presentation toggles
4. draft target selection before commit
5. temporary popups and toasts
6. connection and refresh presentation

### Explicitly Forbidden

The following must not be embedded into the server snapshot model:

1. selected unit ids
2. selected combat target id
3. local prep mode if it is purely UI-facing
4. pending confirmation state
5. panel open or closed state
6. transient stack-member toggle state

## Merits Of Simpler Backend Authority

This proposal intentionally accepts more backend round trips for committed actions because the game is turn-based.

Benefits:

1. Hard reload becomes easy to reason about.
2. Debugging gets simpler because problems are either in server snapshot mapping, local interaction state, or pure derivation.
3. Committed actions have one authority boundary.
4. Browser-local bugs stop masquerading as server-state bugs.
5. Test seams become cleaner and more layered.

Costs:

1. More server traffic for committed actions and refreshes.
2. Slightly more explicit controller and transport bookkeeping.
3. Some client convenience fields currently piggybacking on the snapshot must be relocated.

Given the product constraints, those costs are acceptable and preferable to continued ambiguity.

## Current Architectural Smells To Remove

1. Client-only fields are merged into snapshot-shaped models in the transport layer.
2. Selection semantics for stacks are spread across multiple helpers with different id forms.
3. Display derivation sometimes normalizes or mutates selection semantics instead of consuming one canonical interaction model.
4. Reload behavior is difficult to reason about because snapshot and UI-local overlays are not clearly separated.
5. Action submission helpers still need to compensate for mixed identifier forms that originate in different layers.

## Target File Boundary

The intended ownership after refactor is:

### Session and Transport

- `web/lib/gameSessionTypes.ts`
- `web/lib/gameSessionController.ts`
- `web/lib/httpGameClient.ts`
- `web/lib/liveEventSource.ts`
- `web/lib/useGameSession.ts`

Responsibilities:

- load snapshots
- submit committed actions
- observe live signals
- refresh when needed
- reject stale refreshes
- expose sync state and authoritative snapshot only

### Interaction State

- `web/lib/useBattlefieldInteractionState.ts`

Responsibilities:

- own client-local prep state
- translate prep state into committed actions
- clear or preserve local state based on explicit UI rules
- never masquerade as server state

### Derived Battlefield View Model

- `web/lib/useBattlefieldDisplayState.ts`
- `web/lib/appViewHelpers.ts`
- `web/lib/rightRailSelection.ts`
- `web/lib/combatPreview.ts`

Responsibilities:

- pure transformations from server snapshot plus interaction state
- no transport policy
- no persistence
- no hidden mutation of authoritative state

### UI Components

- `web/App.tsx`
- `web/components/*`

Responsibilities:

- render the view model
- dispatch interaction events
- avoid owning domain logic that belongs in derivation or committed-action helpers

## Migration Principles

1. Do not attempt one giant cut-over.
2. Move fields to their correct owner first, then simplify logic.
3. Keep the backend as the authority for all committed state changes throughout.
4. Prefer additive refactors with contract tests before deleting compatibility code.
5. Treat hard reload as a core validation path in every phase.
6. Use the commit boundary as the design checkpoint: if the user has not committed, the state should remain client-local.

## Sequential Agent Plan

The sequence below is intended to be handed to agents one step at a time. Each step should land with tests and should preserve behavior unless the step explicitly changes it.

### Progress

- Step 2 completed: UI-local fields removed from the snapshot contract.
- Step 3 completed: interaction state is explicit and client-local.
- Step 4 completed: display derivation now uses shared normalization helpers and no longer duplicates weapon-selection parsing.
- Step 5 completed: commit translation now runs through explicit builders.
- Step 6 completed: App shell now composes session, interaction, and display layers without inline action construction.
- Step 7 remains next: add and harden reload/reconnect regression coverage.

### Step 1. Freeze Vocabulary And Ownership

Goal:

- Establish one set of names for server snapshot, interaction state, derived view state, and sync state.

Deliverables:

- This transient plan is the temporary source of truth.
- A short glossary is added near the top of the relevant web-state files or shared types if needed.

Validation:

- No code change required beyond comments or type aliases.
- Team can point to one owner for each field.

### Step 2. Remove UI-Local Fields From The Snapshot Contract

Goal:

- Stop treating client-only selection or targeting state as part of the server snapshot model.

Target files:

- `web/lib/gameClient.ts`
- `web/lib/httpGameClient.ts`
- `web/lib/gameSessionTypes.ts`
- `web/lib/gameSessionController.ts`

Tasks:

1. Define a `ServerSnapshot` or equivalent type that contains backend-authoritative fields only.
2. Move `selectedUnitId` and any similar UI-local fields out of the transport-cached snapshot shape.
3. Ensure the session controller stores only authoritative snapshot plus sync metadata.

Definition of done:

- Hard reload reconstructs only backend data and sync state.
- No client-only field remains embedded in the authoritative snapshot type.

Validation:

- transport contract tests
- session controller tests
- one hard-reload app regression test

### Step 3. Define Explicit Interaction State Shape

Goal:

- Make prep state a first-class local model instead of scattered hook fields.

Target files:

- `web/lib/useBattlefieldInteractionState.ts`
- possible new file: `web/lib/battlefieldInteractionTypes.ts`

Tasks:

1. Define a single interaction-state type.
2. Group all selection, targeting, inspector, and prompt state under that model.
3. Make the interaction hook return that model plus mutation functions.

Definition of done:

- All prep state is clearly local and isolated.
- No interaction field depends on being embedded in a server snapshot.

Validation:

- focused interaction-hook tests or helper tests
- app orchestration tests for selection and deselection behavior

### Step 4. Make Display Derivation Pure

Goal:

- Ensure the battlefield display model is a pure function of server snapshot plus interaction state.

Target files:

- `web/lib/useBattlefieldDisplayState.ts`
- `web/lib/appViewHelpers.ts`
- `web/lib/rightRailSelection.ts`
- `web/lib/combatPreview.ts`

Tasks:

1. Remove any hidden dependence on transport-local snapshot overlays.
2. Consolidate stack id normalization in one helper boundary.
3. Ensure reloaded selection ids, owner ids, and stack-member ids normalize through one path.
4. Make button enablement and target availability derive only from server snapshot plus interaction state.

Definition of done:

- Display derivation has no side effects.
- Stack selection semantics are owned in one place.
- Hard reload produces the same derived model as a fresh local selection from the same server state.

Status:

- Completed on 2026-04-25.

Validation:

- pure helper tests
- orchestration tests for reload-sensitive stack flows

### Step 5. Make Commit Translation Explicit

Goal:

- The only bridge from local prep state to backend mutation is a small committed-action translation layer.

Target files:

- `web/lib/useBattlefieldInteractionState.ts`
- possible new helper: `web/lib/commitActionBuilders.ts`
- existing helpers like `web/lib/rightRailSelection.ts`

Tasks:

1. Introduce explicit builders for move, combat, and end-phase commands.
2. Feed them server snapshot plus interaction state.
3. Ensure they either return a valid backend command or a concrete validation reason.

Definition of done:

- No component or random hook builds backend commands ad hoc.
- Commit is the only place where client-local ids become backend action payloads.

Validation:

- pure command-builder tests
- existing commit-path orchestration tests

Status:

- Completed on 2026-04-25.

### Step 6. Simplify App To Composition Only

Goal:

- Make `App.tsx` orchestrate the layers rather than own mixed policy.

Target files:

- `web/App.tsx`

Tasks:

1. Consume session snapshot and sync state from the controller.
2. Consume local interaction state from the interaction hook.
3. Consume derived battlefield view state from the display hook.
4. Keep only top-level composition and UI wiring in `App.tsx`.

Definition of done:

- `App.tsx` no longer decides transport or normalization policy.
- Ownership boundaries are visible in the imports and data flow.

Validation:

- orchestration tests
- no broad app-state regressions

Status:

- Completed on 2026-04-25.

### Step 7. Add Hard-Reload And Reconnect Regression Coverage

Goal:

- Make reload and reconnect first-class test scenarios.

Target files:

- `test/web/app/orchestration/*`
- `test/web/app/flows/*`
- `test/web/lib/session/*`

Tasks:

1. Add hard-reload tests where the app boots from a fresh server snapshot after a committed action.
2. Add reconnect/live-refresh tests where sync state changes but interaction state is rebuilt correctly.
3. Cover stack-heavy flows for move and combat commits.

Definition of done:

- reload-specific regressions are reproducible in tests
- stack selection survives as a derivation, not as hidden cached authority

Validation:

- targeted orchestration and session-controller tests

### Step 8. Audit And Remove Compatibility Shims

Goal:

- Remove temporary bridging logic once ownership is clean.

Target files:

- any remaining helpers carrying snapshot/local mixed semantics

Tasks:

1. Delete no-longer-needed merge logic in the transport layer.
2. Delete compatibility helpers that existed only to support the old mixed model.
3. Rename types and helpers to reflect the final ownership boundary.

Definition of done:

- there is one obvious path from backend snapshot to local interaction to derived view to committed command
- code coverage of the web layer is at least 70% and/or documented in low coverage areas that are impractical to test

Validation:

- full targeted web test pass for touched areas

### Step 9. Update Permanent Docs

Goal:

- Make the new model the documented architecture and retire this transient plan.

Target docs:

- `docs/web-ui-spec.md`
- `docs/project-overview.md`
- the archived or living session-controller architecture docs if they still describe the older mixed snapshot model
- any stacking docs that mention client-side state ownership ambiguously

Tasks:

1. Add an explicit section defining the four state categories.
2. State that the backend owns committed game state and the browser owns only prep, sync, and presentation state.
3. Document the commit boundary.
4. Retire or cross-link this transient plan.

Definition of done:

- a new engineer can understand the frontend/backend state boundary from permanent docs alone

Validation:

- docs reviewed for consistency with the code and session-controller spec

## Recommended Order Of Execution

If this work is split across agents, the recommended order is:

1. Step 2
2. Step 3
3. Step 4
4. Step 5
5. Step 6
6. Step 7
7. Step 8
8. Step 9

Step 1 is already established by adopting this document as the transient source of truth.

## Success Criteria

The refactor is successful when all of the following are true:

1. A hard reload rebuilds the app from backend state plus empty local interaction state without hidden carry-over.
2. Committed actions are always backend-authoritative.
3. Client-only prep actions never require backend mutation.
4. The session controller owns sync state only, not UI prep state.
5. The display model is pure and recomputable.
6. Stack selection behavior is deterministic before and after reload.
7. Permanent architecture docs describe the same boundary the code implements.

## Immediate Next Step

The first implementation task should be Step 2: remove UI-local fields from the snapshot contract and transport cache. That step creates the strongest boundary improvement with the least ambiguity and sets up every later simplification.

## Boundary Drift And Repair Plan

The intended model in this plan is a strict split: backend state is authoritative, browser interaction state is transient, and the UI derives everything else from those two inputs. The codebase drifted away from that target in a few places. The current client snapshot type still mixes server data with UI-local fields, the HTTP transport still synthesizes fallback snapshot state, and the app/test fixtures have had to keep up with that mixed model instead of enforcing the stricter boundary.

That drift is why we are not fully at the planned end state yet. The browser still tolerates a fabricated initial snapshot and still carries local fields in the same snapshot-shaped object as server data. The result is that the code is part authoritative-server model and part transitional compatibility layer.

The repair sequence is:

1. Split the snapshot contract into an authoritative server snapshot and a transient client/session state shape.
2. Remove transport fallback/merge logic so the client stops inventing placeholder server state.
3. Move any remaining UI-local fields out of snapshot-shaped types and into interaction state.
4. Keep derived battlefield state pure and recomputable from server snapshot plus interaction state.
5. Retire the compatibility shims and update permanent docs once the split is complete.

That is the shortest path back to the boundary described above and the clearest way to prevent more mixed-model drift.
