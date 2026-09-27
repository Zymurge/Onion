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

**Files:** `shared/moveValidator.ts`, `shared/movePlanner.ts`, `shared/combatCalculator.ts`, `server/engine/movement.ts`, `server/engine/combat.ts`, `server/engine/map.ts`.

- The engine calls shared validators and calculators, but it also keeps its own validation types and re-exports odds and movement results.
- `server/engine/map.ts` still exports `findPath`, `hasLineOfSight`, and `movementCost`. A prior search found those names only in that module, the engine barrel, and map tests, not on the live move path.
- Check which function is canonical, and whether the map helpers are leftover surface that agents will "fix" by mistake.
- Do not treat a re-export as a second rules implementation unless the wrapper changes the result.

## 6. Stack identity

**Files:** `shared/stackRoster.ts`, `shared/stackNaming.ts`, and the web stack, selection, and battlefield projection modules.

- Instructions already spend a lot of space on `stackRoster` as the only membership source. That usually means agents keep crossing the boundary.
- Look for a second membership source, invented member IDs, or naming used as identity.
- Check that split, merge, selection, and combat each have one owner.
- Stay out of archived stacking plans. Use current code and the active snapshot policy.

## 7. Web module map

**Directory:** `web/lib`. The shell note in `web/App.tsx` only helps if the task starts there.

- Routing is split across `interactionRouting`, `shellControlRouting`, and `rightRailControlRouting`.
- Session and transport are split across the game client, the HTTP client, the live client, the session controller, and the app session wiring.
- Selection is split across stack selection, stack readiness, rail selection, and selection IDs.
- Battlefield view, view builders, and group projection need a one-page ownership note. Check for overlap, not for missing features.
- Produce the ownership note as the output. Do not read every module body if the exports and call direction already show the owner.

## 8. Same name, different job

**Files:** `shared/hex.ts`, `web/lib/hex.ts`, `shared/combatCalculator.ts`, `server/engine/combat.ts`, `web/lib/combatOdds.ts`, `shared/movementRules.ts`, `shared/unitMovement.ts`.

- `shared/hex.ts` is axial rules math. `web/lib/hex.ts` is pixel layout. An agent searching for hex logic can open the wrong one.
- `calculateOdds` exists on the shared calculator, the engine combat wrapper, and `web/lib/combatOdds.ts`.
- `canUnitCrossRidgeline` and `canUnitCrossRidgelines` are two names for one rule. Check whether these aliases cause duplicate edits.
- Recommend names or a short pointer only where the collision would send an agent into the wrong file.

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
