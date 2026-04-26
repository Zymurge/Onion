import { describe, expect, it } from 'vitest'

import {
	buildStackGroupKey,
	buildStackRosterFromUnits,
	buildStackRosterIndex,
	expandStackRosterGroups,
	mergeStackRosterGroups,
	retireStackRosterGroup,
	splitStackRosterGroup,
	validateStackRoster,
	validateStackRosterConsistency,
} from '#shared/stackRoster'
import type { StackRosterState } from '#shared/types/index'

describe('stack roster', () => {
	it('flags structural contract violations', () => {
		const roster: StackRosterState = {
			groupsById: {
				'bad-1': {
					groupName: ' ',
					unitType: ' ',
					position: { q: Number.NaN, r: 1 },
					units: [
						{ id: '', status: 'operational', friendlyName: 'Bad Unit' },
					],
				},
				'bad-2': {
					groupName: 'Little Pigs group 9',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					units: [
						{ id: 'shared-id', status: 'operational', friendlyName: 'Little Pigs 1' },
					],
				},
				'bad-3': {
					groupName: 'Little Pigs group 10',
					unitType: 'LittlePigs',
					position: { q: 5, r: 5 },
					units: [
						{ id: 'shared-id', status: 'operational', friendlyName: 'Little Pigs 2' },
					],
				},
				'bad-4': {
					groupName: 'Little Pigs group 11',
					unitType: 'LittlePigs',
					position: { q: 6, r: 6 },
					units: [],
				},
			},
		}

		const issues = validateStackRoster(roster)

		expect(issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: 'EMPTY_GROUP_NAME', groupId: 'bad-1' }),
				expect.objectContaining({ code: 'EMPTY_UNIT_TYPE', groupId: 'bad-1' }),
				expect.objectContaining({ code: 'INVALID_POSITION', groupId: 'bad-1' }),
				expect.objectContaining({ code: 'EMPTY_UNIT_ID', groupId: 'bad-1' }),
				expect.objectContaining({ code: 'DUPLICATE_UNIT_ID', groupId: 'bad-3', unitId: 'shared-id' }),
				expect.objectContaining({ code: 'EMPTY_GROUP', groupId: 'bad-4' }),
			]),
		)
	})

	it('builds derived group and unit views from the minimal contract', () => {
		const roster: StackRosterState = {
			groupsById: {
				'stack-1': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					units: [
						{ id: 'pigs-1', status: 'operational', friendlyName: 'Little Pigs 1' },
						{ id: 'pigs-2', status: 'operational', friendlyName: 'Little Pigs 2' },
					],
				},
				'stack-2': {
					groupName: 'Little Pigs group 2',
					unitType: 'LittlePigs',
					position: { q: 5, r: 5 },
					units: [
						{ id: 'pigs-3', status: 'operational', friendlyName: 'Little Pigs 3' },
					],
				},
			},
		}

		const rosterIndex = buildStackRosterIndex(roster)

		expect(buildStackGroupKey('LittlePigs', { q: 4, r: 4 })).toBe('LittlePigs:4,4')
		expect(rosterIndex.groupsById['stack-1']).toMatchObject({
			groupId: 'stack-1',
			groupKey: 'LittlePigs:4,4',
			groupName: 'Little Pigs group 1',
			unitIds: ['pigs-1', 'pigs-2'],
		})
		expect(rosterIndex.getGroupUnits('stack-1')).toHaveLength(2)
		expect(rosterIndex.getUnitGroup('pigs-2')).toMatchObject({
			groupId: 'stack-1',
			groupKey: 'LittlePigs:4,4',
			groupName: 'Little Pigs group 1',
			unitType: 'LittlePigs',
			position: { q: 4, r: 4 },
		})
		expect(rosterIndex.unitsById['pigs-2']).toMatchObject({
			id: 'pigs-2',
			groupId: 'stack-1',
			groupKey: 'LittlePigs:4,4',
			unitType: 'LittlePigs',
			position: { q: 4, r: 4 },
			friendlyName: 'Little Pigs 2',
		})

		delete rosterIndex.groupsById['stack-1']
		expect(rosterIndex.getUnitGroup('pigs-2')).toBeNull()
	})

	it('round-trips through JSON serialization without losing the roster shape', () => {
		const roster: StackRosterState = {
			groupsById: {
				'stack-1': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					units: [{ id: 'pigs-1', status: 'operational', friendlyName: 'Little Pigs 1' }],
				},
			},
		}

		const serialized = JSON.stringify(roster)
		const restored = JSON.parse(serialized) as StackRosterState

		expect(restored).toEqual(roster)
		expect(buildStackRosterIndex(restored).groupsById['stack-1']?.groupName).toBe('Little Pigs group 1')
	})

	it('returns empty derived views for an empty roster', () => {
		const rosterIndex = buildStackRosterIndex(undefined)

		expect(rosterIndex.groupsById).toEqual({})
		expect(rosterIndex.unitsById).toEqual({})
		expect(rosterIndex.getGroupUnits('missing')).toEqual([])
		expect(rosterIndex.getUnitGroup('missing')).toBeNull()
	})

	it('builds roster groups for stackable co-located unit clusters only', () => {
		expect(buildStackRosterFromUnits([
			{ id: 'pigs-1', type: 'LittlePigs', position: { q: 4, r: 4 }, status: 'operational', friendlyName: 'Little Pigs 1', squads: 1 },
			{ id: 'pigs-2', type: 'LittlePigs', position: { q: 4, r: 4 }, status: 'operational', friendlyName: 'Little Pigs 2', squads: 1 },
			{ id: 'wolf-1', type: 'BigBadWolf', position: { q: 7, r: 7 }, status: 'operational', friendlyName: 'Big Bad Wolf 1', squads: 1 },
		])).toEqual({
			groupsById: {
				'LittlePigs:4,4': {
					groupName: 'Little Pigs 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					units: [
						{ id: 'pigs-1', status: 'operational', friendlyName: 'Little Pigs 1', weapons: undefined, targetRules: undefined },
						{ id: 'pigs-2', status: 'operational', friendlyName: 'Little Pigs 2', weapons: undefined, targetRules: undefined },
					],
				},
			},
		})
	})

	it('ignores non-stackable units when building stack roster groups', () => {
		const roster = buildStackRosterFromUnits([
			{ id: 'wolf-1', type: 'BigBadWolf', position: { q: 7, r: 7 }, status: 'operational', friendlyName: 'Big Bad Wolf 1' },
			{ id: 'puss-1', type: 'Puss', position: { q: 3, r: 5 }, status: 'operational', friendlyName: 'Puss 1' },
		])

		expect(roster).toEqual({ groupsById: {} })
	})

	it('preserves explicit grouped units without squashing them back into squads', () => {
		const roster = buildStackRosterFromUnits([
			{ id: 'pigs-1', type: 'LittlePigs', position: { q: 4, r: 4 }, status: 'operational', friendlyName: 'Little Pigs 1' },
			{ id: 'pigs-2', type: 'LittlePigs', position: { q: 4, r: 4 }, status: 'operational', friendlyName: 'Little Pigs 2' },
		])

		expect(roster).toEqual({
			groupsById: {
				'LittlePigs:4,4': {
					groupName: 'Little Pigs 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					units: [
						{ id: 'pigs-1', status: 'operational', friendlyName: 'Little Pigs 1', weapons: undefined, targetRules: undefined },
						{ id: 'pigs-2', status: 'operational', friendlyName: 'Little Pigs 2', weapons: undefined, targetRules: undefined },
					],
				},
			},
		})
		expect(roster.groupsById['LittlePigs:4,4']?.units).toHaveLength(2)
		expect(roster.groupsById['LittlePigs:4,4']?.units?.every((unit) => Object.hasOwn(unit, 'squads') === false)).toBe(true)
	})

	it('throws when a roster group has the wrong json shape', () => {
		expect(() => buildStackRosterIndex({
			groupsById: {
				bad: {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					units: null as unknown as never,
				},
			},
		})).toThrow('Invalid stack roster group shape for bad')
	})

	it('throws when a roster unit entry has the wrong json shape', () => {
		expect(() => buildStackRosterIndex({
			groupsById: {
				bad: {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					units: [{ id: 'pigs-1', status: 'operational', friendlyName: 'Little Pigs 1' }, null as unknown as never],
				},
			},
		})).toThrow('Invalid stack roster unit shape for bad')
	})

	it('derives the minimal roster contract from defender units', () => {
		const roster = buildStackRosterFromUnits([
			{ id: 'pigs-1', type: 'LittlePigs', position: { q: 4, r: 4 }, status: 'operational', friendlyName: 'Little Pigs 1' },
			{ id: 'pigs-2', type: 'LittlePigs', position: { q: 4, r: 4 }, status: 'operational', friendlyName: 'Little Pigs 2' },
			{ id: 'wolf-1', type: 'BigBadWolf', position: { q: 7, r: 7 }, status: 'destroyed', friendlyName: 'Big Bad Wolf 1' },
		])

		expect(roster).toEqual({
			groupsById: {
				'LittlePigs:4,4': {
					groupName: 'Little Pigs 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					units: [
						{ id: 'pigs-1', status: 'operational', friendlyName: 'Little Pigs 1', weapons: undefined, targetRules: undefined },
						{ id: 'pigs-2', status: 'operational', friendlyName: 'Little Pigs 2', weapons: undefined, targetRules: undefined },
					],
				},
			},
		})
	})

	it('parses canonical group membership from unitIds-only records', () => {
		const unitIdsOnlyRoster = {
			groupsById: {
				'LittlePigs:4,4': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
			},
		} as unknown as StackRosterState

		expect(() => buildStackRosterIndex(unitIdsOnlyRoster)).not.toThrow()
		expect(buildStackRosterIndex(unitIdsOnlyRoster).groupsById['LittlePigs:4,4']?.unitIds).toEqual(['pigs-1', 'pigs-2'])
	})

	it('validates canonical consistency between defenders and group membership', () => {
		const issues = validateStackRosterConsistency(
			{
				'pigs-1': { id: 'pigs-1', type: 'LittlePigs', position: { q: 4, r: 4 }, status: 'operational' },
				'wolf-1': { id: 'wolf-1', type: 'BigBadWolf', position: { q: 4, r: 5 }, status: 'operational' },
			},
			{
				groupsById: {
					'a': {
						groupName: 'Little Pigs group 1',
						unitType: 'LittlePigs',
						position: { q: 4, r: 4 },
						unitIds: ['pigs-1', 'missing-1', 'wolf-1'],
					},
					'b': {
						groupName: 'Wolf group 1',
						unitType: 'BigBadWolf',
						position: { q: 4, r: 5 },
						unitIds: ['wolf-1'],
					},
				},
			},
		)

		expect(issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: 'GROUP_MEMBER_NOT_FOUND', groupId: 'a', unitId: 'missing-1' }),
				expect.objectContaining({ code: 'GROUP_MEMBER_TYPE_MISMATCH', groupId: 'a', unitId: 'wolf-1' }),
				expect.objectContaining({ code: 'GROUP_MEMBER_POSITION_MISMATCH', groupId: 'a', unitId: 'wolf-1' }),
				expect.objectContaining({ code: 'MEMBER_IN_MULTIPLE_GROUPS', groupId: 'b', unitId: 'wolf-1' }),
				expect.objectContaining({ code: 'NON_STACKABLE_GROUP', groupId: 'b' }),
			]),
		)
	})

	it('projects deterministic expanded unit detail from canonical defenders plus unitIds', () => {
		const projected = expandStackRosterGroups(
			{
				'pigs-1': { id: 'pigs-1', type: 'LittlePigs', position: { q: 4, r: 4 }, status: 'operational', friendlyName: 'Little Pigs 1' },
				'pigs-2': { id: 'pigs-2', type: 'LittlePigs', position: { q: 4, r: 4 }, status: 'disabled', friendlyName: 'Little Pigs 2' },
			},
			{
				groupsById: {
					'g-1': {
						groupName: 'Little Pigs group 1',
						unitType: 'LittlePigs',
						position: { q: 4, r: 4 },
						unitIds: ['pigs-2', 'missing-1', 'pigs-1'],
					},
				},
			},
		)

		expect(projected.groupsById['g-1']).toEqual({
			groupId: 'g-1',
			groupName: 'Little Pigs group 1',
			unitType: 'LittlePigs',
			position: { q: 4, r: 4 },
			unitIds: ['pigs-2', 'pigs-1'],
			units: [
				{ id: 'pigs-2', status: 'disabled', friendlyName: 'Little Pigs 2', weapons: undefined, targetRules: undefined },
				{ id: 'pigs-1', status: 'operational', friendlyName: 'Little Pigs 1', weapons: undefined, targetRules: undefined },
			],
		})
	})

	it('merges, splits, and retires groups using canonical unitIds membership', () => {
		const initialRoster: StackRosterState = {
			groupsById: {
				'g-a': {
					groupName: 'Little Pigs group A',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
				'g-b': {
					groupName: 'Little Pigs group B',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-3'],
				},
			},
		}

		const merged = mergeStackRosterGroups(initialRoster, 'g-a', ['g-b'])
		expect(merged.groupsById['g-a']?.unitIds).toEqual(['pigs-1', 'pigs-2', 'pigs-3'])
		expect(merged.groupsById['g-b']).toBeUndefined()

		const split = splitStackRosterGroup(merged, {
			groupId: 'g-a',
			newGroupId: 'g-c',
			newGroupName: 'Little Pigs group C',
			movedUnitIds: ['pigs-2'],
			newPosition: { q: 5, r: 4 },
		})

		expect(split.groupsById['g-a']?.unitIds).toEqual(['pigs-1', 'pigs-3'])
		expect(split.groupsById['g-c']).toMatchObject({
			groupName: 'Little Pigs group C',
			unitType: 'LittlePigs',
			position: { q: 5, r: 4 },
			unitIds: ['pigs-2'],
		})

		const retired = retireStackRosterGroup(split, 'g-c')
		expect(retired.groupsById['g-c']).toBeUndefined()
		expect(retired.groupsById['g-a']?.unitIds).toEqual(['pigs-1', 'pigs-3'])
	})
})
