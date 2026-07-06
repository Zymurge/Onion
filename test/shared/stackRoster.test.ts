import { describe, expect, it } from 'vitest'

import {
	buildStackGroupKey,
	buildStackRosterFromUnits,
	buildStackRosterIndex,
	refreshStackRosterNamingSnapshot,
	expandStackRosterGroups,
	mergeStackRosterGroups,
	moveStackRosterGroup,
	reconcileStackRosterMoveLifecycle,
	relocateStackRosterUnits,
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
					unitIds: [''],
				},
				'bad-2': {
					groupName: 'Little Pigs group 9',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['shared-id'],
				},
				'bad-3': {
					groupName: 'Little Pigs group 10',
					unitType: 'LittlePigs',
					position: { q: 5, r: 5 },
					unitIds: ['shared-id'],
				},
				'bad-4': {
					groupName: 'Little Pigs group 11',
					unitType: 'LittlePigs',
					position: { q: 6, r: 6 },
					unitIds: [],
				},
			},
			unitsById: {
				'shared-id': { id: 'shared-id', status: 'operational', friendlyName: 'Little Pigs 1' },
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
					unitIds: ['pigs-1', 'pigs-2'],
				},
				'stack-2': {
					groupName: 'Little Pigs group 2',
					unitType: 'LittlePigs',
					position: { q: 5, r: 5 },
					unitIds: ['pigs-3'],
				},
			},
			unitsById: {
				'pigs-1': { id: 'pigs-1', status: 'operational', friendlyName: 'Little Pigs 1' },
				'pigs-2': { id: 'pigs-2', status: 'operational', friendlyName: 'Little Pigs 2' },
				'pigs-3': { id: 'pigs-3', status: 'operational', friendlyName: 'Little Pigs 3' },
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
					unitIds: ['pigs-1'],
				},
			},
			unitsById: {
				'pigs-1': { id: 'pigs-1', status: 'operational', friendlyName: 'Little Pigs 1' },
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
					unitIds: ['pigs-1', 'pigs-2'],
				},
			},
			unitsById: {
				'pigs-1': { id: 'pigs-1', status: 'operational', friendlyName: 'Little Pigs 1', weapons: undefined, targetRules: undefined, squads: 1 },
				'pigs-2': { id: 'pigs-2', status: 'operational', friendlyName: 'Little Pigs 2', weapons: undefined, targetRules: undefined, squads: 1 },
				'wolf-1': { id: 'wolf-1', status: 'operational', friendlyName: 'Big Bad Wolf 1', weapons: undefined, targetRules: undefined, squads: 1 },
			},
		})
	})

	it('ignores non-stackable units when building stack roster groups', () => {
		const roster = buildStackRosterFromUnits([
			{ id: 'wolf-1', type: 'BigBadWolf', position: { q: 7, r: 7 }, status: 'operational', friendlyName: 'Big Bad Wolf 1' },
			{ id: 'puss-1', type: 'Puss', position: { q: 3, r: 5 }, status: 'operational', friendlyName: 'Puss 1' },
		])

		expect(roster).toEqual({
			groupsById: {},
			unitsById: {
				'wolf-1': { id: 'wolf-1', status: 'operational', friendlyName: 'Big Bad Wolf 1', weapons: undefined, targetRules: undefined, squads: undefined },
				'puss-1': { id: 'puss-1', status: 'operational', friendlyName: 'Puss 1', weapons: undefined, targetRules: undefined, squads: undefined },
			},
		})
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
					unitIds: ['pigs-1', 'pigs-2'],
				},
			},
			unitsById: {
				'pigs-1': { id: 'pigs-1', status: 'operational', friendlyName: 'Little Pigs 1', weapons: undefined, targetRules: undefined, squads: undefined },
				'pigs-2': { id: 'pigs-2', status: 'operational', friendlyName: 'Little Pigs 2', weapons: undefined, targetRules: undefined, squads: undefined },
			},
		})
		expect(roster.groupsById['LittlePigs:4,4']?.unitIds).toHaveLength(2)
		expect(roster.unitsById?.['pigs-1']?.squads).toBeUndefined()
	})

	it('throws when a roster group has the wrong json shape', () => {
		expect(() => buildStackRosterIndex({
			groupsById: {
				bad: {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: null as unknown as never,
				},
			},
			unitsById: {},
		})).toThrow('Invalid stack roster group shape')
	})

	it('throws when a roster unit entry has the wrong json shape', () => {
		expect(() => buildStackRosterIndex({
			groupsById: {
				bad: {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
			},
			unitsById: {
				'pigs-1': { id: 'pigs-1', status: 'operational', friendlyName: 'Little Pigs 1' },
				'pigs-2': null as unknown as never,
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
					unitIds: ['pigs-1', 'pigs-2'],
				},
			},
			unitsById: {
				'pigs-1': { id: 'pigs-1', status: 'operational', friendlyName: 'Little Pigs 1', weapons: undefined, targetRules: undefined, squads: undefined },
				'pigs-2': { id: 'pigs-2', status: 'operational', friendlyName: 'Little Pigs 2', weapons: undefined, targetRules: undefined, squads: undefined },
				'wolf-1': { id: 'wolf-1', status: 'destroyed', friendlyName: 'Big Bad Wolf 1', weapons: undefined, targetRules: undefined, squads: undefined },
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
			unitsById: {
				'pigs-1': { id: 'pigs-1', status: 'operational', friendlyName: 'Little Pigs 1' },
				'pigs-2': { id: 'pigs-2', status: 'operational', friendlyName: 'Little Pigs 2' },
			},
		} as unknown as StackRosterState

		expect(() => buildStackRosterIndex(unitIdsOnlyRoster)).not.toThrow()
		expect(buildStackRosterIndex(unitIdsOnlyRoster).groupsById['LittlePigs:4,4']?.unitIds).toEqual(['pigs-1', 'pigs-2'])
	})

	it('refreshes stack naming from the roster-owned adapter', () => {
		const roster: StackRosterState = {
			groupsById: {
				'g-a': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
				'g-b': {
					groupName: 'Little Pigs group 2',
					unitType: 'LittlePigs',
					position: { q: 5, r: 4 },
					unitIds: ['pigs-3'],
				},
			},
			unitsById: {
				'pigs-1': { id: 'pigs-1', status: 'operational', friendlyName: 'Little Pigs 1' },
				'pigs-2': { id: 'pigs-2', status: 'operational', friendlyName: 'Little Pigs 2' },
				'pigs-3': { id: 'pigs-3', status: 'operational', friendlyName: 'Little Pigs 3' },
			},
		}

		expect(refreshStackRosterNamingSnapshot(roster)).toMatchObject({
			groupsInUse: [
				{ groupKey: 'LittlePigs:4,4', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
				{ groupKey: 'LittlePigs:5,4', groupName: 'Little Pigs group 2', unitType: 'LittlePigs' },
			],
			usedGroupNames: ['Little Pigs group 1', 'Little Pigs group 2'],
		})
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

	it('flags stackable defenders that are missing from every roster group', () => {
		const issues = validateStackRosterConsistency(
			{
				'pigs-5': { id: 'pigs-5', type: 'LittlePigs', position: { q: 4, r: 8 }, status: 'operational' },
			},
			{
				groupsById: {
					'a': {
						groupName: 'Little Pigs group 1',
						unitType: 'LittlePigs',
						position: { q: 4, r: 4 },
						unitIds: ['pigs-1'],
					},
				},
			},
		)

		expect(issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: 'STACKABLE_DEFENDER_MISSING_GROUP', groupId: 'pigs-5', unitId: 'pigs-5' }),
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
			groupName: 'Little Pigs group 1',
			unitType: 'LittlePigs',
			position: { q: 4, r: 4 },
			unitIds: ['pigs-2', 'pigs-1'],
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
			unitsById: {},
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
	})

	it('moves a single selected member without inventing a new group name', () => {
		const initialRoster: StackRosterState = {
			groupsById: {
				'g-a': {
					groupName: 'Little Pigs group A',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2', 'pigs-3'],
				},
			},
			unitsById: {},
		}
		const moved = moveStackRosterGroup(initialRoster, {
			sourceGroupId: 'g-a',
			destinationGroupId: 'g-b',
			destinationGroupName: 'Little Pigs group B',
			movedUnitIds: ['pigs-1'],
			destinationPosition: { q: 5, r: 4 },
		})

		expect(moved.groupsById['g-a']?.unitIds).toEqual(['pigs-2', 'pigs-3'])
		expect(moved.groupsById['g-b']).toBeUndefined()
	})

	it('keeps a stackable source group when only one member remains after a move', () => {
		const initialRoster: StackRosterState = {
			groupsById: {
				'LittlePigs:4,4': {
					groupName: 'Little Pigs group A',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
			},
			unitsById: {},
		}
		const moved = relocateStackRosterUnits(initialRoster, {
			movedUnitIds: ['pigs-1'],
			unitType: 'LittlePigs',
			destinationPosition: { q: 5, r: 4 },
			destinationGroupName: 'Little Pigs group B',
		})

		expect(moved.groupsById['LittlePigs:4,4']).toMatchObject({
			groupName: 'Little Pigs group A',
			unitType: 'LittlePigs',
			position: { q: 4, r: 4 },
			unitIds: ['pigs-2'],
		})
		expect(moved.groupsById['LittlePigs:5,4']).toMatchObject({
			groupName: 'Little Pigs group B',
			unitType: 'LittlePigs',
			position: { q: 5, r: 4 },
			unitIds: ['pigs-1'],
		})
	})

	it('merges an ungrouped moved unit into an existing destination stack', () => {
		const initialRoster: StackRosterState = {
			groupsById: {
				'LittlePigs:5,4': {
					groupName: 'Little Pigs group B',
					unitType: 'LittlePigs',
					position: { q: 5, r: 4 },
					unitIds: ['pigs-2', 'pigs-3'],
				},
			},
			unitsById: {},
		}
		const moved = relocateStackRosterUnits(initialRoster, {
			movedUnitIds: ['pigs-1'],
			unitType: 'LittlePigs',
			destinationPosition: { q: 5, r: 4 },
			destinationGroupName: 'Little Pigs group B',
		})

		expect(moved.groupsById['LittlePigs:5,4']).toMatchObject({
			groupName: 'Little Pigs group B',
			unitType: 'LittlePigs',
			position: { q: 5, r: 4 },
			unitIds: ['pigs-2', 'pigs-3', 'pigs-1'],
		})
	})

	it('keeps a stackable singleton destination so later movers can reform the stack', () => {
		const initialRoster: StackRosterState = {
			groupsById: {
				'LittlePigs:4,4': {
					groupName: 'Little Pigs group A',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2', 'pigs-3'],
				},
			},
			unitsById: {},
		}
		const afterFirstMove = relocateStackRosterUnits(initialRoster, {
			movedUnitIds: ['pigs-1'],
			unitType: 'LittlePigs',
			destinationPosition: { q: 5, r: 4 },
			destinationGroupName: 'Little Pigs group B',
		})

		expect(afterFirstMove.groupsById['LittlePigs:4,4']?.unitIds).toEqual(['pigs-2', 'pigs-3'])
		expect(afterFirstMove.groupsById['LittlePigs:5,4']).toMatchObject({
			groupName: 'Little Pigs group B',
			unitType: 'LittlePigs',
			position: { q: 5, r: 4 },
			unitIds: ['pigs-1'],
		})

		const afterSecondMove = relocateStackRosterUnits(afterFirstMove, {
			movedUnitIds: ['pigs-2'],
			unitType: 'LittlePigs',
			destinationPosition: { q: 5, r: 4 },
			destinationGroupName: 'Little Pigs group B',
		})

		expect(afterSecondMove.groupsById['LittlePigs:4,4']).toMatchObject({
			groupName: 'Little Pigs group A',
			unitType: 'LittlePigs',
			position: { q: 4, r: 4 },
			unitIds: ['pigs-3'],
		})
		expect(afterSecondMove.groupsById['LittlePigs:5,4']).toMatchObject({
			groupName: 'Little Pigs group B',
			unitType: 'LittlePigs',
			position: { q: 5, r: 4 },
			unitIds: ['pigs-1', 'pigs-2'],
		})

		const afterThirdMove = relocateStackRosterUnits(afterSecondMove, {
			movedUnitIds: ['pigs-3'],
			unitType: 'LittlePigs',
			destinationPosition: { q: 5, r: 4 },
			destinationGroupName: 'Little Pigs group B',
		})

		expect(afterThirdMove.groupsById['LittlePigs:5,4']).toMatchObject({
			groupName: 'Little Pigs group B',
			unitType: 'LittlePigs',
			position: { q: 5, r: 4 },
			unitIds: ['pigs-1', 'pigs-2', 'pigs-3'],
		})
	})

	it('reconciles move lifecycle with deterministic split naming from a base seed name', () => {
		const roster: StackRosterState = {
			groupsById: {
				'LittlePigs:0,0': {
					groupName: 'Little Pigs group',
					unitType: 'LittlePigs',
					position: { q: 0, r: 0 },
					unitIds: ['p1', 'p2'],
				},
			},
			unitsById: {
				p1: { id: 'p1', status: 'operational', friendlyName: 'Little Pigs 1', squads: 2 },
				p2: { id: 'p2', status: 'operational', friendlyName: 'Little Pigs 2', squads: 3 },
			},
		}

		const reconciled = reconcileStackRosterMoveLifecycle({
			stackRoster: roster,
			stackNaming: {
				groupsInUse: [{ groupKey: 'LittlePigs:0,0', groupName: 'Little Pigs group', unitType: 'LittlePigs' }],
				usedGroupNames: ['Little Pigs group'],
			},
			defenders: {
				p1: { id: 'p1', type: 'LittlePigs', position: { q: 1, r: 0 }, status: 'operational', friendlyName: 'Little Pigs 1', squads: 2 },
				p2: { id: 'p2', type: 'LittlePigs', position: { q: 0, r: 0 }, status: 'operational', friendlyName: 'Little Pigs 2', squads: 3 },
			},
			movedUnitId: 'p1',
			unitType: 'LittlePigs',
			destinationPosition: { q: 1, r: 0 },
			movedUnitFriendlyName: 'Little Pigs 1',
		})

		expect(reconciled.stackRoster.groupsById['LittlePigs:0,0']).toMatchObject({
			groupName: 'Little Pigs group',
			unitIds: ['p2'],
		})
		expect(reconciled.stackRoster.groupsById['LittlePigs:1,0']).toMatchObject({
			groupName: 'Little Pigs group 2',
			unitIds: ['p1'],
		})
		expect(reconciled.stackNaming.groupsInUse).toEqual([
			{ groupKey: 'LittlePigs:0,0', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
			{ groupKey: 'LittlePigs:1,0', groupName: 'Little Pigs group 2', unitType: 'LittlePigs' },
		])
		expect(reconciled.stackNaming.usedGroupNames).toEqual(['Little Pigs group 1', 'Little Pigs group 2'])
	})

	it('reconciles move lifecycle by preserving an existing destination stack name', () => {
		const roster: StackRosterState = {
			groupsById: {
				'LittlePigs:0,0': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 0, r: 0 },
					unitIds: ['p1', 'p2'],
				},
				'LittlePigs:4,0': {
					groupName: 'Little Pigs group 2',
					unitType: 'LittlePigs',
					position: { q: 4, r: 0 },
					unitIds: ['p5'],
				},
			},
			unitsById: {
				p1: { id: 'p1', status: 'operational', friendlyName: 'Little Pigs 1', squads: 2 },
				p2: { id: 'p2', status: 'operational', friendlyName: 'Little Pigs 2', squads: 3 },
				p5: { id: 'p5', status: 'operational', friendlyName: 'Little Pigs 5', squads: 2 },
			},
		}

		const reconciled = reconcileStackRosterMoveLifecycle({
			stackRoster: roster,
			stackNaming: {
				groupsInUse: [
					{ groupKey: 'LittlePigs:0,0', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
					{ groupKey: 'LittlePigs:4,0', groupName: 'Little Pigs group 2', unitType: 'LittlePigs' },
				],
				usedGroupNames: ['Little Pigs group 1', 'Little Pigs group 2'],
			},
			defenders: {
				p1: { id: 'p1', type: 'LittlePigs', position: { q: 4, r: 0 }, status: 'operational', friendlyName: 'Little Pigs 1', squads: 2 },
				p2: { id: 'p2', type: 'LittlePigs', position: { q: 0, r: 0 }, status: 'operational', friendlyName: 'Little Pigs 2', squads: 3 },
				p5: { id: 'p5', type: 'LittlePigs', position: { q: 4, r: 0 }, status: 'operational', friendlyName: 'Little Pigs 5', squads: 2 },
			},
			movedUnitId: 'p1',
			unitType: 'LittlePigs',
			destinationPosition: { q: 4, r: 0 },
			movedUnitFriendlyName: 'Little Pigs 1',
		})

		expect(reconciled.stackRoster.groupsById['LittlePigs:4,0']).toMatchObject({
			groupName: 'Little Pigs group 2',
			unitIds: ['p5', 'p1'],
		})
		expect(reconciled.stackNaming.groupsInUse).toEqual(
			expect.arrayContaining([
				{ groupKey: 'LittlePigs:4,0', groupName: 'Little Pigs group 2', unitType: 'LittlePigs' },
			]),
		)
		expect(reconciled.stackNaming.usedGroupNames).toEqual(['Little Pigs group 1', 'Little Pigs group 2'])
	})
})
