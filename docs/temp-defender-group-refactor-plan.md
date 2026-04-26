# Defender/Group Normalization Refactor Plan

**Status:** Phase 6 complete
**Date:** 2026-04-24
**Branch:** `feature/stacking` follow-on refactor branch

## Purpose

Refactor the defender portion of runtime state so stacked infantry no longer depend on aggregated `squads` records as the canonical live model.

This plan captures the agreed direction from the current stacking discussion and turns it into concrete implementation tasks with definition-of-done criteria.

Phase 0 is complete when this document is treated as the temporary source of truth for authored defender input, canonical runtime state, and API/UI projections during the normalization refactor. Any older stack-contract language that contradicts this document is superseded until those docs are migrated.

## Decisions Locked In

### 1. Canonical runtime model

Use a normalized runtime state:

- `defenders` contains one record per individual defender unit only.
- `stackRoster.groupsById` contains group metadata and membership for stackable units.
- `stackNaming` remains the naming lifecycle source.
- API/UI convenience projections may include expanded `group.units`, but that is derived output, not the canonical source of truth.

### 2. Scenario authoring model

Keep authored scenarios concise.

- Scenarios may continue to declare infantry as grouped authored records with counts.
- The scenario normalization layer expands those authored groups into individual runtime defenders plus group metadata at game creation.
- This keeps authored scenarios manageable while still giving runtime logic stable per-unit identity.

Locked authored-input rule:

- authored grouped infantry is an input convenience only and must never survive unchanged into canonical runtime state.

### 3. Helper ownership boundary

Do not broaden immediately to one generic "all units" helper.

- Create or evolve one shared defender-domain helper that owns defender/group normalization, parsing, mutation helpers, and projections.
- `stackRoster` should become one projection/view of that helper rather than the main abstraction itself.
- UI-facing grouped/ungrouped consumption should be another projection from the same shared helper.
- Onion state stays outside this helper for now.

### 4. Refactor shape

This is a wide refactor and should stay isolated on a dedicated branch.

## Current Problems To Eliminate

1. `LittlePigs` are still modeled in canonical runtime state as aggregated units with `squads` counts.
2. `stackRoster` is partially derived from `defenders`, which duplicates or distorts truth.
3. UI consumption still reads the flat `defenders` map directly for most defender rendering.
4. Movement and combat logic still interpret infantry stacks through `squads` arithmetic instead of explicit member units plus group membership.
5. Scenario authoring, engine normalization, API transport, and UI projection are not aligned on one defender/group contract.

## Target Architecture

### Layer 1. Authored scenario input

Authored scenarios may define defender entries in two forms:

- non-stackable unit entries
- authored stackable group entries with a count and initial group metadata

The authored format is for input ergonomics only.

Recommended authored shape:

```ts
type AuthoredInitialState = {
  onion: AuthoredOnionState
  defenders: Record<string, AuthoredDefenderEntry>
}

type AuthoredDefenderEntry = AuthoredUnitEntry | AuthoredStackGroupEntry

type AuthoredUnitEntry = {
  kind?: 'unit'
  type: string
  position: HexPos
  status?: UnitStatus
}

type AuthoredStackGroupEntry = {
  kind: 'stack-group'
  unitType: 'LittlePigs'
  position: HexPos
  count: number
  groupName?: string
  status?: UnitStatus
}
```

Authored-input rules:

- authored grouped infantry may only be used for stack-eligible defender types
- authored non-stackable defenders must use unit entries
- authored group keys are scenario-local authoring ids, not runtime member ids
- if `groupName` is omitted, normalization assigns the initial runtime stack name using the canonical naming rules

### Layer 2. Scenario normalization

At game creation, the scenario normalizer expands authored defender input into canonical runtime state:

- one defender entry per individual unit
- initial `stackRoster.groupsById` entries for authored stackable groups
- initial `stackNaming` state aligned with those groups

This is the only place where authored grouped infantry is translated into runtime units.

### Layer 3. Canonical runtime state

Recommended canonical shape:

```ts
type GameState = {
  onion: OnionState
  defenders: Record<string, DefenderUnitState>
  stackRoster: StackRosterState
  stackNaming?: StackNamingSnapshot
  ramsThisTurn?: number
  movementSpent?: Record<string, number>
  combatSpent?: Record<string, number>
}

type DefenderUnitState = {
  id: string
  type: string
  position: HexPos
  status: UnitStatus
  friendlyName: string
  weapons?: Weapon[]
  targetRules?: TargetRules
}

type StackRosterState = {
  groupsById: Record<string, StackGroupState>
}

type StackGroupState = {
  groupId: string
  groupName: string
  unitType: string
  position: HexPos
  unitIds: string[]
}
```

Canonical rule:

- `defenders` owns live unit state.
- `stackRoster.groupsById` owns group identity and membership.
- any expanded member detail is derived later from `defenders` and `unitIds`; it is not canonical runtime state.

Canonical runtime rules:

- every stackable defender member has its own stable `id`, `friendlyName`, move/combat accounting, and lifecycle
- `defenders` must never contain aggregate live records such as `LittlePigs` with `squads: 3`
- `stackRoster` must never contain non-stackable defenders
- `stackRoster.groupsById[*].unitIds` is the canonical group-membership record
- if a stackable defender is not currently grouped with any peer, it still exists in `defenders`; whether singleton stack groups are persisted is a helper/runtime policy decision, not a transport requirement
- `group.units` is transport/UI projection data only and must be rebuilt from canonical state when emitted

### Layer 4. Shared defender/group helper

Introduce or evolve one shared helper module, likely defender-domain rather than stack-roster-only.

Responsibilities:

1. Expand authored stackable groups into individual defenders.
2. Parse canonical defenders plus group membership.
3. Validate membership consistency.
4. Provide `getGroupUnits`, `getUnitGroup`, `mergeGroups`, `splitGroup`, `retireGroup`, and projection helpers.
5. Build grouped/member-detail projections from canonical `defenders` plus `unitIds` after transport.
6. Build UI-facing grouped views for rails, selection, and inspection.

Non-goal for first pass:

- Do not absorb Onion state or all unit concerns into the same helper until defender/group flows stabilize.

### Layer 5. API/UI projections

Transport contract:

- `defenders` contains all individual defender units only.
- `stackRoster` contains stackable groups only.
- each group transport payload canonically carries member references through `unitIds` only.
- expanded member detail is helper-derived view data and is not part of the transport contract.

Recommended transport shape:

```ts
type TransportGameState = {
  onion: OnionState
  defenders: Record<string, DefenderUnitState>
  stackRoster: {
    groupsById: Record<string, {
      groupName: string
      unitType: string
      position: HexPos
      unitIds: string[]
    }>
  }
}
```

Transport rules:

- `defenders` is the only transport location for individual live defender records
- `stackRoster` is the only transport location for group metadata
- `stackRoster.groupsById[*].unitIds` is the canonical transport reference list for group membership
- any grouped member-detail expansion must be derived after transport by the shared helper from `defenders` plus `unitIds`
- no member may appear in a group projection unless it also exists in `defenders`
- non-stackable defenders must never appear in `stackRoster`
- group projections must be deterministic for test purposes

UI contract:

- map/rail/selection surfaces consume derived grouped views from the shared helper.
- the UI should not infer or rebuild stack membership directly from raw defender positions.

UI projection rules:

- UI grouped views are derived from canonical defenders plus `stackRoster`, not from raw occupancy clustering
- action submission always uses stable individual unit ids
- stack labels and member lists come from the same shared projection helper so map, rails, dialogs, and inspector surfaces do not diverge
- the UI may consume a union-like grouped projection, but that projection is not persisted as canonical game state

## Phased Tasks

### Phase 0. Freeze the target contract

- [x] Write and approve the normalized defender/group runtime contract.
- [x] Write and approve the authored scenario input shape for grouped infantry.
- [x] Write and approve the projection rules for API and UI.

Definition of Done:

- one doc describes authored input, canonical runtime state, and API/UI projections without contradiction
- `defenders`, `stackRoster`, and derived `group.units` ownership are explicit
- the team agrees that grouped infantry in authored scenarios expand during normalization

Phase 0 completion note:

- This document now serves as that single temporary contract source.
- Older stack-contract sections in `docs/api-contract.md` and `docs/stacked-unit-management-spec.md` are superseded where they conflict with this document and should be migrated in later phases.

### Phase 1. Add red contract tests for normalization and projections

- [x] Add scenario normalizer tests for authored grouped infantry expansion.
- [x] Add shared helper tests for canonical defenders plus group membership parsing.
- [x] Add API contract tests proving `defenders` and `stackRoster` roles are non-overlapping.
- [x] Add UI/helper projection tests proving grouped views come from shared helper output rather than raw defender clustering.

Definition of Done:

- tests fail against the current `squads`-based runtime model
- tests explicitly prove all three required contract guarantees:
  - all groups are represented in `stackRoster` only
  - all individual units are represented in `defenders` only
  - groups expose complete member arrays derived from individual defenders
- tests cover non-stackable defenders and ensure they never appear in `stackRoster`

Phase 1 completion note:

- The Phase 1 contract tests are intentionally red against the current runtime implementation and form the baseline for Phase 2+ changes.

### Phase 2. Extend authored scenario schema and normalization

- [x] Extend the scenario schema to represent authored grouped infantry input cleanly.
- [x] Update scenario normalizer to expand authored infantry groups into individual defenders.
- [x] Seed initial stack group metadata and stack naming during normalization.
- [x] Keep authored non-stackable defenders unchanged.

Definition of Done:

- authored grouped infantry scenarios parse successfully
- normalized runtime state contains one defender record per individual infantry unit
- normalized runtime state contains initial stack group metadata with stable member ids
- no normalized defender record uses `squads` as a canonical live-membership shortcut

Phase 2 completion note:

- Scenario schema now accepts authored defender entries as either unit records or `kind: 'stack-group'` records.
- Scenario normalization now expands authored `stack-group` entries into per-unit defenders and seeds initial `stackRoster` metadata keyed by stack group with stable `unitIds`.
- Normalization initializes `stackNaming` from the same generated groups and leaves authored non-stackable unit entries as regular per-unit defenders.

### Phase 3. Introduce the canonical defender/group helper

- [x] Create or reshape the shared helper around canonical defenders plus groups.
- [x] Implement consistency validation between `defenders` and `stackRoster.groupsById`.
- [x] Implement derived expansion helpers for transport `group.units` arrays.
- [x] Implement group mutation helpers for merge, split, retire, and lookup.

Definition of Done:

- one shared module is the only place that knows how to move between individual defenders, group membership, and grouped projections
- helper tests cover lookup, validation, merge, split, and projection behavior
- projection helpers are deterministic and stable for testing

Phase 3 completion note:

- The shared stack roster helper now includes canonical defender/group consistency validation against unit existence, type/position alignment, duplicate membership, and non-stackable group misuse.
- Deterministic projection helpers now expand group metadata (`unitIds`) into derived member detail arrays from canonical defenders.
- Group mutation helpers now support merge, split, and retire operations while preserving canonical `unitIds` membership.
- Helper tests now cover lookup/index behavior, consistency validation, deterministic projection expansion, and merge/split/retire flows.

### Phase 4. Convert movement and combat to the normalized model

- [x] Replace squads-based stack-limit logic with membership-count and group-membership logic.
- [x] Replace squads-based combat targeting/defense logic with explicit stacked unit handling.
- [x] Keep per-unit movement and combat spending tied to individual unit ids.
- [x] Ensure merge/split behavior updates canonical group membership consistently.

Definition of Done:

- movement and combat no longer depend on `defender.squads` for live stack identity
- stack legality is validated using explicit group members or individual defender counts
- combat can resolve losses against grouped infantry by removing or updating individual unit members deterministically
- focused movement and combat tests pass against the normalized model

Phase 4 completion note:

- Movement stack-stop legality now evaluates Little Pigs stack limits by individual member count rather than legacy `squads` magnitudes.
- Move validation/planning now treats incoming stack contribution as one moving member per unit action and keeps per-unit movement accounting unchanged.
- Shared combat defense resolution now treats Little Pigs as per-unit defenders (no squads multiplier).
- Combat outcome/damage resolution now applies deterministic per-unit Little Pigs lifecycle updates (targeted member destroyed on `D`/`X`, no squad-loss attrition path).

### Phase 5. Refactor API transport to project from canonical state

- [x] Update API response builders to stop rebuilding stack state from raw defenders.
- [x] Project transport `stackRoster.groupsById[*].units` from canonical defenders plus `unitIds`.
- [x] Ensure `defenders` in API responses contain individual units only.
- [x] Ensure non-stackable units never appear in `stackRoster`.

Definition of Done:

- API snapshots satisfy the agreed transport contract
- `buildGameStateResponse` and related builders treat canonical state as source of truth
- transport tests prove that grouped infantry appear once in `defenders` as individual units and once in `stackRoster` as group metadata plus expanded members

Phase 5 completion note:

- API builders now treat persisted canonical `stackRoster` as the source of truth and no longer synthesize group state from defender co-location.
- API transport now omits legacy `squads` from defender payloads so defender records are strictly per-unit state.
- API transport stack groups remain metadata-only (`unitIds`) and continue filtering out non-stackable unit types.
- Added API tests proving no stack derivation fallback when canonical `stackRoster` is absent and no `squads` leakage in defender transport.

### Phase 6. Refactor UI to consume shared grouped projections

- [x] Replace direct raw defender clustering in the left rail and map overlays.
- [x] Consume shared grouped projections for selection, stack counts, and member lists.
- [x] Keep stable unit ids for selection and action submission.
- [x] Preserve the finalized stack naming flows already in flight.

Definition of Done:

- UI grouping does not depend on ad hoc `type + position` clustering for canonical stack identity
- left rail, map, and inspector surfaces all derive stack membership from the shared helper
- unit selection still submits individual unit ids while displaying stack-level labels and member lists consistently

Phase 6 completion note:

- Web stack member resolution now uses explicit canonical `stackRoster.groupsById[*].unitIds` membership instead of co-location heuristics.
- Stack selection and selected-member counting now consume the same helper output, keeping rail/selection behavior aligned.
- Stable individual unit ids remain the selection/action identity, with stack grouping now sourced from shared canonical membership.

### Phase 7. Scenario migration and cleanup

- [ ] Migrate existing scenarios to the finalized authored grouped-infantry format.
- [ ] Remove obsolete `squads`-based runtime assumptions from tests, helpers, and docs.
- [ ] Update docs for scenario authoring, API contract, and UI behavior.

Definition of Done:

- current scenarios load through the new authored input path
- no runtime contract docs describe `squads` as the canonical live stack representation
- leftover compatibility shims are either removed or explicitly documented as temporary

## Test Strategy

Recommended red-green order:

1. scenario normalization contract tests
2. shared defender/group helper tests
3. movement/combat rule tests against canonical individual defenders
4. API transport contract tests
5. UI projection and interaction tests

Key test fixtures should cover:

1. one authored Little Pigs group expanding into multiple runtime defenders
2. two authored infantry groups starting in different hexes
3. non-stackable defenders coexisting with stackable infantry
4. merge and split behavior preserving stable member ids
5. transport snapshots where `stackRoster` contains stackable groups only and expanded member arrays are complete

## Open Questions To Resolve Early

1. Should canonical `stackRoster` persist `unitIds` only, or also cache expanded `units` for convenience? The preferred answer is `unitIds` only.
2. How should deterministic infantry loss selection work once combat removes individual defenders from a group?
3. Should group ids be opaque stable ids or derived from surviving lineage plus position? The preferred answer is stable ids managed by the shared helper.
4. Which existing stack helper file becomes the defender/group helper entrypoint: evolve `shared/stackRoster.ts` or replace it with a broader `shared/defenderState.ts`?

## Immediate Next Slice

Start with Phase 1 and Phase 2 in a narrow vertical cut:

1. add scenario normalizer red tests for authored grouped infantry
2. extend the authored scenario schema
3. normalize grouped infantry into individual defenders plus initial groups
4. add helper tests for projecting `group.units` from canonical defenders plus `unitIds`

This gives the refactor a stable foundation before movement, combat, API, and UI are migrated.

## Bugs

- ~~Map labels are showing each individual unit instead of the stack name~~ **[CLOSED]**
  - **Root Cause:** Map overlays and other UI surfaces were using the individual unit's `friendlyName` or ID for display, not the stack/group label from `stackRoster`/`stackNaming`.
  - **Fix:** All map overlays/tooltips now use `resolveBattlefieldStackLabel` with the correct group context. Group membership is resolved via `stackRoster` and the group label is used. Map now renders one icon per group, label is correct, and tests pass.

---

**Next recommended task:**

Refactor right rail selection and action submission logic to use canonical group membership from `stackRoster.groupsById`.

This will:

- Fix selection bugs where the right rail does not select groups correctly.
- Ensure action submission (e.g., move, attack) uses the correct group/unitIds.
- Centralize all group/unit display and selection logic for maintainability.

**Suggested steps:**

1. Update right rail selection logic to use stackRoster group/unitIds.
2. Refactor action submission to use canonical group membership.
3. Add/expand tests for right rail selection and action submission.

- When selecting a stack, the right rail selector buttons for Select All and Clear, or attempting to toggle any unit, clears the box and the stack selection
  - **Root Cause:** The right rail stack selection logic is not correctly tracking group membership or is resetting selection state on any change. Selection logic may use unit IDs directly, not canonical group/unitIds from `stackRoster`.
  - **Fix Guidance:** Refactor right rail selection logic to use canonical group membership from `stackRoster.groupsById`. Toggling a unit in a stack should only update selection for that group. "Select All" and "Clear" should operate on the group’s `unitIds` array.

- When submitting either a move or combat for a stack, nothing happens except clearing the selection. Nothing shows up in the debug or is sent to the server
  - **Root Cause:** The action submission handler is not correctly building the action payload from the selected stack/group. If selection state is not using correct unit IDs (from `stackRoster`), the action may be empty/invalid, resulting in no-op.
  - **Fix Guidance:** Ensure move/combat submission code collects selected unit IDs from the current group (using `stackRoster`). Validate that the action payload is non-empty and matches the expected contract before sending. Add debug logging before submission to verify the payload.

- left rail attack select for shows both a group of 3 and a group of 2 with an attack of '011'
  - **Root Cause:** Left rail grouping logic is using position/type clustering or stale logic, not canonical `stackRoster`. Attack values may be concatenated or miscomputed if the group is not resolved properly.
  - **Fix Guidance:** Refactor left rail to use `stackRoster.groupsById` for grouping, not just co-located units. For each group, sum or otherwise correctly compute the attack value based on group membership, not by string concatenation.

- when a stack is selected for combat, in the right rail confirmation box it shows the attack strength squared? Group of 2 is attack 4, group of 3 is attack 9
  - **Root Cause:** Attack strength is being calculated as `baseAttack * stackSize` where `baseAttack` is already the sum for the group, or the logic is multiplying instead of summing.
  - **Fix Guidance:** Ensure attack strength is calculated as the sum of each member's attack, not as `baseAttack * stackSize`. Audit the code path for attack strength in both rails and confirmation to ensure it uses the correct aggregation.

- during DEFENDER_COMBAT, for Onion player they see the populated left rail attackers list, which behaves mostly like the defender's screen. A selected unit does not show up in the inspector
  - **Root Cause:** Left rail is not filtering/hiding the attacker list for Onion player during DEFENDER_COMBAT. Inspector logic may be tied to the wrong selection state or not updating for Onion units.
  - **Fix Guidance:** Add a role/phase check to hide/disable the left rail attacker list for Onion during DEFENDER_COMBAT. Ensure the inspector updates for Onion units when selected, and that selection state is not being overridden by defender logic.

### Defender Phase Issues To Fix

These were reproduced during Defender phases and should be treated as active follow-up bugs for the right-rail / grouped-selection refactor.

#### MOVE issues

- Left rail shows Little Pigs individually instead of as groups; selecting any member still opens the right rail selection box and acts like a full group selection.
  - **Probable Cause:** The left rail is still rendering defender membership from raw per-unit data and/or a fallback co-location cluster, while the group selection state is being shared too broadly between rail presentation and action intent.
  - **Fix Target:** Grouped defenders should render as groups on the left rail, with the right rail owning individual-member selection only. The left rail should not need a dropdown for stack membership.

- Selecting a Little Pigs group directly on the map correctly highlights all members on the left rail, but it also opens the right rail selection state instead of a read-only group inspection.
  - **Probable Cause:** Map-click handling is likely routing into the same state path used for right-rail stack selection, so inspection and selection are still conflated.
  - **Fix Target:** Map group clicks should drive inspection/highlight separately from stack editing/selection.

- In the right rail, `Select All`, `Clear`, and the individual selector buttons just dismiss the rail instead of keeping the stack selection active.
  - **Probable Cause:** The selection handlers are probably clearing the active stack context before the updated selection can be committed, or they are rebuilding selection from an incomplete/empty source of truth.
  - **Fix Target:** Right-rail actions should mutate the active group selection, not collapse the panel unless the user explicitly closes it.

- The only reliable way to move a defender group is to select the group on the map and right-click a destination; using the right rail move controls does not complete the move.
  - **Probable Cause:** Action submission from the right rail is probably not building a valid `MOVE_STACK` payload from the selected unit ids, so the submission path is dropping back to a no-op/clear path.
  - **Fix Target:** Right-rail move submission must resolve the active group into a valid movement command and send it consistently.

- For Onion as inspector, clicking a group opens the full right-rail move selector instead of a group inspection view.
  - **Probable Cause:** Inspector focus is likely being overridden by the same fallback logic that activates stack editing when a group is selected, so inspection state and selection state are still sharing one code path.
  - **Fix Target:** Inspector mode should remain read-only unless the user explicitly enters selection/edit intent.

#### COMBAT issues

- Group attack totals still render as `0111` for stacks with multiple members.
  - **Probable Cause:** The attack label is probably being assembled from per-member flags or string concatenation rather than a numeric summary of the selected group.
  - **Fix Target:** Render a single numeric group attack total derived from the selected members.

- Group attack totals appear to be calculated as the square of the number of units in the right rail.
  - **Probable Cause:** The combat aggregation path is likely multiplying by stack size somewhere instead of summing member attack values, or it is reusing a stack-size score where a total-attack score is expected.
  - **Fix Target:** Compute group attack as a sum of member contributions, not a size-squared value.

- After selecting a group on the left rail and submitting combat, the group cannot be selected again later; it is marked as already attacked and disabled.
  - **Probable Cause:** The attacked/spent state is likely being attached to the group container or canonical left-rail selection model instead of the committed combat action, and it is not being reset correctly after the attack resolves.
  - **Fix Target:** Combat spent-state should track actual member combat usage and remain selectable again until the phase rules genuinely block it.

### Right Rail Refactor Design

The biggest encapsulation opportunity is to introduce one right-rail-specific selection model instead of passing raw arrays and unit ids around. Right now you already have partial canonical helpers in `appViewHelpers.ts:89` and a fuller roster abstraction in `stackRoster.ts:60`. The refactor should stop the rail from manually deriving members from displayed units and instead consume a small, explicit view model such as:

```ts
type ActiveStackSelection = {
  anchorUnitId: string
  groupId: string | null
  memberUnitIds: string[]
  selectedUnitIds: string[]
  selectableUnitIds: string[]
}
```

That does three things:

1. It gives the hook one canonical object to compute and own
2. It makes the component mostly presentational
3. It gives tests a stable seam that does not depend on rendering incidental `displayedDefenders` shapes

#### Concrete tasks to get there

1.**Create a dedicated selector/helper for active right-rail stack state.**

- Put it in the hook layer or a nearby pure helper, but keep it out of the component.
- It should accept authoritative state, current anchor/inspected unit, and current selected ids, then return the active group id, member ids, and selected count.
- This should replace the ad hoc `inspectedStackUnitIds` and `stackPanelUnitIds` logic in `BattlefieldRightRail.tsx:77`.

2.**Replace generic rail callbacks with intent-specific operations.**

- Instead of `onSelectUnit(unitId, additive)` and `onDeselect`, add explicit operations such as:
  - `onSelectStack(groupOrAnchorUnitId)`
  - `onToggleStackMember(unitId)`
  - `onSelectAllStackMembers()`
  - `onClearStackSelection()`
- These can still delegate internally, but the surface API becomes testable and unambiguous.

3.**Move stack membership resolution fully behind canonical helpers.**

- Do not let the component filter `displayedDefenders` by type/q/r at all. That is exactly the stale logic the refactor is trying to remove.
- Reuse or extend the existing canonical membership helper in `appViewHelpers.ts:89`, or better, route through the roster index in `stackRoster.ts:210` so the rail is driven by `getUnitGroup` and `getGroupUnits`.

4.**Separate “selection mutation” from “action submission payload building.”**

- Add one pure helper that takes the active stack selection plus current mode and returns a validated move/combat payload or a typed failure result.
- Submission code should not discover members on the fly. It should receive already-normalized `selectedUnitIds` and either dispatch or return a concrete reason it cannot.

5.**Make empty submission impossible to do silently.**

- If the current group has zero selected members, the submit path should return an explicit validation result before any selection reset.
- The current bug description strongly suggests that clearing is happening before dispatch success is known. The rule should be: selection persists unless submission succeeds or the user explicitly clears it.

6.**Decouple “inspector focus” from “stack selection.”**

- The current rail appears to derive its stack panel from `selectedInspectorDefender` when explicit stack selection is absent. That is convenient, but it blurs inspection and selection into one state machine.
- Make that fallback explicit in the hook: inspector focus may determine the default active group, but once explicit stack selection exists, inspector changes should not rewrite it.

7.**Introduce a right-rail view-model test seam.**

- Before changing behavior further, add pure tests around the new selector/helper rather than only UI tests.
- The existing contract tests in `appViewHelpers.stackGrouping.contract.test.ts:6` are a good precedent. Add equivalent tests for:
  - deriving group members from an anchor unit via `stackRoster`
  - preserving selection when toggling one member
  - selecting all members of the active group
  - clearing only the active group selection
  - rejecting empty submissions without clearing
  - building the expected move payload from selected member ids
  - building the expected combat payload from selected member ids

8.**Reduce the component to rendering and event wiring.**

- After the new helper/hook API exists, `BattlefieldRightRail.tsx` should not compute membership, selected counts, or fallback stack inference itself.
- It should receive a precomputed model like:
  - `activeStackMembers`
  - `selectedStackMemberIds`
  - `activeStackLabel`
  - `canSubmit`
  - `submissionError`
- That will materially improve testability because component tests can assert rendering behavior without standing up the whole battlefield state machine.

#### Implementation Sequence

If I were sequencing implementation, I’d do it in this order:

1. Add pure selector tests for active right-rail stack state.
2. Add pure submission-builder tests for move/combat payloads.
3. Implement the selector/helper and wire the hook to use it.
4. Replace the right rail callbacks with explicit selection operations.
5. Update the component to consume the new model and remove local membership derivation.
6. Add one integration test proving a stack can be selected, partially toggled, and submitted without clearing unexpectedly.

That sequence gives you the best encapsulation outcome: canonical membership logic lives in one place, UI events become explicit domain actions, and the hardest bugs become testable without relying on brittle component-state interactions.
