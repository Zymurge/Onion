# Top-Down Review Action Plan

**Status:** Active review plan
**Scope:** Current implementation only. No future work.
**Out of scope:** CLI, server configuration, deferred AI, archives, and generated API HTML.

This plan records the nine review targets left after the agent-instruction cost pass. That pass rewrote `.copilot/instructions/model-selection.instructions.md` so agents stay relatively cost-aware without a price catalog. Do not reopen that catalog while working these items.

Each item is a focused read. Open only the files named for that item. Do not implement fixes during the review unless the user asks. Record contradictions, the file that should win, and whether a later edit is warranted.

Suggested order: 1, 4, 3, 2, 5, 8, 6, 7, 9. Item 1 should land first because it stops later passes from loading the wrong documents.

## 1. Spec entry path

**Status:** Done.

**Entry:** `docs/project-overview.md` holds the task router and line ranges. Rules and API contracts keep a copy of their own ranges at the top. Persistence is `docs/persistence.md`. Web tasks use `docs/web-ui-spec.md` directly.

- `docs/project-overview.md` is a product blurb. It is not a contract.
- Agents load one router row, then one heading or one area spec. They do not open archive, work-items, CLI, configuration, or generated API HTML unless the user names that surface.
- The matches-versus-game_state boundary lives in `docs/persistence.md`. Smoke scenario names live in `docs/testing-strategy.md`. Phase, recovery, error-code, and name-map text already lived in the rules or API specs and was not copied again.

## 2. Rules authority

**Status:** Done.

**Winner:** `shared/config/unitCatalog.json` for numbers. `shared/movementRules.ts` for movement legality. `shared/stackRoster.ts` for membership. `shared/combatCalculator.ts` for odds and modifiers. `server/engine/combat.ts` for the CRT and for applying stack damage, missile limits, and Onion subsystem results. `scenario-schema.md` for victory objectives. `docs/game-rules.md` is a player-facing description and does not override those owners.

- The rules table disagreed with the catalog: Big Bad Wolf movement was listed as 2 while the catalog and special-ability prose say 4; Lord Farquaad movement was listed as 1 while the catalog says immobile; Little Pigs defense was listed as 2 while the catalog says 1 per squad. Those numeric cells are no longer a contract.
- The CRT copy in `docs/game-rules.md` matches the `CRT` constant in `server/engine/combat.ts`. The code wins if they diverge.
- `treadsPerMove` is declared on the Onion catalog entry and is not read. `shared/movementAllowance.ts` hardcodes the 15-tread bands.
- `resolveCombatOutcome` still has a local attack-strength path that predates `shared/combatCalculator.ts`. That belongs to item 5, not a second rules owner.

## 3. API contract shape

**Status:** Done.

**Slices:** [project-overview.md](../project-overview.md) names one line range per command and per event family. The same ranges are at the top of `docs/api-contract.md`. If they disagree, the overview wins.

- WebSocket is current. The old Phase 1 / Phase 2+ framing was removed. `SESSION_INIT` stays with the sync-event slice.
- The duplicated Scenario Map Loading heading was an editing break. `END_PHASE` is now its own command. The scenario-map rule is a four-line slice, not part of MOVE.
- The second MOVE example was a duplicate and was removed, so MOVE is one range.
- The retry essay still embedded under Transport Strategy is not the snapshot contract. Item 4 owns that copy.

## 4. Repeated snapshot and retry policy

**Status:** Done.

**Owner:** `docs/snapshot-deprecation-policy.md`. It owns invalid snapshots, no migration, read retries, `SNAPSHOT_INVALID`, and `GAME_ABORTED`.

- The API contract keeps only the refresh protocol: `GET /games/{id}` returns match state, and event sequence numbers are delivery cursors. It no longer restates retry status codes.
- The web error spec keeps only presentation: a terminal invalid snapshot is not dismissible and replaces the game screen.
- The web architecture spec points at the same policy instead of repeating the status list.
- Always-on architecture instructions still forbid silent migration, and they point at the policy instead of copying the retry rules.

## 5. Shared rules versus engine wrappers

**Status:** Done.

**Files:** `shared/moveValidator.ts`, `shared/movePlanner.ts`, `shared/combatCalculator.ts`, `server/engine/movement.ts`, `server/engine/combat.ts`, `server/engine/map.ts`.

- Movement legality and pathfinding are canonical in `shared/moveValidator.ts` and `shared/movePlanner.ts`. `server/engine/movement.ts` adapts the engine map/state into the shared input, converts the result to its engine contract, and owns execution and state mutation.
- Combat strengths and odds are canonical in `shared/combatCalculator.ts`. `server/engine/combat.ts` adapts live engine state into the calculator contract, then owns command validation, CRT resolution, and damage application. Its `calculateEngineCombatOdds` export is a compatibility wrapper around the shared `calculateCrtOddsBand` function; the old local attack-strength path is no longer present, although nearby prose still describes it.
- `server/engine/map.ts` still owns map membership through `isInBounds`, which remains on a live movement helper path. Its `findPath`, `hasLineOfSight`, and `movementCost` exports are not used by the live movement path and appear to be legacy compatibility/test surface, so they should be documented or removed in a later targeted cleanup rather than treated as canonical rules.
- No implementation edit is warranted for this review item. Future agents should load the shared validator/planner/calculator for rules changes and the engine modules only for adaptation, execution, or compatibility behavior.

## 6. Stack identity

**Status:** Done.

**Files:** `shared/stackRoster.ts`, `shared/stackNaming.ts`, and the web stack, selection, and battlefield projection modules.

- `shared/stackRoster.ts` owns canonical membership, roster validation/indexing, and split, merge, move, relocate, and move-lifecycle reconciliation. Its `buildStackRosterIndex` output is a derived projection, not a second persisted membership source.
- `shared/stackNaming.ts` owns group labels. The type/position `groupKey` is used for naming and lifecycle naming decisions, while roster `groupId` and real unit IDs remain the identity sources. `web/lib/battlefieldNaming.ts` consumes both without redefining identity.
- Web selection and action code resolves members from the roster and submits real unit IDs. `stack-member:<owner>:<index>` values are UI-only selection aliases that resolve back to the owning unit; they are not invented game members. Battlefield group projections and display builders are presentation projections over the shared roster index.
- The web layer also filters roster data for phase visibility and computes type/position counts for snapshot diagnostics. Those are projections or validation checks, not alternate membership authorities.
- No implementation edit is warranted for this review item. Future agents should load `shared/stackRoster.ts` for membership and transitions, `shared/stackNaming.ts` for labels, and the web modules only for selection, display, or projection behavior.

## 7. Web module map

**Status:** Done.

**Directory:** `web/lib`. The shell note in `web/App.tsx` only helps if the task starts there.

- **Interaction routing:** `interactionRouting.ts` owns map/subject intent decisions. `shellControlRouting.ts` owns enabled/disabled header-control decisions, and `rightRailControlRouting.ts` owns enabled/disabled right-rail control decisions. `appCommands.ts` translates shell decisions into actions; components provide the surface-specific inputs.
- **Session contract and orchestration:** `gameSessionTypes.ts` owns the controller and transport contracts. `gameSessionController.ts` owns authoritative snapshot loading, refresh policy, live-signal sequencing, stale-result rejection, and lifecycle cleanup. `useGameSession.ts` is only the React subscription/lifecycle adapter.
- **Session wiring:** `appSessionWiring.ts` selects one session binding and constructs one controller for the active game. `useConnectionGate.ts` authenticates and creates a connected `SessionBinding`; `sessionBinding.ts` defines that binding. `appRequestTransportAdapter.ts` adapts injected legacy `GameClient` instances for tests or callers.
- **Transport:** `httpGameClient.ts` owns HTTP request/response mapping, retry policy, and response validation. `liveEventSource.ts` owns WebSocket parsing, connection state, and live signals. `gameClient.ts` holds the legacy request seam and shared snapshot/action types. `liveGameClient.ts` combines the legacy client and live source for compatibility and has no active production caller; do not start new controller work there.
- **Selection:** `useBattlefieldInteractionState.ts` owns local selection state, selection changes, move prompts, and interaction-triggered submissions. `stackSelection.ts` resolves roster-backed members and phase-visible projections. `rightRailSelection.ts` owns stack selection models and MOVE/FIRE payload construction. `selectionIds.ts` owns UI selection-ID parsing, normalization, and combat-target translation. `stackReadiness.ts` only derives readiness counts and disabled states.
- **Battlefield display:** `useBattlefieldDisplayState.ts` is the display-state orchestrator and snapshot/roster validation boundary. `battlefieldViewBuilders.ts` builds live unit/map/range display models. `battlefieldGroupProjection.ts` adapts the shared roster index for left-rail and map-board projections. `battlefieldNaming.ts` owns display labels, while `battlefieldView.ts` owns view types and small pure view helpers. `combatPreview.ts` derives combat target options.
- **Overlap assessment:** repeated calls to `buildStackRosterIndex` are derived projections over the shared roster, not competing membership sources. `useConnectionGate.ts` and `appSessionWiring.ts` both create bindings for different entry paths (interactive versus injected/persisted). No implementation edit is warranted; this note is the routing aid. Start at `appSessionWiring.ts` for session work, `useBattlefieldInteractionState.ts` for interaction work, `useBattlefieldDisplayState.ts` for display work, and the named pure modules for their specific decisions.

## 8. Same name, different job

**Status:** Done.

**Files:** `shared/hex.ts`, `web/lib/hex.ts`, `shared/combatCalculator.ts`, `server/engine/combat.ts`, `web/lib/combatOdds.ts`, `shared/movementRules.ts`, `shared/unitMovement.ts`.

- `shared/hex.ts` is axial rules math. `web/lib/hex.ts` is pixel layout. An agent searching for hex logic can open the wrong one.
- The combat APIs now have unique ownership names: `calculateCrtOddsBand` is the shared pure rule, `calculateEngineCombatOdds` is the server compatibility wrapper, and `calculatePreviewCombatOdds` is the web adapter. The `CombatCalculator` compatibility method uses the same `calculateCrtOddsBand` name.
- The movement APIs now have unique ownership names: `canCrossRidgelineByTerrainRule` is the low-level terrain primitive, and `canUnitCrossRidgeline` is the public unit-movement facade.
- **Hex naming:** no function rename is needed. The exports already describe separate coordinate domains (`HexPos`/axial rules versus `HexCoord`/pixel layout); when both modules are imported together, use explicit aliases such as `sharedHexKey` and `axialToPixel` at the call site.
- **Implemented:** imports, tests, and the `server/engine/index.ts` re-export were updated with the coordinated rename. Agents should load `shared/hex.ts` for axial rules, `web/lib/hex.ts` for pixel layout, `shared/combatCalculator.ts` for canonical odds rules, `server/engine/combat.ts` for execution behavior, and `web/lib/combatOdds.ts` for preview formatting.

## 9. Test map

**Files:** `docs/testing-strategy.md`, `.copilot/instructions/testing.instructions.md`, `test`.

- The layer map is useful. The strategy doc also carries local watcher and inotify recovery notes that are not a test contract.
- The always-on testing instructions repeat that map, so a task pays for both.
- Check whether the documented directories still match the tree, and whether `pnpm test` still means the narrow suite the docs claim.
- Compare the map to directory names and suite entry points. Do not read the test bodies.

## Done when

- Each item has a short finding: current owner, contradiction if any, and the next edit if one is needed.
- No item pulls in CLI, configuration, archives, or future-work specs.
- Proposed doc edits name the one file an agent should load for that concern.
