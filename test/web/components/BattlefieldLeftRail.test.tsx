// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BattlefieldLeftRail } from '#web/components/BattlefieldLeftRail'
import type { BattlefieldOnionView, BattlefieldUnit } from '#web/lib/battlefieldView'

describe('BattlefieldLeftRail', () => {
  it('renders one combat group card from canonical roster membership even when members are on different hexes', () => {
    const displayedDefenders: BattlefieldUnit[] = [
      {
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
      },
      {
        id: 'pigs-2',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 2',
        status: 'operational',
        q: 5,
        r: 4,
        move: 3,
        weapons: 'main: ready',
        attack: '1 / rng 1',
        actionableModes: ['fire', 'combined'],
      },
    ]
    const stackNaming = {
      groupsInUse: [
        { groupKey: 'LittlePigs:4,4', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
      ],
      usedGroupNames: ['Little Pigs group 1'],
    }
    const stackRoster = {
      groupsById: {
        'LittlePigs:4,4': {
          groupName: 'Little Pigs group 1',
          unitType: 'LittlePigs',
          position: { q: 4, r: 4 },
          unitIds: ['pigs-1', 'pigs-2'],
        },
      },
    }
    const onion: BattlefieldOnionView = {
      id: 'onion-1',
      type: 'TheOnion',
      q: 0,
      r: 0,
      status: 'operational',
      treads: 33,
      movesAllowed: 3,
      movesRemaining: 3,
      rams: 0,
      weapons: 'main: ready',
      weaponDetails: [],
    }

    render(
      <BattlefieldLeftRail
        activeCombatRole="defender"
        activeMode="fire"
        activeSelectedUnitIds={[]}
        displayedDefenders={displayedDefenders}
        displayedOnion={onion}
        isCombatPhase
        isMovementPhase={false}
        isSelectionLocked={false}
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 0"
        stackNaming={stackNaming as any}
        stackRoster={stackRoster as any}
        onSelectUnit={vi.fn()}
      />,
    )

    expect(screen.getByTestId('combat-unit-pigs-1').textContent).toContain('Little Pigs group 1')
    expect(screen.queryByTestId('combat-unit-pigs-2')).toBeNull()
    expect(screen.queryByText('Little Pigs 1')).toBeNull()
    expect(screen.queryByText('Little Pigs 2')).toBeNull()
  })

  it('renders Little Pigs as a grouped move card with individually toggle-able members', () => {
    const onSelectUnit = vi.fn()
    const displayedDefenders: BattlefieldUnit[] = [
      {
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
      },
      {
        id: 'pigs-2',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 2',
        status: 'operational',
        q: 4,
        r: 4,
        move: 3,
        weapons: 'main: ready',
        attack: '1 / rng 1',
        actionableModes: ['fire', 'combined'],
      },
      {
        id: 'pigs-3',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 3',
        status: 'operational',
        q: 4,
        r: 4,
        move: 3,
        weapons: 'main: ready',
        attack: '1 / rng 1',
        actionableModes: ['fire', 'combined'],
      },
    ]
    const stackNaming = {
      groupsInUse: [
        { groupKey: 'LittlePigs:4,4', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
      ],
      usedGroupNames: ['Little Pigs group 1'],
    }
    const stackRoster = {
      groupsById: {
        'LittlePigs:4,4': {
          groupName: 'Little Pigs group 1',
          unitType: 'LittlePigs',
          position: { q: 4, r: 4 },
          unitIds: ['pigs-1', 'pigs-2', 'pigs-3'],
        },
      },
    }
    const onion: BattlefieldOnionView = {
      id: 'onion-1',
      type: 'TheOnion',
      q: 0,
      r: 0,
      status: 'operational',
      treads: 33,
      movesAllowed: 3,
      movesRemaining: 3,
      rams: 0,
      weapons: 'main: ready',
      weaponDetails: [],
    }

    render(
      <BattlefieldLeftRail
        activeCombatRole="defender"
        activeMode="fire"
        activeSelectedUnitIds={[]}
        displayedDefenders={displayedDefenders}
        displayedOnion={onion}
        isCombatPhase={false}
        isMovementPhase
        isSelectionLocked={false}
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 0"
        stackNaming={stackNaming as any}
        stackRoster={stackRoster as any}
        onSelectUnit={onSelectUnit}
      />,
    )

    expect(screen.getByTestId('combat-unit-pigs-1').textContent).toContain('Little Pigs group 1')
    expect(screen.getByTestId('combat-unit-pigs-1').textContent).toContain('Move: 3')
    fireEvent.click(screen.getByTestId('combat-stack-member-pigs-2'))
    expect(onSelectUnit).toHaveBeenCalledWith('pigs-2', true)
    expect(screen.getByTestId('combat-stack-member-pigs-1')).not.toBeNull()
    expect(screen.getByTestId('combat-stack-member-pigs-2')).not.toBeNull()
    expect(screen.getByTestId('combat-stack-member-pigs-3')).not.toBeNull()
    expect(screen.getByTestId('combat-stack-member-pigs-1').textContent).toContain('Little Pigs 1')
    expect(screen.getByTestId('combat-stack-member-pigs-2').textContent).toContain('Little Pigs 2')
    expect(screen.getByTestId('combat-stack-member-pigs-3').textContent).toContain('Little Pigs 3')
  })

  it('renders grouped combat attack totals as numeric sums instead of concatenated strings', () => {
    const displayedDefenders: BattlefieldUnit[] = [
      {
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
      },
      {
        id: 'pigs-2',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 2',
        status: 'operational',
        q: 4,
        r: 4,
        move: 3,
        weapons: 'main: ready',
        attack: '1 / rng 1',
        actionableModes: ['fire', 'combined'],
      },
      {
        id: 'pigs-3',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 3',
        status: 'operational',
        q: 4,
        r: 4,
        move: 3,
        weapons: 'main: ready',
        attack: '1 / rng 1',
        actionableModes: ['fire', 'combined'],
      },
    ]
    const stackNaming = {
      groupsInUse: [
        { groupKey: 'LittlePigs:4,4', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
      ],
      usedGroupNames: ['Little Pigs group 1'],
    }
    const stackRoster = {
      groupsById: {
        'LittlePigs:4,4': {
          groupName: 'Little Pigs group 1',
          unitType: 'LittlePigs',
          position: { q: 4, r: 4 },
          unitIds: ['pigs-1', 'pigs-2', 'pigs-3'],
        },
      },
    }
    const onion: BattlefieldOnionView = {
      id: 'onion-1',
      type: 'TheOnion',
      q: 0,
      r: 0,
      status: 'operational',
      treads: 33,
      movesAllowed: 3,
      movesRemaining: 3,
      rams: 0,
      weapons: 'main: ready',
      weaponDetails: [],
    }

    render(
      <BattlefieldLeftRail
        activeCombatRole="defender"
        activeMode="fire"
        activeSelectedUnitIds={['pigs-1', 'pigs-2', 'pigs-3']}
        displayedDefenders={displayedDefenders}
        displayedOnion={onion}
        isCombatPhase
        isMovementPhase={false}
        isSelectionLocked={false}
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 3"
        stackNaming={stackNaming as any}
        stackRoster={stackRoster as any}
        onSelectUnit={vi.fn()}
      />,
    )

    expect(screen.getByTestId('combat-attack-total').textContent).toBe('Attack 3')
  })
})
