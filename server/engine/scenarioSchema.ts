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

const NumericWeaponOverrideSchema = z.object({
  attack: z.number().positive().optional(),
  range: z.number().positive().optional(),
  defense: z.number().positive().optional(),
  maxAmmo: z.number().int().positive().optional(),
}).strict()

const UnitTypeDerivationSchema = z.object({
  extends: z.string().min(1),
  overrides: z.object({
    movement: z.number().optional(),
    defense: z.number().optional(),
    maxTreads: z.number().int().nonnegative().optional(),
    treadsPerMove: z.number().optional(),
    ramsPerTurn: z.number().int().nonnegative().optional(),
    squads: z.number().int().positive().optional(),
    maxStacks: z.number().int().positive().optional(),
    weaponQuantities: z.record(z.string().min(1), z.number().int().nonnegative()).optional(),
    weaponOverrides: z.record(z.string().min(1), NumericWeaponOverrideSchema).optional(),
  }).strict(),
}).strict()

const UnitTypesSchema = z.record(z.string().min(1), UnitTypeDerivationSchema)

const DeploymentBaseSchema = {
  side: z.enum(['onion', 'defender']),
  position: HexPosSchema,
  status: UnitStateSchema.optional(),
  startingTreads: z.number().int().nonnegative().optional(),
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

const VictoryObjectiveSchema = z.union([
  z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    kind: z.literal('destroy-unit'),
    victor: z.enum(['onion', 'defender']),
    required: z.boolean().optional(),
    unitId: z.string().min(1).optional(),
    unitType: z.string().min(1).optional(),
  }).strict().refine((objective) => (objective.unitId === undefined) !== (objective.unitType === undefined), 'Destroy-unit objectives require exactly one target'),
  z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    kind: z.literal('escape-map'),
    victor: z.enum(['onion', 'defender']),
    required: z.boolean().optional(),
  }).strict(),
  z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    kind: z.literal('immobilize-onion'),
    victor: z.literal('defender'),
    required: z.boolean().optional(),
  }).strict(),
])

const VictoryConditionsSchema = z.object({
  maxTurns: z.number().int().positive().optional(),
  objectives: z.array(VictoryObjectiveSchema).min(1),
  onion: z.object({
    escapeHexes: z.array(HexPosSchema).optional(),
    description: z.string().optional(),
  }).optional(),
  defender: z.object({
    description: z.string().optional(),
  }).optional(),
}).passthrough().refine(
  (conditions) => conditions.objectives.some((objective) => objective.kind === 'immobilize-onion' && objective.victor === 'defender'),
  'Victory conditions must explicitly include a defender Onion immobilization objective',
)

export const ScenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  displayName: z.string().min(1).optional(),
  description: z.string().min(1),
  unitTypes: UnitTypesSchema.optional(),
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
  victoryConditions: VictoryConditionsSchema,
})

export type Scenario = z.infer<typeof ScenarioSchema>
export type InitialState = z.infer<typeof InitialStateSchema>
export type Deployment = z.infer<typeof DeploymentSchema>
