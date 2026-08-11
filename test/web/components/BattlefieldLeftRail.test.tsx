// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BattlefieldLeftRail } from '#web/components/BattlefieldLeftRail'
import type { BattlefieldOnionView } from '#web/lib/battlefieldView'
import { canonicalizeBattlefieldDefenders, type BattlefieldDefenderFixture } from '#test/utils/gameStateUtils'
import { createSessionCatalog } from '#web/lib/sessionCatalog'
import { getUnitTypeCatalog, getWeaponTypeCatalog } from '#shared/unitDefinitions'
import type { StackNamingSnapshot } from '#shared/stackNaming'
import type { StackRosterState } from '#shared/types/index'

const sessionCatalog = createSessionCatalog(getUnitTypeCatalog(), getWeaponTypeCatalog())

describe('BattlefieldLeftRail', () => {
  it('renders onion weapon metadata from the session catalog', () => {
    const weaponType = sessionCatalog.weaponTypes['TheOnion.main']
    const onion: BattlefieldOnionView = {
      id: 'onion-1',
      type: 'TheOnion',
      position: { q: 0, r: 0 },
      status: 'operational',
      treads: 33,
      movesAllowed: 3,
      movesRemaining: 3,
      rams: 0,
      weapons: 'main: ready',
      weaponDetails: [{
        id: 'main-1',
        typeId: 'TheOnion.main',
        weaponClass: 'main',
        state: 'ready',
        friendlyName: 'Runtime Main',
      }],
    }

    render(
      <BattlefieldLeftRail
        activeCombatRole="onion"
        activeRole="onion"
        activeTurnActive
        activeMode="fire"
        activeSelectedUnitIds={[]}
        displayedDefenders={[]}
        displayedOnion={onion}
        isCombatPhase
        isMovementPhase={false}
        isSelectionLocked={false}
        stacksExpandable={false}
        onionWeapons={{ operationalWeapons: 1, operationalMissiles: 0 }}
        readyWeaponDetails={onion.weaponDetails ?? []}
        selectedCombatAttackLabel="Attack 0"
        catalog={sessionCatalog}
        onSelectUnit={vi.fn()}
      />,
    )

    const weaponCard = screen.getByTestId('combat-weapon-main-1')
    expect(weaponCard.textContent).toContain(weaponType.name)
    expect(weaponCard.textContent).toContain(`Attack: ${weaponType.attack}`)
    expect(weaponCard.textContent).toContain(`Range: ${weaponType.range}`)
  })

  it('renders one combat group card from canonical roster membership even when members are on different hexes', () => {
    const displayedDefenders: BattlefieldDefenderFixture[] = [
      {
        id: 'pigs-1',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 1',
        status: 'operational',
        position: { q: 4, r: 4 },
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
        position: { q: 5, r: 4 },
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
      }
    }
    const onion: BattlefieldOnionView = {
      id: 'onion-1',
      type: 'TheOnion',
      position: {  q: 0, r: 0  },
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
        displayedDefenders={canonicalizeBattlefieldDefenders(displayedDefenders)}
        displayedOnion={onion}
        isCombatPhase
        isMovementPhase={false}
        isSelectionLocked={false}
        stacksExpandable
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 0"
        stackNaming={stackNaming as StackNamingSnapshot}
        stackRoster={stackRoster as StackRosterState}
        onSelectUnit={vi.fn()}
      />,
    )

    expect(screen.getByTestId('combat-unit-pigs-1').textContent).toContain('Little Pigs group 1')
    expect(screen.getByTestId('battlefield-left-rail-combat-groups')).not.toBeNull()
    expect(screen.getByTestId('combat-stack-group-pigs-1').dataset.expanded).toBe('false')
    expect(screen.queryByTestId('combat-stack-member-pigs-1')).toBeNull()
    expect(screen.queryByTestId('combat-stack-member-pigs-2')).toBeNull()
  })

  it('shows the canonical stack name instead of the first member friendly name', () => {
    const displayedDefenders: BattlefieldDefenderFixture[] = [
      {
        id: 'pigs-4',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 4',
        status: 'operational',
        position: { q: 5, r: 5 },
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
        position: { q: 5, r: 5 },
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
      }
    }
    const onion: BattlefieldOnionView = {
      id: 'onion-1',
      type: 'TheOnion',
      position: {  q: 0, r: 0  },
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
        displayedDefenders={canonicalizeBattlefieldDefenders(displayedDefenders)}
        displayedOnion={onion}
        isCombatPhase={false}
        isMovementPhase
        isSelectionLocked={false}
        stacksExpandable
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 0"
        stackNaming={stackNaming as StackNamingSnapshot}
        stackRoster={stackRoster as StackRosterState}
        onSelectUnit={vi.fn()}
      />,
    )

    expect(screen.getByTestId('combat-unit-pigs-4').textContent).toContain('Little Pigs group 5')
    expect(screen.getByTestId('combat-unit-pigs-4').textContent).not.toContain('Little Pigs 4')
  })

  it('renders singleton stack-roster placeholders with the unit label instead of a group fallback', () => {
    const displayedDefenders: BattlefieldDefenderFixture[] = [
      {
        id: 'pigs-1',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 1',
        status: 'operational',
        position: { q: 4, r: 8 },
        move: 3,
        weapons: 'main: ready',
        attack: '1 / rng 1',
        actionableModes: ['fire', 'combined'],
      },
    ]
    const onion: BattlefieldOnionView = {
      id: 'onion-1',
      type: 'TheOnion',
      position: {  q: 0, r: 0  },
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
        displayedDefenders={canonicalizeBattlefieldDefenders(displayedDefenders)}
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
        } as StackNamingSnapshot}
        stackRoster={{
          groupsById: {
            'LittlePigs:4,8': {
              groupName: 'Little Pigs group 1',
              unitType: 'LittlePigs',
              position: { q: 4, r: 8 },
              unitIds: ['pigs-1'],
            },
          }
        } as StackRosterState}
        catalog={sessionCatalog}
        onSelectUnit={vi.fn()}
      />,
    )

    expect(screen.getByTestId('combat-unit-pigs-1').textContent).toContain('Little Pigs 1')
    expect(screen.getByTestId('combat-unit-pigs-1').textContent).not.toContain('LittlePigs:4,8')
    expect(screen.getByTestId('combat-unit-pigs-1').textContent).not.toContain('Little Pigs group 1')
  })

  it('shows a diagnostic error overlay instead of crashing when grouped move data is missing', () => {
    const displayedDefenders: BattlefieldDefenderFixture[] = [
      {
        id: 'pigs-5',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 5',
        status: 'operational',
        position: { q: 4, r: 8 },
        move: 3,
        weapons: 'main: ready',
        attack: '1 / rng 1',
        squads: 2,
        actionableModes: ['fire', 'combined'],
      },
    ]
    const onion: BattlefieldOnionView = {
      id: 'onion-1',
      type: 'TheOnion',
      position: {  q: 0, r: 0  },
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
        displayedDefenders={canonicalizeBattlefieldDefenders(displayedDefenders)}
        displayedOnion={onion}
        isCombatPhase={false}
        isMovementPhase
        isSelectionLocked={false}
        stacksExpandable
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 0"
        stackNaming={{ groupsInUse: [], usedGroupNames: [] } as StackNamingSnapshot}
        stackRoster={undefined}
        onSelectUnit={vi.fn()}
      />,
    )

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Missing stackNaming entry for grouped unit pigs-5')
    expect(alert.textContent).toContain('selectedUnitId=pigs-5')
    expect(alert.textContent).toContain('stackRosterGroups=none')
  })

  it('renders Little Pigs as a grouped move card with individually toggle-able members', () => {
    const onSelectUnit = vi.fn()
    const displayedDefenders: BattlefieldDefenderFixture[] = [
      {
        id: 'pigs-1',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 1',
        status: 'operational',
        position: { q: 4, r: 4 },
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
        position: { q: 4, r: 4 },
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
        position: { q: 4, r: 4 },
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
      }
    }
    const onion: BattlefieldOnionView = {
      id: 'onion-1',
      type: 'TheOnion',
      position: { 
        q: 0, r: 0 },
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
        displayedDefenders={canonicalizeBattlefieldDefenders(displayedDefenders)}
        displayedOnion={onion}
        isCombatPhase={false}
        isMovementPhase
        isSelectionLocked={false}
        stacksExpandable
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 0"
        stackNaming={stackNaming as StackNamingSnapshot}
        stackRoster={stackRoster as StackRosterState}
        catalog={sessionCatalog}
        onSelectUnit={onSelectUnit}
      />,
    )

    expect(screen.getByTestId('combat-unit-pigs-1').textContent).toContain('Little Pigs group 1')
    expect(screen.getByTestId('combat-unit-pigs-1').textContent).toContain('3/3')
    expect(screen.getByTestId('combat-unit-pigs-1').textContent).toContain('Move: 3')
    expect(screen.getByTestId('battlefield-left-rail-move-groups')).not.toBeNull()
    expect(screen.getByTestId('move-stack-group-pigs-1').dataset.expanded).toBe('false')
    fireEvent.click(screen.getByTestId('combat-unit-pigs-1'))
    expect(onSelectUnit).toHaveBeenCalledWith('pigs-1', false)
  })

  it('keeps all roster defenders available when another move group is selected', () => {
    const displayedDefenders: BattlefieldDefenderFixture[] = [1, 2, 3, 4, 5].map((unitNumber) => ({
      id: `pigs-${unitNumber}`,
      type: 'LittlePigs',
      friendlyName: `Little Pigs ${unitNumber}`,
      status: 'operational',
      position: { q: unitNumber <= 3 ? 4 : 5, r: 7 },
      move: 1,
      weapons: 'rifle: ready',
      attack: '1 / rng 1',
      actionableModes: ['fire', 'combined'],
    }))
    const onion: BattlefieldOnionView = {
      id: 'onion-1',
      type: 'TheOnion',
      position: { q: 0, r: 0 },
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
        activeTurnActive
        activeMode="fire"
        activeSelectedUnitIds={['pigs-1', 'pigs-2', 'pigs-3']}
        displayedDefenders={canonicalizeBattlefieldDefenders(displayedDefenders)}
        displayedOnion={onion}
        isCombatPhase={false}
        isMovementPhase
        isSelectionLocked={false}
        stacksExpandable
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 0"
        stackNaming={{
          groupsInUse: [
            { groupKey: 'LittlePigs:4,7', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
            { groupKey: 'LittlePigs:5,7', groupName: 'Little Pigs group 2', unitType: 'LittlePigs' },
          ],
          usedGroupNames: ['Little Pigs group 1', 'Little Pigs group 2'],
        } as StackNamingSnapshot}
        stackRoster={{
          groupsById: {
            'LittlePigs:4,7': {
              groupName: 'Little Pigs group 1',
              unitType: 'LittlePigs',
              position: { q: 4, r: 7 },
              unitIds: ['pigs-1', 'pigs-2', 'pigs-3'],
            },
            'LittlePigs:5,7': {
              groupName: 'Little Pigs group 2',
              unitType: 'LittlePigs',
              position: { q: 5, r: 7 },
              unitIds: ['pigs-4', 'pigs-5'],
            },
          },
        } as StackRosterState}
        catalog={sessionCatalog}
        onSelectUnit={vi.fn()}
      />,
    )

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByTestId('combat-unit-pigs-1').textContent).toContain('Little Pigs group 1')
    expect(screen.getByTestId('combat-unit-pigs-4').textContent).toContain('Little Pigs group 2')
  })

  it('shows the movement badge for an Onion viewer during defender movement', () => {
    const displayedDefenders: BattlefieldDefenderFixture[] = [
      {
        id: 'pigs-1',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 1',
        status: 'operational',
        position: { q: 4, r: 4 },
        move: 3,
        weapons: 'main: ready',
        attack: '1 / rng 1',
        actionableModes: [],
      },
      {
        id: 'pigs-2',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 2',
        status: 'operational',
        position: { q: 4, r: 4 },
        move: 3,
        weapons: 'main: ready',
        attack: '1 / rng 1',
        actionableModes: [],
      },
    ]
    const onion: BattlefieldOnionView = {
      id: 'onion-1',
      type: 'TheOnion',
      position: {  q: 0, r: 0  },
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
        displayedDefenders={canonicalizeBattlefieldDefenders(displayedDefenders)}
        displayedOnion={onion}
        isCombatPhase={false}
        isMovementPhase
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
        } as StackNamingSnapshot}
        stackRoster={{
          groupsById: {
            'LittlePigs:4,4': {
              groupName: 'Little Pigs group 1',
              unitType: 'LittlePigs',
              position: { q: 4, r: 4 },
              unitIds: ['pigs-1', 'pigs-2'],
            },
          }
        } as StackRosterState}
        catalog={sessionCatalog}
        onSelectUnit={vi.fn()}
      />,
    )

    expect(screen.getByTestId('combat-unit-pigs-1').textContent).toContain('2/2')
  })

  it('expands defender combat stacks so individual members can be selected for partial attacks', () => {
    const onSelectUnit = vi.fn()
    const displayedDefenders: BattlefieldDefenderFixture[] = [
      {
        id: 'pigs-1',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 1',
        status: 'operational',
        position: { q: 4, r: 4 },
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
        position: { q: 4, r: 4 },
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
        position: { q: 4, r: 4 },
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
      }
    }
    const onion: BattlefieldOnionView = {
      id: 'onion-1',
      type: 'TheOnion',
      position: {  q: 0, r: 0  },
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
        activeSelectedUnitIds={['pigs-1', 'pigs-2']}
        displayedDefenders={canonicalizeBattlefieldDefenders(displayedDefenders)}
        displayedOnion={onion}
        isCombatPhase
        isMovementPhase={false}
        isSelectionLocked={false}
        stacksExpandable
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 0"
        stackNaming={stackNaming as StackNamingSnapshot}
        stackRoster={stackRoster as StackRosterState}
        catalog={sessionCatalog}
        onSelectUnit={onSelectUnit}
      />,
    )

    expect(screen.getByTestId('combat-stack-group-pigs-1').dataset.expanded).toBe('true')
    expect(screen.getByTestId('combat-stack-member-pigs-1')).not.toBeNull()
    expect(screen.getByTestId('combat-stack-member-pigs-2')).not.toBeNull()
    expect(screen.getByTestId('combat-stack-member-pigs-3')).not.toBeNull()
    expect(screen.getByTestId('combat-unit-pigs-1').textContent).toContain('Attack: 2')

    fireEvent.click(screen.getByTestId('combat-stack-member-pigs-2'))
    expect(onSelectUnit).toHaveBeenCalledWith('pigs-2', true)
  })

  it('renders grouped combat attack totals as numeric sums instead of concatenated strings', () => {
    const displayedDefenders: BattlefieldDefenderFixture[] = [
      {
        id: 'pigs-1',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 1',
        status: 'operational',
        position: { q: 4, r: 4 },
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
        position: { q: 4, r: 4 },
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
        position: { q: 4, r: 4 },
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
      }
    }
    const onion: BattlefieldOnionView = {
      id: 'onion-1',
      type: 'TheOnion',
      position: {  q: 0, r: 0  },
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
        displayedDefenders={canonicalizeBattlefieldDefenders(displayedDefenders)}
        displayedOnion={onion}
        isCombatPhase
        isMovementPhase={false}
        isSelectionLocked={false}
        stacksExpandable
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 3"
        stackNaming={stackNaming as StackNamingSnapshot}
        stackRoster={stackRoster as StackRosterState}
        onSelectUnit={vi.fn()}
      />,
    )

  })

  it('shows 0/2 when every defender in a combat stack has already fired', () => {
    const displayedDefenders: BattlefieldDefenderFixture[] = [
      {
        id: 'pigs-1',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 1',
        status: 'operational',
        position: { q: 4, r: 4 },
        move: 3,
        weapons: 'main: spent',
        weaponDetails: [
          { id: 'pigs-1-main', name: 'Main Gun', attack: 1, range: 1, defense: 0, status: 'spent', individuallyTargetable: false },
        ],
        attack: '1 / rng 1',
        actionableModes: ['fire', 'combined'],
      },
      {
        id: 'pigs-2',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 2',
        status: 'operational',
        position: { q: 4, r: 4 },
        move: 3,
        weapons: 'main: spent',
        weaponDetails: [
          { id: 'pigs-2-main', name: 'Main Gun', attack: 1, range: 1, defense: 0, status: 'spent', individuallyTargetable: false },
        ],
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
      }
    }
    const onion: BattlefieldOnionView = {
      id: 'onion-1',
      type: 'TheOnion',
      position: {  q: 0, r: 0  },
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
        displayedDefenders={canonicalizeBattlefieldDefenders(displayedDefenders)}
        displayedOnion={onion}
        isCombatPhase
        isMovementPhase={false}
        isSelectionLocked={false}
        stacksExpandable
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 0"
        stackNaming={stackNaming as StackNamingSnapshot}
        stackRoster={stackRoster as StackRosterState}
        onSelectUnit={vi.fn()}
      />,
    )

    expect(screen.getByTestId('combat-unit-pigs-1').textContent).toContain('0/2')
    expect(screen.getByTestId('combat-unit-pigs-1').textContent).toContain('Attack: 0')
  })

  it('shows the selected subset attack when only part of a defender stack is selected', () => {
    const displayedDefenders: BattlefieldDefenderFixture[] = [
      {
        id: 'pigs-1',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 1',
        status: 'operational',
        position: { q: 4, r: 4 },
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
        position: { q: 4, r: 4 },
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
      }
    }
    const onion: BattlefieldOnionView = {
      id: 'onion-1',
      type: 'TheOnion',
      position: {  q: 0, r: 0  },
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
        activeSelectedUnitIds={['pigs-1']}
        displayedDefenders={canonicalizeBattlefieldDefenders(displayedDefenders)}
        displayedOnion={onion}
        isCombatPhase
        isMovementPhase={false}
        isSelectionLocked={false}
        stacksExpandable
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 1"
        stackNaming={stackNaming as StackNamingSnapshot}
        stackRoster={stackRoster as StackRosterState}
        catalog={sessionCatalog}
        onSelectUnit={vi.fn()}
      />,
    )

    expect(screen.getByTestId('combat-unit-pigs-1').textContent).toContain('1/2')
    expect(screen.getByTestId('combat-unit-pigs-1').textContent).toContain('Attack: 1')
  })

  it('keeps grouped defender stacks collapsed for inactive viewers', () => {
    const displayedDefenders: BattlefieldDefenderFixture[] = [
      {
        id: 'pigs-1',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 1',
        status: 'operational',
        position: { q: 4, r: 4 },
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
        position: { q: 4, r: 4 },
        move: 3,
        weapons: 'main: ready',
        attack: '1 / rng 1',
        actionableModes: ['fire', 'combined'],
      },
    ]
    const onion: BattlefieldOnionView = {
      id: 'onion-1',
      type: 'TheOnion',
      position: {  q: 0, r: 0  },
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
        displayedDefenders={canonicalizeBattlefieldDefenders(displayedDefenders)}
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
        } as StackNamingSnapshot}
        stackRoster={{
          groupsById: {
            'LittlePigs:4,4': {
              groupName: 'Little Pigs group 1',
              unitType: 'LittlePigs',
              position: { q: 4, r: 4 },
              unitIds: ['pigs-1', 'pigs-2'],
            },
          }
        } as StackRosterState}
        onSelectUnit={vi.fn()}
      />,
    )

    expect(screen.getByTestId('combat-stack-group-pigs-1').dataset.expanded).toBe('false')
    expect(screen.queryByTestId('combat-stack-member-pigs-1')).toBeNull()
    expect(screen.queryByTestId('combat-stack-member-pigs-2')).toBeNull()
  })

  it('lets an inactive Onion player inspect defender stacks from the left rail during defender combat', () => {
    const onSelectUnit = vi.fn()
    const displayedDefenders: BattlefieldDefenderFixture[] = [
      {
        id: 'pigs-1',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 1',
        status: 'operational',
        position: { q: 4, r: 4 },
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
        position: { q: 4, r: 4 },
        move: 3,
        weapons: 'main: spent',
        attack: '1 / rng 1',
        actionableModes: [],
      },
    ]
    const onion: BattlefieldOnionView = {
      id: 'onion-1',
      type: 'TheOnion',
      position: {  q: 0, r: 0  },
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
        displayedDefenders={canonicalizeBattlefieldDefenders(displayedDefenders)}
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
        } as StackNamingSnapshot}
        stackRoster={{
          groupsById: {
            'LittlePigs:4,4': {
              groupName: 'Little Pigs group 1',
              unitType: 'LittlePigs',
              position: { q: 4, r: 4 },
              unitIds: ['pigs-1', 'pigs-2'],
            },
          }
        } as StackRosterState}
        onSelectUnit={onSelectUnit}
      />,
    )

    const groupButton = screen.getByTestId('combat-unit-pigs-1')
    expect(groupButton.hasAttribute('disabled')).toBe(false)

    fireEvent.click(groupButton)
    expect(onSelectUnit).toHaveBeenCalledWith('pigs-1', false)
  })
})
