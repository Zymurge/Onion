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
        activeRole="defender"
        activeTurnActive={true}
        activeMode="fire"
        activeSelectedUnitIds={[]}
        displayedDefenders={displayedDefenders}
        displayedOnion={onion}
        isCombatPhase
        isMovementPhase={false}
        isSelectionLocked={false}
        stacksExpandable
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 0"
        stackNaming={stackNaming as any}
        stackRoster={stackRoster as any}
        onSelectUnit={vi.fn()}
      />,
    )

    expect(screen.getByTestId('combat-unit-pigs-1').textContent).toContain('Little Pigs group 1')
    expect(screen.getByTestId('combat-stack-group-pigs-1').dataset.expanded).toBe('false')
    expect(screen.queryByTestId('combat-stack-member-pigs-1')).toBeNull()
    expect(screen.queryByTestId('combat-stack-member-pigs-2')).toBeNull()
  })

  it('shows the canonical stack name instead of the first member friendly name', () => {
    const displayedDefenders: BattlefieldUnit[] = [
      {
        id: 'pigs-4',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 4',
        status: 'operational',
        q: 5,
        r: 5,
        move: 3,
        weapons: 'main: ready',
        attack: '1 / rng 1',
        actionableModes: ['fire', 'combined'],
      },
      {
        id: 'pigs-5',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 5',
        status: 'operational',
        q: 5,
        r: 5,
        move: 3,
        weapons: 'main: ready',
        attack: '1 / rng 1',
        actionableModes: ['fire', 'combined'],
      },
    ]
    const stackNaming = {
      groupsInUse: [
        { groupKey: 'LittlePigs:5,5', groupName: 'Little Pigs group 5', unitType: 'LittlePigs' },
      ],
      usedGroupNames: ['Little Pigs group 5'],
    }
    const stackRoster = {
      groupsById: {
        'LittlePigs:5,5': {
          groupName: 'Little Pigs 4',
          unitType: 'LittlePigs',
          position: { q: 5, r: 5 },
          unitIds: ['pigs-4', 'pigs-5'],
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
        activeRole="defender"
        activeTurnActive={true}
        activeMode="fire"
        activeSelectedUnitIds={[]}
        displayedDefenders={displayedDefenders}
        displayedOnion={onion}
        isCombatPhase={false}
        isMovementPhase
        isSelectionLocked={false}
        stacksExpandable
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 0"
        stackNaming={stackNaming as any}
        stackRoster={stackRoster as any}
        onSelectUnit={vi.fn()}
      />,
    )

    expect(screen.getByTestId('combat-unit-pigs-4').textContent).toContain('Little Pigs group 5')
    expect(screen.getByTestId('combat-unit-pigs-4').textContent).not.toContain('Little Pigs 4')
  })

  it('renders singleton stack-roster placeholders with the unit label instead of a group fallback', () => {
    const displayedDefenders: BattlefieldUnit[] = [
      {
        id: 'pigs-1',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 1',
        status: 'operational',
        q: 4,
        r: 8,
        move: 3,
        weapons: 'main: ready',
        attack: '1 / rng 1',
        actionableModes: ['fire', 'combined'],
      },
    ]
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
        activeRole="defender"
        activeTurnActive={true}
        activeMode="fire"
        activeSelectedUnitIds={[]}
        displayedDefenders={displayedDefenders}
        displayedOnion={onion}
        isCombatPhase={false}
        isMovementPhase
        isSelectionLocked={false}
        stacksExpandable
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 0"
        stackNaming={{
          groupsInUse: [],
          usedGroupNames: ['Little Pigs group 1'],
        } as any}
        stackRoster={{
          groupsById: {
            'LittlePigs:4,8': {
              groupName: 'Little Pigs group 1',
              unitType: 'LittlePigs',
              position: { q: 4, r: 8 },
              unitIds: ['pigs-1'],
            },
          },
        } as any}
        onSelectUnit={vi.fn()}
      />,
    )

    expect(screen.getByTestId('combat-unit-pigs-1').textContent).toContain('Little Pigs 1')
    expect(screen.getByTestId('combat-unit-pigs-1').textContent).not.toContain('LittlePigs:4,8')
    expect(screen.getByTestId('combat-unit-pigs-1').textContent).not.toContain('Little Pigs group 1')
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
        activeRole="defender"
        activeTurnActive={true}
        activeMode="fire"
        activeSelectedUnitIds={[]}
        displayedDefenders={displayedDefenders}
        displayedOnion={onion}
        isCombatPhase={false}
        isMovementPhase
        isSelectionLocked={false}
        stacksExpandable
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
    expect(screen.getByTestId('move-stack-group-pigs-1').dataset.expanded).toBe('false')
    fireEvent.click(screen.getByTestId('combat-unit-pigs-1'))
    expect(onSelectUnit).toHaveBeenCalledWith('pigs-1', false)
  })

  it('expands defender combat stacks so individual members can be selected for partial attacks', () => {
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
        activeRole="defender"
        activeTurnActive={true}
        activeMode="fire"
        activeSelectedUnitIds={['pigs-1', 'pigs-2', 'pigs-3']}
        displayedDefenders={displayedDefenders}
        displayedOnion={onion}
        isCombatPhase
        isMovementPhase={false}
        isSelectionLocked={false}
        stacksExpandable
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 0"
        stackNaming={stackNaming as any}
        stackRoster={stackRoster as any}
        onSelectUnit={onSelectUnit}
      />,
    )

    expect(screen.getByTestId('combat-stack-group-pigs-1').dataset.expanded).toBe('true')
    expect(screen.getByTestId('combat-stack-member-pigs-1')).not.toBeNull()
    expect(screen.getByTestId('combat-stack-member-pigs-2')).not.toBeNull()
    expect(screen.getByTestId('combat-stack-member-pigs-3')).not.toBeNull()

    fireEvent.click(screen.getByTestId('combat-stack-member-pigs-2'))
    expect(onSelectUnit).toHaveBeenCalledWith('pigs-2', true)
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
        activeRole="defender"
        activeTurnActive={true}
        activeMode="fire"
        activeSelectedUnitIds={['pigs-1', 'pigs-2', 'pigs-3']}
        displayedDefenders={displayedDefenders}
        displayedOnion={onion}
        isCombatPhase
        isMovementPhase={false}
        isSelectionLocked={false}
        stacksExpandable
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

  it('keeps grouped defender stacks collapsed for inactive viewers', () => {
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
    ]
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
        activeRole="onion"
        activeTurnActive={false}
        activeMode="fire"
        activeSelectedUnitIds={['pigs-1', 'pigs-2']}
        displayedDefenders={displayedDefenders}
        displayedOnion={onion}
        isCombatPhase
        isMovementPhase={false}
        isSelectionLocked={false}
        stacksExpandable={false}
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 2"
        stackNaming={{
          groupsInUse: [
            { groupKey: 'LittlePigs:4,4', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
          ],
          usedGroupNames: ['Little Pigs group 1'],
        } as any}
        stackRoster={{
          groupsById: {
            'LittlePigs:4,4': {
              groupName: 'Little Pigs group 1',
              unitType: 'LittlePigs',
              position: { q: 4, r: 4 },
              unitIds: ['pigs-1', 'pigs-2'],
            },
          },
        } as any}
        onSelectUnit={vi.fn()}
      />,
    )

    expect(screen.getByTestId('combat-stack-group-pigs-1').dataset.expanded).toBe('false')
    expect(screen.queryByTestId('combat-stack-member-pigs-1')).toBeNull()
    expect(screen.queryByTestId('combat-stack-member-pigs-2')).toBeNull()
  })

  it('lets an inactive Onion player inspect defender stacks from the left rail during defender combat', () => {
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
        weapons: 'main: spent',
        attack: '1 / rng 1',
        actionableModes: [],
      },
      {
        id: 'pigs-2',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 2',
        status: 'operational',
        q: 4,
        r: 4,
        move: 3,
        weapons: 'main: spent',
        attack: '1 / rng 1',
        actionableModes: [],
      },
    ]
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
        activeRole="onion"
        activeTurnActive={false}
        activeMode="fire"
        activeSelectedUnitIds={[]}
        displayedDefenders={displayedDefenders}
        displayedOnion={onion}
        isCombatPhase
        isMovementPhase={false}
        isSelectionLocked={false}
        stacksExpandable={false}
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 0"
        stackNaming={{
          groupsInUse: [
            { groupKey: 'LittlePigs:4,4', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
          ],
          usedGroupNames: ['Little Pigs group 1'],
        } as any}
        stackRoster={{
          groupsById: {
            'LittlePigs:4,4': {
              groupName: 'Little Pigs group 1',
              unitType: 'LittlePigs',
              position: { q: 4, r: 4 },
              unitIds: ['pigs-1', 'pigs-2'],
            },
          },
        } as any}
        onSelectUnit={onSelectUnit}
      />,
    )

    const groupButton = screen.getByTestId('combat-unit-pigs-1')
    expect(groupButton).not.toHaveAttribute('disabled')

    fireEvent.click(groupButton)
    expect(onSelectUnit).toHaveBeenCalledWith('pigs-1', false)
  })
})
