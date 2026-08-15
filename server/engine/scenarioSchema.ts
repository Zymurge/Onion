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

const StartingAmmoByWeaponTypeSchema = z.record(z.string().min(1), z.number().int().nonnegative())

const DeploymentBaseSchema = {
  side: z.enum(['onion', 'defender']),
  position: HexPosSchema,
  status: UnitStateSchema.optional(),
  startingAmmoByWeaponType: StartingAmmoByWeaponTypeSchema.optional(),
}

export const UnitDeploymentSchema = z.object({
  type: z.string().min(1),
  ...DeploymentBaseSchema,
}).strict()

export const StackGroupDeploymentSchema = z.object({
  kind: z.literal('stack-group'),
  unitType: z.string().min(1),
  count: z.number().int().positive(),
  groupName: z.string().optional(),
  ...DeploymentBaseSchema,
}).strict()

export const DeploymentSchema = z.union([UnitDeploymentSchema, StackGroupDeploymentSchema])

export const DeploymentsRecordSchema = z.record(z.string().min(1), DeploymentSchema)

export const InitialStateSchema = z
  .object({
    deployments: DeploymentsRecordSchema,
  })
  .strict()
  .refine(
    (initialState) => Object.values(initialState.deployments).some((deployment) => deployment.side === 'onion'),
    'At least one Onion deployment is required',
  )

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
export type Deployment = z.infer<typeof DeploymentSchema>
