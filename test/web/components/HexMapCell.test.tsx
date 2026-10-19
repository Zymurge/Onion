// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { HexMapCell } from '#web/components/HexMapCell'
import type { BattlefieldOnionView } from '#web/lib/battlefieldView'
import { getUnitSpriteHref } from '#web/lib/unitSpriteRegistry'
import { getUnitTypeCatalog } from '#shared/unitDefinitions'

const onion: BattlefieldOnionView = {
  unitId: 'onion-1',
  typeId: 'TheOnion',
  role: 'onion',
  friendlyName: 'The Onion',
  position: { q: 2, r: 3 },
  state: 'operational',
  treads: 33,
  ramsRemaining: 0,
  movesAllowed: 3,
  movesRemaining: 3,
  weapons: [],
}

describe('HexMapCell', () => {
  it('preserves cell identity and escape overlays', () => {
    render(
      <svg>
        <HexMapCell
          activeCombatRole="onion"
          center={{ x: 36, y: 36 }}
          cellOccupants={[onion]}
          combatRange
          combatTargetSelected={false}
          coord={{ q: 2, r: 3 }}
          escapeHex
          escapePatternId="escape-test"
          hasSharedOccupancy={false}
          isMoveReady={false}
          isOnion
          isReachable={false}
          isSelected={false}
          isSelectionLocked={false}
          onBackgroundClick={vi.fn()}
          onCellContextMenu={vi.fn()}
          onion={onion}
          phase="ONION_COMBAT"
          polygonPoints="0,0 1,0 1,1"
          renderedOccupants={[onion]}
          renderedTerrainType={1}
          resolvedPhaseMode="combat"
          resolvedViewerActivity="active"
          resolvedViewerRole="onion"
          routeMapInteraction={() => ({ intent: 'noop', reason: 'test' })}
          rosterIndex={null}
          selectedUnitIds={new Set()}
          onDeselect={vi.fn()}
          onSelectUnit={vi.fn()}
        />
      </svg>,
    )

    expect(screen.getByTestId('hex-cell-2-3')).toHaveClass('hex-terrain-1', 'hex-cell-combat-range', 'hex-cell-escape')
    expect(screen.getByTestId('hex-cell-2-3').querySelector('.hex-shape-escape-overlay')).not.toBeNull()
    expect(screen.getByTestId('hex-cell-2-3').querySelector('[data-testid="hex-unit-onion-1"]')).not.toBeNull()
    expect(screen.queryByTestId('hex-destroyed-crosshatch-2-3')).toBeNull()
  })

  it.each([
    {
      description: 'destroyed units',
      status: 'destroyed',
      pattern: 'destroyed-unit-stripes',
      occupant: { ...onion, state: 'destroyed' as const },
    },
    {
      description: 'disabled units',
      status: 'disabled',
      pattern: 'disabled-unit-stripes',
      occupant: { ...onion, state: 'disabled' as const },
    },
  ])('covers the full hex with a stripe overlay for $description', ({ occupant, status, pattern }) => {
    render(
      <svg>
        <HexMapCell
          activeCombatRole="onion"
          center={{ x: 36, y: 36 }}
          cellOccupants={[occupant]}
          combatRange={false}
          combatTargetSelected={false}
          coord={{ q: 2, r: 3 }}
          escapeHex={false}
          escapePatternId="escape-test"
          hasSharedOccupancy={false}
          isMoveReady={false}
          isOnion
          isReachable={false}
          isSelected={false}
          isSelectionLocked={false}
          onBackgroundClick={vi.fn()}
          onCellContextMenu={vi.fn()}
          onion={onion}
          phase="ONION_COMBAT"
          polygonPoints="0,0 1,0 1,1"
          renderedOccupants={[occupant]}
          resolvedPhaseMode="combat"
          resolvedViewerActivity="active"
          resolvedViewerRole="onion"
          routeMapInteraction={() => ({ intent: 'noop', reason: 'test' })}
          rosterIndex={null}
          selectedUnitIds={new Set()}
          onDeselect={vi.fn()}
          onSelectUnit={vi.fn()}
        />
      </svg>,
    )

    const cell = screen.getByTestId('hex-cell-2-3')
    const marker = cell.querySelector('[data-testid^="hex-unit-"]')
    const hatch = screen.getByTestId(`hex-${status}-crosshatch-2-3`)
    expect(hatch.tagName).toBe('polygon')
    expect(hatch).toHaveAttribute('points', '0,0 1,0 1,1')
    expect(hatch).toHaveAttribute('fill', `url(#${pattern})`)
    expect(hatch).toHaveAttribute('pointer-events', 'none')
    expect(Array.from(cell.children).indexOf(hatch)).toBeGreaterThan(Array.from(cell.children).indexOf(marker!))
    if (status === 'disabled') {
      expect(marker?.querySelector('.hex-unit-disabled-indicator rect')).toBeNull()
      expect(marker?.querySelector('.hex-unit-disabled-icon')).not.toBeNull()
    }
  })

  it('uses the destroyed hatch when a cell contains both destroyed and disabled units', () => {
    const disabledOnion = { ...onion, unitId: 'onion-2', state: 'disabled' as const }
    const destroyedOnion = { ...onion, unitId: 'onion-3', state: 'destroyed' as const }

    render(
      <svg>
        <HexMapCell
          activeCombatRole="onion"
          center={{ x: 36, y: 36 }}
          cellOccupants={[disabledOnion, destroyedOnion]}
          combatRange={false}
          combatTargetSelected={false}
          coord={{ q: 2, r: 3 }}
          escapeHex={false}
          escapePatternId="escape-test"
          hasSharedOccupancy
          isMoveReady={false}
          isOnion
          isReachable={false}
          isSelected={false}
          isSelectionLocked={false}
          onBackgroundClick={vi.fn()}
          onCellContextMenu={vi.fn()}
          onion={onion}
          phase="ONION_COMBAT"
          polygonPoints="0,0 1,0 1,1"
          renderedOccupants={[disabledOnion, destroyedOnion]}
          resolvedPhaseMode="combat"
          resolvedViewerActivity="active"
          resolvedViewerRole="onion"
          routeMapInteraction={() => ({ intent: 'noop', reason: 'test' })}
          rosterIndex={null}
          selectedUnitIds={new Set()}
          onDeselect={vi.fn()}
          onSelectUnit={vi.fn()}
        />
      </svg>,
    )

    expect(screen.getByTestId('hex-destroyed-crosshatch-2-3')).toHaveAttribute('fill', 'url(#destroyed-unit-stripes)')
    expect(screen.queryByTestId('hex-disabled-crosshatch-2-3')).toBeNull()
  })

  it('shows the damaged Onion sprite without hatching its hex when a weapon is destroyed', () => {
    const damagedOnion: BattlefieldOnionView = {
      ...onion,
      weapons: [{
        id: 'main',
        typeId: 'TheOnion.main',
        weaponClass: 'main',
        state: 'destroyed',
        friendlyName: 'Main Weapon',
      }],
    }

    render(
      <svg>
        <HexMapCell
          activeCombatRole="onion"
          center={{ x: 36, y: 36 }}
          cellOccupants={[damagedOnion]}
          combatRange={false}
          combatTargetSelected={false}
          coord={{ q: 2, r: 3 }}
          escapeHex={false}
          escapePatternId="escape-test"
          hasSharedOccupancy={false}
          isMoveReady={false}
          isOnion
          isReachable={false}
          isSelected={false}
          isSelectionLocked={false}
          onBackgroundClick={vi.fn()}
          onCellContextMenu={vi.fn()}
          onion={damagedOnion}
          phase="ONION_COMBAT"
          polygonPoints="0,0 1,0 1,1"
          renderedOccupants={[damagedOnion]}
          resolvedPhaseMode="combat"
          resolvedViewerActivity="active"
          resolvedViewerRole="onion"
          routeMapInteraction={() => ({ intent: 'noop', reason: 'test' })}
          rosterIndex={null}
          selectedUnitIds={new Set()}
          onDeselect={vi.fn()}
          onSelectUnit={vi.fn()}
        />
      </svg>,
    )

    const marker = screen.getByTestId('hex-unit-onion-1')
    expect(screen.queryByTestId('hex-destroyed-crosshatch-2-3')).toBeNull()
    expect(marker.querySelector('image')).toHaveAttribute(
      'href',
      getUnitSpriteHref(getUnitTypeCatalog().TheOnion.spriteKey, 'operational', true),
    )
  })
})