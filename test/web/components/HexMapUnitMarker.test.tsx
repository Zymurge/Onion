// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { HexMapUnitMarker } from '#web/components/HexMapUnitMarker'
import type { BattlefieldOnionView, BattlefieldUnit } from '#web/lib/battlefieldView'

const onion: BattlefieldOnionView = {
  unitId: 'onion-1',
  typeId: 'TheOnion',
  role: 'onion',
  friendlyName: 'The Onion',
  position: { q: 0, r: 0 },
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
  it('renders a destroyed Swamp sprite and preserves marker identity', () => {
    render(
      <svg>
        <HexMapUnitMarker
          activeCombatRole={null}
          center={{ x: 36, y: 36 }}
          combatMembers={[defender]}
          isCombatPhase={false}
          isMovementPhase
          isOccupantSelected
          isSelectionLocked={false}
          occupant={defender}
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

    expect(screen.getByTestId('hex-unit-swamp-1')).toHaveAttribute('data-selected', 'true')
    expect(screen.getByTestId('hex-unit-swamp-1').querySelector('image')).toHaveAttribute('href', expect.stringContaining('destroyed'))
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
          rosterGroup={{ groupId: 'pigs', unitIds: ['pigs-1', 'pigs-2'] }}
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
    const livePig = {
      ...defender,
      unitId: 'pigs-1',
      typeId: 'LittlePigs',
      friendlyName: 'Little Pigs 1',
      state: 'operational',
    }
    const destroyedPig = {
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
          rosterGroup={{ groupId: 'pigs', unitIds: ['pigs-1', 'pigs-2'] }}
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
    expect(marker.querySelector('rect')).toHaveClass('hex-unit-rect-move-eligible')
  })
})