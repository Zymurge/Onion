# Defender/Group Normalization Refactor Plan

**Status:** Temporary planning doc
**Date:** 2026-04-24
**Branch:** `feature/stacking` follow-on refactor branch

## Purpose

Refactor the defender portion of runtime state so stacked infantry no longer depend on aggregated `squads` records as the canonical live model.

This plan captures the agreed direction from the current stacking discussion and turns it into concrete implementation tasks with definition-of-done criteria.

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
  groupName: string
  unitType: string
  position: HexPos
  unitIds: string[]
}
```

Canonical rule:

- `defenders` owns live unit state.
- `stackRoster.groupsById` owns group identity and membership.
- expanded `group.units` arrays are projections derived from `defenders` and `unitIds`.

### Layer 4. Shared defender/group helper

Introduce or evolve one shared helper module, likely defender-domain rather than stack-roster-only.

Responsibilities:

1. Expand authored stackable groups into individual defenders.
2. Parse canonical defenders plus group membership.
3. Validate membership consistency.
4. Provide `getGroupUnits`, `getUnitGroup`, `mergeGroups`, `splitGroup`, `retireGroup`, and projection helpers.
5. Build API transport views including expanded `group.units` arrays.
6. Build UI-facing grouped views for rails, selection, and inspection.

Non-goal for first pass:

- Do not absorb Onion state or all unit concerns into the same helper until defender/group flows stabilize.

### Layer 5. API/UI projections

Transport contract:

- `defenders` contains all individual defender units only.
- `stackRoster` contains stackable groups only.
- each group transport payload may include an expanded `units` array derived from `unitIds`.

UI contract:

- map/rail/selection surfaces consume derived grouped views from the shared helper.
- the UI should not infer or rebuild stack membership directly from raw defender positions.

## Phased Tasks

### Phase 0. Freeze the target contract

- [ ] Write and approve the normalized defender/group runtime contract.
- [ ] Write and approve the authored scenario input shape for grouped infantry.
- [ ] Write and approve the projection rules for API and UI.

Definition of Done:

- one doc describes authored input, canonical runtime state, and API/UI projections without contradiction
- `defenders`, `stackRoster`, and derived `group.units` ownership are explicit
- the team agrees that grouped infantry in authored scenarios expand during normalization

### Phase 1. Add red contract tests for normalization and projections

- [ ] Add scenario normalizer tests for authored grouped infantry expansion.
- [ ] Add shared helper tests for canonical defenders plus group membership parsing.
- [ ] Add API contract tests proving `defenders` and `stackRoster` roles are non-overlapping.
- [ ] Add UI/helper projection tests proving grouped views come from shared helper output rather than raw defender clustering.

Definition of Done:

- tests fail against the current `squads`-based runtime model
- tests explicitly prove all three required contract guarantees:
  - all groups are represented in `stackRoster` only
  - all individual units are represented in `defenders` only
  - groups expose complete member arrays derived from individual defenders
- tests cover non-stackable defenders and ensure they never appear in `stackRoster`

### Phase 2. Extend authored scenario schema and normalization

- [ ] Extend the scenario schema to represent authored grouped infantry input cleanly.
- [ ] Update scenario normalizer to expand authored infantry groups into individual defenders.
- [ ] Seed initial stack group metadata and stack naming during normalization.
- [ ] Keep authored non-stackable defenders unchanged.

Definition of Done:

- authored grouped infantry scenarios parse successfully
- normalized runtime state contains one defender record per individual infantry unit
- normalized runtime state contains initial stack group metadata with stable member ids
- no normalized defender record uses `squads` as a canonical live-membership shortcut

### Phase 3. Introduce the canonical defender/group helper

- [ ] Create or reshape the shared helper around canonical defenders plus groups.
- [ ] Implement consistency validation between `defenders` and `stackRoster.groupsById`.
- [ ] Implement derived expansion helpers for transport `group.units` arrays.
- [ ] Implement group mutation helpers for merge, split, retire, and lookup.

Definition of Done:

- one shared module is the only place that knows how to move between individual defenders, group membership, and grouped projections
- helper tests cover lookup, validation, merge, split, and projection behavior
- projection helpers are deterministic and stable for testing

### Phase 4. Convert movement and combat to the normalized model

- [ ] Replace squads-based stack-limit logic with membership-count and group-membership logic.
- [ ] Replace squads-based combat targeting/defense logic with explicit stacked unit handling.
- [ ] Keep per-unit movement and combat spending tied to individual unit ids.
- [ ] Ensure merge/split behavior updates canonical group membership consistently.

Definition of Done:

- movement and combat no longer depend on `defender.squads` for live stack identity
- stack legality is validated using explicit group members or individual defender counts
- combat can resolve losses against grouped infantry by removing or updating individual unit members deterministically
- focused movement and combat tests pass against the normalized model

### Phase 5. Refactor API transport to project from canonical state

- [ ] Update API response builders to stop rebuilding stack state from raw defenders.
- [ ] Project transport `stackRoster.groupsById[*].units` from canonical defenders plus `unitIds`.
- [ ] Ensure `defenders` in API responses contain individual units only.
- [ ] Ensure non-stackable units never appear in `stackRoster`.

Definition of Done:

- API snapshots satisfy the agreed transport contract
- `buildGameStateResponse` and related builders treat canonical state as source of truth
- transport tests prove that grouped infantry appear once in `defenders` as individual units and once in `stackRoster` as group metadata plus expanded members

### Phase 6. Refactor UI to consume shared grouped projections

- [ ] Replace direct raw defender clustering in the left rail and map overlays.
- [ ] Consume shared grouped projections for selection, stack counts, and member lists.
- [ ] Keep stable unit ids for selection and action submission.
- [ ] Preserve the finalized stack naming flows already in flight.

Definition of Done:

- UI grouping does not depend on ad hoc `type + position` clustering for canonical stack identity
- left rail, map, and inspector surfaces all derive stack membership from the shared helper
- unit selection still submits individual unit ids while displaying stack-level labels and member lists consistently

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