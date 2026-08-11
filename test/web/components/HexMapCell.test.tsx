// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { HexMapCell } from '#web/components/HexMapCell'
import type { BattlefieldOnionView } from '#web/lib/battlefieldView'

const onion: BattlefieldOnionView = {
  id: 'onion-1',
  type: 'TheOnion',
  friendlyName: 'The Onion',
  position: { q: 2, r: 3 },
  status: 'operational',
  treads: 33,
  movesAllowed: 3,
  movesRemaining: 3,
  rams: 0,
  weapons: 'main: ready',
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
  })
})