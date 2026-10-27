import { describe, expect, it } from 'vitest'

import {
	buildStackRosterFromUnits,
	buildStackRosterIndex,
	canonicalizeStackRoster,
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
} from '#shared/stackRoster/index'
import type { DefenderMap, StackRosterState } from '#shared/types/index'
import { makeDefender, makeDefenderMap, makeStackFixture, makeStackGroup } from '#test/utils/gameStateUtils'

describe('stack roster', () => {
	it('flags structural contract violations', () => {
		const defenders: DefenderMap = {}
		const roster: StackRosterState = {
			nextGroupOrdinal: 1,
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
		}

		const issues = validateStackRoster(roster, defenders)

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

		it('flags non-canonical group IDs and allocator counters', () => {
			const issues = validateStackRoster(
				{
					nextGroupOrdinal: 3,
					groupsById: {
						'little-pigs:4,4': makeStackGroup(),
						'group-3': makeStackGroup({ unitIds: ['pigs-3', 'pigs-4'] }),
					},
				},
				makeDefenderMap({
					'pigs-1': { typeId: 'LittlePigs', position: { q: 1, r: 1 } },
					'pigs-2': { typeId: 'LittlePigs', position: { q: 1, r: 1 } },
					'pigs-3': { typeId: 'LittlePigs', position: { q: 1, r: 1 } },
					'pigs-4': { typeId: 'LittlePigs', position: { q: 1, r: 1 } },
				}),
			)

			expect(issues).toEqual(expect.arrayContaining([
				expect.objectContaining({ code: 'INVALID_GROUP_ID', groupId: 'little-pigs:4,4' }),
				expect.objectContaining({ code: 'INVALID_NEXT_GROUP_ORDINAL', groupId: 'stackRoster' }),
			]))
		})

	it('rejects non-canonical naming keys in the roster naming seed', () => {
		const fixture = makeStackFixture({
			groups: {
				'group-1': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
			},
		})

		expect(() => refreshStackRosterNamingSnapshot(
			fixture.stackRoster,
			{
				groupsInUse: [{ groupId: 'little-pigs:4,4', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' }],
				usedGroupNames: ['Little Pigs group 1'],
			},
			fixture.defenders,
		)).toThrow('canonical group ID')
	})

	it('builds derived group and unit views from the minimal contract', () => {
		const fixture = makeStackFixture({
			groups: {
				'group-1': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
			},
		})
		const { defenders, stackRoster: roster } = fixture

		const rosterIndex = buildStackRosterIndex(roster, defenders)

		expect(rosterIndex.groupsById['group-1']).toMatchObject({
			groupId: 'group-1',
			groupName: 'Little Pigs group 1',
			unitIds: ['pigs-1', 'pigs-2'],
		})
		expect(rosterIndex.getGroupUnits('group-1')).toHaveLength(2)
		expect(rosterIndex.getUnitGroup('pigs-2')).toMatchObject({
			groupId: 'group-1',
			groupName: 'Little Pigs group 1',
			unitType: 'LittlePigs',
			position: { q: 4, r: 4 },
		})
		expect(rosterIndex.derivedUnitsById['pigs-2']).toMatchObject({
			unitId: 'pigs-2',
			groupId: 'group-1',
			unitType: 'LittlePigs',
			position: { q: 4, r: 4 },
			friendlyName: 'Little Pigs 2',
		})

		delete rosterIndex.groupsById['group-1']
		expect(rosterIndex.getUnitGroup('pigs-2')).toBeNull()
	})

	it('resolves grouped defenders by canonical unitId when map keys differ', () => {
		const rosterIndex = buildStackRosterIndex(
			{
				nextGroupOrdinal: 1,
				groupsById: {
					'group-2': {
						groupName: 'Little Pigs group 1',
						unitType: 'LittlePigs',
						position: { q: 4, r: 4 },
						unitIds: ['pigs-4'],
					},
				},
			},
			{ 'roster-entry-4': makeDefender({ unitId: 'pigs-4', typeId: 'LittlePigs', position: { q: 4, r: 4 } }) },
		)

		expect(rosterIndex.getUnitGroup('pigs-4')).toMatchObject({ groupId: 'group-2' })
	})

	it('round-trips through JSON serialization without losing the roster shape', () => {
		const roster: StackRosterState = {
			nextGroupOrdinal: 1,
			groupsById: {
				'group-1': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1'],
				},
			},
		}

		const serialized = JSON.stringify(roster)
		const restored = JSON.parse(serialized) as StackRosterState
		const defenders = makeDefenderMap({
			'pigs-1': { typeId: 'LittlePigs', position: { q: 4, r: 4 }, friendlyName: 'Little Pigs 1' },
		})

		expect(restored).toEqual(roster)
		expect(buildStackRosterIndex(restored, defenders).groupsById['group-1']?.groupName).toBe('Little Pigs group 1')
	})

	it('returns empty derived views for an empty roster', () => {
		const rosterIndex = buildStackRosterIndex(undefined, undefined)

		expect(rosterIndex.groupsById).toEqual({})
		expect(rosterIndex.derivedUnitsById).toEqual({})
		expect(rosterIndex.getGroupUnits('missing')).toEqual([])
		expect(rosterIndex.getUnitGroup('missing')).toBeNull()
	})

	it('builds roster groups for stackable co-located unit clusters only', () => {
		expect(buildStackRosterFromUnits([
			makeDefender({ unitId: 'pigs-1', typeId: 'LittlePigs', position: { q: 4, r: 4 }, friendlyName: 'Little Pigs 1' }),
			makeDefender({ unitId: 'pigs-2', typeId: 'LittlePigs', position: { q: 4, r: 4 }, friendlyName: 'Little Pigs 2' }),
			makeDefender({ unitId: 'wolf-1', typeId: 'BigBadWolf', position: { q: 7, r: 7 }, friendlyName: 'Big Bad Wolf 1' }),
		])).toEqual({
			nextGroupOrdinal: 2,
			groupsById: {
				'group-1': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
			},
		})
	})

	it('ignores non-stackable units when building stack roster groups', () => {
		const roster = buildStackRosterFromUnits([
			makeDefender({ unitId: 'wolf-1', typeId: 'BigBadWolf', position: { q: 7, r: 7 }, friendlyName: 'Big Bad Wolf 1' }),
			makeDefender({ unitId: 'puss-1', typeId: 'Puss', position: { q: 3, r: 5 }, friendlyName: 'Puss 1' }),
		])

		expect(roster).toEqual({
			nextGroupOrdinal: 1,
			groupsById: {},
		})
	})

	it('preserves explicit grouped units without squashing them back into squads', () => {
		const roster = buildStackRosterFromUnits([
			makeDefender({ unitId: 'pigs-1', typeId: 'LittlePigs', position: { q: 4, r: 4 }, friendlyName: 'Little Pigs 1' }),
			makeDefender({ unitId: 'pigs-2', typeId: 'LittlePigs', position: { q: 4, r: 4 }, friendlyName: 'Little Pigs 2' }),
		])

		expect(roster).toEqual({
			nextGroupOrdinal: 2,
			groupsById: {
				'group-1': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
			},
		})
		expect(roster.groupsById['group-1']?.unitIds).toHaveLength(2)
	})

	it('throws when a roster group has the wrong json shape', () => {
		expect(() => buildStackRosterIndex({
			nextGroupOrdinal: 1,
			groupsById: {
				bad: {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: null as unknown as never,
				},
			},
		}, {})).toThrow('Invalid stack roster group shape')
	})

	it('throws when a defender unit entry has the wrong shape for a grouped unit', () => {
		expect(() => buildStackRosterIndex(
			{
				nextGroupOrdinal: 1,
				groupsById: {
					bad: {
						groupName: 'Little Pigs group 1',
						unitType: 'LittlePigs',
						position: { q: 4, r: 4 },
						unitIds: ['pigs-1', 'pigs-2'],
					},
				},
			},
			{
				...makeDefenderMap({ 'pigs-1': { typeId: 'LittlePigs', position: { q: 4, r: 4 } } }),
				'pigs-2': null as unknown as never,
			},
		)).toThrow('Invalid stack roster unit shape for bad')
	})

	it('throws when a grouped unit is missing from defenders', () => {
		expect(() => buildStackRosterIndex(
			{
				nextGroupOrdinal: 1,
				groupsById: {
					bad: {
						groupName: 'Little Pigs group 1',
						unitType: 'LittlePigs',
						position: { q: 4, r: 4 },
						unitIds: ['pigs-1'],
					},
				},
			},
			{},
		)).toThrow(/missing.*pigs-1/i)
	})

	it('derives the minimal roster contract from defender units', () => {
		const roster = buildStackRosterFromUnits([
			makeDefender({ unitId: 'pigs-1', typeId: 'LittlePigs', position: { q: 4, r: 4 }, friendlyName: 'Little Pigs 1' }),
			makeDefender({ unitId: 'pigs-2', typeId: 'LittlePigs', position: { q: 4, r: 4 }, friendlyName: 'Little Pigs 2' }),
			makeDefender({ unitId: 'wolf-1', typeId: 'BigBadWolf', position: { q: 7, r: 7 }, state: 'destroyed', friendlyName: 'Big Bad Wolf 1' }),
		])

		expect(roster).toEqual({
			nextGroupOrdinal: 2,
			groupsById: {
				'group-1': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
			},
		})
	})

	it('parses canonical group membership from unitIds-only records', () => {
		const roster: StackRosterState = {
			nextGroupOrdinal: 1,
			groupsById: {
				'group-2': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
			},
		}
		const defenders = makeDefenderMap({
			'pigs-1': { typeId: 'LittlePigs', position: { q: 4, r: 4 } },
			'pigs-2': { typeId: 'LittlePigs', position: { q: 4, r: 4 } },
		})

		expect(() => buildStackRosterIndex(roster, defenders)).not.toThrow()
		expect(buildStackRosterIndex(roster, defenders).groupsById['group-2']?.unitIds).toEqual(['pigs-1', 'pigs-2'])
	})

	it('refreshes stack naming from the roster-owned adapter', () => {
		const fixture = makeStackFixture({
			groups: {
				'group-1': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
				'group-2': {
					groupName: 'Little Pigs group 2',
					unitType: 'LittlePigs',
					position: { q: 5, r: 4 },
					unitIds: ['pigs-3'],
				},
			},
		})
		const { defenders, stackRoster: roster } = fixture

		expect(refreshStackRosterNamingSnapshot(roster, undefined, defenders)).toMatchObject({
			groupsInUse: [
				{ groupId: 'group-1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
			],
			usedGroupNames: ['Little Pigs group 1'],
		})
	})

	it('prunes singleton groups when canonicalizing roster and naming state', () => {
		const fixture = makeStackFixture({
			groups: {
				'group-1': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
				'group-2': {
					groupName: 'Little Pigs group 2',
					unitType: 'LittlePigs',
					position: { q: 5, r: 4 },
					unitIds: ['pigs-3'],
				},
			},
		})

		const canonical = canonicalizeStackRoster(fixture.stackRoster, undefined, fixture.defenders)

		expect(canonical.stackRoster.groupsById).toEqual({
			'group-1': fixture.stackRoster.groupsById['group-1'],
		})
		expect(canonical.stackNaming.groupsInUse).toEqual([
			{ groupId: 'group-1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
		])
		expect(canonical.stackNaming.usedGroupNames).toEqual(['Little Pigs group 1'])
	})

	it('fails refresh when a grouped unit is missing from defenders', () => {
		expect(() => refreshStackRosterNamingSnapshot(
			{
				nextGroupOrdinal: 1,
				groupsById: {
					'group-1': {
						groupName: 'Little Pigs group 1',
						unitType: 'LittlePigs',
						position: { q: 4, r: 4 },
						unitIds: ['pigs-1', 'pigs-2'],
					},
				},
			},
			undefined,
			makeDefenderMap({ 'pigs-1': { typeId: 'LittlePigs', position: { q: 4, r: 4 } } }),
		)).toThrow(/missing.*pigs-2/i)
	})

	it('validates canonical consistency between defenders and group membership', () => {
		const issues = validateStackRosterConsistency(
			makeDefenderMap({
				'pigs-1': { typeId: 'LittlePigs', position: { q: 4, r: 4 } },
				'wolf-1': { typeId: 'BigBadWolf', position: { q: 4, r: 5 } },
			}),
			{
				nextGroupOrdinal: 1,
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
			makeDefenderMap({
				'pigs-1': { typeId: 'LittlePigs', position: { q: 4, r: 4 } },
				'pigs-5': { typeId: 'LittlePigs', position: { q: 4, r: 4 } },
			}),
			{
				nextGroupOrdinal: 1,
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

	it('filters group membership to only units present in defenders', () => {
		const projected = expandStackRosterGroups(
			{
				nextGroupOrdinal: 1,
				groupsById: {
					'g-1': {
						groupName: 'Little Pigs group 1',
						unitType: 'LittlePigs',
						position: { q: 4, r: 4 },
						unitIds: ['pigs-2', 'missing-1', 'pigs-1'],
					},
				},
			},
			makeDefenderMap({
				'pigs-1': { typeId: 'LittlePigs', position: { q: 4, r: 4 } },
				'pigs-2': { typeId: 'LittlePigs', position: { q: 4, r: 4 }, state: 'disabled' },
			}),
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
			nextGroupOrdinal: 3,
			groupsById: {
				'group-1': {
					groupName: 'Little Pigs group A',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
				'group-2': {
					groupName: 'Little Pigs group B',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-3'],
				},
			},
		}
		const merged = mergeStackRosterGroups(initialRoster, 'group-1', ['group-2'])
		expect(merged.groupsById['group-1']?.unitIds).toEqual(['pigs-1', 'pigs-2', 'pigs-3'])
		expect(merged.groupsById['group-2']).toBeUndefined()

		const split = splitStackRosterGroup(merged, {
			groupId: 'group-1',
			newGroupName: 'Little Pigs group C',
			movedUnitIds: ['pigs-2'],
			newPosition: { q: 5, r: 4 },
		})

		expect(split.groupsById['group-1']?.unitIds).toEqual(['pigs-1', 'pigs-3'])
		expect(split.groupsById['group-3']).toBeUndefined()

		const retired = retireStackRosterGroup(split, 'group-3')
		expect(retired.groupsById['group-3']).toBeUndefined()
	})

	it('preserves opaque group identity when moving an intact group', () => {
		const initialRoster = {
			nextGroupOrdinal: 3,
			groupsById: {
				'group-1': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
			},
		} as StackRosterState

		const moved = moveStackRosterGroup(initialRoster, {
			sourceGroupId: 'group-1',
			destinationGroupId: 'group-99',
			movedUnitIds: ['pigs-1', 'pigs-2'],
			destinationPosition: { q: 8, r: 8 },
		})

		expect(moved.nextGroupOrdinal).toBe(3)
		expect(moved.groupsById['group-1']).toMatchObject({
			position: { q: 8, r: 8 },
			unitIds: ['pigs-1', 'pigs-2'],
		})
		expect(moved.groupsById['group-99']).toBeUndefined()
	})

	it('allocates the next group ID and retires singleton remnants when splitting', () => {
		const initialRoster = {
			nextGroupOrdinal: 3,
			groupsById: {
				'group-1': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2', 'pigs-3'],
				},
			},
		} as StackRosterState

		const split = splitStackRosterGroup(initialRoster, {
			groupId: 'group-1',
			movedUnitIds: ['pigs-1', 'pigs-2'],
			newPosition: { q: 8, r: 8 },
		})

		expect(split.nextGroupOrdinal).toBe(4)
		expect(split.groupsById['group-1']).toBeUndefined()
		expect(split.groupsById['group-3']).toMatchObject({
			position: { q: 8, r: 8 },
			unitIds: ['pigs-1', 'pigs-2'],
		})
		expect(split.groupsById['group-99']).toBeUndefined()
	})

	it('retains the lowest ordinal group ID when merging groups', () => {
		const initialRoster = {
			nextGroupOrdinal: 3,
			groupsById: {
				'group-1': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
				'group-2': {
					groupName: 'Little Pigs group 2',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-3', 'pigs-4'],
				},
			},
		} as StackRosterState

		const merged = mergeStackRosterGroups(initialRoster, 'group-2', ['group-1'])

		expect(merged.nextGroupOrdinal).toBe(3)
		expect(merged.groupsById['group-1']?.unitIds).toEqual(expect.arrayContaining(['pigs-1', 'pigs-2', 'pigs-3', 'pigs-4']))
		expect(merged.groupsById['group-1']?.unitIds).toHaveLength(4)
		expect(merged.groupsById['group-2']).toBeUndefined()
	})

	it('preserves member identity through split and merge regardless of layout order', () => {
		const initialRoster: StackRosterState = {
			nextGroupOrdinal: 3,
			groupsById: {
				'group-1': {
					groupName: 'Little Pigs group A',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2', 'pigs-3'],
				},
				'group-2': {
					groupName: 'Little Pigs group B',
					unitType: 'LittlePigs',
					position: { q: 9, r: 9 },
					unitIds: ['pigs-4', 'pigs-5'],
				},
			},
		}
		const split = splitStackRosterGroup(initialRoster, {
			groupId: 'group-1',
			newGroupName: 'Little Pigs group C',
			movedUnitIds: ['pigs-3', 'pigs-1'],
			newPosition: { q: 9, r: 9 },
		})
		const merged = mergeStackRosterGroups(split, 'group-3', ['group-2'])
		const mergedUnitIds = merged.groupsById['group-2']?.unitIds ?? []

		expect(mergedUnitIds).toHaveLength(4)
		expect(new Set(mergedUnitIds)).toEqual(new Set(['pigs-1', 'pigs-3', 'pigs-4', 'pigs-5']))
		expect(merged.groupsById['group-1']).toBeUndefined()
		expect(merged.groupsById['group-3']).toBeUndefined()

		const rosterIndex = buildStackRosterIndex(merged, {
			'layout-2': makeDefender({ unitId: 'pigs-2', typeId: 'LittlePigs', position: { q: 9, r: 9 } }),
			'layout-4': makeDefender({ unitId: 'pigs-4', typeId: 'LittlePigs', position: { q: 9, r: 9 } }),
			'layout-5': makeDefender({ unitId: 'pigs-5', typeId: 'LittlePigs', position: { q: 9, r: 9 } }),
			'layout-1': makeDefender({ unitId: 'pigs-1', typeId: 'LittlePigs', position: { q: 9, r: 9 } }),
			'layout-3': makeDefender({ unitId: 'pigs-3', typeId: 'LittlePigs', position: { q: 9, r: 9 } }),
		})

		for (const unitId of mergedUnitIds) {
			expect(rosterIndex.getUnitGroup(unitId)?.groupId).toBe('group-2')
		}
	})

	it('moves a single selected member without inventing a new group name', () => {
		const initialRoster: StackRosterState = {
			nextGroupOrdinal: 1,
			groupsById: {
				'g-a': {
					groupName: 'Little Pigs group A',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2', 'pigs-3'],
				},
			},
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

	it('creates a group name only when two unnamed singleton units combine', () => {
		const firstMove = relocateStackRosterUnits({
			nextGroupOrdinal: 1,
			groupsById: {},
		}, {
			movedUnitIds: ['pigs-1', 'pigs-2'],
			unitType: 'LittlePigs',
			destinationPosition: { q: 5, r: 4 },
			destinationGroupName: undefined,
		})

		expect(firstMove.groupsById['group-1']).toMatchObject({
			unitIds: ['pigs-1', 'pigs-2'],
		})
		expect(firstMove.groupsById['group-1']).not.toHaveProperty('groupName')
	})

	it('does not name a singleton created by splitting a group', () => {
		const split = splitStackRosterGroup({
			nextGroupOrdinal: 1,
			groupsById: {
				'group-1': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
			},
		}, {
			groupId: 'group-1',
			newGroupName: 'Little Pigs group 2',
			movedUnitIds: ['pigs-1'],
		})

		expect(split.groupsById['group-1']).toBeUndefined()
		expect(split.groupsById['group-2']).toBeUndefined()
	})

	it('keeps a stackable source group when only one member remains after a move', () => {
		const initialRoster: StackRosterState = {
			nextGroupOrdinal: 2,
			groupsById: {
				'group-1': {
					groupName: 'Little Pigs group A',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
			},
		}
		const moved = relocateStackRosterUnits(initialRoster, {
			movedUnitIds: ['pigs-1'],
			unitType: 'LittlePigs',
			destinationPosition: { q: 5, r: 4 },
			destinationGroupName: 'Little Pigs group B',
		})

		expect(moved.groupsById).toEqual({})
	})

	it('advances the group ordinal when a singleton joins an ungrouped destination singleton', () => {
		const initialRoster: StackRosterState = {
			nextGroupOrdinal: 2,
			groupsById: {
				'group-1': {
					groupName: 'Little Pigs group A',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
			},
		}
		const moved = relocateStackRosterUnits(initialRoster, {
			movedUnitIds: ['pigs-1'],
			unitType: 'LittlePigs',
			destinationPosition: { q: 5, r: 4 },
			destinationGroupName: 'Little Pigs group B',
			destinationUnitIds: ['pigs-3'],
		})
		const validationIssues = validateStackRoster(moved, makeDefenderMap({
			'pigs-1': { typeId: 'LittlePigs', position: { q: 5, r: 4 } },
			'pigs-2': { typeId: 'LittlePigs', position: { q: 4, r: 4 } },
			'pigs-3': { typeId: 'LittlePigs', position: { q: 5, r: 4 } },
		}))

		expect(moved.nextGroupOrdinal).toBe(3)
		expect(moved.groupsById['group-2']?.unitIds).toEqual(['pigs-3', 'pigs-1'])
		expect(validationIssues).toEqual([])
	})

	it('merges an ungrouped moved unit into an existing destination stack', () => {
		const initialRoster: StackRosterState = {
			nextGroupOrdinal: 2,
			groupsById: {
				'group-1': {
					groupName: 'Little Pigs group B',
					unitType: 'LittlePigs',
					position: { q: 5, r: 4 },
					unitIds: ['pigs-2', 'pigs-3'],
				},
			},
		}
		const moved = relocateStackRosterUnits(initialRoster, {
			movedUnitIds: ['pigs-1'],
			unitType: 'LittlePigs',
			destinationPosition: { q: 5, r: 4 },
			destinationGroupName: 'Little Pigs group B',
		})

		expect(moved.groupsById['group-1']).toMatchObject({
			groupName: 'Little Pigs group B',
			unitType: 'LittlePigs',
			position: { q: 5, r: 4 },
			unitIds: ['pigs-2', 'pigs-3', 'pigs-1'],
		})
	})

	it('keeps a stackable singleton destination so later movers can reform the stack', () => {
		const initialRoster: StackRosterState = {
			nextGroupOrdinal: 2,
			groupsById: {
				'group-1': {
					groupName: 'Little Pigs group A',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2', 'pigs-3'],
				},
			},
		}
		const afterFirstMove = relocateStackRosterUnits(initialRoster, {
			movedUnitIds: ['pigs-1'],
			unitType: 'LittlePigs',
			destinationPosition: { q: 5, r: 4 },
			destinationGroupName: 'Little Pigs group B',
		})

		expect(afterFirstMove.groupsById['group-1']?.unitIds).toEqual(['pigs-2', 'pigs-3'])
		expect(afterFirstMove.groupsById).toEqual({
			'group-1': expect.objectContaining({ unitIds: ['pigs-2', 'pigs-3'] }),
		})

		const afterSecondMove = relocateStackRosterUnits(afterFirstMove, {
			movedUnitIds: ['pigs-2'],
			unitType: 'LittlePigs',
			destinationPosition: { q: 5, r: 4 },
			destinationGroupName: 'Little Pigs group B',
		})

		expect(afterSecondMove.groupsById).toEqual({})

		const afterThirdMove = relocateStackRosterUnits(afterSecondMove, {
			movedUnitIds: ['pigs-3'],
			unitType: 'LittlePigs',
			destinationPosition: { q: 5, r: 4 },
			destinationGroupName: 'Little Pigs group B',
		})

		expect(afterThirdMove.groupsById).toEqual({})
	})

	it('reconciles move lifecycle with deterministic split naming from a base seed name', () => {
		const roster: StackRosterState = {
			nextGroupOrdinal: 2,
			groupsById: {
				'group-1': {
					groupName: 'Little Pigs group',
					unitType: 'LittlePigs',
					position: { q: 0, r: 0 },
					unitIds: ['p1', 'p2'],
				},
			},
		}

		const reconciled = reconcileStackRosterMoveLifecycle({
			stackRoster: roster,
			stackNaming: {
				groupsInUse: [{ groupId: 'group-1', groupName: 'Little Pigs group', unitType: 'LittlePigs' }],
				usedGroupNames: ['Little Pigs group'],
			},
			defenders: makeDefenderMap({
				p1: { typeId: 'LittlePigs', position: { q: 0, r: 0 } },
				p2: { typeId: 'LittlePigs', position: { q: 0, r: 0 } },
			}),
			movedUnitId: 'p1',
			unitType: 'LittlePigs',
			destinationPosition: { q: 1, r: 0 },
			movedUnitFriendlyName: 'Little Pigs 1',
		})

		expect(reconciled.stackRoster.groupsById).toEqual({})
		expect(reconciled.destinationGroupId).toBe('group-2')
		expect(reconciled.stackNaming.groupsInUse).toEqual([])
		expect(reconciled.stackNaming.usedGroupNames).toEqual(['Little Pigs group'])
	})

	it('reconciles move lifecycle by preserving the named multi-unit source', () => {
		const roster: StackRosterState = {
			nextGroupOrdinal: 3,
			groupsById: {
				'group-1': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 0, r: 0 },
					unitIds: ['p1', 'p2'],
				},
				'group-2': {
					groupName: 'Little Pigs group 2',
					unitType: 'LittlePigs',
					position: { q: 4, r: 0 },
					unitIds: ['p5'],
				},
			},
		}

		const reconciled = reconcileStackRosterMoveLifecycle({
			stackRoster: roster,
			stackNaming: {
				groupsInUse: [
					{ groupId: 'group-1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
					{ groupId: 'group-2', groupName: 'Little Pigs group 2', unitType: 'LittlePigs' },
				],
				usedGroupNames: ['Little Pigs group 1', 'Little Pigs group 2'],
			},
			defenders: makeDefenderMap({
				p1: { typeId: 'LittlePigs', position: { q: 0, r: 0 } },
				p2: { typeId: 'LittlePigs', position: { q: 0, r: 0 } },
				p5: { typeId: 'LittlePigs', position: { q: 4, r: 0 } },
			}),
			movedUnitId: 'p1',
			unitType: 'LittlePigs',
			destinationPosition: { q: 4, r: 0 },
			movedUnitFriendlyName: 'Little Pigs 1',
		})

		expect(reconciled.stackRoster.groupsById['group-2']).toMatchObject({
			groupName: 'Little Pigs group 3',
			unitIds: ['p5', 'p1'],
		})
		expect(reconciled.stackNaming.groupsInUse).toEqual(
			expect.arrayContaining([
				{ groupId: 'group-2', groupName: 'Little Pigs group 3', unitType: 'LittlePigs' },
			]),
		)
		expect(reconciled.stackNaming.usedGroupNames).toEqual(['Little Pigs group 1', 'Little Pigs group 2', 'Little Pigs group 3'])
	})

	it('preserves the group name when the whole group moves together', () => {
		const reconciled = reconcileStackRosterMoveLifecycle({
			stackRoster: {
				nextGroupOrdinal: 4,
				groupsById: {
					'group-3': {
						groupName: 'Little Pigs group 3',
						unitType: 'LittlePigs',
						position: { q: 0, r: 0 },
						unitIds: ['p1', 'p2'],
					},
				},
			},
			stackNaming: {
				groupsInUse: [{ groupId: 'group-3', groupName: 'Little Pigs group 3', unitType: 'LittlePigs' }],
				usedGroupNames: ['Little Pigs group 1', 'Little Pigs group 2', 'Little Pigs group 3'],
			},
			defenders: makeDefenderMap({
				p1: { typeId: 'LittlePigs', position: { q: 0, r: 0 } },
				p2: { typeId: 'LittlePigs', position: { q: 0, r: 0 } },
			}),
			movedUnitId: 'p1',
			movedUnitIds: ['p1', 'p2'],
			unitType: 'LittlePigs',
			destinationPosition: { q: 2, r: 1 },
		})

		expect(reconciled.stackRoster.groupsById['group-3']).toMatchObject({
			groupName: 'Little Pigs group 3',
			unitIds: ['p1', 'p2'],
		})
		expect(reconciled.stackNaming.usedGroupNames).toEqual(['Little Pigs group 1', 'Little Pigs group 2', 'Little Pigs group 3'])
	})
})
