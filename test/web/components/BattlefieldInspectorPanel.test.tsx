// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BattlefieldInspectorPanel } from '#web/components/BattlefieldInspectorPanel'
import type { BattlefieldOnionView, BattlefieldUnit } from '#web/lib/battlefieldView'

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
    const defender: BattlefieldUnit = {
      id: 'pigs-1',
      type: 'LittlePigs',
      friendlyName: 'Little Pigs 1',
      status: 'operational',
      q: 4,
      r: 4,
      move: 3,
      weapons: 'main: ready',
      attack: '1 / rng 1',
      actionableModes: ['fire', 'combined'],
      squads: 1,
    }

    render(
      <BattlefieldInspectorPanel
        selectedInspectorLabel={null}
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
    const swamp: BattlefieldUnit = {
      id: 'swamp-1',
      type: 'Swamp',
      friendlyName: 'The Swamp',
      status: 'operational',
      q: 3,
      r: 5,
      move: 0,
      weapons: 'main: ready',
      attack: '0 / rng 0',
      actionableModes: ['fire'],
    }

    render(
      <BattlefieldInspectorPanel
        selectedInspectorLabel={null}
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
    const onion: BattlefieldOnionView = {
      id: 'onion-1',
      type: 'TheOnion',
      q: 0,
      r: 0,
      status: 'operational',
      treads: 33,
      movesAllowed: 3,
      movesRemaining: 2,
      rams: 1,
      weapons: 'laser: ready',
      weaponDetails: [],
    }

    render(
      <BattlefieldInspectorPanel
        selectedInspectorLabel={null}
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
})