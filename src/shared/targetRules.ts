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
	if (liveTargetRules !== undefined) {
		return liveTargetRules
	}

	return unitDefinition?.weapons?.find((weapon) => weapon.id === weaponId)?.targetRules
}

export function resolveUnitTargetRules(
	unitDefinition: TargetRuleUnitDefinition | undefined,
	liveTargetRules?: TargetRules,
): TargetRules | undefined {
	return liveTargetRules ?? unitDefinition?.targetRules
}