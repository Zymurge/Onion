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
- [x] Tests were added to prove the new hard-fail behavior for selection names, inspector labels, and stackable commit paths.
- [x] Static scenario fields are allowed to remain cached where they are validated and immutable (`victoryObjectives`, `escapeHexes`).

## Remaining Work

- [ ] Harden `useBattlefieldDisplayState` so non-static missing state does not quietly collapse to empty arrays, nulls, or derived defaults.
- [ ] Remove or harden selection normalization in `rightRailSelection` so partial stack ids do not get expanded back into a full group.
- [ ] Remove or harden grouped combat target derivation in `combatPreview` so missing roster/naming data becomes an error instead of a synthetic target.
- [ ] Remove or harden canonical occupant selection in `HexMapBoard` so map clicks cannot recover by choosing the first occupant or inferring a target from co-location.
- [ ] Remove or harden stack-count inference in `rightRailInspector` so missing stack data does not fall back to `squads` or `1`.
- [ ] Add broken-state tests for `BattlefieldLeftRail` that prove grouped labels and member rendering fail when stack metadata is incomplete.
- [ ] Add broken-state tests for `HexMapBoard` that prove map selection and combat targeting fail when canonical occupant data is incomplete.
- [ ] Add broken-state tests for `rightRailSelection` and `combatPreview` that prove missing stack metadata is not recovered.
- [ ] Add orchestration coverage that injects incomplete game state and verifies the standard error overlay appears instead of inferred UI state.
- [ ] Decide whether a shared snapshot-completeness guard should be added for render-time validation, with targeted guards kept in action handlers for user-triggered paths.

## Notes

- The current hardening work already proves the spec direction for labels and stackable commit actions.
- The remaining work is mostly about deleting recovery logic and replacing it with explicit failures plus negative tests.
