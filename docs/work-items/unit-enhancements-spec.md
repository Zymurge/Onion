# Unit Definitions and Sprite Enhancements

## Status

**Status:** V1 catalog, scenario derivation, and the shipped web unit-presentation
foundation are implemented. The permanent rendering contract is
[unit-presentation-spec.md](../web-ui/unit-presentation-spec.md); this document
remains the design record for catalog and scenario-derivation decisions plus
the remaining missing-sprite behavior.

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

Runtime sprite lookup, state variants, Inspector reuse, map positioning, and
status hatching are defined in
[unit-presentation-spec.md](../web-ui/unit-presentation-spec.md). The current
web client uses a bundled registry keyed by the resolved `spriteKey`; the same
asset is used on the map and in the Inspector, with per-type sizing and offsets
applied only on the map. Stack identity remains owned by `stackRoster`.

One implementation gap remains: absent or unrecognized sprite keys resolve to
no image, and the catalog parser does not validate the registry mapping. Define
whether catalog validation or an explicit fallback owns that failure before
adding authoring tools for new sprite keys.

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
- Use one bundled asset registry for map and Inspector surfaces; use explicit
  per-type variants only where the state has distinct artwork.
- Implement labels, stack counts, status overlays, selection, destroyed-member
   inspection, and the chosen co-location layout.
- Add component tests and the ram-miss multi-unit presentation fixture.

**Status:** Implemented for the shipped catalog. Unknown or missing registry
keys currently render no image; explicit validation or fallback behavior
remains open as noted above.

### 4. Define unit and stack presentation

**Status:** Implemented for the current V1 presentation. Group identity,
co-located membership, and selection use canonical `stackRoster` data; the
shipped web tests cover map markers, stack interaction, destroyed-member
inspection, and ram/co-location flows. See the
[unit-presentation specification](../web-ui/unit-presentation-spec.md) and
[interaction-routing specification](../web-ui/interaction-routing-spec.md) for
the current contracts.

### 5. Verify cross-layer parity

For catalog changes, exercise scenario resolution, API/`SESSION_INIT`
serialization, and web catalog consumption. For rendering changes, use the
focused tests linked from the
[unit-presentation specification](../web-ui/unit-presentation-spec.md). Add a
broader end-to-end flow when a change crosses those boundaries.

**Status:** Ongoing regression guidance, not an outstanding V1 feature.

## Explicit Non-Goals

- Do not move authoritative combat or movement rules into the web client.
- Do not infer stack membership from position alone.
- Do not create a client-side mutable unit catalog that can diverge from the
  server-resolved catalog.
- Do not introduce a sprite registry that silently overrides scenario or
  catalog metadata.
