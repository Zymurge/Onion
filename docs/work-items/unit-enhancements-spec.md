# Unit Definitions and Sprite Enhancements

## Status

**Status:** Core V1 catalog and scenario-derivation work is implemented. This
document remains the design record for the completed rules/catalog boundary and
the open V2 sprite and presentation questions below.

## Goals

1. Make it easy for scenario editors to create new unit types without editing
   TypeScript.
2. Preserve one resolved, authoritative unit-definition model for the engine,
   API, and web client.
3. Allow scenarios to derive a unit from a base type and override selected
   quantitative values when that is safer than creating a global type.
4. Give every resolved unit type an explicit sprite identity and a predictable
   display treatment for labels, stacks, status, destruction, and co-location.
5. Keep canonical unit identity and `stackRoster` authoritative. Never infer
   stack membership from two units merely sharing a hex.

## Current Ownership

- `shared/config/unitCatalog.json` is the current human-edited global catalog.
- `shared/unitDefinitions.ts` validates and resolves that catalog into runtime
  unit and weapon definitions.
- `server/engine/scenarioSchema.ts` validates authored deployments and
   scenario-local unit derivations.
- `server/engine/scenarioDefinitions.ts` resolves derived types into namespaced
   immutable catalogs, and `shared/rulesContext.ts` exposes those catalogs as
   the per-match lookup boundary.
- `server/engine/scenarioNormalizer.ts` creates runtime state from scenario
  deployments.
- `server/api/gameHelpers/protocol.ts` sends resolved catalogs through
  `SESSION_INIT`.
- `web/lib/sessionCatalog.ts` consumes the session catalog.
- `web/components/HexMapBoard.tsx` and the battlefield view builders own map
  presentation; `shared/stackRoster` owns canonical stack membership.

The implementation entry points are [scenario-schema.md](../scenario-schema.md)
for authoring and [agent-start-here.md](../agent-start-here.md) for the task
router. Do not treat the remaining presentation questions in this work-item as
requirements for catalog or engine changes.

## Canonical Design: Resolved Catalog Plus Scenario Derivations

Keep a global catalog of reusable base unit and weapon types, then let a
scenario declare local derived types. The server resolves the scenario catalog
before deployment and sends the resolved catalog in `SESSION_INIT`.

Conceptual shape:

```json
{
  "unitTypes": {
    "ScenarioDragon": {
      "extends": "Dragon",
      "overrides": {
        "movement": 4,
        "defense": 5,
            "maxStacks": 2,
            "weaponQuantities": {
               "Dragon.main": 2
            },
            "weaponOverrides": {
               "Dragon.main": {
                  "attack": 7,
                  "range": 4
               }
            }
      }
    }
  }
}
```

The runtime should see one normalized `UnitTypeCatalog`, regardless of whether
a type came from the global catalog or scenario-local derivation. Scenario IDs
must not collide with global IDs or with another scenario's local IDs.

### Allowed override categories

- Numeric unit values such as movement, defense, maximum treads,
   treads-per-move, rams-per-turn, squads, and maximum stack size.
- Per-weapon quantities, including zero to remove a weapon from a derived
   loadout. A derived type cannot add a weapon type that its base does not have.
- Numeric weapon values such as attack and range, subject to validation against
   the referenced base weapon type.

Role, base stackability, friendly-name templates, terrain capability structure,
sprite metadata, and arbitrary ability structure are not scenario overrides in
this first version. Derived types inherit `spriteKey` from their global base;
creating a new sprite requires creating a new global unit type. `maxStacks` may
vary only within the base type's stackability contract; a non-stackable base
cannot become stackable through an override. Inapplicable overrides, such as
`startingTreads` on a type without `maxTreads`, are ignored or logged as
warnings. Applicable overrides with invalid values remain hard scenario-load
errors.

The engine must consume resolved definitions, not inspect scenario JSON directly.

## Resolved Decisions: Definition Model

1. **IDs:** Scenario-derived IDs are automatically namespaced, for example
   `scenarioId:ScenarioDragon`. They are scenario-specific. A frequently reused
   modification can later be promoted to a global type.
2. **Inheritance:** Use single inheritance only. Multiple inheritance and
   nested derivation are out of scope.
3. **Overrides:** Use numeric unit overrides, per-weapon quantities, and
   numeric overrides for existing weapon types such as attack and range.
   Quantity zero removes a base weapon type from the derived loadout. Overrides
   cannot add new weapon types and do not mutate the global catalog.
4. **Weapon lists and instances:** The global catalog owns reusable weapon
   types and each type's `defaultQuantity`. A unit loadout maps weapon type IDs
   to quantities, with omitted quantities using that default. Scenario build
   creates the requested runtime instances and deterministic IDs/names from
   the owning unit ID, weapon type ID, and one-based ordinal. IDs such as
   `onion-1:TheOnion.secondary:1` identify instances, not catalog entries.
5. **Invariants:** Role and base stackability are fixed. Maximum stack size is
   variable only within the base type's stackability contract.
6. **Sprites and references:** Global unit types own sprite identity. Derived
   types inherit `spriteKey` and cannot override it. Scenario deployments and
   objective `unitType` targets use short local derived keys; resolution
   expands them to namespaced runtime IDs such as `scenarioId:ScenarioDragon`.
7. **Immutability:** The scenario resolves its complete catalog once at match
   startup. Resolved definitions are immutable for the match and must be
   persisted or versioned with the scenario data needed for replay.
8. **Validation:** Invalid applicable overrides are a hard scenario-load
   failure. Inapplicable overrides are ignored or logged as warnings. Editor
   tooling may provide earlier diagnostics later, but the server remains the
   final gate.
9. **Editor tooling:** Scenario editor tools are V2. JSON/schema validation is
   the V1 authoring workflow.
10. **Migration:** No legacy scenario compatibility is required. Existing
   scenarios may be updated as part of this work.

## Resolved Decision: Tread and Missile Starting Values

Use the hybrid model:

- The unit or weapon type defines the maximum capacity and the default starting
   value.
- A scenario deployment may override the initial runtime value, subject to the
   type maximum.
- A deployment override becomes mutable `GameState` at match startup; it is not
   a second type definition.
- Treads are not repaired during play, so a partially damaged Onion can start
   with fewer than its type maximum through `startingTreads`.
- Missile ammunition is not replenished during play. A scenario may use
   `startingAmmoByWeaponType` to start with fewer rounds than `maxAmmo`.
- Weapon readiness is separate from ammunition: a spent weapon may become ready
   at the normal turn reset when it still has ammunition, but consumed
   ammunition is not restored.
- `ramsPerTurn` remains a type-defined per-turn capacity; `ramsRemaining` is
   mutable runtime state reset at the start of the relevant turn.

The schema must distinguish type maxima/defaults from deployment starting
values, validate every starting value as non-negative and no greater than its
maximum, and preserve the resolved values for replay.

## Sprite and Unit Presentation

Every resolved unit type should expose a stable `spriteKey` or asset reference.
The runtime catalog, not UI type-name heuristics, should determine the sprite.
The asset mapping should support at least:

- Base unit sprite by resolved type
- Disabled, recovering, and destroyed variants where applicable
- Onion damage or tread-state variants where the rules require them
- Swamp/HQ presentation and destroyed-state presentation
- A deterministic fallback sprite for missing or invalid assets

### Display layers

Keep the visual layers separate:

1. **Sprite:** identifies the unit type.
2. **Unit label:** identifies the individual unit or friendly name.
3. **Stack indicator:** shows the canonical stack size and supports member
   inspection without replacing individual identity.
4. **Status indicator:** shows operational, disabled, recovering, or destroyed
   state without relying on color alone.
5. **Selection/interaction layer:** shows selected units, legal targets, range,
   and movement state.

A stack label must be derived from `stackRoster` and live member state. It must
not be reconstructed from co-location.

### Multiple units in one hex after a ram miss

A ram miss can leave multiple units in one hex. The display must keep every
unit inspectable and preserve the canonical roster relationship. Candidate
presentations include a stack badge with an expandable member list, a controlled
fan/offset layout, or a selected-member spotlight with the remaining members
behind it.

The chosen treatment must define behavior for:

- Selecting one member versus the whole stack
- Showing individual friendly names and statuses
- Showing destroyed members that remain inspectable
- Movement and combat range overlays for a partially selected stack
- Narrow viewports and overlapping labels
- Ordering members deterministically

## Open Questions: Sprites and Presentation

1. What asset format and delivery path should be canonical: bitmap files,
   sprite sheets, SVG assets, or a mixture?
2. Who creates and approves the initial sprite set, and what dimensions/aspect
   ratio should assets use?
3. The ownership decision is resolved: `spriteKey` lives on global unit types,
   and scenario-derived types inherit it without override. The remaining
   question is whether a separate presentation registry is needed for asset
   delivery metadata.
4. Which unit states require distinct artwork versus a status overlay?
5. Should labels always be visible, hover/focus-only, or controlled by a display
   setting?
6. What exact stack count should be shown: all members, living members only,
   or both?
7. How should a destroyed member remain inspectable without implying that it
   is still actionable?
8. Which interaction wins when a hex contains multiple units after a ram miss:
   click cycles members, opens a member list, or selects the canonical stack?
9. What is the deterministic visual ordering for co-located units?
10. What is the fallback when a sprite asset is missing, malformed, or not
    available in a replay?
11. Which display requirements are V1 and which should be deferred to the V2
    accessibility/presentation backlog?

## TDD Implementation Plan

### 1. Define and validate the authored model

- Add failing schema tests for base references, derived IDs, override fields,
   weapon references, sprite keys, starting treads, starting ammunition, and
   invalid inheritance or capacity values.
- Define the resolved runtime catalog contract.
- Add scenario fixtures for one base type, one derived type, and one invalid
  override.

**Status:** Complete. Scenario parsing produces deterministic resolved definitions,
invalid definitions fail before gameplay starts, and existing scenarios resolve
unchanged.

### 2. Resolve scenario-local definitions

- Add a server-owned resolver between scenario parsing and normalization.
- Detect cycles, unknown bases, ID collisions, invalid override combinations,
  and missing weapon references.
- Ensure `SESSION_INIT` sends the resolved catalog used by the match.

**Status:** Complete. The engine, API, WebSocket catalog, and replay paths consume the same
resolved definitions and tests prove no runtime lookup reads authored overrides
directly.

### 3. Render unit sprites and presentation

- Consume the resolved unit-type `spriteKey`; do not derive sprites from names.
- Create the initial asset set and deterministic asset-loading fallback.
- Implement labels, stack counts, status overlays, selection, destroyed-member
   inspection, and the chosen co-location layout.
- Add component tests and the ram-miss multi-unit presentation fixture.

**Done when:** every shipped resolved type renders through its resolved
`spriteKey` or an intentional fallback, and unit/stack presentation remains
stable and inspectable across movement, combat, destruction, and co-location.

### 4. Define unit and stack presentation

- Add component tests for labels, stack counts, status overlays, selection,
  destroyed members, and co-located units.
- Implement the chosen stack presentation using canonical `stackRoster` data.
- Add a scenario fixture covering a ram miss with multiple units in one hex.

**Done when:** individual members remain inspectable and correctly actionable,
stack counts/statuses remain correct after movement/combat, and the board has a
stable layout on desktop and narrow viewports.

### 5. Verify cross-layer parity

- Run engine scenario tests, API snapshot/catalog tests, WebSocket session-init
  tests, and focused web rendering tests.
- Add a browser smoke flow for a derived unit, a sprite variant, a stack, and a
  ram miss.

**Done when:** server rules, serialized catalogs, sprites, labels, stack
presentation, and interaction state agree for the same match snapshot.

## Explicit Non-Goals

- Do not move authoritative combat or movement rules into the web client.
- Do not infer stack membership from position alone.
- Do not create a client-side mutable unit catalog that can diverge from the
  server-resolved catalog.
- Do not introduce a sprite registry that silently overrides scenario or
  catalog metadata.
