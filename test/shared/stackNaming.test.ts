import { describe, expect, it } from 'vitest'

import {
	createStackNamingEngine,
	refreshStackNamingSnapshotFromRoster,
	resolveStackLabel,
	resolveStackLabelFromSnapshot,
	resolveStackUnitName,
} from '#shared/stackNaming/index'
import { makeDefender, makeStackFixture } from '#test/utils/gameStateUtils'

describe('stack naming', () => {
	it('resolves canonical unit names from unit definitions', () => {
		expect(resolveStackUnitName('LittlePigs', 'pigs-1')).toBe('Little Pigs 1')
		expect(resolveStackUnitName('BigBadWolf', 'wolf-2')).toBe('Big Bad Wolf 2')
		expect(resolveStackUnitName('LittlePigs', 'pigs-1', 'Little Pigs 9')).toBe('Little Pigs 9')
		expect(resolveStackUnitName('Puss', 'puss-1', '   ')).toBe('Puss 1')
		expect(resolveStackUnitName('MysteryUnit', undefined)).toBe('MysteryUnit')
	})

	it('uses global group ordinals and includes the unit type in the group name', () => {
		const engine = createStackNamingEngine()

		expect(engine.resolveGroupName('group-1', 'LittlePigs', 'pigs-1', undefined, 2)).toBe('Group 1 - [Little Pigs]')
		expect(engine.resolveGroupName('group-2', 'BigBadWolf', 'wolf-1', undefined, 2)).toBe('Group 2 - [Big Bad Wolf]')
	})

	it('allocates unique stack names and does not recycle them', () => {
		const engine = createStackNamingEngine()

		expect(resolveStackLabel('LittlePigs', 'pigs-1', undefined, 3)).toBe('Little Pigs group')
		expect(resolveStackLabel('LittlePigs', 'pigs-1', undefined, 1)).toBe('Little Pigs group')
		expect(engine.resolveGroupName('group-1', 'LittlePigs', 'pigs-1', undefined, 3)).toBe('Group 1 - [Little Pigs]')
		expect(engine.resolveGroupName('group-2', 'LittlePigs', 'pigs-2', undefined, 2)).toBe('Group 2 - [Little Pigs]')
		expect(engine.resolveGroupName('group-2', 'LittlePigs', 'pigs-2', undefined, 2)).toBe('Group 2 - [Little Pigs]')

		engine.releaseGroup('group-1')
		expect(engine.resolveGroupName('group-3', 'LittlePigs', 'pigs-3', undefined, 4)).toBe('Group 3 - [Little Pigs]')
	})

	it('reuses the same group name for the same key', () => {
		const engine = createStackNamingEngine()

		expect(engine.resolveGroupName('group-1', 'BigBadWolf', 'wolf-1', undefined, 2)).toBe('Group 1 - [Big Bad Wolf]')
		expect(engine.resolveGroupName('group-1', 'BigBadWolf', 'wolf-2', undefined, 2)).toBe('Group 1 - [Big Bad Wolf]')
	})

	it('names a transient group immediately and keeps that name through a merge', () => {
		const engine = createStackNamingEngine()

		const transientGroupName = engine.resolveGroupName('group-1', 'LittlePigs', 'pigs-1', undefined, 2)
		expect(transientGroupName).toBe('Group 1 - [Little Pigs]')
		expect(engine.resolveGroupName('group-1', 'LittlePigs', 'pigs-2', undefined, 3)).toBe('Group 1 - [Little Pigs]')
		expect(engine.snapshot()).toMatchObject({
			groupsInUse: [{ groupId: 'group-1', groupName: 'Group 1 - [Little Pigs]', unitType: 'LittlePigs' }],
			usedGroupNames: ['Group 1 - [Little Pigs]'],
		})
	})

	it('refreshes active groups and drops missing ones from the snapshot', () => {
		const fixture = makeStackFixture({
			groups: {
				'group-1': {
					groupName: 'Group 1 - [Little Pigs]',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
				'group-2': {
					groupName: 'Group 2 - [Little Pigs]',
					unitType: 'LittlePigs',
					position: { q: 5, r: 5 },
					unitIds: ['pigs-3', 'pigs-4'],
				},
				'group-3': {
					groupName: 'Group 3 - [Big Bad Wolf]',
					unitType: 'BigBadWolf',
					position: { q: 7, r: 7 },
					unitIds: ['wolf-1'],
				},
			},
			unitOverrides: {
				'wolf-1': { state: 'destroyed' },
			},
		})
		const snapshot = refreshStackNamingSnapshotFromRoster(
			{
				groupsInUse: [
					{ groupId: 'group-1', groupName: 'Group 1 - [Little Pigs]', unitType: 'LittlePigs' },
					{ groupId: 'group-3', groupName: 'Group 3 - [Big Bad Wolf]', unitType: 'BigBadWolf' },
				],
				usedGroupNames: ['Group 1 - [Little Pigs]'],
			},
			fixture.stackRoster,
			Object.values(fixture.defenders),
		)

		expect(snapshot.groupsInUse).toHaveLength(2)
		expect(snapshot.groupsInUse.find((group) => group.groupId === 'group-1')).toMatchObject({
			groupId: 'group-1',
			groupName: 'Group 1 - [Little Pigs]',
			unitType: 'LittlePigs',
		})
		expect(snapshot.groupsInUse.find((group) => group.groupId === 'group-2')).toMatchObject({
			groupId: 'group-2',
			groupName: 'Group 2 - [Little Pigs]',
			unitType: 'LittlePigs',
		})
		expect(snapshot.usedGroupNames).toEqual([
			'Group 1 - [Little Pigs]',
			'Group 3 - [Big Bad Wolf]',
			'Group 2 - [Little Pigs]',
		])
		expect(snapshot.groupsInUse.some((group) => group.groupId === 'group-3')).toBe(false)
	})

	it('refreshes stack names from the authoritative roster without naming singleton groups', () => {
		const fixture = makeStackFixture({
			groups: {
				'group-1': {
					groupName: 'Group 1 - [Little Pigs]',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
				'group-2': {
					groupName: 'Group 2 - [Little Pigs]',
					unitType: 'LittlePigs',
					position: { q: 5, r: 4 },
					unitIds: ['pigs-3'],
				},
				'group-3': {
					groupName: 'Group 3 - [Big Bad Wolf]',
					unitType: 'BigBadWolf',
					position: { q: 7, r: 4 },
					unitIds: ['wolf-1'],
				},
			},
		})
		const snapshot = refreshStackNamingSnapshotFromRoster(
			{
				groupsInUse: [{ groupId: 'group-1', groupName: 'Group 1 - [Little Pigs]', unitType: 'LittlePigs' }],
				usedGroupNames: ['Group 1 - [Little Pigs]'],
			},
			fixture.stackRoster,
			Object.values(fixture.defenders),
		)

		expect(snapshot.groupsInUse).toHaveLength(1)
		expect(snapshot.groupsInUse[0]).toMatchObject({
			groupId: 'group-1',
			groupName: 'Group 1 - [Little Pigs]',
			unitType: 'LittlePigs',
		})
		expect(snapshot.usedGroupNames).toEqual(['Group 1 - [Little Pigs]'])
	})

	it('does not track a singleton as a named group', () => {
		const snapshot = refreshStackNamingSnapshotFromRoster(
			undefined,
			{
				nextGroupOrdinal: 2,
				groupsById: {
					'group-2': {
						groupName: 'Group 1 - [Little Pigs]',
						unitType: 'LittlePigs',
						position: { q: 4, r: 4 },
						unitIds: ['pigs-1'],
					},
				},
			},
			[makeDefender({ unitId: 'pigs-1', typeId: 'LittlePigs', position: { q: 4, r: 4 } })],
		)
		expect(snapshot.usedGroupNames).toEqual([])
	})

	it('preserves duplicate source IDs in an explicit split edge case', () => {
		const snapshot = refreshStackNamingSnapshotFromRoster(
			undefined,
			{
				nextGroupOrdinal: 4,
				groupsById: {
					'group-1': {
						groupName: 'Group 1 - [Little Pigs]',
						unitType: 'LittlePigs',
						position: { q: 4, r: 7 },
						unitIds: ['pigs-1'],
					},
					'group-2': {
						groupName: 'Group 2 - [Little Pigs]',
						unitType: 'LittlePigs',
						position: { q: 5, r: 7 },
						unitIds: ['pigs-3', 'pigs-4'],
					},
					'group-3': {
						groupName: 'Group 3 - [Little Pigs]',
						unitType: 'LittlePigs',
						position: { q: 5, r: 8 },
						unitIds: ['pigs-1', 'pigs-2'],
					},
				},
			},
			[
				makeDefender({ unitId: 'pigs-1', typeId: 'LittlePigs', position: { q: 4, r: 7 }, friendlyName: 'Little Pigs 1' }),
				makeDefender({ unitId: 'pigs-1', typeId: 'LittlePigs', position: { q: 5, r: 8 }, friendlyName: 'Little Pigs 1' }),
				makeDefender({ unitId: 'pigs-2', typeId: 'LittlePigs', position: { q: 5, r: 8 }, friendlyName: 'Little Pigs 2' }),
				makeDefender({ unitId: 'pigs-3', typeId: 'LittlePigs', position: { q: 5, r: 7 }, friendlyName: 'Little Pigs 3' }),
				makeDefender({ unitId: 'pigs-4', typeId: 'LittlePigs', position: { q: 5, r: 7 }, friendlyName: 'Little Pigs 4' }),
			],
		)

		expect(snapshot.groupsInUse).toHaveLength(2)
	})

	it.each([
		{
			name: 'split onto existing stack',
			fixture: makeStackFixture({ groups: {
					'group-1': {
					groupName: 'Group 1 - [Little Pigs]',
					unitType: 'LittlePigs',
					position: { q: 4, r: 7 },
					unitIds: ['pigs-1'],
				},
					'group-2': {
					groupName: 'Group 2 - [Little Pigs]',
					unitType: 'LittlePigs',
					position: { q: 5, r: 7 },
					unitIds: ['pigs-2', 'pigs-3', 'pigs-4', 'pigs-5'],
				},
			} }),
			expected: [
				{ groupId: 'group-2', groupName: 'Group 2 - [Little Pigs]' },
			],
		},
		{
			name: 'whole stack move to empty',
			fixture: makeStackFixture({ groups: {
					'group-1': {
					groupName: 'Group 1 - [Little Pigs]',
					unitType: 'LittlePigs',
					position: { q: 4, r: 7 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
					'group-2': {
					groupName: 'Group 2 - [Little Pigs]',
					unitType: 'LittlePigs',
					position: { q: 5, r: 8 },
					unitIds: ['pigs-3', 'pigs-4'],
				},
			} }),
			expected: [
				{ groupId: 'group-1', groupName: 'Group 1 - [Little Pigs]' },
				{ groupId: 'group-2', groupName: 'Group 2 - [Little Pigs]' },
			],
		},
		{
			name: 'whole stack move onto existing stack',
			fixture: makeStackFixture({ groups: {
					'group-1': {
						groupName: 'Group 1 - [Little Pigs]',
						unitType: 'LittlePigs',
						position: { q: 4, r: 7 },
						unitIds: ['pigs-1', 'pigs-2', 'pigs-3', 'pigs-4'],
					},
			} }),
			expected: [
				{ groupId: 'group-1', groupName: 'Group 1 - [Little Pigs]' },
			],
		},
		{
			name: 'merge two preexisting groups',
			fixture: makeStackFixture({ groups: {
					'group-2': {
					groupName: 'Group 2 - [Little Pigs]',
					unitType: 'LittlePigs',
					position: { q: 4, r: 7 },
					unitIds: ['pigs-1', 'pigs-2', 'pigs-3', 'pigs-4'],
				},
			} }),
			expected: [
				{ groupId: 'group-2', groupName: 'Group 2 - [Little Pigs]' },
			],
		},
	])('covers the stack move matrix for $name', ({ fixture, expected }) => {
		const snapshot = refreshStackNamingSnapshotFromRoster(undefined, fixture.stackRoster, Object.values(fixture.defenders))

		expect(snapshot.groupsInUse).toHaveLength(expected.length)
		for (const entry of expected) {
			expect(snapshot.groupsInUse.find((group) => group.groupId === entry.groupId)).toMatchObject({
				...entry,
				unitType: 'LittlePigs',
			})
		}
	})

	it('resolves the canonical group name when a merge reuses the same group key', () => {
		const engine = createStackNamingEngine({
			groupsInUse: [{ groupId: 'group-1', groupName: 'Group 1 - [Little Pigs]', unitType: 'LittlePigs' }],
			usedGroupNames: ['Group 1 - [Little Pigs]'],
		})

		expect(engine.resolveGroupName('group-1', 'LittlePigs', 'pigs-older', undefined, 2)).toBe('Group 1 - [Little Pigs]')
		expect(engine.resolveGroupName('group-1', 'LittlePigs', 'pigs-newer', undefined, 2)).toBe('Group 1 - [Little Pigs]')
	})

	it('accepts canonical seed names and resolves unit names through the engine', () => {
		const engine = createStackNamingEngine({
			groupsInUse: [{ groupId: 'group-1', groupName: 'Group 1 - [Big Bad Wolf]', unitType: 'BigBadWolf' }],
			usedGroupNames: ['Group 1 - [Big Bad Wolf]'],
		})

		expect(engine.resolveUnitName('BigBadWolf', 'wolf-1', 'Wolf 1')).toBe('Wolf 1')
		expect(engine.resolveGroupName('group-2', 'BigBadWolf', 'wolf-2', undefined, 1)).toBe('Big Bad Wolf 2')
		expect(engine.snapshot()).toMatchObject({
			groupsInUse: [
				{ groupId: 'group-1', groupName: 'Group 1 - [Big Bad Wolf]', unitType: 'BigBadWolf' },
				{ groupId: 'group-2', groupName: 'Big Bad Wolf 2', unitType: 'BigBadWolf' },
			],
			usedGroupNames: ['Group 1 - [Big Bad Wolf]'],
		})
	})

	it('accepts canonical seed names using the canonical group ordinal', () => {
		const engine = createStackNamingEngine({
			groupsInUse: [{ groupId: 'group-1', groupName: 'Group 1 - [Little Pigs]', unitType: 'LittlePigs' }],
			usedGroupNames: ['Group 2 - [Little Pigs]', 'Group 1 - [Little Pigs]'],
		})

		expect(engine.snapshot()).toMatchObject({
			groupsInUse: [{ groupId: 'group-1', groupName: 'Group 1 - [Little Pigs]', unitType: 'LittlePigs' }],
			usedGroupNames: ['Group 2 - [Little Pigs]', 'Group 1 - [Little Pigs]'],
		})
	})

	it('rejects legacy group names in persisted naming seeds', () => {
		expect(() => createStackNamingEngine({
			groupsInUse: [{ groupId: 'group-1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' }],
			usedGroupNames: ['Group 1 - [Little Pigs]'],
		})).toThrow('Group group-1 must use a canonical group name')
	})

	it('resolves stack labels from a seeded snapshot', () => {
		const seeded = {
			groupsInUse: [{ groupId: 'group-1', groupName: 'Group 1 - [Little Pigs]', unitType: 'LittlePigs' }],
			usedGroupNames: ['Group 1 - [Little Pigs]'],
		}

		expect(resolveStackLabelFromSnapshot(seeded, 'group-1', 'LittlePigs', 'pigs-1', undefined, 3)).toBe('Group 1 - [Little Pigs]')
		expect(resolveStackLabelFromSnapshot(seeded, 'group-2', 'LittlePigs', 'pigs-2', undefined, 2)).toBe('Group 2 - [Little Pigs]')
	})
})