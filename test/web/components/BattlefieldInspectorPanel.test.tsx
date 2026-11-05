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

  it('shows paired defender stats with defense modifier and terrain type', () => {
    const defender: BattlefieldUnit = {
      unitId: 'pigs-1',
      typeId: 'LittlePigs',
      role: 'defender',
      friendlyName: 'Little Pigs 1',
      state: 'operational',
      position: { q: 4, r: 4 },
      weapons: [],
      movesRemaining: 1,
      stackSize: 1,
      actionableModes: ['fire', 'combined'],
    }

    render(
      <BattlefieldInspectorPanel
        selectedInspectorLabel={null}
        selectedInspectorGroupHeading={{
          title: 'Group 1',
          subtitle: 'Little Pigs',
          selectionLabel: '2 of 2 selected',
        }}
        selectedInspectorGroupLabel={null}
        selectedInspectorDefense={2}
        selectedInspectorTerrainModifier={2}
        selectedInspectorTerrainType="ridgeline"
        selectedInspectorDefender={defender}
        selectedInspectorOnion={null}
        selectedStackMemberCount={2}
        activeSelectedUnitCount={2}
      />,
    )

    const inspector = screen.getByTestId('battlefield-inspector')
    expect(within(inspector).getByTestId('battlefield-inspector-subject-pigs-1').textContent).toBe('Group 1')
    expect(within(inspector).getByText('Little Pigs')).toBeInTheDocument()
    expect(within(inspector).getByText('2 of 2 selected')).toBeInTheDocument()
    expect(within(inspector).queryByTestId('battlefield-inspector-group')).toBeNull()
    expect(getLabeledValue('Defense')).toBe('2 (+2)')
    expect(getLabeledValue('Terrain')).toBe('Ridgeline')
    expect(within(inspector).getByRole('img', { name: 'Group 1 Little Pigs sprite' })).toBeInTheDocument()
    expect(within(inspector).getByText(/stackable rifle squad/i)).toBeInTheDocument()
    expect(Array.from(inspector.querySelectorAll('dl > div')).map((pair) => Array.from(pair.children).map((field) => field.textContent))).toEqual([
      ['Status', 'operational'],
      ['Move', '1/2'],
      ['Attack', '0'],
      ['Range', '0'],
      ['Defense', '2 (+2)'],
      ['Terrain', 'Ridgeline'],
    ])
    expect(within(inspector).queryByText('Selected')).toBeNull()
    expect(within(inspector).queryByText('Stack')).toBeNull()
    expect(screen.queryByText(/victory conditions/i)).toBeNull()
  })

  it('shows zero remaining movement alongside the unit maximum outside its movement phase', () => {
    const defender: BattlefieldUnit = {
      unitId: 'pigs-1',
      typeId: 'LittlePigs',
      role: 'defender',
      friendlyName: 'Little Pigs 1',
      state: 'operational',
      position: { q: 4, r: 4 },
      weapons: [],
      movesRemaining: 0,
      stackSize: 1,
      actionableModes: ['fire', 'combined'],
    }

    render(
      <BattlefieldInspectorPanel
        selectedInspectorLabel={defender.friendlyName}
        selectedInspectorDefense={1}
        selectedInspectorTerrainType="clear"
        selectedInspectorDefender={defender}
        selectedInspectorOnion={null}
        activeSelectedUnitCount={1}
      />,
    )

    expect(getLabeledValue('Move')).toBe('0/2')
  })

  it('renders the empty inspector without a terrain bonus', () => {
    render(
      <BattlefieldInspectorPanel
        selectedInspectorLabel={null}
        selectedInspectorDefense={null}
        selectedInspectorTerrainModifier={null}
        selectedInspectorTerrainType={null}
        selectedInspectorDefender={null}
        selectedInspectorOnion={null}
        selectedStackMemberCount={0}
        activeSelectedUnitCount={0}
      />,
    )

    const inspector = screen.getByTestId('battlefield-inspector')
    expect(within(inspector).getByText(/select a unit on the map or in the rail/i)).toBeInTheDocument()
    expect(within(inspector).queryByText('Terrain')).toBeNull()
  })

  it('keeps victory conditions out of the swamp inspector', () => {
    const swamp: BattlefieldUnit = {
      unitId: 'swamp-1',
      typeId: 'Swamp',
      role: 'defender',
      friendlyName: 'The Swamp',
      state: 'operational',
      position: { q: 3, r: 5 },
      movesRemaining: 0,
      stackSize: 1,
      weapons: [],
      actionableModes: ['fire'],
    }

    render(
      <BattlefieldInspectorPanel
        selectedInspectorLabel={swamp.friendlyName}
        selectedInspectorDefense={0}
        selectedInspectorTerrainModifier={null}
        selectedInspectorTerrainType="clear"
        selectedInspectorDefender={swamp}
        selectedInspectorOnion={null}
        selectedStackMemberCount={1}
        activeSelectedUnitCount={1}
      />,
    )

    const inspector = screen.getByTestId('battlefield-inspector')
    expect(within(inspector).queryByText(/victory conditions/i)).toBeNull()
    expect(within(inspector).queryByText(/escape hexes/i)).toBeNull()
    expect(getLabeledValue('Terrain')).toBe('Clear')
  })

  it('shows destroyed status for an inspected defender', () => {
    const destroyedDefender: BattlefieldUnit = {
      unitId: 'puss-1',
      typeId: 'LittlePigs',
      role: 'defender',
      friendlyName: 'Puss 1',
      state: 'destroyed',
      position: { q: 3, r: 5 },
      movesRemaining: 0,
      stackSize: 1,
      weapons: [],
      actionableModes: [],
    }

    render(
      <BattlefieldInspectorPanel
        selectedInspectorLabel={destroyedDefender.friendlyName}
        selectedInspectorDefense={1}
        selectedInspectorTerrainModifier={null}
        selectedInspectorTerrainType="crater"
        selectedInspectorDefender={destroyedDefender}
        selectedInspectorOnion={null}
        selectedStackMemberCount={0}
        activeSelectedUnitCount={0}
      />,
    )

    expect(getLabeledValue('Status')).toBe('destroyed')
  })

  it('renders onion inspector stats and keeps stack count fixed at one', () => {
    const onion: BattlefieldOnionView = {
      unitId: 'onion-1',
      typeId: 'TheOnion',
      role: 'onion',
      friendlyName: 'TheOnion',
      position: { q: 0, r: 0 },
      state: 'operational',
      treads: 33,
      ramsRemaining: 1,
      movesAllowed: 3,
      movesRemaining: 2,
      weapons: [],
    }

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
    expect(within(inspector).getByRole('img', { name: 'TheOnion sprite' })).toHaveAttribute('src', expect.stringContaining('the-onion-damaged-sprite.png'))
    expect(within(inspector).getByText(/heavily armed mobile fortress/i)).toBeInTheDocument()
    expect(getLabeledValue('Stack')).toBe('1')
    expect(getLabeledValue('Status')).toBe('operational')
    expect(getLabeledValue('Moves')).toBe('2/3')
    expect(screen.queryByText(/victory conditions/i)).toBeNull()
  })

  it('throws when the selected unit has no resolved inspector label', () => {
    const defender: BattlefieldUnit = {
      unitId: 'pigs-1',
      typeId: 'LittlePigs',
      role: 'defender',
      friendlyName: 'Little Pigs 1',
      state: 'operational',
      position: { q: 4, r: 4 },
      weapons: [],
      movesRemaining: 3,
      stackSize: 1,
      actionableModes: ['fire', 'combined'],
    }

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

})