/**
 * Combat engine entry point.
 *
 * The index keeps the stable combat API discoverable while each implementation
 * module owns one responsibility: command actions, outcomes, rolls, targets,
 * or shared contracts.
 */
export type {
  CombatExecutionResult,
  CombatOutcomeEffect,
  CombatOutcomeResolution,
  CombatPlan,
  CombatResult,
  CombatResultDetails,
  CombatRoll,
  CombatTarget,
  CombatValidation,
  CombatValidationCode,
} from './types.js'

export { executeCombatAction, validateCombatAction } from './actions.js'
export { applyDamage, resolveCombatOutcome } from './outcomes.js'
export { calculateEngineCombatOdds, rollCombat } from './rolls.js'
export { getValidTargets } from './targets.js'