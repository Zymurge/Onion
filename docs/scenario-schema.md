# Onion Scenario Schema (v1)

This document defines the JSON structure for game scenarios. This schema will be validated using **Zod** in the Node.js engine.

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
  "name": "The Siege of Shrek's Swamp",
  "description": "The Onion must reach the Castle while defenders hold the ridgeline.",
  "map": {
    "width": 15,
    "height": 22,
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
      }
    },
    "defenders": [
      { "id": "wolf-1", "type": "BigBadWolf", "pos": { "q": 5, "r": 5 } },
      { "id": "puss-1", "type": "Puss", "pos": { "q": 6, "r": 5 } },
      { "id": "pig-1", "type": "LittlePig", "pos": { "q": 10, "r": 5 }, "squads": 3 }
    ]
  },
  "victoryConditions": {
    "targetHex": { "q": 12, "r": 5 },
    "maxTurns": 20
  }
}
```

## 3. Zod Implementation Notes

We will define the following TS interfaces:

```typescript
const HexSchema = z.object({
  q: z.number(),
  r: z.number(),
  t: z.nativeEnum(TerrainType)
});

const UnitSchema = z.object({
  id: z.string(),
  type: z.enum(["Puss", "Witch", "BigBadWolf", "LittlePig", "Dragon", "LordFarquaad"]),
  pos: z.object({ q: z.number(), r: z.number() }),
  squads: z.number().optional() // For Little Pig stacks
});
```
