// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { HexMapUnitMarker } from '#web/components/HexMapUnitMarker'
import type { BattlefieldOnionView, BattlefieldUnit } from '#web/lib/battlefieldView'

const onion: BattlefieldOnionView = {
  id: 'onion-1',
  type: 'TheOnion',
  friendlyName: 'The Onion',
  position: { q: 0, r: 0 },
  status: 'operational',
  treads: 33,
  movesAllowed: 3,
  movesRemaining: 3,
  rams: 0,
  weapons: 'main: ready',
}

const defender: BattlefieldUnit = {
  id: 'swamp-1',
  type: 'Swamp',
  status: 'destroyed',
  role: 'defender',
  unitId: 'swamp-1',
  typeId: 'Swamp',
  state: 'destroyed',
  position: { q: 0, r: 0 },
  q: 0,
  r: 0,
  move: 0,
  weapons: [],
  attack: '0 / rng 0',
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
          selectedUnitIds={new Set(['swamp-1'])}
          onDeselect={vi.fn()}
          onSelectUnit={vi.fn()}
        />
      </svg>,
    )

    expect(screen.getByTestId('hex-unit-swamp-1')).toHaveAttribute('data-selected', 'true')
    expect(screen.getByTestId('hex-unit-swamp-1').querySelector('image')).toHaveAttribute('href', expect.stringContaining('destroyed'))
  })
})