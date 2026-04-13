import { describe, it, expect } from 'vitest'
import { translateScenarioCoord } from '../../shared/scenarioMap.js'

describe('translateScenarioCoord', () => {
  it('caches the last used radius', () => {
    const coord = { q: 3, r: 10 }
    const radius = 7
    const result = translateScenarioCoord(coord, radius)
    expect(result).toEqual({ q: 0, r: 10 })
    expect(translateScenarioCoord.lastRadius).toBe(radius)
  })

  it('updates lastRadius on each call', () => {
    translateScenarioCoord({ q: 1, r: 2 }, 5)
    expect(translateScenarioCoord.lastRadius).toBe(5)
    translateScenarioCoord({ q: 0, r: 0 }, 9)
    expect(translateScenarioCoord.lastRadius).toBe(9)
  })
})
