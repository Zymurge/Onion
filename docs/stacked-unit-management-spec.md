# Stacked Unit Management Spec

## 1. Stacking Rules (Current Knowledge)

- **Stacking Definition:** Multiple units may occupy (“stack in”) the same hex, subject to stacking limits.
- **Eligible Units:**
  - Only certain unit types (e.g., Little Pigs/infantry) may stack.
  - Large units (e.g., The Onion, Swamp, Wolves, etc.) cannot stack with others or with each other.
- **Stack Limit:**
  - There is a maximum number of stackable units per hex (e.g., 5 infantry per hex; value to be confirmed).
- **Stacking Effects:**
  - Stacking may affect movement (e.g., entering a full hex is not allowed).
  - Stacking may affect combat (e.g., all units in a stack may be targeted, or only the top unit; rules to clarify).
  - Stacking may affect defense (e.g., terrain bonuses, cover, or cumulative defense; rules to clarify).
- **Stacking Restrictions:**
  - Units may not stack with enemy units (no mixed stacks).
  - Some units may have special stacking rules (e.g., leaders, support units).

## 1a. Split Attacks from Stacks

- **Split Attack Definition:**
  - Any stack of eligible units may be split into arbitrary groups (from 1 up to the full stack size) for the purpose of attacking.
  - Each group can commit a separate attack during the combat phase.
  - Multiple groups from the same stack may attack the same target (each as a separate attack) or different targets.
  - A split group from a stack may also combine with other eligible units (not in the original stack) to form a combined attack.
- **Implications:**
  - The UI must allow the player to select and form groups from a stack for attack assignment.
  - The attack planner must support multiple attacks originating from the same hex in a single phase.
  - The backend must validate that each group is legal (no unit attacks twice, all units are eligible, etc.).
  - Odds calculations and combat resolution must handle multiple attacks from the same stack, including possible combined attacks with units from other hexes.

## 1b. Clarifications & Design Decisions (2026-04-22)

- **Stack Limit:**
  - The maximum stack size is defined per unit type (e.g., infantry may stack up to 5, others may not stack at all).
- **No Mixed Stacks:**
  - Stacks may not mix any different unit types (not just enemies); only identical eligible types may stack together.
- **Targeting Stacks:**
  - Stacked units can only be targeted as a group for both combat and ramming.
  - For attacking, a stack can be subdivided into any number of groups, each of which can attack separately.
- **Stack Inspection:**
  - Inspecting a stack shows only the full group, except during the stack’s combat phase, when temporary attack groupings may be shown for clarity.
- **Movement Tracking:**
  - Per-unit movement remaining must be tracked. If stack A (all units at max move) joins stack B (units with remaining move), only stack B’s units can still move.
  - Mechanically, units are considered stacked if they share a hex at the end of the movement phase; splitting/merging within the move phase is not tracked as a separate entity.
  - Only enforce the max-units-per-hex rule during the move phase.
- **Unit IDs & Stack Identity:**
  - Each stackable unit retains its own unique ID; stacks are not new entities, just collections of units in a hex.
  - This simplifies tracking move/combat allowance per unit and avoids dynamic stack IDs.
- **UI Selection for Actions:**
  - When a stack is selected for move or combat, the UI prompts for the number of units to use (default: all).
  - If individual units are tracked, the UI can pop up a list of all available units in the stack, with toggles for selection (default: all selected).
  - Units that have already moved or attacked are excluded from the available list.
  - This selection UI should work similarly to the left rail group combat selector.
- **Stack Naming & Messaging:**
  - Each stack will be assigned a unique, dynamically managed name (e.g., "Stack A", "Stack B", or context-aware names) for display during inspection and in all player-facing messages.
  - Stack names must update as stacks form, split, or merge, and should be reused or recycled as needed to avoid confusion.
  - Underlying units retain their own IDs; stack names are for UI and messaging clarity only.

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

- [ ] **Finalize stacking rules per unit type**  
  *Definition of Done:* All stacking limits (max per hex, eligible types, no mixed stacks) are documented in rules and reflected in shared definitions.

- [ ] **Specify and document stack targeting rules**  
  *Definition of Done:* Rules for group-only defense and arbitrary subgroup attacks are written in the rules doc and referenced in engine logic.

- [ ] **Define per-unit movement and combat allowance tracking**  
  *Definition of Done:* Game state schema supports tracking remaining move/attack for each unit, and docs are updated to match.

- [ ] **Design stack naming scheme and dynamic naming logic**  
  *Definition of Done:* Naming algorithm is specified, implemented, and tested; stack names update on merge/split and are recycled as needed.

- [ ] **Update scenario authoring and engine docs for stack rules**  
  *Definition of Done:* Scenario and engine documentation includes stacking, naming, and targeting rules.

### Backend Logic

- [ ] **Update movement logic to enforce per-type stack limits**  
  *Definition of Done:* Movement phase enforces stack limits by type; illegal moves are blocked and logged.

- [ ] **Implement stack formation at end of movement**  
  *Definition of Done:* Units sharing a hex at end of move phase are treated as a stack; splitting/merging within phase is not tracked as a new entity.

- [ ] **Implement per-unit movement remaining after merges**  
  *Definition of Done:* Only units with remaining movement can move after a merge; game state and UI reflect this.

- [ ] **Update combat logic for stack attacks and group defense**  
  *Definition of Done:* Arbitrary subgroups from a stack can attack; only full stack can defend/ram; validated by tests.

- [ ] **Validate single action per unit per phase**  
  *Definition of Done:* No unit can move or attack more than once per phase; enforced in backend and covered by tests.

- [ ] **Include stack names in event payloads and logs**  
  *Definition of Done:* All relevant events and logs reference stack names for clarity.

### UI/UX

- [ ] **Display stack count and unique stack name on hexes**  
  *Definition of Done:* UI shows stack badge and name on stacked hexes; verified in all relevant UI states.

- [ ] **Show unit selection list for stack actions**  
  *Definition of Done:* On stack selection, UI lists all units with toggles (default: all); units that have acted are excluded.

- [ ] **Prompt for group size or allow multi-select for actions**  
  *Definition of Done:* UI allows user to select any eligible subset for move/combat; default is all; selection is intuitive and tested.

- [ ] **Show stack name in all dialogs/messages**  
  *Definition of Done:* Stack name appears in inspection, combat, and ramming dialogs/messages; verified in UI and logs.

- [ ] **Show temporary groupings during split attacks**  
  *Definition of Done:* During combat, UI displays temporary attack groups if stack splits; reverts to full stack view after.

- [ ] **Provide clear feedback for illegal stacking**  
  *Definition of Done:* UI/tooltips explain stacking violations; illegal actions are blocked and user is informed.

### Testing

- [ ] **Test stack formation, splitting, merging, and naming**  
  *Definition of Done:* Unit/integration tests cover all stack operations and naming updates, including recycling.

- [ ] **Test per-unit movement/attack after merges and splits**  
  *Definition of Done:* Tests verify only eligible units can act after merges/splits; edge cases are covered.

- [ ] **Test UI selection logic for stacks**  
  *Definition of Done:* UI tests cover selection, exclusion of ineligible units, and all edge cases.

- [ ] **Test stack naming updates and recycling**  
  *Definition of Done:* Tests confirm stack names update and recycle correctly as stacks form/split/merge.

### Integration

- [ ] **Fold finalized stacking rules into docs/game-rules.md**  
  *Definition of Done:* Main rules doc is updated with all stacking logic and examples.

- [ ] **Fold finalized UI/UX patterns into docs/web-ui-spec.md**  
  *Definition of Done:* UI spec includes all stack-related patterns, visuals, and flows.

- [ ] **Update scenario and engine documentation as needed**  
  *Definition of Done:* All relevant docs reflect new stacking, naming, and targeting logic.

- [ ] **Update any scenario authoring or engine docs as needed.**
