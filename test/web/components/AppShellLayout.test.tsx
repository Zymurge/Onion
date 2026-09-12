// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AppShellLayout, type AppShellLayoutProps } from '#web/components/AppShellLayout'

function createProps(overrides: Partial<AppShellLayoutProps> = {}): AppShellLayoutProps {
	return {
		commands: {} as AppShellLayoutProps['commands'],
		debug: {
			debugEntries: [],
			debugOpen: false,
			debugPopupLayout: { position: { x: 0, y: 0 }, size: { width: 340, height: 400 } },
			setDebugOpen: () => undefined,
			setDebugPopupLayout: () => undefined,
		},
		display: {
			activeCombatRole: null,
			activeMode: 'fire',
			activePhase: null,
			activeRole: null,
			activeSelectedUnitIds: [],
			activeTurnActive: false,
			clientSnapshot: null,
			combatRangeHexKeys: new Set(),
			combatTargetIds: new Set(),
			combatTargetOptions: [],
			displayedDefenders: [],
			displayedOnion: null,
			displayedOnions: [],
			displayedScenarioMap: null,
			escapeHexes: [],
			headerHasSnapshot: true,
			isCombatPhase: false,
			isMovementPhase: false,
			lastUpdatedAt: null,
			phaseAdvanceLabel: null,
			readyWeaponDetails: [],
			rightRailStackPanel: { isVisible: false, selectedStackMembers: [], selectedStackMemberIds: [], selectedStackSelectionCount: 0, selectedStackSelectionIds: [] },
			selectedCombatAttackCount: 0,
			selectedCombatAttackLabel: 'Attack 0',
			selectedCombatAttackMemberLabels: [],
			selectedCombatAttackRange: 0,
			selectedCombatAttackStrength: 0,
			selectedCombatAttackerIds: [],
			selectedCombatTarget: null,
			selectedInspectorDefender: null,
			selectedInspectorLabel: null,
			selectedInspectorOnion: null,
			selectedInspectorUnitId: null,
			shellPhase: 'DEFENDER_MOVE',
			stacksExpandable: false,
			victoryObjectives: [],
		},
		gate: {
			controlsLocked: false,
			inactiveEventWindowVisible: false,
			screenLocked: false,
		},
		inactiveEventStream: {
			entries: [],
			errorMessage: null,
			isDismissed: false,
			isLoading: false,
			clearEntries: () => undefined,
			clearErrorMessage: () => undefined,
		},
		interaction: {
			activeMode: 'fire',
			actionError: null,
			combatBaseSnapshot: null,
			hasExplicitSelection: false,
			isRefreshing: false,
			lastRefreshAt: null,
			pendingCombatResolution: null,
			pendingRamPrompt: null,
			pendingRamResolution: null,
			selectedCombatTargetId: null,
			selectedUnitIds: [],
		},
		session: {
			activeGameId: 123,
			binding: null,
			isControlled: false,
			state: { status: 'ready', snapshot: null, session: null, catalog: null, liveConnection: 'idle', lastAppliedEventSeq: null, lastAppliedEventType: null, lastUpdatedAt: null, error: null },
			turn: { phase: null, number: null, role: null, activeOwner: null, isKnown: false, isLifecycleActive: true, isActive: false },
		},
		overlays: <div data-testid="overlay-slot">Overlay</div>,
		...overrides,
	}
}

describe('AppShellLayout', () => {
	it('preserves shell, state, ready, and sync test hooks while rendering overlays', () => {
		render(<AppShellLayout {...createProps()} />)

		expect(screen.getByTestId('app-shell')).toBeInTheDocument()
		expect(screen.getByTestId('app-loaded-state')).toBeInTheDocument()
		expect(screen.getByTestId('app-ready')).toBeInTheDocument()
		expect(screen.getByTestId('session-sync-probe')).toHaveAttribute('data-session-status', 'ready')
		expect(screen.getByTestId('overlay-slot')).toHaveTextContent('Overlay')
	})

	it('applies the screen lock class and preserves session sequence metadata', () => {
		const props = createProps({
			gate: { controlsLocked: true, inactiveEventWindowVisible: true, screenLocked: true },
			display: {
				...createProps().display,
				shellPhase: 'ONION_MOVE',
				headerHasSnapshot: false,
			},
			session: {
				...createProps().session,
				state: { ...createProps().session.state, status: 'loading', lastAppliedEventSeq: 9, snapshot: { lastEventSeq: 10 } },
			},
		})

		render(<AppShellLayout {...props} />)

		expect(screen.getByTestId('app-shell')).toHaveClass('inactive-event-screen-locked')
		expect(screen.getByTestId('app-loading-state')).toBeInTheDocument()
		expect(screen.queryByTestId('app-ready')).toBeNull()
		expect(screen.getByTestId('session-sync-probe')).toHaveAttribute('data-observed-event-seq', '9')
		expect(screen.getByTestId('session-sync-probe')).toHaveAttribute('data-snapshot-event-seq', '10')
	})
})