import { describe, expect, it } from 'vitest'

import { buildApp } from '#server/app'
import { register } from './helpers.js'

const playableScenarioIds = ['onion-ring-iii', 'swamp-siege-01'] as const
const activeTestScenarioIds = [
	'e2e-colocation-01',
	'e2e-combat-01',
	'e2e-failed-ram-01',
	'e2e-ram-01',
	'smoke-endgame-01',
] as const

function failScenarioStep(step: string, scenarioId: string, statusCode: number, body: string): never {
	throw new Error(`Broken scenario fixture: ${step} failed for ${scenarioId}. Status ${statusCode}. Response: ${body}`)
}

describe('scenario/game preflight', () => {
	it('loads required scenarios and can create games from them', async () => {
		for (const scenarioId of playableScenarioIds) {
			const app = buildApp()
			const { token } = await register(app, 'preflight-user')

			const scenarioRes = await app.inject({
				method: 'GET',
				url: `/scenarios/${scenarioId}`,
			})

			if (scenarioRes.statusCode !== 200) {
				failScenarioStep('GET /scenarios/:id', scenarioId, scenarioRes.statusCode, scenarioRes.body)
			}

			const scenario = scenarioRes.json<{ id: string; displayName?: string; map?: { cells?: Array<{ q: number; r: number }> }; victoryConditions?: unknown }>()
			if (scenario.id !== scenarioId) {
				throw new Error(`Broken scenario fixture: expected scenario id ${scenarioId} but got ${scenario.id}`)
			}

			if (scenario.displayName === undefined || scenario.displayName.trim().length === 0) {
				throw new Error(`Broken scenario fixture: scenario ${scenarioId} is missing a display name`)
			}

			if (!Array.isArray(scenario.map?.cells) || scenario.map.cells.length === 0) {
				throw new Error(`Broken scenario fixture: scenario ${scenarioId} does not provide a usable map cell set`)
			}

			if (scenario.victoryConditions === undefined) {
				throw new Error(`Broken scenario fixture: scenario ${scenarioId} is missing victory conditions`)
			}

			const createRes = await app.inject({
				method: 'POST',
				url: '/games',
				headers: { authorization: `Bearer ${token}` },
				payload: { scenarioId, role: 'onion' },
			})

			if (createRes.statusCode !== 201) {
				failScenarioStep('POST /games', scenarioId, createRes.statusCode, createRes.body)
			}

			const created = createRes.json<{ gameId?: number }>()
			if (typeof created.gameId !== 'number') {
				throw new Error(`Broken scenario fixture: POST /games for ${scenarioId} did not return a numeric gameId`)
			}

			const stateRes = await app.inject({
				method: 'GET',
				url: `/games/${created.gameId}`,
				headers: { authorization: `Bearer ${token}` },
			})

			if (stateRes.statusCode !== 200) {
				failScenarioStep('GET /games/:id', scenarioId, stateRes.statusCode, stateRes.body)
			}
		}
	})

	it('validates actively used test scenarios without exposing them in the lobby list', async () => {
		const app = buildApp()
		const listedResponse = await app.inject({ method: 'GET', url: '/scenarios' })
		const listedIds = listedResponse.json<{ id: string }[]>().map((scenario) => scenario.id)

		expect(listedIds.sort()).toEqual([...playableScenarioIds].sort())

		for (const scenarioId of activeTestScenarioIds) {
			const response = await app.inject({ method: 'GET', url: `/scenarios/${scenarioId}` })
			if (response.statusCode !== 200) {
				failScenarioStep('GET test scenario by ID', scenarioId, response.statusCode, response.body)
			}

			const scenario = response.json<{ id: string; map?: { cells?: unknown[]; edges?: unknown[] } }>()
			expect(scenario.id).toBe(scenarioId)
			expect(scenario.map?.cells?.length).toBeGreaterThan(0)
			expect(scenario.map?.edges).toBeDefined()
		}
	})
})