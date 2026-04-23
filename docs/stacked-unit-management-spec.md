# Stacked Unit Management Spec

## 1. Stacking Rules (Current Knowledge)

- **Stacking Definition:** Multiple units may occupy (“stack in”) the same hex, subject to stacking limits.
- **Eligible Units:**
  - Infantry is the only stackable unit type right now.
  - Large units (e.g., The Onion, Swamp, Wolves, etc.) cannot stack with others or with each other.
- **Stack Limit:**
  - Infantry may stack up to 5 units per hex.
- **Stacking Effects:**
  - Stacking affects movement by preventing entry into a hex that would exceed the stack limit.
  - Stacked units are always targeted as a whole.
  - Damage is resolved by randomly destroying individual units within the stack until the required reduction is reached.
  - Stacking may affect defense (e.g., terrain bonuses, cover, or cumulative defense; rules to clarify).
- **Stacking Restrictions:**
  - Units may not stack with enemy units (no mixed stacks).
  - Some units may have special stacking rules (e.g., leaders, support units).

## 1a. Split Attacks from Stacks

- **Split Attack Definition:**
  - Any stack of eligible units may be split into arbitrary groups (from 1 up to the full stack size) during attack planning.
  - If the attack is committed, the selected unit has participated in combat for that phase.
  - If the attack is not committed, the selected unit remains available.
  - Each committed group can resolve a separate attack during the combat phase.
  - Multiple groups from the same stack may attack the same target (each as a separate attack) or different targets.
  - A split group from a stack may also combine with other eligible units (not in the original stack) to form a combined attack.
- **Implications:**
  - The UI must allow the player to select and form groups from a stack for attack assignment.
  - The attack planner must support multiple attacks originating from the same hex in a single phase.
  - The backend must validate that each group is legal (no unit attacks twice, all units are eligible, etc.).
  - Odds calculations and combat resolution must handle multiple attacks from the same stack, including possible combined attacks with units from other hexes.

## 1b. Clarifications & Design Decisions (2026-04-22)

- **Stack Limit:**
  - The maximum stack size is defined per unit type; right now, only infantry stacks and the limit is 5.
- **No Mixed Stacks:**
  - Stacks may not mix any different unit types (not just enemies); only identical eligible types may stack together.
- **Targeting Stacks:**
  - Stacked units can only be targeted as a group for both combat and ramming.
  - For attacking, a stack can be subdivided into any number of groups, each of which can attack separately.
- **Stack Inspection:**
  - Inspecting a stack shows only the full group to the active player.
  - During the stack’s combat phase, temporary attack groupings may be shown for the active player for clarity.
  - Inactive event viewers may use the generic unit type plus "group" wording when a final stack name has not yet been declared.
- **Movement Tracking:**
  - Per-unit movement remaining must be tracked. If stack A (all units at max move) joins stack B (units with remaining move), only stack B’s units can still move.
  - Mechanically, units are considered stacked if they share a hex at the end of the movement phase; splitting/merging within the move phase is not tracked as a separate entity.
  - The max-units-per-hex rule is always enforced.
- **Unit IDs & Stack Identity:**
  - Each stackable unit retains its own unique ID; stacks are not new entities, just collections of units in a hex.
  - Each stackable unit also retains its own canonical friendly name. The UI must never invent new member ids or renumber members based on the current group layout.
  - This simplifies tracking move/combat allowance per unit and avoids dynamic stack IDs.
- **UI Selection for Actions:**
  - When a stack is selected for move or combat, the UI prompts for the number of units to use (default: all).
  - If individual units are tracked, the UI can pop up a list of all available units in the stack, with toggles for selection (default: all selected).
  - Units that have already moved or attacked are excluded from the available list.
  - This selection UI should work similarly to the left rail group combat selector.
- **Stack Naming & Messaging:**
  - Each stack group will be assigned a unique, dynamically managed name for display during inspection and in all player-facing messages.
  - A stack group name remains with that group record for its lifetime.
  - A newly created group receives a stack name immediately, even if it is transient during the move phase.
  - If a partial stack moves away, the remaining units keep the original group record and group name.
  - If one or more units moves onto an existing stack, the existing group record and group name are used for the resulting stack in that hex.
  - Stack group names are not recycled; names increment throughout the life of the game to reduce confusion.
  - Underlying units retain their own IDs; stack names are for UI and messaging clarity only.

- **Source of Truth:**
  - `stackRoster` is the authoritative source of stack membership, group identity, and unit identity.
  - `stackNaming` is the authoritative source of stack-name allocation, normalization, and retirement history.
  - `defenders` may remain as a compatibility or projection view, but it should not be used as the canonical source for stacked-unit identity once `stackRoster` is available.

## 1c. Proposed Stack-Roster Contract

The game state should carry one bundled stack-roster element so the engine, API, and UI can pass stack state around without reconstructing it from loose unit records.

Recommended shape:

```ts
type StackRoster = {
  groupsById: Record<string, StackGroupState>
  unitsById: Record<string, StackUnitState>
}

type StackGroupState = {
  groupName: string
  unitType: string
  position: { q: number; r: number }
  units: StackUnitState[]
}

type StackUnitState = {
  id: string
  status: string
  friendlyName: string
  squads?: number
  weapons?: unknown[]
}
```

Contract rules:

- `groupsById` is the persisted roster bundle. The `groupsById` record key is the group id.
- `groupKey` is derived from `unitType + position` by the helper when needed and is not persisted.
- `unitIds`, `memberOrdinal`, and other convenience fields are derived by the helper when needed and are not persisted.
- `group.units` is a convenience view for UI and action selection; it must be consistent with the roster bundle and helper-derived lookups.
- `friendlyName` on a unit is stable and always refers to the individual unit, not the current stack label.
- `groupName` is the only field used for stack-level display in combat, inspection, logs, and summaries.
- A unit may move between groups, but its `id` and canonical `friendlyName` do not change.
- A group may lose or gain members, but its `groupName` remains stable until the group is retired.
- Any extant group record must have a display name; there is no unnamed transient group state.
- Retired groups remain available to the naming engine only as consumed history so names are never recycled.
- If two groups merge into the same position, the older surviving group id remains the active one and the emptied group is retired.
- When a group reaches zero members through merge or destruction, the group is removed and its name is retired.
- Destroyed stacked units disappear from the active roster rather than remaining as zeroed-out placeholders.
- For deterministic testing, when a stack must lose multiple units, the highest ordinal unit id is removed first.

This contract applies to newly created games and new snapshots. Existing throwaway games do not need a migration path.

## 1d. Shared Stack-Roster Helper

Create one shared helper that owns stack roster parsing and mutations instead of scattering stack math across the UI.

Responsibilities:

- Parse a stack roster from game state into groups and units.
- Provide single-call accessors such as `getGroupUnits(groupId)` and `getUnitGroup(unitId)`.
- Derive `groupKey`, `unitIds`, and presentation-only member metadata on demand.
- Support group mutations such as merge, split, and retire.
- Bridge to `shared/stackNaming.ts` so new groups can receive names and retired names can be harvested from the history set.
- Preserve unit identity across regrouping by keeping unit records stable while updating group membership.
- Return a derived view for UI surfaces that need both the group header and the contained member list.

The helper should be the only place that knows how to move between `unitsById`, `groupsById`, and the naming snapshot.

## 2. UI Exposure (Initial Plan)

- **Stack Visualization:**
  - The UI must visually indicate when a hex contains a stack (e.g., stack count badge, mini-icons, or a stack overlay).
  - Hovering or clicking a stack should reveal all units in the stack, with clear selection affordances.
- **Stack Interaction:**
  - Users must be able to select individual units within a stack for movement, combat, or inspection.
  - The UI should support splitting a stack (moving some units out) and merging stacks (moving units into an existing stack, if legal).
  - Drag-and-drop or context menu options may be used for stack management.
- **Stack Limits and Feedback:**
  - The UI must prevent illegal stacking (e.g., exceeding the stack limit) and provide clear feedback when a move is blocked by stacking rules.
  - Tooltips or error messages should explain stacking violations.

## 3. Implementation Mapping (To Do)

### Rules & Data Model

- [x] **Finalize stacking rules per unit type**  
  *Definition of Done:* All stacking limits (max per hex, eligible types, no mixed stacks) are documented in rules and reflected in shared definitions.

- [x] **Specify and document stack targeting rules**  
  *Definition of Done:* Rules for group-only defense, whole-stack targeting, and arbitrary subgroup attacks are written in the rules doc and referenced in engine logic.

- [x] **Define per-unit movement and combat allowance tracking**  
  *Definition of Done:* Game state schema supports tracking remaining move/attack for each unit, and docs are updated to match.

- [x] **Design stack naming scheme and dynamic naming logic**  
  *Definition of Done:* Naming algorithm is specified, implemented, and tested; stack names remain with the stack for its lifetime and increment forward without recycling.

### Backend Logic

- [x] **Phase 1: Movement and stack-state foundation**
  - Purpose: Keep all move-phase stacking behavior grounded in the existing per-unit state model so legality, merging, and remaining movement do not require a separate stack entity.
  - Scope: `Update movement logic to enforce per-type stack limits`, `Implement stack formation at end of movement`, and `Implement per-unit movement remaining after merges`.
  - Definition of Done:
    - Movement phase enforces the infantry-only stack limit of 5.
    - Illegal overstack moves are blocked and logged.
    - Units sharing a hex at the end of the move phase are treated as a stack.
    - Transient in-phase groups are not persisted as separate entities.
    - Only units with remaining movement can continue acting after a merge.
    - Game state and downstream UI-facing data still identify each unit by its own ID.
  - Test-first order: add or update focused movement and stack-state tests before implementation, then make them pass with the smallest movement/state change.

- [x] **Phase 2: Action validation and combat resolution**
  - Purpose: Make stacked units legal combat participants while ensuring no unit can be committed twice in the same phase.
  - Scope: `Update combat logic for stack attacks and group defense` and `Validate single action per unit per phase`.
  - Definition of Done:
    - Arbitrary subgroups from a stack can be selected for attack planning.
    - A selected unit only counts as committed once the attack is actually submitted.
    - Uncommitted units remain available for later planning in the same phase.
    - Stack targets are always resolved as whole targets.
    - Damage against stacked targets is applied by reducing individual units inside the stack.
    - No unit can move or attack more than once per phase.
    - Combat and ramming validation are covered by tests for both committed and rejected paths.
  - Test-first order: extend combat and phase-guard tests first, confirm they fail against the current engine, then implement the shared action-availability checks and combat resolution changes.

- [ ] **Phase 2b: Stack-roster assignment and naming lifecycle management**
  - Purpose: Implement the section 1b/1c stack roster rules as durable game behavior so group names and member names come from authoritative state instead of UI-only fallback wording.
  - Scope: `Assign finalized stack names at end of movement`, `Carry names forward across stack splits and merges`, `Keep a monotonic stack-name counter for the life of the game`, `Persist groups and units as a bundled roster element`, and `Expose canonical member names plus finalized stack names to downstream projection helpers and left-rail selection surfaces`.
  - Definition of Done:
    - Each stackable unit retains its own canonical friendly name; the UI does not invent per-member placeholder names during stack selection.
    - Each finalized stack receives a unique stack name that is distinct from the underlying unit IDs.
    - The authoritative game state exposes a bundled stack-roster structure with stable `groupsById` collections whose values contain minimal unit records.
    - If a partial stack moves away, the remaining units keep the original group record and group name.
    - If units move onto an existing named stack, the resulting stack uses the existing group name for that hex.
    - Name assignment and reconciliation happen at end-of-move consolidation, not during transient in-phase grouping.
    - Stack names are never recycled; the next generated name always advances from the prior high-water mark for that game.
    - Backend state or projection data provides enough information for map, inspector, combat, and event-log surfaces to show finalized stack names and canonical member names consistently, while the shared helper derives unit lists and group keys on demand.
    - Left-rail stack/member pickers preserve the underlying unit identity while displaying canonical member names and the finalized stack name; they do not collapse members into synthetic `1..N` placeholders.
    - Generic `unit type + group` wording is used only when a finalized stack name has not yet been assigned.
  - Test-first order: add engine and projection tests for initial naming, split carry-forward, merge carry-forward, non-recycling counters, and member-name exposure before implementing the naming state and projection updates.

- [x] **Phase 3: Event payloads, logs, and stack-name projection**
  - Purpose: Keep backend event output readable by projecting finalized stack names from live unit state instead of introducing a separate stack object.
  - Scope: `Include stack names in event payloads and logs`.
  - Definition of Done:
    - All player-facing backend events and logs identify stacks consistently.
    - Finalized stack names are emitted after end-of-move consolidation.
    - Inactive views can fall back to generic "group" wording when a final name has not yet been declared.
    - Stack names remain stable for the lifetime of the stack.
    - Name generation stays tied to the underlying unit IDs and move-phase consolidation, not to a separate mutable stack entity.
  - Test-first order: add event/log projection tests first, then implement the naming emission path and keep it read-only from the point of view of combat and movement rules.

### UI/UX

The six original UI/UX tasks are consolidated into four development-ready tasks below. Each task is scoped so a sub-agent can implement it independently, with the shared expectation that the UI mirrors the finalized backend stack behavior and never invents a separate stack entity.

- [x] **Stack presentation and naming across map and dialogs**  
  *Purpose:* Show stacked units as a single readable UI concept everywhere the player can inspect, target, or review outcomes.  
  *Scope:* Map hex badges, stack count overlays, inspection panels, combat/ramming dialogs, and player-facing action logs.  
  *Acceptance Criteria:*  
  - Every stacked hex displays both a unit count and a stable stack name once the stack has been finalized at end of movement.  
  - Inspection and action dialogs use the same stack name that appears on the map.  
  - When a final stack name has not yet been assigned, the UI uses the generic unit-type + "group" wording instead of an invented placeholder.  
  - The displayed stack label remains stable for the lifetime of that stack and does not change between adjacent UI surfaces.  
  - The UI does not expose a separate mutable stack entity; labels are derived from existing unit state and backend projection data.  
  *Implementation Notes:* Reuse the existing unit/stack projection helpers and the same wording in all visible surfaces so the active player and inactive viewers do not see different identities for the same stack.  
  *Test-first order:* add or update map, dialog, and message rendering tests before changing the display logic.

- [ ] **Stack selection and action input for move/combat**  
  *Purpose:* Let the player choose which units in a stack are participating in a move or combat action without introducing a special stack editor.  
  *Scope:* Selection panels, unit toggles, keyboard/mouse interaction, and move/combat action submission.  
  *Acceptance Criteria:*  
  - Selecting a stack opens a unit list with one toggle per eligible unit in that hex.  
  - The default state selects all eligible units.  
  - Units that have already moved or attacked in the current phase are hidden or disabled, not silently re-selected.  
  - The player can choose any legal subset for the current action and submit it without needing to perform multiple separate UI flows.  
  - The interaction pattern matches the existing left-rail combat selector where practical, so the stack flow feels like a direct extension of current multi-select behavior.  
  - Once the naming lifecycle step is complete, selection rows use canonical member names and preserve the underlying unit identity instead of showing placeholder subgroup numbering.  
  - Illegal selections cannot be submitted, and the UI explains why the action is unavailable.  
  *Implementation Notes:* Keep the selection model additive and reversible during planning so a player can adjust the unit set before committing.  
  *Test-first order:* add or update selection and eligibility tests before wiring the action submission path.

- [ ] **Split-attack preview and temporary group rendering**  
  *Purpose:* Make stacked combat understandable while the player is planning multiple attacks from the same stack.  
  *Scope:* Combat planning previews, temporary group labels, and post-commit cleanup of preview state.  
  *Acceptance Criteria:*  
  - The UI can show temporary subgroups from the same stack while combat is being planned.  
  - Temporary subgroup labels are visible only to the active player who is making the attack assignment.  
  - Inactive viewers continue to see the finalized stack label during combat planning; there is no unnamed transient group state.  
  - Multiple temporary groups may originate from the same hex and may target the same or different enemies, matching the backend combat model.  
  - Once the attack is committed or canceled, the UI returns to the finalized stack view with no leftover preview state.  
  *Implementation Notes:* Treat the preview as a transient presentation layer over the existing stack state rather than a persisted object.  
  *Test-first order:* add focused combat-planning UI tests for the preview state, then implement the rendering and cleanup logic.

- [ ] **Illegal stacking feedback and blocked actions**  
  *Purpose:* Prevent invalid stack creation or movement from feeling ambiguous to the player.  
  *Scope:* Movement blocking, validation messaging, tooltips, and map-level feedback for overstack and mixed-stack attempts.  
  *Acceptance Criteria:*  
  - Attempting to move into a hex that would exceed the stack limit is blocked before the action commits.  
  - The UI explains the failure with a specific message, such as stack limit exceeded or illegal mixed stack, rather than a generic failure.  
  - The blocking feedback is shown close to the action source, such as the map interaction, selection panel, or message banner, so the player can correct the move immediately.  
  - A blocked illegal move does not partially apply state or leave the selection UI in a committed state.  
  - The wording used in UI feedback stays aligned with the shared validator and backend error messages.  
  *Implementation Notes:* Prefer shared validation messaging so the UI can surface the same reason the engine rejected the move.  
  *Test-first order:* add or update illegal-move and tooltip tests before wiring the feedback path.

- [ ] Fix: Left rail defenders list during defender turn shows all groups as attack 1. That attack used in combar is also fixed at 1. Should be the combined attack of the stack.

### Testing

- [ ] **Test stack formation, splitting, merging, and naming**  
  *Definition of Done:* Unit/integration tests cover all stack operations and naming updates, including partial moves and end-of-phase consolidation.

- [ ] **Test per-unit movement/attack after merges and splits**  
  *Definition of Done:* Tests verify only eligible units can act after merges/splits; edge cases are covered.

- [ ] **Test UI selection logic for stacks**  
  *Definition of Done:* UI tests cover selection, exclusion of ineligible units, and all edge cases.

- [ ] **Test stack naming updates and recycling**  
  *Definition of Done:* Tests confirm stack names remain stable for a stack’s lifetime and increment forward without recycling.

### Integration

- [ ] **Fold finalized stacking rules into docs/game-rules.md**  
  *Definition of Done:* Main rules doc is updated with all stacking logic and examples.

- [ ] **Fold finalized UI/UX patterns into docs/web-ui-spec.md**  
  *Definition of Done:* UI spec includes all stack-related patterns, visuals, and flows.

- [ ] **Update scenario authoring and engine docs for stack rules**  
  *Definition of Done:* Scenario and engine documentation includes stacking, naming, and targeting rules, and existing scenarios are updated to comply.
