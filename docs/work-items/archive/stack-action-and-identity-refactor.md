# Stack Action And Identity Refactor

**Status:** Complete; archived 2026-10-27.

## Purpose

Issue #60 asks how movement, combat, ramming, and stacks should interact; whether they should share a common action path; and where server and web code duplicate stack behavior. This document records the architectural assessment of the current implementation, resolves foundational contract decisions, and establishes an actionable, bounded sequence of implementation tasks for sub-agents.

This document is an architectural plan of record. The completed seven-item implementation sequence below is the final status authority; the detailed tasks retain the architectural boundaries and acceptance criteria for historical reference. It does not authorize changes outside its sequenced scope.

## Completed Seven-Item Sequence

The implementation sequence is intentionally narrower than the architectural task breakdown below:

1. **[x] Define common action subject**
2. **[x] Unify canonical group lookups**
3. **[x] Enforce immutable group IDs**
    - Persist canonical opaque `group-N` IDs in `stackRoster.groupsById`.
    - Keep group-ID allocation in `stackRoster` and remove caller-controlled split IDs.
    - Align action and UI contracts with canonical `groupId` values.
    - Remove coordinate-derived targets, naming keys, and stale coordinate-shaped fixtures.
    - Complete the focused integration, typecheck, and lint audit for the changed surfaces.
4. **[x] Align naming lifecycle IDs**
    - Allocate initial group IDs from the roster ordinal and omit singleton roster entries.
    - Key active naming records and retirement history by canonical `groupId`.
    - Preserve names across intact moves, splits, and merges without recycling retired names.
    - Keep roster canonicalization and naming refresh synchronized, including singleton pruning.
5. **[x] Align action-specific resolution**
    - Action execution rewrites, combined commands, and web command resolution were completed under item 5.
6. **[x] Cross-layer verification and regression suite**
7. **[x] Handler boilerplate consolidation**

### Completion Status (2026-10-27)

- Items 1 through 7 are complete. Canonical group identity, singleton pruning, naming lifecycle, server action handling, web projections, and direct right-rail FIRE target resolution are implemented and covered by focused regressions.
- Inactive-event naming is covered at the server event-builder, web formatting, and browser-rendered E2E layers. The grouped combat scenarios assert `Fire on Little Pigs group 1: destroyed`, `Attackers (1): Main Weapon`, `Attackers (2): Little Pigs group 1`, and friendly target labels including `Target: Little Pigs group 1` and `Target: The Onion 1 treads`; canonical `group-1` remains the wire/state identity and is not accepted as the viewer-facing name.
- Verified gates: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm web:build`, `pnpm lint`, and `pnpm web:lint`. The web build reports a non-blocking large-chunk warning; root lint reports only three warnings in generated coverage files and no errors.
- `pnpm test:integration` is verified against the external Compose PostgreSQL service with the host test environment configured: 4 test files and 39 tests passed. The `db` and `migrate` services are required; the `engine` container is not required because Vitest instantiates the app in the host process.
- No implementation steps remain. MOVE and FIRE share only their post-execution finalization boundary; their domain logic remains distinct.

## 1. Executive Decision Summary and Core Contract

1. **Keep MOVE and FIRE Distinct:** MOVE and FIRE retain distinct command structures, validation rules, state mutations, and event emissions. Ramming remains an integral outcome of MOVE path execution with die rolls and tread damage side effects, not an independent top-level command.
2. **ActionSubject as a Pure Resolver:** `ActionSubject` is a derived, read-only interface/resolver over canonical game state, extending the existing `StackRosterIndex` pattern. It is never a persisted entity and does not replace canonical unit records.
3. **Immutable, Location-Independent Group Identity:** Group identity (`groupId`) does not encode coordinates or unit types. It remains stable across movement and whole-group relocation.
4. **Group Lifecycle and Allocator Ownership:**
   - A group exists only when it contains two or more operational members ($N \ge 2$).
   - Singletons are represented solely by their canonical `unitId`; they do not have group records in `stackRoster.groupsById`.
   - `stackRoster` owns canonical group membership and the durable monotonic counter `nextGroupOrdinal` stored in `StackRosterState` (`group-1`, `group-2`, ...). Retired group IDs are never reused in a match.
   - When merging groups, the lower-numbered group ID survives (`group-1` absorbed with `group-2` retains `group-1`); the higher ID is retired.
5. **Separate Stack Naming from Group Identity:**
   - `shared/stackRoster` owns canonical group membership, group IDs, and lifecycle transitions.
   - `shared/stackNaming` owns group display-name generation and retirement history (`groupsInUse`, `usedGroupNames`).
   - Group records in `stackRoster` store the active assigned `groupName` for snapshot convenience, but `stackNaming` remains the allocator authority. Naming keys transition from coordinate keys (`${type}:${q},${r}`) to canonical `groupId`.
6. **Disposal of Legacy Match Data:**
   - Per `docs/snapshot-deprecation-policy.md`, backward compatibility for deprecated snapshot schemas is explicitly rejected.
   - Existing active match records, test snapshots, and disposable fixture data are rebuilt from canonical scenario definitions.
   - No destructive database truncation commands are executed automatically by coding agents; database migrations or schema adjustments must be explicitly scoped.

---

## 2. Terminology and Identity Invariants

| Concept | Definition | Invariant / Boundary |
| --- | --- | --- |
| **Unit ID (`unitId`)** | Identifies one individual unit record (e.g., `pigs-1`, `wolf-1`, `onion-1`). | Globally unique per match. Canonical state lives in `state.defenders` or `state.onions`. Survives splits and merges. |
| **Group ID (`groupId`)** | Identifies an active formation of $\ge 2$ stackable units. Opaque string (e.g., `group-1`). | Location-independent. Never encodes `q, r` or unit type. Preserved when moving intact. Never reused after retirement. |
| **Map Key (`rosterKey`)** | Key in `state.stackRoster.groupsById`. | Strictly equals the canonical `groupId`. |
| **Derived Position Key (`hexKey`)** | Coordinate key (e.g., `4,4` or `${type}:${q},${r}`). | Used solely for spatial queries (occupancy, range, terrain). Must **never** be used as an identity key in `groupsById` or `targetId`. |
| **Naming Key (`groupId`)** | Lookup key in `stackNaming.groupsInUse`. | Must match the canonical `groupId`; coordinate-derived naming keys are invalid. |
| **ActionSubject** | Pure derived view resolved from a `unitId` or `groupId`. | Exposes `id`, `kind: 'unit' \| 'group'`, `typeId`, `position`, `label`, `size`, and `memberUnitIds`. Transient; never persisted. |
| **Combat Target ID (`targetId`)** | Protocol target wire identifier. | Valid values: individual unit ID (unstacked unit), canonical `groupId` (multi-unit stack target), weapon ID (`main`, `secondary-1`), or `{onionId}:treads`. |

---

## 3. Current Architecture vs. Proposed Architecture

### Findings Analysis & Classification

- **F1 (Group IDs encode location):** Currently `labels.ts` generates `${unitType}:${q},${r}`. A move deletes the old key and creates a new one at `newQ,newR`.
  *Correction:* Replace with monotonic opaque IDs (`group-1`, `group-2`, ...) allocated by `stackRoster`. Whole-group moves update `position` on the group record without changing `groupId`.
- **F2 (Dual key derivation in indexing):** `buildStackRosterIndex` and `canonicalizeStackRoster` recompute keys from `type` and `position`.
  *Correction:* Indexing and lookup must rely on the stored, canonical `groupId`.
- **F3 (Web naming & preview reconstruct coordinate keys):** `battlefieldNaming.ts` and `combatPreview.ts` build coordinate strings to find groups.
  *Correction:* Resolve the unit’s group via `buildStackRosterIndex(state).getUnitGroup(unitId)` and use its canonical `groupId`.
- **F4 (FIRE stack targets use coordinate keys):** The API contract currently specifies targets like `LittlePigs:3,2`.
  *Correction:* Update `docs/api-contract.md` so stack targets use canonical group IDs (`group-1`). Wire formats, events, responses, and tests must align with the new canonical format.
- **F5 (Singleton roster representations):** `stackRoster/validation.ts` previously emitted `STACKABLE_DEFENDER_MISSING_GROUP` if any stackable defender lacked a group.
  *Correction:* Align consistency validation with `docs/snapshot-deprecation-policy.md`. A group exists only for $N \ge 2$. Singletons must not be in `groupsById`.
- **F6 (MOVE & FIRE API handler boilerplate):** `move.ts` and `fire.ts` duplicate database progression, event cause tracking, and response wrapping.
  *Correction:* This is transport boilerplate, not domain duplication. Domain logic is properly isolated in `server/engine/movement.ts` and `server/engine/combat/actions.ts`. Handler extraction is optional and deferred.
- **F7 (Dual CombatExchangeInput assembly):** Both engine and web adapt game state into calculator inputs.
  *Correction:* The shared calculator (`shared/combatCalculator.ts`) is already the shared rules authority. The dual adaptations reflect legitimate server authoritative vs. client preview needs.
- **F8 (Web submission polymorphism):** `buildRightRailStackSubmissionAction` already unifies web client submission.
  *Correction:* No engine action polymorphism is needed; distinct MOVE and FIRE semantics must be preserved.
- **F9 (Ramming classification):** Ramming is an evaluation outcome during MOVE, not a distinct command.
  *Correction:* Retain ramming inside movement validation, execution, and move event envelopes.
- **F10 (Two label pipelines):** Event builders inspect `groupsById` directly while web naming derives coordinate keys.
  *Correction:* Standardize both on canonical roster queries using `groupId`.
- **F11 (Combat preview co-location tripwire):** `combatPreview.ts` uses co-location checks as a missing-roster tripwire.
  *Correction:* Replaced by assertions using the canonical roster index.
- **F12 (ID factory coupled to naming):** `buildStackGroupKey` lives in `shared/stackNaming`.
  *Correction:* Group ID generation is moved to `shared/stackRoster`. `stackNaming` only manages display names.
- **F13 (Empty groups surviving transitions):** `expandStackRosterGroups` could leave groups with 0 or 1 members.
  *Correction:* Clean up groups with $< 2$ members during roster lifecycle reconciliation.

---

## 4. Architectural Boundaries and Non-Goals

### Boundaries to Preserve

- **Backend Engine Authority:** The engine remains authoritative for movement legality, phase order, combat rolls, CRT resolution, ramming outcomes, and canonical state mutation.
- **Client Preparation:** The web client prepares actions locally. Committed actions must round-trip through the API and engine; no optimistic mutations of canonical state.
- **Stable Member Identity:** Individual units retain their unique `unitId` across splits, merges, moves, and combat.
- **Roster vs. Naming Separation:** `stackRoster` owns group structure and identity. `stackNaming` owns friendly display strings and used-name history.

### Explicit Non-Goals

- Do not create a polymorphic command endpoint combining MOVE and FIRE.
- Do not treat ramming as an independent top-level action.
- Do not build automated migration scripts or dual-read fallback compatibility layers for legacy snapshots.
- Do not execute destructive table truncations without explicit operator authorization.
- Do not create a secondary persisted database table or entity for `ActionSubject`.

---

## 5. Implementation Task Dependency Graph

```text
           [Task 1: Contract & Specification Alignment]
                                |
                                v
           [Task 2: Shared Identity, Roster & ActionSubject]
                                |
            +-------------------+-------------------+
            |                                       |
            v                                       v
[Task 3: Scenario Normalization         [Task 4: Server Engine
    & Naming Lifecycle]                      & API Protocol]
            |                                       |
            +-------------------+-------------------+
                                |
                                v
           [Task 5: Web Projections & Command Builders]
                                |
                                v
           [Task 6: Cross-Layer Verification & Regressions]
                                |
                                v
           [Task 7: Handler Cleanup (Completed)]
```

---

## 6. Detailed Task Specifications for Sub-Agents

### Task 1: Contract & Specification Alignment

- **Goal:** Update all specification and contract documents to establish the new identity rules before code changes begin.
- **Files to Update:**
  - `docs/api-contract.md`: Update `### FIRE` and `#### Combat Target IDs` to replace coordinate IDs (e.g., `LittlePigs:3,2`) with opaque group IDs (e.g., `group-1`). Clarify that singletons are targeted by `unitId`.
  - `docs/snapshot-deprecation-policy.md`: Update schema requirements: `groupsById` contains only groups with $N \ge 2$; singleton stackables are not groups.
- **Prerequisites:** None.
- **Deliverables:** Updated documentation reflecting immutable `groupId`, removal of singleton roster entries, and updated example wire payloads.
- **Validation:** Visual diff check; verify documentation accuracy with `docs/agent-start-here.md`.
- **Non-Goals:** Do not change production TypeScript code or JSON schemas yet.

---

### Task 2: Shared Identity, Roster Lifecycle & ActionSubject View

- **Goal:** Update `shared/stackRoster` and `shared/types` to support monotonic group IDs, singleton pruning, and the derived `ActionSubject` resolver.
- **Files to Inspect / Modify:**
  - `shared/types/index.ts`: Update `StackRosterState` to include `nextGroupOrdinal: number`. Update `StackRosterGroupState` ensuring `groupId` is recognized.
  - `shared/actionSubject.ts`: Define the derived `ActionSubject` interface and related resolution types.
  - `shared/stackRoster/types.ts`: Maintain the related roster view and lookup contracts.
  - `shared/stackRoster/indexing.ts`: Enhance `buildStackRosterIndex` to resolve `ActionSubject` for any unit or group ID. Remove coordinate-based `groupKey` lookups.
  - `shared/stackRoster/transitions.ts`:
    - Move intact groups by updating `position` while keeping `groupId`.
    - Splitting allocates new `groupId` (`group-${nextOrdinal++}`) for moving units. Retain source `groupId` if remaining units $\ge 2$; otherwise retire it.
    - Merging retains the lowest numerical ordinal group ID and retires others.
    - Prune groups with $< 2$ members to eliminate singletons.
  - `shared/stackRoster/validation.ts`: Remove `STACKABLE_DEFENDER_MISSING_GROUP` requirement for singletons. Require all groups in `groupsById` to have $\ge 2$ members.
  - `test/shared/stackRoster.test.ts`: Update tests to assert monotonic `groupId` persistence, singleton retirement, and `ActionSubject` resolution.
- **Prerequisites:** Task 1.
- **Acceptance Criteria:**
  - Monotonic group IDs are preserved across whole-group movement.
  - Groups with $< 2$ members are automatically retired from `groupsById`.
  - `buildStackRosterIndex` correctly returns `ActionSubject` views.
  - Canonical roster projection preserves `nextGroupOrdinal` and retired-name history while pruning singleton groups.
  - Focused suite passes: `pnpm test test/shared/stackRoster.test.ts`.
- **Non-Goals:** Do not modify server scenario normalizer or web client in this task.

---

### Task 3: Scenario Normalization & Naming Lifecycle

- **Goal:** Update initial scenario deployment processing and stack naming to use the new group ID format and naming key.
- **Files to Inspect / Modify:**
  - `server/engine/scenarioNormalizer.ts`:
    - Initialize `stackRoster` with `nextGroupOrdinal: 1`.
    - Multi-unit deployments allocate `group-${nextGroupOrdinal++}` instead of `${type}:${q},${r}`.
    - Single-unit deployments do not create entries in `stackRoster.groupsById`.
  - `shared/stackNaming/engine.ts` & `shared/stackNaming/snapshot.ts`:
    - Use `groupId` as the lookup key in `groupsInUse` instead of coordinate keys.
    - Ensure name assignment and retirement record history against `groupId`.
  - `shared/stackRoster/naming.ts`: Update `canonicalizeStackRoster` and `refreshStackRosterNamingSnapshot` to align with `groupId`.
  - `test/server/engine/scenarioNormalizer.test.ts` & `test/shared/stackNaming.test.ts`.
- **Prerequisites:** Task 2.
- **Acceptance Criteria:**
  - Normalized initial state contains valid `group-1`, `group-2` IDs for multi-unit deployments.
  - Singletons have no group in `groupsById`.
  - Naming snapshot tracks groups by `groupId`.
  - Focused tests pass: `pnpm test test/server/engine/scenarioNormalizer.test.ts test/shared/stackNaming.test.ts`.
- **Non-Goals:** Do not edit game action execution or web components.

---

### Task 4: Server Engine Execution & API Protocol Handlers

- **Goal:** Align server movement, combat validation, phase cleanups, event builders, and response projections with location-independent group IDs and singleton removal.
- **Files to Inspect / Modify:**
  - `server/engine/movement.ts`:
    - Update `reconcileStackStateAfterMoves` to preserve moving `groupId` and purge singletons.
  - `server/engine/combat/actions.ts`:
    - Target resolution (`resolveDefenderTarget`): look up `targetId` in `groupsById` directly by `groupId`.
    - Same-stack multi-attacker validation (`areAttackersInSameStack`): check membership via `groupsById`.
  - `server/engine/phases.ts`: Ensure end-of-phase cleanup prunes destroyed units and retires singletons.
  - `server/api/gameHelpers/eventBuilders.ts`:
    - `resolveUnitFriendlyName` and `resolveTargetFriendlyName`: look up friendly name using `groupId` without coordinate fallback.
  - `server/api/gameHelpers/stateProjection.ts`:
    - Validate canonical consistency without requiring singleton group records.
  - `test/server/engine/movement.test.ts`, `test/server/engine/combat.test.ts`, `test/server/engine/phases.test.ts`, `test/server/api/gamesHelpers.test.ts`.
- **Prerequisites:** Task 3.
- **Acceptance Criteria:**
  - Server validates and executes `FIRE` targeting `group-1`.
  - Inactive and active combat/move events emit canonical `groupId` and correct friendly names.
  - Movement preserves group ID on intact moves and correctly reconciles splits/merges.
  - Focused tests pass: `pnpm test test/server/engine/movement.test.ts test/server/engine/combat.test.ts test/server/api/gamesHelpers.test.ts`.
- **Non-Goals:** Do not rewrite API route persistence wrappers.

---

### Task 5: Web Projections, Selection & Command Builders

- **Goal:** Update web client projections, battlefield naming, combat preview, and action commit builders to consume canonical group IDs.
- **Files to Inspect / Modify:**
  - `web/lib/stackSelection.ts`:
    - Remove coordinate string derivations; resolve membership and active stacks using `StackRosterIndex`.
  - `web/lib/rightRailSelection.ts`:
    - Populate `groupId` on `RightRailStackSelectionModel` from the roster index.
  - `web/lib/commitActionBuilders.ts`:
    - `resolveStackGroupTargetId`: map individual member target IDs to their canonical `groupId`.
  - `web/lib/battlefieldNaming.ts`:
    - Resolve group labels using `groupId` and roster records instead of reconstructing `${type}:${q},${r}`.
  - `web/lib/combatPreview.ts`:
    - Build defender target options using canonical `groupId`. Remove coordinate-based tripwires.
  - `test/web/lib/stackSelection.test.ts`, `test/web/lib/rightRailSelection.test.ts`, `test/web/lib/pure/commitActionBuilders.test.ts`, `test/web/lib/pure/combatPreview.test.ts`, `test/web/lib/battlefieldNaming.contract.test.ts`.
- **Prerequisites:** Task 4.
- **Acceptance Criteria:**
  - Combat preview targets display defense values with canonical `groupId` targets.
  - Attacking a stack sends `{ targetId: 'group-1' }` in `FIRE` payload.
  - Right rail correctly displays stack member selections and group identity.
  - Focused tests pass: `pnpm test test/web/lib/`.
- **Non-Goals:** Do not alter React UI CSS or presentation layouts.

---

### Task 6: Cross-Layer Verification & Regression Suite

- **Goal:** Execute integration tests, end-to-end scenarios, typechecking, and linting across the repository to ensure complete system consistency.
- **Files to Inspect / Verify:**
  - `test/server/api/integration.integration.test.ts`
  - `test/e2e/scenarios/mixedSideCombat.spec.ts`
  - `docs/agent-start-here.md`: Update task router references if files or responsibilities moved.
- **Validation Commands:**
  1. `pnpm test`
  2. `pnpm test:integration`
  3. `pnpm exec tsc --noEmit`
  4. `pnpm web:build`
  5. `pnpm lint`
- **Prerequisites:** Tasks 1 through 5.
- **Acceptance Criteria:**
  - Full test suite passes without regressions.
  - Clean TypeScript compilation and web build.
  - No coordinate-derived value is used as a persisted group identity or combat target; spatial coordinate keys may remain in local occupancy and validation indexes.

---

### Task 7: Handler Boilerplate Consolidation (Completed)

- **Goal:** Extract repetitive post-execution finalization between `move.ts` and `fire.ts` into a shared helper `server/api/gameRoutes/actionHandlers/common.ts`.
- **Files to Inspect / Modify:**
  - `server/api/gameRoutes/actionHandlers/common.ts`
  - `server/api/gameRoutes/actionHandlers/move.ts`
  - `server/api/gameRoutes/actionHandlers/fire.ts`
  - `test/server/api/gameRoutes/actionHandlers/common.test.ts`
- **Prerequisites:** Task 6 completed and green.
- **Acceptance Criteria:**
  - Shared finalization handles cause attachment, persistence, event/action logging, broadcasting, and successful action response construction after MOVE or FIRE execution succeeds.
  - Event sequence fallback uses the latest persisted match event when an action emits no events.
  - Persistence failures propagate unchanged so the route can preserve stale-state handling.
  - Focused helper tests and the existing action-handler/API tests pass with zero behavioral regressions.
- **Non-Goals:** Do not centralize match loading, authorization, schema validation, error mapping, MOVE/FIRE validation or execution, event construction, action-specific outcome assembly, or END_PHASE handling. Do not merge MOVE and FIRE domain logic.
