import { buildStackRosterIndex, type StackRosterIndex } from '../../shared/stackRoster'
import type { DefenderMap, StackRosterState } from '../../shared/types/index'
import type { BattlefieldUnit } from './battlefieldView'

export type BattlefieldRosterProjection = {
	defendersById: ReadonlyMap<string, BattlefieldUnit>
	index: StackRosterIndex
}

function buildBattlefieldDefenderLookup(defenders: ReadonlyArray<BattlefieldUnit>): DefenderMap {
	return Object.fromEntries(
		defenders.map((unit) => [unit.unitId, {
			role: 'defender' as const,
			unitId: unit.unitId,
			typeId: unit.typeId,
			state: unit.state,
			friendlyName: unit.friendlyName,
			position: unit.position,
			weapons: unit.weapons,
		}]),
	)
}

export function buildBattlefieldRosterIndex(
	defenders: ReadonlyArray<BattlefieldUnit>,
	stackRoster: StackRosterState | undefined,
): StackRosterIndex {
	return buildStackRosterIndex(stackRoster, buildBattlefieldDefenderLookup(defenders))
}

export function buildBattlefieldRosterProjection(
	defenders: ReadonlyArray<BattlefieldUnit>,
	stackRoster: StackRosterState | undefined,
): BattlefieldRosterProjection {
	return {
		defendersById: new Map(defenders.map((defender) => [defender.unitId, defender])),
		index: buildBattlefieldRosterIndex(defenders, stackRoster),
	}
}
