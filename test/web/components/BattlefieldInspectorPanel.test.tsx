// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BattlefieldInspectorPanel } from '#web/components/BattlefieldInspectorPanel'
import { makeBattlefieldDefender, makeBattlefieldOnion } from '#test/utils/gameStateUtils'

describe('BattlefieldInspectorPanel', () => {
  function getLabeledValue(label: string): string {
    const labelElement = screen.getByText(label)
    const valueElement = labelElement.parentElement?.querySelector('dd')

    if (valueElement === null || valueElement === undefined) {
      throw new Error(`Missing value for ${label}`)
    }

    return valueElement.textContent ?? ''
  }

  it('uses canonical stack counts for grouped defenders and renders the swamp summary when objectives are present', () => {
    const defender = makeBattlefieldDefender({ unitId: 'pigs-1', typeId: 'LittlePigs', friendlyName: 'Little Pigs 1', position: { q: 4, r: 4 } }, { movesRemaining: 3, stackSize: 1, actionableModes: ['fire', 'combined'] })

    render(
      <BattlefieldInspectorPanel
        selectedInspectorLabel={defender.friendlyName}
        selectedInspectorDefender={defender}
        selectedInspectorOnion={null}
        selectedStackMemberCount={2}
        activeSelectedUnitCount={2}
        victoryObjectives={[
          { id: 'obj-1', label: 'Survive', kind: 'destroy-unit', completed: true, required: true },
        ]}
        escapeHexes={[{ q: 3, r: 5 }]}
      />,
    )

    const inspector = screen.getByTestId('battlefield-inspector')
    expect(within(inspector).getByTestId('battlefield-inspector-subject-pigs-1').textContent).toBe('Little Pigs 1')
    expect(getLabeledValue('Stack')).toBe('2')
    expect(screen.queryByText(/victory conditions/i)).toBeNull()
  })

  it('renders the swamp victory summary when objectives are present', () => {
    const swamp = makeBattlefieldDefender({ unitId: 'swamp-1', typeId: 'Swamp', friendlyName: 'The Swamp', position: { q: 3, r: 5 } }, { movesRemaining: 0, stackSize: 1, actionableModes: ['fire'] })

    render(
      <BattlefieldInspectorPanel
        selectedInspectorLabel={swamp.friendlyName}
        selectedInspectorDefender={swamp}
        selectedInspectorOnion={null}
        selectedStackMemberCount={1}
        activeSelectedUnitCount={1}
        victoryObjectives={[
          { id: 'obj-1', label: 'Survive', kind: 'destroy-unit', completed: true, required: true },
        ]}
        escapeHexes={[{ q: 3, r: 5 }]}
      />,
    )

    const inspector = screen.getByTestId('battlefield-inspector')
    expect(within(inspector).getByText(/victory conditions/i)).not.toBeNull()
    expect(within(inspector).getByText(/escape hexes/i)).not.toBeNull()
  })

  it('renders onion inspector stats and keeps stack count fixed at one', () => {
    const onion = makeBattlefieldOnion({ unitId: 'onion-1', friendlyName: 'TheOnion', position: { q: 0, r: 0 }, treads: 33, ramsRemaining: 1, weapons: [] }, { movesAllowed: 3, movesRemaining: 2 })

    render(
      <BattlefieldInspectorPanel
        selectedInspectorLabel={onion.friendlyName}
        selectedInspectorDefender={null}
        selectedInspectorOnion={onion}
        selectedStackMemberCount={4}
        activeSelectedUnitCount={4}
        victoryObjectives={[]}
        escapeHexes={[]}
      />,
    )

    const inspector = screen.getByTestId('battlefield-inspector')
    expect(within(inspector).getByTestId('battlefield-inspector-subject-onion-1').textContent).toBe('TheOnion')
    expect(getLabeledValue('Stack')).toBe('1')
    expect(screen.queryByText(/victory conditions/i)).toBeNull()
  })

  it('throws when the selected unit has no resolved inspector label', () => {
    const defender = makeBattlefieldDefender({ unitId: 'pigs-1', typeId: 'LittlePigs', friendlyName: 'Little Pigs 1', position: { q: 4, r: 4 } }, { movesRemaining: 3, stackSize: 1, actionableModes: ['fire', 'combined'] })

    expect(() => {
      render(
        <BattlefieldInspectorPanel
          selectedInspectorLabel={null}
          selectedInspectorDefender={defender}
          selectedInspectorOnion={null}
          selectedStackMemberCount={2}
          activeSelectedUnitCount={2}
          victoryObjectives={[]}
          escapeHexes={[]}
        />,
      )
    }).toThrow('Missing inspector label for selected unit pigs-1')
  })

  it('throws when a grouped defender is missing a selected stack member count', () => {
    const defender = makeBattlefieldDefender({ unitId: 'pigs-1', typeId: 'LittlePigs', friendlyName: 'Little Pigs 1', position: { q: 4, r: 4 } }, { movesRemaining: 3, stackSize: 1, actionableModes: ['fire', 'combined'] })

    expect(() => {
      render(
        <BattlefieldInspectorPanel
          selectedInspectorLabel={defender.friendlyName}
          selectedInspectorDefender={defender}
          selectedInspectorOnion={null}
          selectedStackMemberCount={0}
          activeSelectedUnitCount={0}
          victoryObjectives={[]}
          escapeHexes={[]}
        />,
      )
    }).toThrow('Missing stack member count for grouped unit pigs-1')
  })
})