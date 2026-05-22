# UI Fallback Hardening Issue

**Status:** Draft
**Scope:** Remove UI-side fallback recovery for incomplete authoritative game state. Keep only validated, immutable scenario data caching for fields that cannot change during a game.

## Rule Of Record

- `victoryObjectives` and `escapeHexes` may be cached or reused if the scenario payload is complete and validated, because they are immutable for the lifetime of a game.
- All stack, selection, label, target, movement, and commit-path data must be authoritative.
- If any of that data is missing, the UI should surface the standard error path instead of inferring a substitute.

## Completed

- [x] Shared selection-name resolution no longer falls back to group keys, unit ids, or generated names when the data is incomplete.
- [x] The inspector no longer fabricates a label when selected unit metadata is missing.
- [x] Move and combat commit builders no longer infer stack actions from partial stack state for stackable units.
- [x] The interaction and app layers now surface missing stack data as a user-visible error instead of silently recovering.
- [x] `rightRailSelection` no longer expands partial stack ids back into a synthesized full group.
- [x] `rightRailInspector` no longer falls back to `squads` or `1` when stack-count data is missing.
- [x] `combatPreview` now fails on grouped defender targets when canonical stack roster data is missing.
- [x] `HexMapBoard` now fails on stacked defenders without canonical roster data instead of choosing the first occupant.
- [x] Tests were added to prove the new hard-fail behavior for selection names, inspector labels, and stackable commit paths.
- [x] Tests were added to prove the new hard-fail behavior for grouped combat preview and grouped board rendering.
- [x] Static scenario fields are allowed to remain cached where they are validated and immutable (`victoryObjectives`, `escapeHexes`).

## Remaining Work

- [ ] Harden `useBattlefieldDisplayState` so non-static missing state does not quietly collapse to empty arrays, nulls, or derived defaults.
- [ ] Add broken-state tests for `useBattlefieldDisplayState` and `BattlefieldLeftRail` that prove missing non-static state does not quietly recover.
- [ ] Add orchestration coverage that injects incomplete game state and verifies the standard error overlay appears instead of inferred UI state.
- [ ] Decide whether a shared snapshot-completeness guard should be added for render-time validation, with targeted guards kept in action handlers for user-triggered paths.

## Notes

- The current hardening work already proves the spec direction for labels and stackable commit actions.
- The remaining work is mostly about deleting recovery logic and replacing it with explicit failures plus negative tests.
