import { z } from 'zod'

export const HexPositionSchema = z.object({
	q: z.number().int(),
	r: z.number().int(),
}).strict()

export const EndPhaseCommandSchema = z.object({
	type: z.literal('END_PHASE'),
}).strict()

export const MoveCommandSchema = z.object({
	type: z.literal('MOVE'),
	movers: z.array(z.string()),
	to: HexPositionSchema,
	attemptRam: z.boolean().optional(),
}).strict()

export const FireCommandSchema = z.object({
	type: z.literal('FIRE'),
	attackers: z.array(z.string()),
	targetId: z.string(),
	onionId: z.string(),
}).strict()

export const CommandSchema = z.discriminatedUnion('type', [
	EndPhaseCommandSchema,
	MoveCommandSchema,
	FireCommandSchema,
])

export type ValidatedCommand = z.infer<typeof CommandSchema>
