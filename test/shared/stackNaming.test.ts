import { describe, expect, it } from 'vitest'

import {
	buildStackGroupKey,
	createStackNamingEngine,
	refreshStackNamingSnapshotFromRoster,
	resolveStackLabel,
	resolveStackLabelFromSnapshot,
	resolveStackUnitName,
} from '#shared/stackNaming'
import { makeDefender, makeStackFixture } from '#test/utils/gameStateUtils'

describe('stack naming', () => {
	it('resolves canonical unit names from unit definitions', () => {
		expect(resolveStackUnitName('LittlePigs', 'pigs-1')).toBe('Little Pigs 1')
		expect(resolveStackUnitName('BigBadWolf', 'wolf-2')).toBe('Big Bad Wolf 2')
		expect(resolveStackUnitName('LittlePigs', 'pigs-1', 'Little Pigs 9')).toBe('Little Pigs 9')
		expect(resolveStackUnitName('Puss', 'puss-1', '   ')).toBe('Puss 1')
		expect(resolveStackUnitName('MysteryUnit', undefined)).toBe('MysteryUnit')
	})

	it('builds stack group keys from type and position', () => {
		expect(buildStackGroupKey('LittlePigs', { q: 4, r: 4 })).toBe('LittlePigs:4,4')
		expect(buildStackGroupKey('BigBadWolf', { q: 1, r: 2 })).toBe('BigBadWolf:1,2')
	})

	it('allocates unique stack names and does not recycle them', () => {
		const engine = createStackNamingEngine()

		expect(resolveStackLabel('LittlePigs', 'pigs-1', undefined, 3)).toBe('Little Pigs group')
		expect(resolveStackLabel('LittlePigs', 'pigs-1', 'Little Pigs group 4', 3)).toBe('Little Pigs group 4')
		expect(resolveStackLabel('LittlePigs', 'pigs-1', undefined, 1)).toBe('Little Pigs group')
		expect(engine.resolveGroupName('little-pigs:4,4', 'LittlePigs', 'pigs-1', undefined, 3)).toBe('Little Pigs group 1')
		expect(engine.resolveGroupName('little-pigs:5,5', 'LittlePigs', 'pigs-2', undefined, 2)).toBe('Little Pigs group 2')
		expect(engine.resolveGroupName('little-pigs:5,5', 'LittlePigs', 'pigs-2', undefined, 2)).toBe('Little Pigs group 2')

		engine.releaseGroup('little-pigs:4,4')
		expect(engine.resolveGroupName('little-pigs:6,6', 'LittlePigs', 'pigs-3', undefined, 4)).toBe('Little Pigs group 3')
	})

	it('reuses the same group name for the same key', () => {
		const engine = createStackNamingEngine()

		expect(engine.resolveGroupName('wolf-pack', 'BigBadWolf', 'wolf-1', undefined, 2)).toBe('Big Bad Wolf group 1')
		expect(engine.resolveGroupName('wolf-pack', 'BigBadWolf', 'wolf-2', undefined, 2)).toBe('Big Bad Wolf group 1')
	})

	it('names a transient group immediately and keeps that name through a merge', () => {
		const engine = createStackNamingEngine()

		const transientGroupName = engine.resolveGroupName('LittlePigs:3,3', 'LittlePigs', 'pigs-1', undefined, 2)
		expect(transientGroupName).toBe('Little Pigs group 1')
		expect(engine.resolveGroupName('LittlePigs:3,3', 'LittlePigs', 'pigs-2', undefined, 3)).toBe('Little Pigs group 1')
		expect(engine.snapshot()).toMatchObject({
			groupsInUse: [{ groupKey: 'LittlePigs:3,3', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' }],
			usedGroupNames: ['Little Pigs group 1'],
		})
	})

	it('refreshes active groups and drops missing ones from the snapshot', () => {
		const fixture = makeStackFixture({
			groups: {
				'g-a': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
				'g-b': {
					groupName: 'Little Pigs group 2',
					unitType: 'LittlePigs',
					position: { q: 5, r: 5 },
					unitIds: ['pigs-3', 'pigs-4'],
				},
				'g-c': {
					groupName: 'Big Bad Wolf group',
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
					{ groupKey: 'LittlePigs:4,4', groupName: 'Little Pigs group', unitType: 'LittlePigs' },
					{ groupKey: 'BigBadWolf:7,7', groupName: 'Big Bad Wolf group', unitType: 'BigBadWolf' },
				],
				usedGroupNames: ['Little Pigs group'],
			},
			fixture.stackRoster,
			Object.values(fixture.defenders),
		)

		expect(snapshot.groupsInUse).toHaveLength(2)
		expect(snapshot.groupsInUse.find((group) => group.groupKey === 'LittlePigs:4,4')).toMatchObject({
			groupKey: 'LittlePigs:4,4',
			groupName: 'Little Pigs group 1',
			unitType: 'LittlePigs',
		})
		expect(snapshot.groupsInUse.find((group) => group.groupKey === 'LittlePigs:5,5')).toMatchObject({
			groupKey: 'LittlePigs:5,5',
			groupName: 'Little Pigs group 2',
			unitType: 'LittlePigs',
		})
		expect(snapshot.usedGroupNames).toEqual(['Little Pigs group', 'Little Pigs group 1', 'Little Pigs group 2'])
		expect(snapshot.groupsInUse.some((group) => group.groupKey === 'BigBadWolf:7,7')).toBe(false)
	})

	it('refreshes stack names from the authoritative roster and keeps stackable singleton groups', () => {
		const fixture = makeStackFixture({
			groups: {
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
				'g-c': {
					groupName: 'Big Bad Wolf group',
					unitType: 'BigBadWolf',
					position: { q: 7, r: 4 },
					unitIds: ['wolf-1'],
				},
			},
		})
		const snapshot = refreshStackNamingSnapshotFromRoster(
			{
				groupsInUse: [{ groupKey: 'LittlePigs:4,4', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' }],
				usedGroupNames: ['Little Pigs group 1'],
			},
			fixture.stackRoster,
			Object.values(fixture.defenders),
		)

		expect(snapshot.groupsInUse).toHaveLength(2)
		expect(snapshot.groupsInUse[0]).toMatchObject({
			groupKey: 'LittlePigs:4,4',
			groupName: 'Little Pigs group 1',
			unitType: 'LittlePigs',
		})
		expect(snapshot.groupsInUse.find((group) => group.groupKey === 'LittlePigs:5,4')).toMatchObject({
			groupKey: 'LittlePigs:5,4',
			groupName: 'Little Pigs group 2',
			unitType: 'LittlePigs',
		})
		expect(snapshot.usedGroupNames).toEqual(['Little Pigs group 1', 'Little Pigs group 2'])
	})

	it('preserves duplicate source IDs in an explicit split edge case', () => {
		const snapshot = refreshStackNamingSnapshotFromRoster(
			undefined,
			{
				groupsById: {
					'LittlePigs:4,7': {
						groupName: 'Little Pigs group 1',
						unitType: 'LittlePigs',
						position: { q: 4, r: 7 },
						unitIds: ['pigs-1'],
					},
					'LittlePigs:5,7': {
						groupName: 'Little Pigs group 2',
						unitType: 'LittlePigs',
						position: { q: 5, r: 7 },
						unitIds: ['pigs-3', 'pigs-4'],
					},
					'LittlePigs:5,8': {
						groupName: 'Little Pigs group 3',
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

		expect(snapshot.groupsInUse).toHaveLength(3)
	})

	it.each([
		{
			name: 'split onto existing stack',
			fixture: makeStackFixture({ groups: {
				'LittlePigs:4,7': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 7 },
					unitIds: ['pigs-1'],
				},
				'LittlePigs:5,7': {
					groupName: 'Little Pigs group 2',
					unitType: 'LittlePigs',
					position: { q: 5, r: 7 },
					unitIds: ['pigs-2', 'pigs-3', 'pigs-4', 'pigs-5'],
				},
			} }),
			expected: [
				{ groupKey: 'LittlePigs:4,7', groupName: 'Little Pigs group 1' },
				{ groupKey: 'LittlePigs:5,7', groupName: 'Little Pigs group 2' },
			],
		},
		{
			name: 'whole stack move to empty',
			fixture: makeStackFixture({ groups: {
				'LittlePigs:4,7': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 7 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
				'LittlePigs:5,8': {
					groupName: 'Little Pigs group 2',
					unitType: 'LittlePigs',
					position: { q: 5, r: 8 },
					unitIds: ['pigs-3', 'pigs-4'],
				},
			} }),
			expected: [
				{ groupKey: 'LittlePigs:4,7', groupName: 'Little Pigs group 1' },
				{ groupKey: 'LittlePigs:5,8', groupName: 'Little Pigs group 2' },
			],
		},
		{
			name: 'whole stack move onto existing stack',
			fixture: makeStackFixture({ groups: {
				'LittlePigs:4,7': {
						groupName: 'Little Pigs group 1',
						unitType: 'LittlePigs',
						position: { q: 4, r: 7 },
						unitIds: ['pigs-1', 'pigs-2', 'pigs-3', 'pigs-4'],
					},
			} }),
			expected: [
				{ groupKey: 'LittlePigs:4,7', groupName: 'Little Pigs group 1' },
			],
		},
		{
			name: 'merge two preexisting groups',
			fixture: makeStackFixture({ groups: {
				'LittlePigs:4,7': {
					groupName: 'Little Pigs group 2',
					unitType: 'LittlePigs',
					position: { q: 4, r: 7 },
					unitIds: ['pigs-1', 'pigs-2', 'pigs-3', 'pigs-4'],
				},
			} }),
			expected: [
				{ groupKey: 'LittlePigs:4,7', groupName: 'Little Pigs group 2' },
			],
		},
	])('covers the stack move matrix for $name', ({ fixture, expected }) => {
		const snapshot = refreshStackNamingSnapshotFromRoster(undefined, fixture.stackRoster, Object.values(fixture.defenders))

		expect(snapshot.groupsInUse).toHaveLength(expected.length)
		for (const entry of expected) {
			expect(snapshot.groupsInUse.find((group) => group.groupKey === entry.groupKey)).toMatchObject({
				...entry,
				unitType: 'LittlePigs',
			})
		}
	})

	it('retains the older group name when a merge resolves to the same group key', () => {
		const engine = createStackNamingEngine({
			groupsInUse: [{ groupKey: 'LittlePigs:4,4', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' }],
			usedGroupNames: ['Little Pigs group 1'],
		})

		expect(engine.resolveGroupName('LittlePigs:4,4', 'LittlePigs', 'pigs-older', undefined, 2)).toBe('Little Pigs group 1')
		expect(engine.resolveGroupName('LittlePigs:4,4', 'LittlePigs', 'pigs-newer', undefined, 2)).toBe('Little Pigs group 1')
	})

	it('preserves non-group seed names and resolves unit names through the engine', () => {
		const engine = createStackNamingEngine({
			groupsInUse: [{ groupKey: 'wolf-pack', groupName: 'Armored Spear', unitType: 'BigBadWolf' }],
			usedGroupNames: ['Armored Spear'],
		})

		expect(engine.resolveUnitName('BigBadWolf', 'wolf-1', 'Wolf 1')).toBe('Wolf 1')
		expect(engine.resolveGroupName('wolf-pack-2', 'BigBadWolf', 'wolf-2', undefined, 1)).toBe('Big Bad Wolf 2')
		expect(engine.snapshot()).toMatchObject({
			groupsInUse: [
				{ groupKey: 'wolf-pack', groupName: 'Armored Spear', unitType: 'BigBadWolf' },
				{ groupKey: 'wolf-pack-2', groupName: 'Big Bad Wolf 2', unitType: 'BigBadWolf' },
			],
			usedGroupNames: ['Armored Spear'],
		})
	})

	it('keeps already ordinalized seed group names intact', () => {
		const engine = createStackNamingEngine({
			groupsInUse: [{ groupKey: 'little-pigs:4,4', groupName: 'Little Pigs group 2', unitType: 'LittlePigs' }],
			usedGroupNames: ['Little Pigs group 2'],
		})

		expect(engine.snapshot()).toMatchObject({
			groupsInUse: [{ groupKey: 'little-pigs:4,4', groupName: 'Little Pigs group 2', unitType: 'LittlePigs' }],
			usedGroupNames: ['Little Pigs group 2'],
		})
	})

	it('resolves stack labels from a seeded snapshot', () => {
		const seeded = {
			groupsInUse: [{ groupKey: 'LittlePigs:4,4', groupName: 'Little Pigs group', unitType: 'LittlePigs' }],
			usedGroupNames: ['Little Pigs group 1'],
		}

		expect(resolveStackLabelFromSnapshot(seeded, 'LittlePigs:4,4', 'LittlePigs', 'pigs-1', undefined, 3)).toBe('Little Pigs group 1')
		expect(resolveStackLabelFromSnapshot(seeded, 'LittlePigs:5,5', 'LittlePigs', 'pigs-2', undefined, 2)).toBe('Little Pigs group 2')
	})
})