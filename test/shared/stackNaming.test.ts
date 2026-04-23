import { describe, expect, it } from 'vitest'

import { createStackNamingEngine, resolveStackLabel, resolveStackUnitName } from '#shared/stackNaming'

describe('stack naming', () => {
	it('resolves canonical unit names from unit definitions', () => {
		expect(resolveStackUnitName('LittlePigs', 'pigs-1')).toBe('Little Pigs 1')
		expect(resolveStackUnitName('BigBadWolf', 'wolf-2')).toBe('Big Bad Wolf 2')
	})

	it('allocates unique stack names and does not recycle them', () => {
		const engine = createStackNamingEngine()

		expect(resolveStackLabel('LittlePigs', 'pigs-1', undefined, 3)).toBe('Little Pigs group')
		expect(engine.resolveGroupName('little-pigs:4,4', 'LittlePigs', 'pigs-1', undefined, 3)).toBe('Little Pigs group')
		expect(engine.resolveGroupName('little-pigs:5,5', 'LittlePigs', 'pigs-2', undefined, 2)).toBe('Little Pigs group 2')

		engine.releaseGroup('little-pigs:4,4')
		expect(engine.resolveGroupName('little-pigs:6,6', 'LittlePigs', 'pigs-3', undefined, 4)).toBe('Little Pigs group 3')
	})

	it('reuses the same group name for the same key', () => {
		const engine = createStackNamingEngine()

		expect(engine.resolveGroupName('wolf-pack', 'BigBadWolf', 'wolf-1', undefined, 2)).toBe('Big Bad Wolf group')
		expect(engine.resolveGroupName('wolf-pack', 'BigBadWolf', 'wolf-2', undefined, 2)).toBe('Big Bad Wolf group')
	})
})