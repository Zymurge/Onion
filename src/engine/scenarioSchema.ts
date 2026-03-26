import { z } from 'zod'

export const HexPosSchema = z.object({
  q: z.number(),
  r: z.number(),
})

export const OnionSchema = z.object({
  type: z.string(), // e.g., 'TheOnion', 'MkIII', etc.
  position: HexPosSchema,
  treads: z.number(),
  missiles: z.number(),
  batteries: z.object({
    main: z.number(),
    secondary: z.number(),
    ap: z.number(),
  }),
  status: z.string().optional(),
})

export const DefenderSchema = z.object({
  type: z.string(),
  position: HexPosSchema,
  status: z.string().optional(),
  squads: z.number().optional(),
})

export const DefendersRecordSchema = z.record(z.string(), DefenderSchema)

export const InitialStateSchema = z.object({
  onion: OnionSchema,
  defenders: DefendersRecordSchema,
})

export const ScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  map: z.object({
    width: z.number(),
    height: z.number(),
    hexes: z.array(z.object({
      q: z.number(),
      r: z.number(),
      t: z.number(),
    })),
  }),
  initialState: InitialStateSchema,
  victoryConditions: z.any(), // For now, accept any shape
})

export type Scenario = z.infer<typeof ScenarioSchema>
export type InitialState = z.infer<typeof InitialStateSchema>
