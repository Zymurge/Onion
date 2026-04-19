# Onion Scenario Schema (v1)

This document defines the JSON structure for game scenarios. This schema will be validated using **Zod** in the Node.js engine.

Core rules mechanics referenced from the public domain portions of the [OGRE Designer's Edition Rulebook (v6.0)](https://www.sjgames.com/ogre/kickstarter/ogre_rulebook.pdf) by Steve Jackson Games.

## Schema and Normalization Overview (2026)

This schema is designed for authoring flexibility and robust normalization. The backend engine materializes all runtime geometry and unit/weapon state from authored scenario JSON as follows:

- **Authoring:** Scenarios may specify a map by `radius` (for a regular hexagon) or by explicit `cells`/`hexes`. Only non-clear terrain needs to be listed in `hexes`.
- **Backend Normalization:**
  - If `radius` is present, the backend generates a canonical list of axial coordinates for all valid map cells, centered at `(radius, radius)`.
  - The backend translates authored `q`/`r` positions into runtime coordinates and materializes the full `cells` array.
  - The frontend always receives explicit `cells` and does not perform coordinate translation.
- **Unit/Weapon Population:**
  - Scenario JSON only declares starting unit types, positions, and stack sizes (for infantry).
  - The engine populates all weapon lists, weapon stats, and targeting rules from the shared unit definitions at game start.
  - Do not put combat target restrictions or weapon stats directly in scenario JSON; these are always sourced from the engine.
- **Unit Status State Machine:**
  - All units default to `operational` if status is missing.
  - Defender units cycle: `operational` → `disabled` (if hit) → `recovering` (start of next turn) → `operational` (start of Recovery Phase).
  - The engine manages all status transitions automatically.
- **IDs:**
  - Any `id` fields in scenario JSON are ignored; the engine assigns unique IDs at game start for all units.
- **Victory Conditions:**
  - Scenario JSON specifies victory conditions, but the engine enforces and tracks win/loss state.

See also: [server/engine/units.ts] for canonical unit/weapon definitions and rules.

## 1. Map Configuration (Axial Hex Coordinates)

We use an **Axial Coordinate System** (q, r) where:

- `q`: Column index
- `r`: Row index
- `s = -q - r` (Implicit third axis for distance calculation)

### Hex Terrain Types

- `0`: Clear
- `1`: Ridgeline
- `2`: Crater
- `3`: Castle (Objective)

## 2. JSON Structure Example

```json
{
  "id": "swamp-siege-01",
  "name": "swamp-siege-01",
  "displayName": "The Siege of Shrek's Swamp",
  "description": "The Onion must destroy the Swamp and then escape the map.",
  "map": {
    "radius": 7,
    "hexes": [
      { "q": 0, "r": 0, "t": 0 },
      { "q": 1, "r": 0, "t": 1 },
      { "q": 5, "r": 5, "t": 3 }
    ]
  },
  "initialState": {
    "onion": {
      "type": "MkIII",
      "position": { "q": 0, "r": 10 },
      "treads": 45,
      "missiles": 2,
      "batteries": {
        "main": 1,
        "secondary": 4,
        "ap": 8
      },
      "status": "operational"
    },
    "defenders": {
      "swamp-1": { "type": "Swamp", "position": { "q": 5, "r": 5 }, "status": "operational" }
    }
  },
  "victoryConditions": {
    "maxTurns": 20,
    "objectives": [
      {
        "id": "destroy-swamp",
        "label": "Destroy The Swamp",
        "kind": "destroy-unit",
        "unitType": "Swamp",
        "required": true
      },
      {
        "id": "escape-map",
        "label": "Escape to a scenario-defined edge hex after The Swamp is destroyed",
        "kind": "escape-map",
        "required": true
      }
    ]
  }
}
```

## 3. Victory Conditions

Victory conditions are authored in the scenario under `victoryConditions`. The engine materializes them into runtime objective state, but the scenario file remains the source of truth.

### Fields

- `maxTurns`: Optional turn limit for the scenario. If omitted, the engine uses its default maximum turn count.
- `objectives`: Ordered list of scenario objectives. Each objective is evaluated independently and exposed to the API/UI as its own completion state.
- `onion.escapeHexes`: Array of explicit escape hexes. The Onion completes the `escape-map` objective by reaching any listed hex after the prerequisite objective sequence is satisfied.

### Currently Supported Objective Types

- `destroy-unit`: Completes when the named unit is destroyed. Use either `unitId` for a specific authored unit or `unitType` for any unit of that type.
- `escape-map`: Completes when the Onion leaves the map after the prerequisite objective sequence has been satisfied.

### Authoring Rules

1. Prefer `objectives` for new scenarios. Do not mix unrelated victory systems in the same file unless you are intentionally supporting a legacy scenario.
2. Mark each objective with a stable `id` and a player-facing `label`.
3. Set `required` to `true` for objectives that must be complete for the Onion to win. Omitted `required` defaults to required in the current engine contract.
4. Use `unitId` when the scenario contains one specific named objective unit, such as The Swamp.
5. Use `unitType` when any unit of that type should satisfy the objective.
6. Add new objective kinds only when the engine and API contract have been updated to support them end to end.

## 4. Unit and Weapon Population

Scenario JSON only declares the starting unit types, positions, and stack sizes. The engine populates the full weapon lists, weapon stats, and any target-rule metadata from the shared unit definitions at normalization time.

1. Do not put combat target restrictions directly in scenario JSON.
2. If a weapon or unit has special targeting restrictions, define them on the shared unit definition in the engine source of truth.
3. Scenario `initialState` should remain focused on initial placement, stack sizes, and status fields that vary per scenario.

## 5. Map Encoding Convention

Authored scenarios may declare a hex map by `radius` instead of enumerating every cell. In that authoring mode, the backend/shared scenario pipeline converts the authored positions into runtime axial coordinates and materializes the map as an explicit `cells` array centered at `(radius, radius)`, which keeps the generated board geometry consistent and non-negative.

When `radius` is used, the authored coordinates are not raw runtime coordinates. The backend treats `r` as the authored row index and `q` as the authored column index within that row, then translates those authored positions into runtime axial coordinates before the scenario reaches the client.

The runtime/API map shape still uses explicit `cells`; `radius` is only an authoring convenience for scenario authors. The frontend consumes the materialized axial coordinates as-is and does not perform any coordinate translation.

Only non-clear hexes need to appear in the `hexes` array. Any hex coordinate not listed is assumed to be terrain type `0` (Clear). This keeps scenario files compact.

## 6. Unit Status State Machine

Defender units cycle through three states. The engine is responsible for advancing state automatically at the start of each Defender turn.

- `operational`: Unit acts normally.
- `disabled`: Unit was hit with a "D" result this turn. It cannot move or fire. At the start of the **next** Defender turn, the engine transitions it to `recovering`.
- `recovering`: Unit was disabled last turn. It returns to `operational` at the **start of the Recovery Phase** this turn and may act normally.

## 7. Zod Implementation Notes

We will define the following TS interfaces:

```typescript
const ScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
  map: MapSchema,
  initialState: InitialStateSchema,
  victoryConditions: VictoryConditionsSchema
});

const HexSchema = z.object({
  q: z.number(),
  r: z.number(),
  t: z.nativeEnum(TerrainType)
});

const UnitStatusSchema = z.enum(["operational", "disabled", "recovering"]);

const UnitSchema = z.object({
  id: z.string(),
  type: z.enum(["Puss", "Witch", "BigBadWolf", "LittlePigs", "Dragon", "LordFarquaad"]),
  position: z.object({ q: z.number(), r: z.number() }),
  status: UnitStatusSchema.default("operational"),
  squads: z.number().optional() // For Little Pigs stacks only
});
```

The runtime unit definitions, not the scenario schema, supply the full weapon list and any weapon/unit target rules used by combat selection.
