import { z } from 'zod'

export const HexPosSchema = z.object({
  q: z.number(),
  r: z.number(),
})

const UnitStateSchema = z.enum(['operational', 'disabled', 'recovering', 'destroyed'])

const TerrainHexSchema = z.object({
  q: z.number(),
  r: z.number(),
  t: z.number(),
})

export const OnionSchema = z.object({
  type: z.string().min(1), // e.g., 'TheOnion', 'MkIII', etc.
  position: HexPosSchema,
  status: UnitStateSchema.optional(),
}).strict()

export const DefenderSchema = z.object({
  type: z.string().min(1),
  position: HexPosSchema,
  status: UnitStateSchema.optional(),
  squads: z.number().int().positive().optional(),
})

export const DefenderStackGroupSchema = z.object({
  kind: z.literal('stack-group'),
  unitType: z.string().min(1),
  position: HexPosSchema,
  count: z.number().int().positive(),
  groupName: z.string().optional(),
  status: UnitStateSchema.optional(),
})

export const DefenderEntrySchema = z.union([
  DefenderSchema,
  DefenderStackGroupSchema,
])

export const DefendersRecordSchema = z.record(z.string(), DefenderEntrySchema)

export const InitialStateSchema = z.object({
  onions: z.record(z.string().min(1), OnionSchema).refine((onions) => Object.keys(onions).length > 0, 'At least one Onion is required'),
  defenders: DefendersRecordSchema,
}).strict()

export const ScenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  displayName: z.string().min(1).optional(),
  description: z.string().min(1),
  map: z.union([
  z.object({
    radius: z.number().int().nonnegative(),
    shape: z.literal('hex').optional(),
    hexes: z.array(TerrainHexSchema).default([]),
  }),
  z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    cells: z.array(HexPosSchema).min(1),
    hexes: z.array(TerrainHexSchema),
  }),
  ]),
  initialState: InitialStateSchema,
  victoryConditions: z.object({}).passthrough(),
})

export type Scenario = z.infer<typeof ScenarioSchema>
export type InitialState = z.infer<typeof InitialStateSchema>
