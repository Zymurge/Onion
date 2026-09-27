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

**Files:** `docs/game-rules.md`, `shared/config`, `shared`, `server/engine`.

- Rules text, the unit catalog, and engine behavior can disagree without an obvious winner.
- The rules doc mixes player rules, UI obligations, and implementation notes, and it repeats Swamp and victory material.
- Check one mechanic at a time, starting with movement, combat results, and stacking, and see which file an agent should trust.
- Do not read the whole engine. Compare one mechanic across the rules doc, the catalog, and the owning module.

## 3. API contract shape

**File:** `docs/api-contract.md`.

- One file covers transport, auth, games, actions, events, and errors. A single-command change still invites a full read.
- The opening still frames WebSocket as later work, while later sections specify current session behavior.
- A duplicated Scenario Map Loading heading sits inside the command section. Check whether that split hides a real contract or is just an editing break.
- Identify the smallest slice boundaries that would let an agent load one command or one event family.

## 4. Repeated snapshot and retry policy

**Files:** `docs/api-contract.md`, `docs/snapshot-deprecation-policy.md`, `docs/web-ui/errors-and-validation-spec.md`, `.copilot/instructions/repository-architecture.instructions.md`.

- Invalid snapshots, no migration, and retry limits are stated in more than one place.
- Look for wording drift, and for which copy an agent should treat as the only contract.
- Do not expand into configuration or transport implementation unless a sentence disagrees with the current code boundary.

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
