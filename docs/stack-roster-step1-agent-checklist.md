# Stack Roster Step 1 Agent Checklist

This checklist breaks the remaining stack-roster lifecycle work into autonomous slices.
Each task is intended to be implementable and testable independently.

Primary source requirements:

- [docs/stacked-unit-management-spec.md](docs/stacked-unit-management-spec.md)
- [docs/todo.md](docs/todo.md)

## Goal

Finish the stack-roster lifecycle step so canonical stack identity, stack naming,
split/merge carry-forward, and member-name exposure come from one authoritative
state path instead of compatibility projections or co-location inference.

## Task 1: Canonical Roster Bundle Contract

- [x] Define the dedicated authoritative roster bundle in shared state types.
- [x] Keep persisted group records minimal and stable.
- [x] Keep persisted unit records minimal and stable.
- [x] Mark compatibility views as projections, not authority.

Done when:

- `GameState` exposes one dedicated stack-roster bundle as the canonical stack source.
- Group records carry stable group identity, unit type, position, and finalized group name.
- Unit records carry stable unit id, canonical friendly name, and only the minimal state needed downstream.
- Any compatibility `defenders` or derived stack views are clearly downstream projections rather than the source of truth.

Validation:

- Shared type and snapshot-shape tests prove the bundle exists on new snapshots.
- Serialization and helper-entry tests prove callers can consume the bundle without inferring stack membership from position.

Suggested ownership:

- Shared types and shared stack-roster modules.

## Task 2: Shared Stack-Roster Lifecycle Helper

- [ ] Centralize roster parsing and lookup.
- [ ] Centralize split behavior.
- [ ] Centralize merge behavior.
- [ ] Centralize retire behavior.
- [ ] Bridge naming allocation and retirement history through the helper.

Done when:

- One helper owns `getGroupUnits`, `getUnitGroup`, derived `groupKey`, and unit-id lookups.
- One helper owns split, merge, and retirement mutations.
- Callers no longer need to infer stack membership from co-location.
- Group-name retention and retirement rules are enforced in helper code rather than reimplemented by callers.

Validation:

- Pure shared tests cover split carry-forward behavior.
- Pure shared tests cover merge carry-forward behavior.
- Pure shared tests cover retirement behavior.
- Pure shared tests cover name monotonicity and no name reuse.

Suggested ownership:

- `shared/stackRoster.ts` and related pure helper modules.

## Task 3: End-of-Movement Reconciliation Ownership

- [ ] Route movement-end stack consolidation through the shared lifecycle helper.
- [ ] Keep stack-limit enforcement before consolidation.
- [ ] Preserve surviving group identity across partial splits.
- [ ] Preserve destination identity across merges.
- [ ] Retire emptied groups at consolidation time.

Done when:

- A partial stack move keeps the original group record and group name on the remainder.
- Moving units onto an existing named stack preserves the destination group identity and name.
- Empty groups are retired immediately when they lose all members.
- Consolidation happens at end-of-move rather than as a transient in-phase side effect.
- Overstack validation still blocks illegal moves before roster reconciliation.

Validation:

- Focused engine movement tests cover split carry-forward.
- Focused engine movement tests cover merge carry-forward.
- Focused engine movement tests cover empty-group retirement.
- Focused engine movement tests cover repeated turns without name reuse.

Suggested ownership:

- Engine movement-resolution and state-reconciliation code.

## Task 4: Engine-Owned Naming Lifecycle

- [ ] Allocate finalized stack names only from authoritative naming state.
- [ ] Normalize legacy group labels at load.
- [ ] Retire names without reuse.
- [ ] Keep unit friendly names independent from group labels.

Done when:

- Every newly finalized stack receives the next unique group name.
- Retired group names remain consumed and are never recycled.
- Legacy `... group` names normalize to the canonical numbered form on load.
- Member `friendlyName` remains the canonical per-unit label even when group names change.

Validation:

- Shared naming tests cover allocation order.
- Shared naming tests cover load normalization.
- Shared naming tests prove member names remain stable while group names change.

Suggested ownership:

- `shared/stackNaming.ts` plus engine snapshot/load paths.

## Task 5: Snapshot And Projection Exposure

- [ ] Emit the canonical roster bundle in authoritative snapshots.
- [ ] Emit the naming snapshot alongside it.
- [ ] Rewire stack-aware projections to consume canonical roster data.
- [ ] Fail fast when stack-aware views are missing canonical roster data.

Done when:

- New engine snapshots include authoritative roster and naming state.
- Projection helpers derive stack headers and member rows from canonical roster data instead of co-location inference.
- Left-rail and related stack/member views show canonical member names plus finalized stack names.
- Stack-aware code paths reject or fail fast when canonical roster data is missing, rather than inventing synthetic member identity.

Validation:

- Snapshot tests prove roster and naming state are emitted together.
- Projection tests cover left-rail member rows and finalized stack labels.
- Negative tests prove stack-aware views fail when canonical roster data is absent.

Suggested ownership:

- Server snapshot assembly plus shared/web projection helpers.

## Task 6: Compatibility Audit And Fallback Removal

- [ ] Find remaining stack-aware grouping derived from hex position alone.
- [ ] Find remaining synthetic subgroup/member naming paths.
- [ ] Replace them with canonical roster lookups.
- [ ] Leave only explicit temporary fallbacks, if any, with tests.

Done when:

- Stack-aware engine and UI surfaces read membership from authoritative roster state.
- No stack-aware path invents `1..N` member identity for finalized stacks.
- Any remaining compatibility fallback is explicit, temporary, and covered by a failing-fast test.

Validation:

- Regression tests prove no synthetic member renumbering appears in stack UI data.
- Negative tests prove stack-aware projections refuse to proceed when canonical roster inputs are incomplete.

Suggested ownership:

- Shared projection helpers, web stack-aware selectors, and any remaining compatibility adapters.

## Recommended Execution Order

1. Task 1: Canonical roster bundle contract
2. Task 2: Shared stack-roster lifecycle helper
3. Task 3: End-of-movement reconciliation ownership
4. Task 4: Engine-owned naming lifecycle
5. Task 5: Snapshot and projection exposure
6. Task 6: Compatibility audit and fallback removal

## Completion Gate For Step 1

Step 1 is done only when all of the following are true:

- Canonical stack identity comes from the roster bundle rather than position inference.
- Canonical member names and finalized stack names are both present in authoritative state.
- Split and merge behavior preserves the correct surviving group name.
- Retired stack names never recycle.
- Stack-aware projections fail fast instead of inventing synthetic membership or placeholder member identity.
