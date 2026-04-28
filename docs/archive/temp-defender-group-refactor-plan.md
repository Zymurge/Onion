# Defender/Group Normalization Refactor Plan

**Status:** Phase 6 complete
**Date:** 2026-04-24
**Branch:** `feature/stacking` follow-on refactor branch

## Purpose

Refactor the defender portion of runtime state so stacked infantry no longer depend on aggregated `squads` records as the canonical live model.

This plan captures the agreed direction from the current stacking discussion and turns it into concrete implementation tasks with definition-of-done criteria.

Phase 0 is complete when this document is treated as the temporary source of truth for authored defender input, canonical runtime state, and API/UI projections during the normalization refactor. Any older stack-contract language that contradicts this document is superseded until those docs are migrated.

Current implementation note:

- Move reconciliation is now owned by `server/engine/movement.ts`, not the HTTP route.
- Web display-state projection now rejects stacked defenders that lack canonical `stackRoster` data instead of deriving membership from co-location.
- The remaining work in this plan is doc cleanup and any polish that does not change canonical stack ownership.

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
// ...existing code...
```

### Layer 2. Scenario normalization

// ...existing code...

### Layer 3. Canonical runtime state

// ...existing code...

### Layer 4. Shared defender/group helper

// ...existing code...

### Layer 5. API/UI projections

// ...existing code...

## Phased Tasks

### Phase 0. Freeze the target contract

// ...existing code...

### Phase 1. Add red contract tests for normalization and projections

// ...existing code...

### Phase 2. Extend authored scenario schema and normalization

// ...existing code...

### Phase 3. Introduce the canonical defender/group helper

// ...existing code...

### Phase 4. Convert movement and combat to the normalized model

// ...existing code...

### Phase 5. Refactor API transport to project from canonical state

// ...existing code...

### Phase 6. Refactor UI to consume shared grouped projections

// ...existing code...

### Phase 7. Scenario migration and cleanup

- [x] Migrate existing scenarios to the finalized authored grouped-infantry format. (All current scenarios already use the new format; no DB migration required—existing games in the DB are N/A.)
- [ ] Remove obsolete `squads`-based runtime assumptions from tests, helpers, and docs.
- [ ] Update docs for scenario authoring, API contract, and UI behavior.

Definition of Done:

- All scenario JSON files use the new authored input path (done).
- No runtime contract docs describe `squads` as the canonical live stack representation.
- Leftover compatibility shims are either removed or explicitly documented as temporary.
- No migration of existing DB games is required (N/A).

## Test Strategy

// ...existing code...

## Open Questions To Resolve Early

// ...existing code...

## Immediate Next Slice

// ...existing code...

## Bugs

// ...existing code...
