# UI Fallback Hardening Issue

**Status:** Complete as of 2026-08-17.
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

## Implementation Result

`useBattlefieldDisplayState` now validates every loaded snapshot before display projection. Missing or malformed authoritative state, unit maps, unit metadata, weapons, scenario-map coordinates, session catalog, or victory objectives produces a diagnostic error overlay containing game, scenario, phase, and event-sequence context. The hook only retains empty/loading values when no snapshot has loaded yet, and immutable scenario fields remain the only allowed cached data.

The shared render-time snapshot-completeness guard was adopted in the display-state hook. Focused hook coverage and App orchestration coverage verify missing-state, missing-map, missing-catalog, missing-unit-map, malformed-coordinate, and missing-unit-metadata failures.

## Notes

- The hardening work now covers both targeted interaction paths and the loaded-snapshot render boundary.
