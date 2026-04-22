export type TargetRules = {
	allowedTargetUnitTypes?: ReadonlyArray<string>
	allowedTargetWeaponIds?: ReadonlyArray<string>
	allowedAttackerUnitTypes?: ReadonlyArray<string>
	allowedAttackerWeaponIds?: ReadonlyArray<string>
}

export type TargetRuleActor = {
	unitType: string
	weaponId?: string
	targetRules?: TargetRules
}

export type TargetRuleTarget = {
	unitType: string
	weaponId?: string
	targetRules?: TargetRules
}

export type TargetRuleWeaponDefinition = {
	id: string
	targetRules?: TargetRules
}

export type TargetRuleUnitDefinition = {
	targetRules?: TargetRules
	weapons?: ReadonlyArray<TargetRuleWeaponDefinition>
}

function includesTargetRuleValue(values: ReadonlyArray<string> | undefined, value: string | undefined): boolean {
	if (values === undefined) {
		return true
	}

	if (value === undefined) {
		return false
	}

	return values.includes(value)
}

function mergeTargetRuleValues(
	primary: ReadonlyArray<string> | undefined,
	secondary: ReadonlyArray<string> | undefined,
): ReadonlyArray<string> | undefined {
	if (primary === undefined) {
		return secondary
	}

	if (secondary === undefined) {
		return primary
	}

	return [...new Set([...primary, ...secondary])]
}

function mergeTargetRules(primary: TargetRules | undefined, secondary: TargetRules | undefined): TargetRules | undefined {
	if (primary === undefined) {
		return secondary
	}

	if (secondary === undefined) {
		return primary
	}

	return {
		allowedTargetUnitTypes: mergeTargetRuleValues(primary.allowedTargetUnitTypes, secondary.allowedTargetUnitTypes),
		allowedTargetWeaponIds: mergeTargetRuleValues(primary.allowedTargetWeaponIds, secondary.allowedTargetWeaponIds),
		allowedAttackerUnitTypes: mergeTargetRuleValues(primary.allowedAttackerUnitTypes, secondary.allowedAttackerUnitTypes),
		allowedAttackerWeaponIds: mergeTargetRuleValues(primary.allowedAttackerWeaponIds, secondary.allowedAttackerWeaponIds),
	}
}

export function isTargetAllowedByRules(actor: TargetRuleActor, target: TargetRuleTarget): boolean {
	if (!includesTargetRuleValue(actor.targetRules?.allowedTargetUnitTypes, target.unitType)) {
		return false
	}

	if (!includesTargetRuleValue(actor.targetRules?.allowedTargetWeaponIds, target.weaponId)) {
		return false
	}

	if (!includesTargetRuleValue(target.targetRules?.allowedAttackerUnitTypes, actor.unitType)) {
		return false
	}

	if (!includesTargetRuleValue(target.targetRules?.allowedAttackerWeaponIds, actor.weaponId)) {
		return false
	}

	return true
}

export function resolveWeaponTargetRules(
	unitDefinition: TargetRuleUnitDefinition | undefined,
	weaponId: string,
	liveTargetRules?: TargetRules,
): TargetRules | undefined {
	return mergeTargetRules(
		unitDefinition?.weapons?.find((weapon) => weapon.id === weaponId)?.targetRules,
		liveTargetRules,
	)
}

export function resolveUnitTargetRules(
	unitDefinition: TargetRuleUnitDefinition | undefined,
	liveTargetRules?: TargetRules,
): TargetRules | undefined {
	return mergeTargetRules(unitDefinition?.targetRules, liveTargetRules)
}