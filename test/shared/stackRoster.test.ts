import { describe, expect, it } from 'vitest'

import { buildStackGroupKey, buildStackRosterIndex, validateStackRoster } from '#shared/stackRoster'
import type { StackRosterState } from '#shared/stackRoster'

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
						{ id: 'pigs-1', status: 'operational', friendlyName: 'Little Pigs 1', squads: 1 },
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
})