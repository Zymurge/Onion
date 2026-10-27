// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'

import { BattlefieldLeftRail } from '#web/components/BattlefieldLeftRail'
import { HexMapUnitMarker } from '#web/components/HexMapUnitMarker'
import type { BattlefieldOnionView } from '#web/lib/battlefieldView'
import type { CombatWeaponDetail } from '#web/lib/actionEligibility/reasons'
import { buildBattlefieldActionEligibility, type BattlefieldActionEligibility } from '#web/lib/actionEligibility/projection'
import { canonicalizeBattlefieldDefenders, canonicalizeBattlefieldOnion, type BattlefieldDefenderFixture, type BattlefieldOnionFixture } from '#test/utils/gameStateUtils'
import { createSessionCatalog } from '#web/lib/sessionCatalog'
import { getUnitTypeCatalog, getWeaponTypeCatalog } from '#shared/unitDefinitions'
import type { StackNamingSnapshot } from '#shared/stackNaming/index'
import type { StackRosterState } from '#shared/types/index'

const sessionCatalog = createSessionCatalog(getUnitTypeCatalog(), getWeaponTypeCatalog())
type LeftRailProps = ComponentProps<typeof BattlefieldLeftRail>

function createOnion(overrides: Partial<BattlefieldOnionFixture> = {}): BattlefieldOnionView {
  return canonicalizeBattlefieldOnion({
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
    ...overrides,
  })
}

function createLeftRailProps(overrides: Partial<LeftRailProps> = {}): LeftRailProps {
  return {
    activeCombatRole: null,
    activeRole: 'onion',
    activeTurnActive: true,
    activeMode: 'fire',
    activeSelectedUnitIds: [],
    displayedDefenders: [],
    displayedOnion: null,
    isCombatPhase: false,
    isMovementPhase: false,
    isSelectionLocked: false,
    stacksExpandable: false,
    onionWeapons: { operationalWeapons: 0, operationalMissiles: 0 },
    readyWeaponDetails: [],
    selectedCombatAttackLabel: 'Attack 0',
    onSelectUnit: vi.fn(),
    ...overrides,
  }
}

function renderLeftRail(overrides: Partial<LeftRailProps> = {}) {
  return render(<BattlefieldLeftRail {...createLeftRailProps(overrides)} />)
}

describe('BattlefieldLeftRail', () => {
  function emptyActionEligibility(): BattlefieldActionEligibility {
    return {
      movementByUnitId: {},
      defenderCombatByUnitId: {},
      onionCombatByWeaponId: {},
    }
  }

  it('uses projected movement eligibility for defender highlighting', () => {
    const defender = canonicalizeBattlefieldDefenders([{
      id: 'swamp-1',
      type: 'Swamp',
      friendlyName: 'The Swamp',
      status: 'operational',
      position: { q: 1, r: 1 },
      move: 3,
      weapons: 'main: ready',
      attack: '1 / rng 1',
      actionableModes: ['fire'],
    }])

    renderLeftRail({
      activeCombatRole: 'defender',
      activeRole: 'defender',
      activeTurnActive: true,
      isMovementPhase: true,
      displayedDefenders: defender,
      actionEligibility: {
        ...emptyActionEligibility(),
        movementByUnitId: {
          'swamp-1': { eligible: false, reason: 'no-movement-remaining' },
        },
      },
    })

    expect(screen.getByTestId('combat-unit-swamp-1')).not.toHaveClass('is-actionable')
  })

  it('highlights a combat stack when one member remains eligible', () => {
    const displayedDefenders = canonicalizeBattlefieldDefenders([
      {
        id: 'pigs-1',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 1',
        status: 'operational',
        position: { q: 1, r: 1 },
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
        position: { q: 1, r: 1 },
        move: 3,
        weapons: 'main: ready',
        attack: '1 / rng 1',
        actionableModes: [],
      },
    ])

    renderLeftRail({
      activeCombatRole: 'defender',
      activeRole: 'defender',
      activeTurnActive: true,
      isCombatPhase: true,
      stacksExpandable: true,
      displayedDefenders,
      stackNaming: {
        groupsInUse: [{ groupId: 'group-1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' }],
        usedGroupNames: ['Little Pigs group 1'],
      },
      stackRoster: {
        groupsById: {
          'group-1': {
            groupName: 'Little Pigs group 1',
            unitType: 'LittlePigs',
            position: { q: 1, r: 1 },
            unitIds: ['pigs-1', 'pigs-2'],
          },
        },
      },
      actionEligibility: {
        ...emptyActionEligibility(),
        defenderCombatByUnitId: {
          'pigs-1': { eligibility: { eligible: false, reason: 'attacks-spent' }, targetIds: [], targetHexKeys: [] },
          'pigs-2': { eligibility: { eligible: true }, targetIds: ['onion-1'], targetHexKeys: ['0,0'] },
        },
      },
    })

    expect(screen.getByTestId('combat-unit-pigs-1')).toHaveClass('is-actionable')
  })

  it.each([
    { description: 'a legal target is available', status: 'operational' as const, weaponDetails: [{ id: 'main-1', typeId: 'Puss.main', weaponClass: 'main' as const, state: 'ready' as const }], hasLegalTarget: true, viewerActive: true, expected: true },
    { description: 'no target is in range', status: 'operational' as const, weaponDetails: [{ id: 'main-1', typeId: 'Puss.main', weaponClass: 'main' as const, state: 'ready' as const }], hasLegalTarget: false, viewerActive: true, expected: false },
    { description: 'all attacks are spent', status: 'operational' as const, weaponDetails: [{ id: 'main-1', typeId: 'Puss.main', weaponClass: 'main' as const, state: 'spent' as const }], hasLegalTarget: true, viewerActive: true, expected: false },
    { description: 'the unit has no weapons', status: 'operational' as const, weaponDetails: [], hasLegalTarget: true, viewerActive: true, expected: false },
    { description: 'the unit is disabled', status: 'disabled' as const, weaponDetails: [{ id: 'main-1', typeId: 'Puss.main', weaponClass: 'main' as const, state: 'ready' as const }], hasLegalTarget: true, viewerActive: true, expected: false },
    { description: 'the unit is destroyed', status: 'destroyed' as const, weaponDetails: [{ id: 'main-1', typeId: 'Puss.main', weaponClass: 'main' as const, state: 'ready' as const }], hasLegalTarget: true, viewerActive: true, expected: false },
    { description: 'the viewer is inactive', status: 'operational' as const, weaponDetails: [{ id: 'main-1', typeId: 'Puss.main', weaponClass: 'main' as const, state: 'ready' as const }], hasLegalTarget: true, viewerActive: false, expected: false },
  ])('keeps map and rail combat highlights aligned when $description', ({ status, weaponDetails, hasLegalTarget, viewerActive, expected }) => {
    const displayedDefenders = canonicalizeBattlefieldDefenders([{
      id: 'puss-1',
      type: 'Puss',
      friendlyName: 'Puss 1',
      status,
      position: { q: 1, r: 1 },
      move: 3,
      weaponDetails,
      attack: '4 / rng 3',
      actionableModes: weaponDetails.some((weapon) => weapon.state === 'ready') ? ['fire'] : [],
    }])
    const defender = displayedDefenders[0]
    const actionEligibility = buildBattlefieldActionEligibility({
      phase: 'DEFENDER_COMBAT',
      viewerRole: viewerActive ? 'defender' : null,
      defenders: displayedDefenders,
      onion: null,
      targetOptionsByDefenderId: {
        'puss-1': hasLegalTarget ? [{ id: 'onion-1', q: 0, r: 0 }] : [],
      },
      targetOptionsByWeaponId: {},
    })

    render(
      <>
        <BattlefieldLeftRail
          {...createLeftRailProps({
            activeCombatRole: 'defender',
            activeRole: 'defender',
            activeTurnActive: viewerActive,
            isCombatPhase: true,
            displayedDefenders,
            actionEligibility,
            catalog: sessionCatalog,
          })}
        />
        <svg>
          <HexMapUnitMarker
            actionEligibility={actionEligibility}
            activeCombatRole="defender"
            center={{ x: 36, y: 36 }}
            combatMembers={[defender]}
            isCombatPhase
            isMovementPhase={false}
            isOccupantSelected={false}
            isSelectionLocked={false}
            occupant={defender}
            offsetIndex={0}
            renderedOccupantCount={1}
            onion={createOnion()}
            phase="DEFENDER_COMBAT"
            resolvedPhaseMode="combat"
            resolvedViewerActivity={viewerActive ? 'active' : 'inactive'}
            resolvedViewerRole="defender"
            routeMapInteraction={() => ({ intent: 'noop', reason: 'test' })}
            rosterGroup={null}
            onDeselect={vi.fn()}
            onSelectUnit={vi.fn()}
          />
        </svg>
      </>,
    )

    const markerIsActionable = screen.getByTestId('hex-unit-puss-1').classList.contains('hex-unit-stack-combat-ready')
    const railIsActionable = screen.getByTestId('combat-unit-puss-1').classList.contains('is-actionable')
    expect(markerIsActionable).toBe(expected)
    expect(railIsActionable).toBe(expected)
    expect(markerIsActionable).toBe(railIsActionable)
  })

  it.each([
    { description: 'Onion movement remains', phase: 'ONION_MOVE' as const, role: 'onion' as const, viewerRole: 'onion' as const, movesRemaining: 1, active: true, expected: true },
    { description: 'Onion movement is spent', phase: 'ONION_MOVE' as const, role: 'onion' as const, viewerRole: 'onion' as const, movesRemaining: 0, active: true, expected: false },
    { description: 'Onion movement is viewed by the inactive player', phase: 'ONION_MOVE' as const, role: 'onion' as const, viewerRole: 'defender' as const, movesRemaining: 1, active: false, expected: false },
    { description: 'Defender movement remains', phase: 'DEFENDER_MOVE' as const, role: 'defender' as const, viewerRole: 'defender' as const, movesRemaining: 1, active: true, expected: true },
    { description: 'Defender movement is spent', phase: 'DEFENDER_MOVE' as const, role: 'defender' as const, viewerRole: 'defender' as const, movesRemaining: 0, active: true, expected: false },
    { description: 'GEV secondary movement remains', phase: 'GEV_SECOND_MOVE' as const, role: 'defender' as const, viewerRole: 'defender' as const, movesRemaining: 1, active: true, expected: true },
    { description: 'GEV secondary movement is spent', phase: 'GEV_SECOND_MOVE' as const, role: 'defender' as const, viewerRole: 'defender' as const, movesRemaining: 0, active: true, expected: false },
  ])('keeps map and rail movement indicators aligned when $description', ({ phase, role, viewerRole, movesRemaining, active, expected }) => {
    const defenders = role === 'defender'
      ? canonicalizeBattlefieldDefenders([{
        id: 'puss-1',
        type: 'Puss',
        friendlyName: 'Puss 1',
        status: 'operational',
        position: { q: 1, r: 1 },
        movesRemaining,
        move: 3,
        weapons: 'main: ready',
        attack: '4 / rng 3',
        actionableModes: ['fire'],
      }])
      : []
    const onionUnit = role === 'onion'
      ? createOnion({ movesRemaining, position: { q: 1, r: 1 } })
      : null
    const occupant = role === 'onion' ? onionUnit! : defenders[0]!
    const actionEligibility = buildBattlefieldActionEligibility({
      phase,
      viewerRole,
      defenders,
      onion: onionUnit,
      targetOptionsByDefenderId: {},
      targetOptionsByWeaponId: {},
    })

    render(
      <>
        <BattlefieldLeftRail
          {...createLeftRailProps({
            activeCombatRole: role,
            activeRole: viewerRole,
            activeTurnActive: active,
            isMovementPhase: true,
            displayedDefenders: defenders,
            displayedOnion: onionUnit,
            actionEligibility,
            catalog: sessionCatalog,
          })}
        />
        <svg>
          <HexMapUnitMarker
            actionEligibility={actionEligibility}
            activeCombatRole={role}
            center={{ x: 36, y: 36 }}
            combatMembers={[occupant]}
            isCombatPhase={false}
            isMovementPhase
            isOccupantSelected={false}
            isSelectionLocked={false}
            occupant={occupant}
            offsetIndex={0}
            renderedOccupantCount={1}
            onion={onionUnit ?? createOnion()}
            phase={phase}
            resolvedPhaseMode="movement"
            resolvedViewerActivity={active ? 'active' : 'inactive'}
            resolvedViewerRole={viewerRole}
            routeMapInteraction={() => ({ intent: 'noop', reason: 'test' })}
            rosterGroup={null}
            onDeselect={vi.fn()}
            onSelectUnit={vi.fn()}
          />
        </svg>
      </>,
    )

    const markerIsActionable = screen.getByTestId(`hex-unit-${occupant.unitId}`).classList.contains('hex-unit-stack-move-ready')
    const railIsActionable = screen.getByTestId(`combat-unit-${occupant.unitId}`).classList.contains('is-actionable')
    expect(markerIsActionable).toBe(expected)
    expect(railIsActionable).toBe(expected)
    expect(markerIsActionable).toBe(railIsActionable)
  })

  it('keeps Onion map readiness aligned with per-weapon rail eligibility', () => {
    const onion = canonicalizeBattlefieldOnion({
      id: 'onion-1',
      type: 'TheOnion',
      position: { q: 0, r: 0 },
      status: 'operational',
      treads: 33,
      movesAllowed: 3,
      movesRemaining: 3,
      rams: 0,
      weaponDetails: [
        { id: 'main-1', typeId: 'TheOnion.main', weaponClass: 'main', state: 'spent', friendlyName: 'Main Weapon' },
        { id: 'secondary-1', typeId: 'TheOnion.secondary', weaponClass: 'secondary', state: 'ready', friendlyName: 'Secondary Weapon' },
      ],
    })
    const actionEligibility = buildBattlefieldActionEligibility({
      phase: 'ONION_COMBAT',
      viewerRole: 'onion',
      defenders: [],
      onion,
      targetOptionsByDefenderId: {},
      targetOptionsByWeaponId: {
        'main-1': [],
        'secondary-1': [{ id: 'puss-1', q: 1, r: 1 }],
      },
    })

    render(
      <>
        <BattlefieldLeftRail
          {...createLeftRailProps({
            activeCombatRole: 'onion',
            activeRole: 'onion',
            activeTurnActive: true,
            isCombatPhase: true,
            displayedOnion: onion,
            readyWeaponDetails: onion.weapons,
            onionWeapons: { operationalWeapons: 1, operationalMissiles: 0 },
            actionEligibility,
            catalog: sessionCatalog,
          })}
        />
        <svg>
          <HexMapUnitMarker
            actionEligibility={actionEligibility}
            activeCombatRole="onion"
            center={{ x: 36, y: 36 }}
            combatMembers={[onion]}
            isCombatPhase
            isMovementPhase={false}
            isOccupantSelected={false}
            isSelectionLocked={false}
            occupant={onion}
            offsetIndex={0}
            renderedOccupantCount={1}
            onion={onion}
            phase="ONION_COMBAT"
            resolvedPhaseMode="combat"
            resolvedViewerActivity="active"
            resolvedViewerRole="onion"
            routeMapInteraction={() => ({ intent: 'noop', reason: 'test' })}
            rosterGroup={null}
            onDeselect={vi.fn()}
            onSelectUnit={vi.fn()}
          />
        </svg>
      </>,
    )

    expect(screen.getByTestId('combat-weapon-main-1')).not.toHaveClass('is-actionable')
    expect(screen.getByTestId('combat-weapon-secondary-1')).toHaveClass('is-actionable')
    expect(screen.getByTestId('hex-unit-onion-1')).toHaveClass('hex-unit-stack-combat-ready')
  })

  it('keeps partially eligible stack readiness aligned between map and rail', () => {
    const displayedDefenders = canonicalizeBattlefieldDefenders([
      {
        id: 'pigs-1',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 1',
        status: 'operational',
        position: { q: 1, r: 1 },
        weaponDetails: [{ id: 'rifle-1', typeId: 'LittlePigs.rifle', weaponClass: 'main', state: 'spent' }],
        actionableModes: [],
      },
      {
        id: 'pigs-2',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 2',
        status: 'operational',
        position: { q: 1, r: 1 },
        weaponDetails: [{ id: 'rifle-1', typeId: 'LittlePigs.rifle', weaponClass: 'main', state: 'ready' }],
        actionableModes: ['fire'],
      },
    ])
    const stackRoster = {
      groupsById: {
        'group-1': {
          groupName: 'Little Pigs group 1',
          unitType: 'LittlePigs',
          position: { q: 1, r: 1 },
          unitIds: ['pigs-1', 'pigs-2'],
        },
      },
    }
    const stackNaming = {
      groupsInUse: [{ groupId: 'group-1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' }],
      usedGroupNames: ['Little Pigs group 1'],
    }
    const actionEligibility = buildBattlefieldActionEligibility({
      phase: 'DEFENDER_COMBAT',
      viewerRole: 'defender',
      defenders: displayedDefenders,
      onion: null,
      targetOptionsByDefenderId: {
        'pigs-1': [{ id: 'onion-1', q: 0, r: 0 }],
        'pigs-2': [{ id: 'onion-1', q: 0, r: 0 }],
      },
      targetOptionsByWeaponId: {},
    })

    render(
      <>
        <BattlefieldLeftRail
          {...createLeftRailProps({
            activeCombatRole: 'defender',
            activeRole: 'defender',
            activeTurnActive: true,
            isCombatPhase: true,
            stacksExpandable: true,
            displayedDefenders,
            actionEligibility,
            stackNaming,
            stackRoster,
            catalog: sessionCatalog,
          })}
        />
        <svg>
          <HexMapUnitMarker
            actionEligibility={actionEligibility}
            activeCombatRole="defender"
            center={{ x: 36, y: 36 }}
            combatMembers={displayedDefenders}
            isCombatPhase
            isMovementPhase={false}
            isOccupantSelected={false}
            isSelectionLocked={false}
            occupant={displayedDefenders[0]}
            offsetIndex={0}
            renderedOccupantCount={1}
            onion={createOnion()}
            phase="DEFENDER_COMBAT"
            resolvedPhaseMode="combat"
            resolvedViewerActivity="active"
            resolvedViewerRole="defender"
            routeMapInteraction={() => ({ intent: 'noop', reason: 'test' })}
            rosterGroup={{ groupId: 'group-1', unitIds: ['pigs-1', 'pigs-2'] }}
            stackNaming={stackNaming}
            onDeselect={vi.fn()}
            onSelectUnit={vi.fn()}
          />
        </svg>
      </>,
    )

    const markerIsActionable = screen.getByTestId('hex-unit-pigs-1').classList.contains('hex-unit-stack-combat-ready')
    const railIsActionable = screen.getByTestId('combat-unit-pigs-1').classList.contains('is-actionable')
    expect(actionEligibility.defenderCombatByUnitId['pigs-1']?.eligibility.eligible).toBe(false)
    expect(actionEligibility.defenderCombatByUnitId['pigs-2']?.eligibility.eligible).toBe(true)
    expect(markerIsActionable).toBe(true)
    expect(railIsActionable).toBe(true)
    expect(markerIsActionable).toBe(railIsActionable)
  })

  it('uses projected weapon eligibility for Onion highlighting', () => {
    const onion = canonicalizeBattlefieldOnion({
      id: 'onion-1',
      type: 'TheOnion',
      position: { q: 0, r: 0 },
      status: 'operational',
      treads: 33,
      movesAllowed: 3,
      movesRemaining: 3,
      rams: 0,
      weapons: 'main: ready',
      weaponDetails: [{ id: 'main-1', typeId: 'TheOnion.main', weaponClass: 'main', state: 'ready', friendlyName: 'Main Weapon' }],
    })

    renderLeftRail({
      activeCombatRole: 'onion',
      activeRole: 'onion',
      activeTurnActive: true,
      isCombatPhase: true,
      displayedOnion: onion,
      readyWeaponDetails: onion.weapons,
      onionWeapons: { operationalWeapons: 1, operationalMissiles: 0 },
      actionEligibility: {
        ...emptyActionEligibility(),
        onionCombatByWeaponId: {
          'main-1': { eligibility: { eligible: false, reason: 'no-target-in-range' }, targetIds: [], targetHexKeys: [] },
        },
      },
    })

    const weapon = screen.getByTestId('combat-weapon-main-1')
    expect(weapon).not.toHaveClass('is-actionable')
    expect(weapon).toBeDisabled()
  })

  it('renders weapon availability reasons and blocks unavailable weapon selection', () => {
    const onSelectUnit = vi.fn()
    const weapons: CombatWeaponDetail[] = [
      { id: 'destroyed', typeId: 'TheOnion.main', weaponClass: 'main', state: 'destroyed', friendlyName: 'Destroyed gun', disabledReason: 'Destroyed' },
      { id: 'disabled', typeId: 'TheOnion.main', weaponClass: 'main', state: 'ready', friendlyName: 'Disabled gun', disabledReason: 'Disabled' },
      { id: 'out-of-ammo', typeId: 'TheOnion.main', weaponClass: 'main', state: 'ready', friendlyName: 'Empty gun', disabledReason: 'Out of ammo' },
      { id: 'spent', typeId: 'TheOnion.main', weaponClass: 'main', state: 'spent', friendlyName: 'Spent gun', disabledReason: 'Fired this turn' },
      { id: 'no-target', typeId: 'TheOnion.main', weaponClass: 'main', state: 'ready', friendlyName: 'No-target gun', disabledReason: 'No targets in range' },
    ]

    renderLeftRail({
      activeCombatRole: 'onion',
      activeRole: 'onion',
      isCombatPhase: true,
      displayedOnion: createOnion(),
      readyWeaponDetails: weapons,
      onionWeapons: { operationalWeapons: 5, operationalMissiles: 0 },
      catalog: sessionCatalog,
      onSelectUnit,
    })

    for (const weapon of weapons) {
      const card = screen.getByTestId(`combat-weapon-${weapon.id}`)
      expect(card).toBeDisabled()
      expect(card).toHaveAttribute('title', weapon.disabledReason)
      expect(card).toHaveTextContent(weapon.disabledReason ?? '')
      fireEvent.click(card)
    }

    expect(onSelectUnit).not.toHaveBeenCalled()
  })

  it('renders availability reasons on unavailable defender combat groups', () => {
    const cases = [
      { id: 'disabled', status: 'disabled' as const, reason: 'Disabled' },
      { id: 'recovering', status: 'recovering' as const, reason: 'Recovering' },
      { id: 'spent', status: 'operational' as const, reason: 'Fired this turn' },
      { id: 'out-of-range', status: 'operational' as const, reason: 'Out of range' },
    ]
    const displayedDefenders: BattlefieldDefenderFixture[] = cases.map(({ id, status }) => ({
      id: `reason-${id}`,
      type: 'Puss',
      friendlyName: `Puss ${id}`,
      status,
      position: { q: 1, r: 1 },
      move: 3,
      weapons: 'main: ready',
      attack: '1 / rng 1',
      actionableModes: ['fire'],
    }))

    renderLeftRail({
      activeCombatRole: 'defender',
      activeRole: 'defender',
      isCombatPhase: true,
      displayedDefenders: canonicalizeBattlefieldDefenders(displayedDefenders),
      combatUnitAvailabilityReasons: Object.fromEntries(cases.map(({ id, reason }) => [`reason-${id}`, reason])),
      catalog: sessionCatalog,
    })

    for (const { id, reason } of cases) {
      const card = screen.getByTestId(`combat-unit-reason-${id}`)
      expect(card).toHaveAttribute('title', reason)
      expect(card).toHaveTextContent(reason)
    }
  })

  it('renders no attack capabilities for a weaponless defender', () => {
    renderLeftRail({
      activeCombatRole: 'defender',
      activeRole: 'defender',
      activeTurnActive: true,
      isCombatPhase: true,
      displayedDefenders: canonicalizeBattlefieldDefenders([{
        id: 'swamp',
        type: 'Swamp',
        friendlyName: 'The Swamp',
        status: 'operational',
        position: { q: 1, r: 1 },
        weapons: [],
        actionableModes: [],
      }]),
      combatUnitAvailabilityReasons: { swamp: 'No attack capabilities' },
      catalog: sessionCatalog,
    })

    const card = screen.getByTestId('combat-unit-swamp')
    expect(card).toHaveAttribute('title', 'No attack capabilities')
    expect(card).toHaveTextContent('No attack capabilities')
  })

  it('renders onion weapon metadata from the session catalog', () => {
    const weaponType = sessionCatalog.weaponTypes['TheOnion.main']
    const onion: BattlefieldOnionFixture = {
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
        displayedOnion={canonicalizeBattlefieldOnion(onion)}
        isCombatPhase
        isMovementPhase={false}
        isSelectionLocked={false}
        stacksExpandable={false}
        onionWeapons={{ operationalWeapons: 1, operationalMissiles: 0 }}
        readyWeaponDetails={canonicalizeBattlefieldOnion(onion).weapons}
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
        { groupId: 'group-1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
      ],
      usedGroupNames: ['Little Pigs group 1'],
    }
    const stackRoster = {
      groupsById: {
        'group-1': {
          groupName: 'Little Pigs group 1',
          unitType: 'LittlePigs',
          position: { q: 4, r: 4 },
          unitIds: ['pigs-1', 'pigs-2'],
        },
      }
    }
    const onion: BattlefieldOnionFixture = {
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
        displayedOnion={canonicalizeBattlefieldOnion(onion)}
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
        onSelectUnit={vi.fn()}
      />,
    )

    expect(screen.getByTestId('combat-unit-pigs-1').textContent).toContain('Little Pigs group 1')
    expect(screen.getByTestId('battlefield-left-rail-combat-groups')).not.toBeNull()
    expect(screen.getByTestId('combat-stack-group-pigs-1').dataset.expanded).toBe('false')
    expect(screen.queryByTestId('combat-stack-member-pigs-1')).toBeNull()
    expect(screen.queryByTestId('combat-stack-member-pigs-2')).toBeNull()
  })

  it('shows the minimum ready-weapon range across a combat group', () => {
    const displayedDefenders: BattlefieldDefenderFixture[] = [
      {
        id: 'pigs-1',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 1',
        status: 'operational',
        position: { q: 4, r: 4 },
        move: 3,
        weaponDetails: [{ id: 'main-1', typeId: 'Witch.main', status: 'ready' }],
        actionableModes: ['fire', 'combined'],
      },
      {
        id: 'pigs-2',
        type: 'LittlePigs',
        friendlyName: 'Little Pigs 2',
        status: 'operational',
        position: { q: 5, r: 4 },
        move: 3,
        weaponDetails: [{ id: 'main-2', typeId: 'LittlePigs.rifle', status: 'ready' }],
        actionableModes: ['fire', 'combined'],
      },
    ]
    const stackRoster = {
      groupsById: {
        'group-1': {
          groupName: 'Little Pigs group 1',
          unitType: 'LittlePigs',
          position: { q: 4, r: 4 },
          unitIds: ['pigs-1', 'pigs-2'],
        },
      },
    }
    const stackNaming = {
      groupsInUse: [
        { groupId: 'group-1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
      ],
      usedGroupNames: ['Little Pigs group 1'],
    }

    renderLeftRail({
      activeCombatRole: 'defender',
      activeRole: 'defender',
      isCombatPhase: true,
      stacksExpandable: true,
      displayedDefenders: canonicalizeBattlefieldDefenders(displayedDefenders),
      stackNaming: stackNaming as StackNamingSnapshot,
      stackRoster: stackRoster as StackRosterState,
      catalog: sessionCatalog,
    })

    expect(screen.getByTestId('combat-unit-pigs-1').textContent).toContain('Range: 1')
    expect(screen.getByTestId('combat-unit-pigs-1').textContent).not.toContain('Range: 4')
  })

  it('renders a destroyed Little Pigs group without combat attributes', () => {
    const onSelectUnit = vi.fn()
    const displayedDefenders: BattlefieldDefenderFixture[] = [1, 2, 3].map((index) => ({
      id: `pigs-${index}`,
      type: 'LittlePigs',
      friendlyName: `Little Pigs ${index}`,
      status: 'destroyed',
      position: { q: 4, r: 4 },
      move: 3,
      weapons: 'main: ready',
      attack: '1 / rng 1',
      actionableModes: [],
    }))

    renderLeftRail({
      activeCombatRole: 'defender',
      activeRole: 'defender',
      isCombatPhase: true,
      stacksExpandable: true,
      displayedDefenders: canonicalizeBattlefieldDefenders(displayedDefenders),
      stackNaming: {
        groupsInUse: [{ groupId: 'group-1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' }],
        usedGroupNames: ['Little Pigs group 1'],
      },
      stackRoster: {
        groupsById: {
          'group-1': {
            groupName: 'Little Pigs group 1',
            unitType: 'LittlePigs',
            position: { q: 4, r: 4 },
            unitIds: ['pigs-1', 'pigs-2', 'pigs-3'],
          },
        },
      },
      catalog: sessionCatalog,
      onSelectUnit,
    })

    const card = screen.getByTestId('combat-unit-pigs-1')
    expect(card.className).toContain('tone-destroyed')
    expect(card.className).not.toContain('is-actionable')
    expect(card.textContent).toContain('Destroyed')
    expect(card.textContent).not.toContain('Attack:')
    expect(card.textContent).not.toContain('Range:')
    expect(card.textContent).not.toContain('Move:')
    expect(card.textContent).not.toContain('0/3')
    expect((card as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(card)
    expect(onSelectUnit).toHaveBeenCalledWith('pigs-1', false)
  })

  it('marks disabled unit cards with the dim tone used for orange crosshatching', () => {
    const disabledDefender: BattlefieldDefenderFixture = {
      id: 'swamp-1',
      type: 'Swamp',
      friendlyName: 'The Swamp',
      status: 'disabled',
      position: { q: 4, r: 4 },
      move: 0,
      weapons: 'main: ready',
      attack: '1 / rng 1',
      actionableModes: [],
    }

    renderLeftRail({
      activeCombatRole: 'defender',
      activeRole: 'defender',
      isCombatPhase: true,
      displayedDefenders: canonicalizeBattlefieldDefenders([disabledDefender]),
      catalog: sessionCatalog,
    })

    expect(screen.getByTestId('combat-unit-swamp-1')).toHaveClass('tone-dim')
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
        { groupId: 'group-1', groupName: 'Little Pigs group 5', unitType: 'LittlePigs' },
      ],
      usedGroupNames: ['Little Pigs group 5'],
    }
    const stackRoster = {
      groupsById: {
        'group-1': {
          groupName: 'Little Pigs 4',
          unitType: 'LittlePigs',
          position: { q: 5, r: 5 },
          unitIds: ['pigs-4', 'pigs-5'],
        },
      }
    }
    const onion: BattlefieldOnionFixture = {
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
        displayedOnion={canonicalizeBattlefieldOnion(onion)}
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
    const onion: BattlefieldOnionFixture = {
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
        displayedOnion={canonicalizeBattlefieldOnion(onion)}
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
          groupsById: {},
          nextGroupOrdinal: 1,
        } as StackRosterState}
        catalog={sessionCatalog}
        onSelectUnit={vi.fn()}
      />,
    )

    expect(screen.getByTestId('combat-unit-pigs-1').textContent).toContain('Little Pigs 1')
    expect(screen.getByTestId('combat-unit-pigs-1').textContent).not.toContain('group-1')
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
    const onion: BattlefieldOnionFixture = {
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
        displayedOnion={canonicalizeBattlefieldOnion(onion)}
        isCombatPhase={false}
        isMovementPhase
        isSelectionLocked={false}
        stacksExpandable
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 0"
        stackNaming={{ groupsInUse: [], usedGroupNames: [] } as StackNamingSnapshot}
        stackRoster={undefined}
        catalog={sessionCatalog}
        onSelectUnit={vi.fn()}
      />,
    )

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Missing stack roster group for grouped unit pigs-5')
    expect(alert.textContent).toContain('selectedUnitId=pigs-5')
    expect(alert.textContent).toContain('stackRosterGroups=none')

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss error' }))
    expect(screen.queryByRole('alert')).toBeNull()
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
        { groupId: 'group-1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
      ],
      usedGroupNames: ['Little Pigs group 1'],
    }
    const stackRoster = {
      groupsById: {
        'group-1': {
          groupName: 'Little Pigs group 1',
          unitType: 'LittlePigs',
          position: { q: 4, r: 4 },
          unitIds: ['pigs-1', 'pigs-2', 'pigs-3'],
        },
      }
    }
    const onion: BattlefieldOnionFixture = {
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
        displayedOnion={canonicalizeBattlefieldOnion(onion)}
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
    const onion: BattlefieldOnionFixture = {
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
        displayedOnion={canonicalizeBattlefieldOnion(onion)}
        isCombatPhase={false}
        isMovementPhase
        isSelectionLocked={false}
        stacksExpandable
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 0"
        stackNaming={{
          groupsInUse: [
            { groupId: 'group-1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
            { groupId: 'group-2', groupName: 'Little Pigs group 2', unitType: 'LittlePigs' },
          ],
          usedGroupNames: ['Little Pigs group 1', 'Little Pigs group 2'],
        } as StackNamingSnapshot}
        stackRoster={{
          groupsById: {
            'group-1': {
              groupName: 'Little Pigs group 1',
              unitType: 'LittlePigs',
              position: { q: 4, r: 7 },
              unitIds: ['pigs-1', 'pigs-2', 'pigs-3'],
            },
            'group-2': {
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
    const onion: BattlefieldOnionFixture = {
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
        displayedOnion={canonicalizeBattlefieldOnion(onion)}
        isCombatPhase={false}
        isMovementPhase
        isSelectionLocked={false}
        stacksExpandable={false}
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 0"
        stackNaming={{
          groupsInUse: [
            { groupId: 'group-1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
          ],
          usedGroupNames: ['Little Pigs group 1'],
        } as StackNamingSnapshot}
        stackRoster={{
          groupsById: {
            'group-1': {
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
        { groupId: 'group-1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
      ],
      usedGroupNames: ['Little Pigs group 1'],
    }
    const stackRoster = {
      groupsById: {
        'group-1': {
          groupName: 'Little Pigs group 1',
          unitType: 'LittlePigs',
          position: { q: 4, r: 4 },
          unitIds: ['pigs-1', 'pigs-2', 'pigs-3'],
        },
      }
    }
    const onion: BattlefieldOnionFixture = {
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
        displayedOnion={canonicalizeBattlefieldOnion(onion)}
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
        { groupId: 'group-1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
      ],
      usedGroupNames: ['Little Pigs group 1'],
    }
    const stackRoster = {
      groupsById: {
        'group-1': {
          groupName: 'Little Pigs group 1',
          unitType: 'LittlePigs',
          position: { q: 4, r: 4 },
          unitIds: ['pigs-1', 'pigs-2', 'pigs-3'],
        },
      }
    }
    const onion: BattlefieldOnionFixture = {
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
        displayedOnion={canonicalizeBattlefieldOnion(onion)}
        isCombatPhase
        isMovementPhase={false}
        isSelectionLocked={false}
        stacksExpandable
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 3"
        stackNaming={stackNaming as StackNamingSnapshot}
        stackRoster={stackRoster as StackRosterState}
        catalog={sessionCatalog}
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
        { groupId: 'group-1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
      ],
      usedGroupNames: ['Little Pigs group 1'],
    }
    const stackRoster = {
      groupsById: {
        'group-1': {
          groupName: 'Little Pigs group 1',
          unitType: 'LittlePigs',
          position: { q: 4, r: 4 },
          unitIds: ['pigs-1', 'pigs-2'],
        },
      }
    }
    const onion: BattlefieldOnionFixture = {
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
        displayedOnion={canonicalizeBattlefieldOnion(onion)}
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
        { groupId: 'group-1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
      ],
      usedGroupNames: ['Little Pigs group 1'],
    }
    const stackRoster = {
      groupsById: {
        'group-1': {
          groupName: 'Little Pigs group 1',
          unitType: 'LittlePigs',
          position: { q: 4, r: 4 },
          unitIds: ['pigs-1', 'pigs-2'],
        },
      }
    }
    const onion: BattlefieldOnionFixture = {
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
        displayedOnion={canonicalizeBattlefieldOnion(onion)}
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
    const onion: BattlefieldOnionFixture = {
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
        displayedOnion={canonicalizeBattlefieldOnion(onion)}
        isCombatPhase
        isMovementPhase={false}
        isSelectionLocked={false}
        stacksExpandable={false}
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 2"
        stackNaming={{
          groupsInUse: [
            { groupId: 'group-1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
          ],
          usedGroupNames: ['Little Pigs group 1'],
        } as StackNamingSnapshot}
        stackRoster={{
          groupsById: {
            'group-1': {
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
    const onion: BattlefieldOnionFixture = {
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
        displayedOnion={canonicalizeBattlefieldOnion(onion)}
        isCombatPhase
        isMovementPhase={false}
        isSelectionLocked={false}
        stacksExpandable={false}
        onionWeapons={{ operationalWeapons: 0, operationalMissiles: 0 }}
        readyWeaponDetails={[]}
        selectedCombatAttackLabel="Attack 0"
        stackNaming={{
          groupsInUse: [
            { groupId: 'group-1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
          ],
          usedGroupNames: ['Little Pigs group 1'],
        } as StackNamingSnapshot}
        stackRoster={{
          groupsById: {
            'group-1': {
              groupName: 'Little Pigs group 1',
              unitType: 'LittlePigs',
              position: { q: 4, r: 4 },
              unitIds: ['pigs-1', 'pigs-2'],
            },
          }
        } as StackRosterState}
        catalog={sessionCatalog}
        onSelectUnit={onSelectUnit}
      />,
    )

    const groupButton = screen.getByTestId('combat-unit-pigs-1')
    expect(groupButton.hasAttribute('disabled')).toBe(false)

    fireEvent.click(groupButton)
    expect(onSelectUnit).toHaveBeenCalledWith('pigs-1', false)
  })

  it('routes Onion weapon selection with additive gestures', () => {
    const onSelectUnit = vi.fn()
    const weapon = {
      id: 'main-1',
      typeId: 'TheOnion.main',
      weaponClass: 'main' as const,
      state: 'ready' as const,
      friendlyName: 'Main gun',
    }

    renderLeftRail({
      activeCombatRole: 'onion',
      activeRole: 'onion',
      isCombatPhase: true,
      displayedOnion: createOnion({ weaponDetails: [weapon] }),
      readyWeaponDetails: [weapon],
      catalog: sessionCatalog,
      onSelectUnit,
    })

    const weaponCard = screen.getByTestId('combat-weapon-main-1')
    fireEvent.click(weaponCard)
    fireEvent.click(weaponCard, { ctrlKey: true })

    expect(onSelectUnit).toHaveBeenNthCalledWith(1, 'weapon:main-1', false)
    expect(onSelectUnit).toHaveBeenNthCalledWith(2, 'weapon:main-1', true)
  })

  it('marks destroyed Onion weapons with the destroyed tone', () => {
    const weapon = {
      id: 'main-destroyed',
      typeId: 'TheOnion.main',
      weaponClass: 'main' as const,
      state: 'destroyed' as const,
      friendlyName: 'Main gun',
      disabledReason: 'Destroyed',
    }

    renderLeftRail({
      activeCombatRole: 'onion',
      activeRole: 'onion',
      isCombatPhase: true,
      displayedOnion: createOnion({ weaponDetails: [weapon] }),
      readyWeaponDetails: [weapon],
      catalog: sessionCatalog,
    })

    const weaponCard = screen.getByTestId('combat-weapon-main-destroyed')
    expect(weaponCard.className).toContain('tone-destroyed')
    expect(weaponCard).toBeDisabled()
    expect(weaponCard.textContent).toContain('Destroyed')
  })

  it('routes Onion movement selection with additive gestures', () => {
    const onSelectUnit = vi.fn()
    const displayedOnion = canonicalizeBattlefieldOnion(createOnion())
    const actionEligibility = buildBattlefieldActionEligibility({
      phase: 'ONION_MOVE',
      viewerRole: 'onion',
      defenders: [],
      onion: {
        unitId: displayedOnion.unitId,
        role: 'onion',
        state: displayedOnion.state,
        movesRemaining: displayedOnion.movesRemaining,
        weapons: displayedOnion.weapons,
      },
      targetOptionsByDefenderId: {},
      targetOptionsByWeaponId: {},
    })

    renderLeftRail({
      activeCombatRole: 'onion',
      activeRole: 'onion',
      isMovementPhase: true,
      displayedOnion,
      actionEligibility,
      onSelectUnit,
    })

    const onionCard = screen.getByTestId('combat-unit-onion-1')
    fireEvent.click(onionCard)
    fireEvent.click(onionCard, { ctrlKey: true })

    expect(onSelectUnit).toHaveBeenNthCalledWith(1, 'onion-1', false)
    expect(onSelectUnit).toHaveBeenNthCalledWith(2, 'onion-1', true)
  })

  it.each([
    { description: 'movement is spent', movesRemaining: 0, immobile: false },
    { description: 'the Onion is immobile', movesRemaining: 1, immobile: true },
  ])('does not forward additive selection when $description', ({ movesRemaining, immobile }) => {
    const onSelectUnit = vi.fn()
    const displayedOnion = canonicalizeBattlefieldOnion(createOnion({ movesRemaining }))
    const actionEligibility = buildBattlefieldActionEligibility({
      phase: 'ONION_MOVE',
      viewerRole: 'onion',
      defenders: [],
      onion: {
        unitId: displayedOnion.unitId,
        role: 'onion',
        state: displayedOnion.state,
        movesRemaining,
        immobile,
        weapons: displayedOnion.weapons,
      },
      targetOptionsByDefenderId: {},
      targetOptionsByWeaponId: {},
    })

    renderLeftRail({
      activeCombatRole: 'onion',
      activeRole: 'onion',
      isMovementPhase: true,
      displayedOnion,
      actionEligibility,
      onSelectUnit,
    })

    fireEvent.click(screen.getByTestId('combat-unit-onion-1'), { ctrlKey: true })

    expect(onSelectUnit).toHaveBeenCalledWith('onion-1', false)
    expect(onSelectUnit).not.toHaveBeenCalledWith('onion-1', true)
  })

  it('shows the Onion movement waiting state when no Onion is available', () => {
    renderLeftRail({
      activeCombatRole: 'onion',
      activeRole: 'onion',
      isMovementPhase: true,
    })

    expect(screen.getByText('Waiting for battlefield data.')).not.toBeNull()
  })

  it('shows the empty and locked Onion weapon states', () => {
    const onSelectUnit = vi.fn()
    const weapon = {
      id: 'main-1',
      typeId: 'TheOnion.main',
      weaponClass: 'main' as const,
      state: 'ready' as const,
      friendlyName: 'Main gun',
    }

    renderLeftRail({
      activeCombatRole: 'onion',
      activeRole: 'onion',
      isCombatPhase: true,
      onSelectUnit,
    })
    expect(screen.getByText('No ready weapons available.')).not.toBeNull()

    renderLeftRail({
      activeCombatRole: 'onion',
      activeRole: 'onion',
      isCombatPhase: true,
      isSelectionLocked: true,
      readyWeaponDetails: [weapon],
      catalog: sessionCatalog,
      onSelectUnit,
    })

    const weaponCard = screen.getByTestId('combat-weapon-main-1')
    expect(weaponCard).toBeDisabled()
    fireEvent.click(weaponCard)
    expect(onSelectUnit).not.toHaveBeenCalled()
  })

  it('disables a non-ready combat member while keeping the stack group available', () => {
    const onSelectUnit = vi.fn()
    const displayedDefenders = canonicalizeBattlefieldDefenders([
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
        weapons: 'main: spent',
        attack: '1 / rng 1',
        actionableModes: [],
      },
    ])
    const stackNaming = {
      groupsInUse: [
        { groupId: 'group-1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
      ],
      usedGroupNames: ['Little Pigs group 1'],
    } as StackNamingSnapshot
    const stackRoster = {
      groupsById: {
        'group-1': {
          groupName: 'Little Pigs group 1',
          unitType: 'LittlePigs',
          position: { q: 4, r: 4 },
          unitIds: ['pigs-1', 'pigs-2'],
        },
      },
    } as StackRosterState

    renderLeftRail({
      activeCombatRole: 'defender',
      activeRole: 'defender',
      activeMode: 'fire',
      isCombatPhase: true,
      activeSelectedUnitIds: ['pigs-1', 'pigs-2'],
      displayedDefenders,
      stackNaming,
      stackRoster,
      stacksExpandable: true,
      catalog: sessionCatalog,
      actionEligibility: {
        movementByUnitId: {},
        defenderCombatByUnitId: {
          'pigs-1': { eligibility: { eligible: true }, targetIds: ['onion-1'], targetHexKeys: ['0,0'] },
          'pigs-2': { eligibility: { eligible: false, reason: 'attacks-spent' }, targetIds: [], targetHexKeys: [] },
        },
        onionCombatByWeaponId: {},
      },
      onSelectUnit,
    })

    expect(screen.getByTestId('combat-unit-pigs-1')).not.toBeDisabled()
    expect(screen.getByTestId('combat-stack-member-pigs-1')).not.toBeDisabled()
    expect(screen.getByTestId('combat-stack-member-pigs-2')).toBeDisabled()

    fireEvent.click(screen.getByTestId('combat-stack-member-pigs-1'))
    fireEvent.click(screen.getByTestId('combat-stack-member-pigs-2'))

    expect(onSelectUnit).toHaveBeenCalledOnce()
    expect(onSelectUnit).toHaveBeenCalledWith('pigs-1', true)
  })

  it('disables defender groups and members when the left rail is selection-locked', () => {
    const onSelectUnit = vi.fn()
    const displayedDefenders = canonicalizeBattlefieldDefenders([
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
        actionableModes: ['fire'],
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
        actionableModes: ['fire'],
      },
    ])

    renderLeftRail({
      activeCombatRole: 'defender',
      activeRole: 'defender',
      isCombatPhase: true,
      isSelectionLocked: true,
      activeSelectedUnitIds: ['pigs-1', 'pigs-2'],
      displayedDefenders,
      stackNaming: {
        groupsInUse: [
          { groupId: 'group-1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
        ],
        usedGroupNames: ['Little Pigs group 1'],
      } as StackNamingSnapshot,
      stackRoster: {
        groupsById: {
          'group-1': {
            groupName: 'Little Pigs group 1',
            unitType: 'LittlePigs',
            position: { q: 4, r: 4 },
            unitIds: ['pigs-1', 'pigs-2'],
          },
        },
      } as StackRosterState,
      stacksExpandable: true,
      catalog: sessionCatalog,
      onSelectUnit,
    })

    expect(screen.getByTestId('combat-unit-pigs-1')).toBeDisabled()
    expect(screen.getByTestId('combat-stack-member-pigs-1')).toBeDisabled()
    fireEvent.click(screen.getByTestId('combat-unit-pigs-1'))
    fireEvent.click(screen.getByTestId('combat-stack-member-pigs-1'))
    expect(onSelectUnit).not.toHaveBeenCalled()
  })

  it('routes an expanded defender move member as an additive selection', () => {
    const onSelectUnit = vi.fn()
    const displayedDefenders = canonicalizeBattlefieldDefenders([
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
    ])

    renderLeftRail({
      activeCombatRole: 'defender',
      activeRole: 'defender',
      isMovementPhase: true,
      activeSelectedUnitIds: ['pigs-1'],
      displayedDefenders,
      stackNaming: {
        groupsInUse: [
          { groupId: 'group-1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
        ],
        usedGroupNames: ['Little Pigs group 1'],
      } as StackNamingSnapshot,
      stackRoster: {
        groupsById: {
          'group-1': {
            groupName: 'Little Pigs group 1',
            unitType: 'LittlePigs',
            position: { q: 4, r: 4 },
            unitIds: ['pigs-1', 'pigs-2'],
          },
        },
      } as StackRosterState,
      stacksExpandable: true,
      catalog: sessionCatalog,
      onSelectUnit,
    })

    fireEvent.click(screen.getByTestId('combat-stack-member-pigs-2'))

    expect(onSelectUnit).toHaveBeenCalledWith('pigs-2', true)
  })

  it('shows the combat waiting state when no defenders are available', () => {
    renderLeftRail({
      activeCombatRole: 'defender',
      activeRole: 'defender',
      isCombatPhase: true,
    })

    expect(screen.getByText('Waiting for battlefield data.')).not.toBeNull()
  })
})
