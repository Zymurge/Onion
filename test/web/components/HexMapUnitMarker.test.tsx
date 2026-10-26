// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { HexMapUnitMarker as ProductionHexMapUnitMarker } from '#web/components/HexMapUnitMarker'
import type { BattlefieldOnionView, BattlefieldUnit } from '#web/lib/battlefieldView'
import type { CombatActionEligibility, BattlefieldActionEligibility } from '#web/lib/actionEligibility/projection'
import type { CombatEligibility, CombatEligibilityReason } from '#web/lib/actionEligibility/combat'
import type { MovementEligibility } from '#web/lib/actionEligibility/movement'
import { getUnitTypeCatalog, getWeaponTypeCatalog } from '#shared/unitDefinitions'
import type { ComponentProps } from 'react'

type TestHexMapUnitMarkerProps = Omit<ComponentProps<typeof ProductionHexMapUnitMarker>, 'actionEligibility'> & {
  actionEligibility?: BattlefieldActionEligibility
}

function buildTestActionEligibility({ combatMembers, phase, resolvedViewerRole }: TestHexMapUnitMarkerProps): BattlefieldActionEligibility {
  const movementRole = phase === 'ONION_MOVE' ? 'onion' : phase === 'DEFENDER_MOVE' || phase === 'GEV_SECOND_MOVE' ? 'defender' : null
  const buildMovementEligibility = (eligible: boolean): MovementEligibility => eligible
    ? { eligible: true }
    : { eligible: false, reason: 'no-movement-remaining' }
  const buildCombatEligibility = (eligible: boolean, reason: CombatEligibilityReason): CombatEligibility => eligible
    ? { eligible: true }
    : { eligible: false, reason }
  const buildCombatActionEligibility = (eligible: boolean, reason: CombatEligibilityReason): CombatActionEligibility => ({
    eligibility: buildCombatEligibility(eligible, reason),
    targetIds: ['test-target'],
    targetHexKeys: [],
  })
  const movementByUnitId: Record<string, MovementEligibility> = Object.fromEntries(combatMembers.map((member): [string, MovementEligibility] => {
    const movesRemaining = 'movesRemaining' in member ? member.movesRemaining : 0
    const eligible = movementRole !== null && resolvedViewerRole === movementRole && member.role === movementRole && member.state === 'operational' && movesRemaining > 0
    return [member.unitId, buildMovementEligibility(eligible)]
  }))
  const defenderCombatByUnitId: Record<string, CombatActionEligibility> = Object.fromEntries(combatMembers
    .filter((member) => member.role === 'defender')
    .map((member): [string, CombatActionEligibility] => {
      const eligible = phase === 'DEFENDER_COMBAT' && resolvedViewerRole === 'defender' && member.state === 'operational' && 'actionableModes' in member && member.actionableModes.includes('fire')
      return [member.unitId, buildCombatActionEligibility(eligible, 'no-attack-capabilities')]
    }))
  const onionCombatByWeaponId: Record<string, CombatActionEligibility> = Object.fromEntries(combatMembers
    .filter((member) => member.role === 'onion')
    .flatMap((member) => member.weapons.map((weapon): [string, CombatActionEligibility] => {
      const eligible = phase === 'ONION_COMBAT' && resolvedViewerRole === 'onion' && member.state === 'operational' && weapon.state === 'ready'
      return [weapon.id, buildCombatActionEligibility(eligible, 'attacks-spent')]
    })))

  return { movementByUnitId, defenderCombatByUnitId, onionCombatByWeaponId }
}

function TestHexMapUnitMarker({ actionEligibility, ...props }: TestHexMapUnitMarkerProps) {
  return <ProductionHexMapUnitMarker {...props} actionEligibility={actionEligibility ?? buildTestActionEligibility(props)} />
}

const HexMapUnitMarker = TestHexMapUnitMarker

const onion: BattlefieldOnionView = {
  unitId: 'onion-1',
  typeId: 'TheOnion',
  role: 'onion',
  friendlyName: 'The Onion',
  position: { q: 0, r: 0 },
  side: 'onion',
  state: 'operational',
  treads: 33,
  movesAllowed: 3,
  movesRemaining: 3,
  ramsRemaining: 0,
  weapons: [],
}

const defender: BattlefieldUnit = {
  unitId: 'swamp-1',
  typeId: 'Swamp',
  role: 'defender',
  friendlyName: 'The Swamp',
  side: 'defender',
  state: 'destroyed',
  position: { q: 0, r: 0 },
  weapons: [],
  movesRemaining: 0,
  stackSize: 1,
  actionableModes: [],
}

describe('HexMapUnitMarker', () => {
  it('uses per-unit map scale and center-relative offsets from the session catalog', () => {
    const unitTypes = getUnitTypeCatalog()
    const sessionCatalog = {
      unitTypes: {
        ...unitTypes,
        LittlePigs: { ...unitTypes.LittlePigs, hexMapScale: 0.5, hexMapOffsetY: 10 },
      },
      weaponTypes: getWeaponTypeCatalog(),
    }
    const pig: BattlefieldUnit = {
      ...defender,
      unitId: 'pigs-1',
      typeId: 'LittlePigs',
      friendlyName: 'Little Pigs',
      state: 'operational',
    }

    render(
      <svg>
        <HexMapUnitMarker
          activeCombatRole={null}
          center={{ x: 36, y: 36 }}
          catalog={sessionCatalog}
          combatMembers={[pig]}
          isCombatPhase={false}
          isMovementPhase={false}
          isOccupantSelected={false}
          isSelectionLocked={false}
          occupant={pig}
          offsetIndex={0}
          renderedOccupantCount={1}
          onion={onion}
          phase="ONION_COMBAT"
          resolvedPhaseMode="locked"
          resolvedViewerActivity="active"
          resolvedViewerRole="onion"
          routeMapInteraction={() => ({ intent: 'noop', reason: 'test' })}
          rosterGroup={null}
          onDeselect={vi.fn()}
          onSelectUnit={vi.fn()}
        />
      </svg>,
    )

    const sprite = screen.getByTestId('hex-unit-pigs-1').querySelector('image')
    expect(Number(sprite?.getAttribute('width'))).toBe(36)
    expect(Number(sprite?.getAttribute('height'))).toBe(36)
    expect(Number(sprite?.getAttribute('x'))).toBe(14.4)
    expect(Number(sprite?.getAttribute('y'))).toBeCloseTo(10.8)
  })

  it.each([
    { state: 'operational' as const, sprite: 'intact' },
    { state: 'destroyed' as const, sprite: 'destroyed' },
  ])('renders the $state Swamp sprite without a visible square border', ({ state, sprite }) => {
    const swamp: BattlefieldUnit = { ...defender, state }
    render(
      <svg>
        <HexMapUnitMarker
          activeCombatRole={null}
          center={{ x: 36, y: 36 }}
          combatMembers={[swamp]}
          isCombatPhase={false}
          isMovementPhase
          isOccupantSelected
          isSelectionLocked={false}
          occupant={swamp}
          offsetIndex={0}
          renderedOccupantCount={1}
          onion={onion}
          phase="DEFENDER_MOVE"
          resolvedPhaseMode="movement"
          resolvedViewerActivity="active"
          resolvedViewerRole="defender"
          routeMapInteraction={() => ({ intent: 'noop', reason: 'test' })}
          rosterGroup={null}
          onDeselect={vi.fn()}
          onSelectUnit={vi.fn()}
        />
      </svg>,
    )

    const marker = screen.getByTestId('hex-unit-swamp-1')
    const hitTarget = marker.querySelector('rect')
    expect(marker).toHaveAttribute('data-selected', 'true')
    expect(marker.querySelector('image')).toHaveAttribute('href', expect.stringContaining(sprite))
    expect(hitTarget).toHaveAttribute('fill', 'transparent')
    expect(hitTarget).toHaveAttribute('stroke', 'none')
    expect(hitTarget).not.toHaveClass('hex-unit-rect-selected')
  })

  it('renders defender sprites without a background box and wraps their label below', () => {
    const pig: BattlefieldUnit = {
      ...defender,
      unitId: 'pigs-1',
      typeId: 'LittlePigs',
      friendlyName: 'Little Pigs group 2',
      state: 'operational',
    }

    render(
      <svg>
        <HexMapUnitMarker
          activeCombatRole={null}
          center={{ x: 36, y: 36 }}
          combatMembers={[pig]}
          isCombatPhase={false}
          isMovementPhase={false}
          isOccupantSelected={false}
          isSelectionLocked={false}
          occupant={pig}
          offsetIndex={0}
          renderedOccupantCount={1}
          onion={onion}
          phase="ONION_COMBAT"
          resolvedPhaseMode="locked"
          resolvedViewerActivity="active"
          resolvedViewerRole="onion"
          routeMapInteraction={() => ({ intent: 'noop', reason: 'test' })}
          rosterGroup={null}
          onDeselect={vi.fn()}
          onSelectUnit={vi.fn()}
        />
      </svg>,
    )

    const marker = screen.getByTestId('hex-unit-pigs-1')
    expect(marker.querySelector('.hex-unit-rect-defender')).toBeNull()
    expect(Number(marker.querySelector('image')?.getAttribute('width'))).toBeCloseTo(72 * getUnitTypeCatalog().LittlePigs.hexMapScale!)
    expect(Number(marker.querySelector('image')?.getAttribute('y'))).toBeCloseTo(10.8)
    expect(marker.querySelector('text')).toHaveAttribute('fill', '#111111')
    expect(marker.querySelector('text')).not.toHaveClass('tone-dim')
    expect(Number(marker.querySelector('text')?.getAttribute('y'))).toBeCloseTo(52.8)
    expect(marker.querySelectorAll('tspan')).toHaveLength(2)
  })

  it('shows destroyed markers and lets either player inspect them without targeting', () => {
    const destroyedDefender: BattlefieldUnit = {
      ...defender,
      unitId: 'puss-1',
      typeId: 'Puss',
      friendlyName: 'Puss 1',
      state: 'destroyed',
    }
    const routeMapInteraction = vi.fn(() => ({
      intent: 'inspect-subject' as const,
      reason: 'combat-illegal-but-inspectable-subject' as const,
    }))
    const onSelectUnit = vi.fn()

    render(
      <svg>
        <HexMapUnitMarker
          activeCombatRole="onion"
          center={{ x: 36, y: 36 }}
          combatMembers={[destroyedDefender]}
          isCombatPhase
          isMovementPhase={false}
          isOccupantSelected={false}
          isSelectionLocked={false}
          occupant={destroyedDefender}
          offsetIndex={0}
          renderedOccupantCount={1}
          onion={onion}
          phase="ONION_COMBAT"
          resolvedPhaseMode="combat"
          resolvedViewerActivity="active"
          resolvedViewerRole="onion"
          routeMapInteraction={routeMapInteraction}
          rosterGroup={null}
          onDeselect={vi.fn()}
          onSelectUnit={onSelectUnit}
        />
      </svg>,
    )

    const marker = screen.getByTestId('hex-unit-puss-1')
    expect(marker).toHaveClass('tone-destroyed')

    fireEvent.click(marker)

    expect(routeMapInteraction).toHaveBeenCalledWith(expect.objectContaining({
      subjectCapability: expect.objectContaining({ inspectable: true, targetEligible: false }),
    }))
    expect(onSelectUnit).toHaveBeenCalledWith('puss-1', false)
  })

  it.each([
    { description: 'one ready member', readyModes: ['fire'] as const, expected: true },
    { description: 'no ready members', readyModes: [] as const, expected: false },
  ])('routes combat eligibility for a group with $description', ({ readyModes, expected }) => {
    const members: BattlefieldUnit[] = [
      {
        ...defender,
        unitId: 'pigs-1',
        typeId: 'LittlePigs',
        state: 'operational',
        actionableModes: [],
      },
      {
        ...defender,
        unitId: 'pigs-2',
        typeId: 'LittlePigs',
        state: 'operational',
        actionableModes: [...readyModes],
      },
    ]
    const routeMapInteraction = vi.fn(() => ({ intent: 'noop' as const, reason: 'test' }))

    render(
      <svg>
        <HexMapUnitMarker
          activeCombatRole="defender"
          center={{ x: 36, y: 36 }}
          combatMembers={members}
          isCombatPhase
          isMovementPhase={false}
          isOccupantSelected={false}
          isSelectionLocked={false}
          occupant={members[0]}
          offsetIndex={0}
          renderedOccupantCount={1}
          onion={onion}
          phase="DEFENDER_COMBAT"
          resolvedPhaseMode="combat"
          resolvedViewerActivity="active"
          resolvedViewerRole="defender"
          routeMapInteraction={routeMapInteraction}
          rosterGroup={null}
          onDeselect={vi.fn()}
          onSelectUnit={vi.fn()}
        />
      </svg>,
    )

    fireEvent.click(screen.getByTestId('hex-unit-pigs-1'))

    const marker = screen.getByTestId('hex-unit-pigs-1')
    if (expected) {
      expect(marker).toHaveClass('hex-unit-stack-combat-ready')
    } else {
      expect(marker).not.toHaveClass('hex-unit-stack-combat-ready')
    }

    expect(routeMapInteraction).toHaveBeenCalledWith(expect.objectContaining({
      subjectCapability: expect.objectContaining({ attackerEligible: expected }),
    }))
  })

  it('uses projected eligibility for a partially eligible defender stack', () => {
    const members: BattlefieldUnit[] = [
      { ...defender, unitId: 'pigs-1', typeId: 'LittlePigs', state: 'operational', actionableModes: [] },
      { ...defender, unitId: 'pigs-2', typeId: 'LittlePigs', state: 'operational', actionableModes: [] },
    ]
    const routeMapInteraction = vi.fn(() => ({ intent: 'noop' as const, reason: 'test' }))

    render(
      <svg>
        <HexMapUnitMarker
          actionEligibility={{
            movementByUnitId: {},
            defenderCombatByUnitId: {
              'pigs-1': { eligibility: { eligible: false, reason: 'attacks-spent' }, targetIds: [], targetHexKeys: [] },
              'pigs-2': { eligibility: { eligible: true }, targetIds: ['onion-1'], targetHexKeys: ['0,0'] },
            },
            onionCombatByWeaponId: {},
          }}
          activeCombatRole="defender"
          center={{ x: 36, y: 36 }}
          combatMembers={members}
          isCombatPhase
          isMovementPhase={false}
          isOccupantSelected={false}
          isSelectionLocked={false}
          occupant={members[0]}
          offsetIndex={0}
          renderedOccupantCount={1}
          onion={onion}
          phase="DEFENDER_COMBAT"
          resolvedPhaseMode="combat"
          resolvedViewerActivity="active"
          resolvedViewerRole="defender"
          routeMapInteraction={routeMapInteraction}
          rosterGroup={null}
          onDeselect={vi.fn()}
          onSelectUnit={vi.fn()}
        />
      </svg>,
    )

    fireEvent.click(screen.getByTestId('hex-unit-pigs-1'))

    expect(screen.getByTestId('hex-unit-pigs-1')).toHaveClass('hex-unit-stack-combat-ready')
    expect(routeMapInteraction).toHaveBeenCalledWith(expect.objectContaining({
      subjectCapability: expect.objectContaining({ attackerEligible: true }),
    }))
  })

  it('does not highlight an eligible combat marker for an inactive viewer', () => {
    const livePig: BattlefieldUnit = {
      ...defender,
      unitId: 'pigs-1',
      typeId: 'LittlePigs',
      state: 'operational',
      actionableModes: ['fire'],
    }

    render(
      <svg>
        <HexMapUnitMarker
          actionEligibility={{
            movementByUnitId: {},
            defenderCombatByUnitId: {
              'pigs-1': { eligibility: { eligible: true }, targetIds: ['onion-1'], targetHexKeys: ['0,0'] },
            },
            onionCombatByWeaponId: {},
          }}
          activeCombatRole="defender"
          center={{ x: 36, y: 36 }}
          combatMembers={[livePig]}
          isCombatPhase
          isMovementPhase={false}
          isOccupantSelected={false}
          isSelectionLocked={false}
          occupant={livePig}
          offsetIndex={0}
          renderedOccupantCount={1}
          onion={onion}
          phase="DEFENDER_COMBAT"
          resolvedPhaseMode="combat"
          resolvedViewerActivity="inactive"
          resolvedViewerRole="defender"
          routeMapInteraction={() => ({ intent: 'noop', reason: 'test' })}
          rosterGroup={null}
          onDeselect={vi.fn()}
          onSelectUnit={vi.fn()}
        />
      </svg>,
    )

    expect(screen.getByTestId('hex-unit-pigs-1')).not.toHaveClass('hex-unit-stack-combat-ready')
  })

  it('marks an Onion attacker-ready when any projected weapon is eligible', () => {
    const onionWithTwoWeapons = {
      ...onion,
      weapons: [
        { id: 'main', typeId: 'TheOnion.main', weaponClass: 'main' as const, state: 'spent' as const, friendlyName: 'Main Weapon' },
        { id: 'ap', typeId: 'TheOnion.ap', weaponClass: 'secondary' as const, state: 'ready' as const, friendlyName: 'AP Weapon' },
      ],
    }
    const routeMapInteraction = vi.fn(() => ({ intent: 'noop' as const, reason: 'test' }))

    render(
      <svg>
        <HexMapUnitMarker
          actionEligibility={{
            movementByUnitId: {},
            defenderCombatByUnitId: {},
            onionCombatByWeaponId: {
              main: { eligibility: { eligible: false, reason: 'attacks-spent' }, targetIds: [], targetHexKeys: [] },
              ap: { eligibility: { eligible: true }, targetIds: ['puss-1'], targetHexKeys: ['1,1'] },
            },
          }}
          activeCombatRole="onion"
          center={{ x: 36, y: 36 }}
          combatMembers={[onionWithTwoWeapons]}
          isCombatPhase
          isMovementPhase={false}
          isOccupantSelected={false}
          isSelectionLocked={false}
          occupant={onionWithTwoWeapons}
          offsetIndex={0}
          renderedOccupantCount={1}
          onion={onionWithTwoWeapons}
          phase="ONION_COMBAT"
          resolvedPhaseMode="combat"
          resolvedViewerActivity="active"
          resolvedViewerRole="onion"
          routeMapInteraction={routeMapInteraction}
          rosterGroup={null}
          onDeselect={vi.fn()}
          onSelectUnit={vi.fn()}
        />
      </svg>,
    )

    fireEvent.click(screen.getByTestId('hex-unit-onion-1'))

    expect(screen.getByTestId('hex-unit-onion-1')).toHaveClass('hex-unit-stack-combat-ready')
    expect(routeMapInteraction).toHaveBeenCalledWith(expect.objectContaining({
      subjectCapability: expect.objectContaining({ attackerEligible: true }),
    }))
  })

  it('centers the full-size Onion sprite and keeps its label over the sprite in white', () => {
    render(
      <svg>
        <HexMapUnitMarker
          activeCombatRole={null}
          center={{ x: 36, y: 36 }}
          combatMembers={[onion]}
          isCombatPhase={false}
          isMovementPhase
          isOccupantSelected={false}
          isSelectionLocked={false}
          occupant={onion}
          offsetIndex={0}
          renderedOccupantCount={1}
          onion={onion}
          phase="DEFENDER_MOVE"
          resolvedPhaseMode="movement"
          resolvedViewerActivity="active"
          resolvedViewerRole="defender"
          routeMapInteraction={() => ({ intent: 'noop', reason: 'test' })}
          rosterGroup={null}
          onDeselect={vi.fn()}
          onSelectUnit={vi.fn()}
        />
      </svg>,
    )

    const marker = screen.getByTestId('hex-unit-onion-1')
    const sprite = marker.querySelector('image')
    const label = marker.querySelector('text')
    expect(Number(sprite?.getAttribute('x'))).toBeCloseTo(0)
    expect(Number(sprite?.getAttribute('y'))).toBeCloseTo(0)
    expect(Number(sprite?.getAttribute('width'))).toBeCloseTo(72)
    expect(label).toHaveAttribute('fill', '#ffffff')
    expect(marker.children.item(1)).toBe(sprite)
    expect(marker.children.item(2)).toBe(label)
  })

  it('uses lighter orange for a destroyed member of a partial stack', () => {
    const livePig: BattlefieldUnit = {
      ...defender,
      unitId: 'pigs-1',
      typeId: 'LittlePigs',
      friendlyName: 'Little Pigs 1',
      state: 'operational',
    }
    const destroyedPig: BattlefieldUnit = {
      ...livePig,
      unitId: 'pigs-2',
      friendlyName: 'Little Pigs 2',
      state: 'destroyed',
    }

    render(
      <svg>
        <HexMapUnitMarker
          activeCombatRole={null}
          center={{ x: 36, y: 36 }}
          combatMembers={[livePig, destroyedPig]}
          isCombatPhase={false}
          isMovementPhase={false}
          isOccupantSelected={false}
          isSelectionLocked={false}
          occupant={destroyedPig}
          offsetIndex={1}
          renderedOccupantCount={2}
          onion={onion as unknown as BattlefieldOnionView}
          phase="ONION_COMBAT"
          resolvedPhaseMode="locked"
          resolvedViewerActivity="active"
          resolvedViewerRole="onion"
          routeMapInteraction={() => ({ intent: 'noop', reason: 'test' })}
          rosterGroup={{ groupId: 'group-1', groupKey: 'LittlePigs:1,1', unitIds: ['pigs-1', 'pigs-2'] }}
          onDeselect={vi.fn()}
          onSelectUnit={vi.fn()}
        />
      </svg>,
    )

    expect(screen.getByTestId('hex-unit-pigs-2')).toHaveClass('tone-destroyed-partial')
  })

  it('uses lighter orange for a damaged Onion during Defender Combat', () => {
    const damagedOnion = {
      ...onion,
      unitId: 'onion-1',
      weapons: [{ id: 'main', typeId: 'TheOnion.main', weaponClass: 'main', state: 'destroyed', friendlyName: 'Main Weapon' }],
    } as unknown as BattlefieldOnionView

    render(
      <svg>
        <HexMapUnitMarker
          activeCombatRole={null}
          center={{ x: 36, y: 36 }}
          combatMembers={[damagedOnion]}
          isCombatPhase={false}
          isMovementPhase={false}
          isOccupantSelected={false}
          isSelectionLocked={false}
          occupant={damagedOnion}
          offsetIndex={0}
          renderedOccupantCount={1}
          onion={damagedOnion}
          phase="DEFENDER_COMBAT"
          resolvedPhaseMode="combat"
          resolvedViewerActivity="active"
          resolvedViewerRole="onion"
          routeMapInteraction={() => ({ intent: 'noop', reason: 'test' })}
          rosterGroup={null}
          onDeselect={vi.fn()}
          onSelectUnit={vi.fn()}
        />
      </svg>,
    )

    expect(screen.getByTestId('hex-unit-onion-1')).toHaveClass('tone-destroyed-partial')
  })

  it('preserves lighter orange for a damaged Onion during secondary move', () => {
    const damagedOnion = {
      ...onion,
      unitId: 'onion-1',
      weapons: [{ id: 'main', typeId: 'TheOnion.main', weaponClass: 'main', state: 'destroyed', friendlyName: 'Main Weapon' }],
    } as unknown as BattlefieldOnionView

    render(
      <svg>
        <HexMapUnitMarker
          activeCombatRole={null}
          center={{ x: 36, y: 36 }}
          combatMembers={[damagedOnion]}
          isCombatPhase={false}
          isMovementPhase
          isOccupantSelected={false}
          isSelectionLocked={false}
          occupant={damagedOnion}
          offsetIndex={0}
          renderedOccupantCount={1}
          onion={damagedOnion}
          phase="GEV_SECOND_MOVE"
          resolvedPhaseMode="movement"
          resolvedViewerActivity="active"
          resolvedViewerRole="defender"
          routeMapInteraction={() => ({ intent: 'noop', reason: 'test' })}
          rosterGroup={null}
          onDeselect={vi.fn()}
          onSelectUnit={vi.fn()}
        />
      </svg>,
    )

    expect(screen.getByTestId('hex-unit-onion-1')).toHaveClass('tone-destroyed-partial')
  })

  it('preserves lighter orange for an inactive viewer during Onion Movement handoff', () => {
    const damagedOnion = {
      ...onion,
      unitId: 'onion-1',
      weapons: [{ id: 'main', typeId: 'TheOnion.main', weaponClass: 'main', state: 'destroyed', friendlyName: 'Main Weapon' }],
    } as unknown as BattlefieldOnionView

    render(
      <svg>
        <HexMapUnitMarker
          activeCombatRole={null}
          center={{ x: 36, y: 36 }}
          combatMembers={[damagedOnion]}
          isCombatPhase={false}
          isMovementPhase
          isOccupantSelected={false}
          isSelectionLocked={false}
          isTurnHandoffLocked
          occupant={damagedOnion}
          offsetIndex={0}
          renderedOccupantCount={1}
          onion={damagedOnion}
          phase="ONION_MOVE"
          resolvedPhaseMode="movement"
          resolvedViewerActivity="inactive"
          resolvedViewerRole="defender"
          routeMapInteraction={() => ({ intent: 'noop', reason: 'test' })}
          rosterGroup={null}
          onDeselect={vi.fn()}
          onSelectUnit={vi.fn()}
        />
      </svg>,
    )

    expect(screen.getByTestId('hex-unit-onion-1')).toHaveClass('tone-destroyed-partial')
  })

  it('marks a live stack anchor as partially destroyed when a stackmate is destroyed', () => {
    const livePig: BattlefieldUnit = {
      ...defender,
      unitId: 'pigs-1',
      typeId: 'LittlePigs',
      friendlyName: 'Little Pigs 1',
      state: 'operational',
    }
    const destroyedPig: BattlefieldUnit = {
      ...livePig,
      unitId: 'pigs-2',
      friendlyName: 'Little Pigs 2',
      state: 'destroyed',
    }

    render(
      <svg>
        <HexMapUnitMarker
          activeCombatRole="onion"
          center={{ x: 36, y: 36 }}
          combatMembers={[livePig, destroyedPig]}
          isCombatPhase
          isMovementPhase={false}
          isOccupantSelected={false}
          isSelectionLocked={false}
          occupant={livePig}
          offsetIndex={0}
          renderedOccupantCount={1}
          onion={onion as unknown as BattlefieldOnionView}
          phase="ONION_COMBAT"
          resolvedPhaseMode="combat"
          resolvedViewerActivity="active"
          resolvedViewerRole="onion"
          routeMapInteraction={() => ({ intent: 'noop', reason: 'test' })}
          rosterGroup={{ groupId: 'group-1', groupKey: 'LittlePigs:1,1', unitIds: ['pigs-1', 'pigs-2'] }}
          onDeselect={vi.fn()}
          onSelectUnit={vi.fn()}
        />
      </svg>,
    )

    expect(screen.getByTestId('hex-unit-pigs-1')).toHaveClass('tone-destroyed-partial')
  })

  it('does not restore the old damage tone after Onion Movement', () => {
    const damagedOnion = {
      ...onion,
      unitId: 'onion-1',
      treads: 44,
      weapons: [],
    } as unknown as BattlefieldOnionView

    render(
      <svg>
        <HexMapUnitMarker
          activeCombatRole="onion"
          center={{ x: 36, y: 36 }}
          combatMembers={[damagedOnion]}
          isCombatPhase
          isMovementPhase={false}
          isOccupantSelected={false}
          isSelectionLocked={false}
          occupant={damagedOnion}
          offsetIndex={0}
          renderedOccupantCount={1}
          onion={damagedOnion}
          phase="ONION_COMBAT"
          resolvedPhaseMode="combat"
          resolvedViewerActivity="active"
          resolvedViewerRole="onion"
          routeMapInteraction={() => ({ intent: 'noop', reason: 'test' })}
          rosterGroup={null}
          onDeselect={vi.fn()}
          onSelectUnit={vi.fn()}
        />
      </svg>,
    )

    expect(screen.getByTestId('hex-unit-onion-1')).not.toHaveClass('tone-destroyed-partial')
  })

  it('restores green movement styling for a tread-damaged Onion at Onion Movement', () => {
    const damagedOnion = {
      ...onion,
      unitId: 'onion-1',
      treads: 44,
      weapons: [],
    } as unknown as BattlefieldOnionView

    render(
      <svg>
        <HexMapUnitMarker
          activeCombatRole={null}
          center={{ x: 36, y: 36 }}
          combatMembers={[damagedOnion]}
          isCombatPhase={false}
          isMovementPhase
          isOccupantSelected={false}
          isSelectionLocked={false}
          occupant={damagedOnion}
          offsetIndex={0}
          renderedOccupantCount={1}
          onion={damagedOnion}
          phase="ONION_MOVE"
          resolvedPhaseMode="movement"
          resolvedViewerActivity="active"
          resolvedViewerRole="onion"
          routeMapInteraction={() => ({ intent: 'noop', reason: 'test' })}
          rosterGroup={null}
          onDeselect={vi.fn()}
          onSelectUnit={vi.fn()}
        />
      </svg>,
    )

    const marker = screen.getByTestId('hex-unit-onion-1')
    expect(marker).not.toHaveClass('tone-destroyed-partial')
    expect(marker).toHaveClass('hex-unit-stack-move-ready')
    expect(marker.querySelector('rect')).toHaveClass('hex-unit-onion-hit-target')
    expect(marker.querySelector('rect')).not.toHaveClass('hex-unit-rect')
    expect(marker.querySelector('image')).toHaveAttribute('href', expect.stringContaining('the-onion-damaged-sprite.png'))
  })
})