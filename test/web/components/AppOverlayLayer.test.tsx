// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AppOverlayLayer, type AppOverlayLayerProps } from '#web/components/AppOverlayLayer'

function createProps(overrides: Partial<AppOverlayLayerProps> = {}): AppOverlayLayerProps {
	return {
		commands: {
			dismissActionError: vi.fn(),
			dismissCombatResolution: vi.fn(),
			dismissGameOverToast: vi.fn(),
			dismissRamResolution: vi.fn(),
			dismissSessionError: vi.fn(),
		},
		display: {
			selectedCombatTarget: null,
		},
		interaction: {
			actionError: null,
			pendingCombatResolution: null,
			pendingRamResolution: null,
		},
		notifications: {
			snapshotError: null,
			shouldShowSnapshotError: false,
			shouldShowSessionError: false,
			sessionError: null,
			shouldShowActionError: false,
			sessionWinner: null,
			shouldShowGameOverToast: false,
			playerPresenceNotification: null,
			dismissPlayerPresenceNotification: vi.fn(),
		},
		...overrides,
	}
}

describe('AppOverlayLayer', () => {
	it('gives action errors precedence over recoverable session errors', () => {
		const props = createProps({
			interaction: { actionError: 'Action failed', pendingCombatResolution: null, pendingRamResolution: null },
			notifications: {
				snapshotError: null,
				shouldShowSnapshotError: false,
				shouldShowSessionError: true,
				sessionError: { message: 'Session failed' },
				shouldShowActionError: true,
				sessionWinner: null,
				shouldShowGameOverToast: false,
				playerPresenceNotification: null,
				dismissPlayerPresenceNotification: vi.fn(),
			},
		})

		render(<AppOverlayLayer {...props} />)

		expect(screen.getByRole('alert')).toHaveTextContent('Action failed')
		expect(screen.queryByText('Session failed')).toBeNull()
	})

	it('renders the terminal snapshot error without a working dismissal path', () => {
		const props = createProps({
			notifications: {
				snapshotError: 'Loaded game snapshot is invalid',
				shouldShowSnapshotError: true,
				shouldShowSessionError: false,
				sessionError: null,
				shouldShowActionError: false,
				sessionWinner: null,
				shouldShowGameOverToast: false,
				playerPresenceNotification: null,
				dismissPlayerPresenceNotification: vi.fn(),
			},
		})

		render(<AppOverlayLayer {...props} />)

		expect(screen.getByRole('alert')).toHaveTextContent('Loaded game snapshot is invalid')
		expect(screen.getByRole('button', { name: /dismiss error/i })).toBeDisabled()
	})

	it('renders combat, ram, and game-over notifications with stable test ids', () => {
		const props = createProps({
			display: {
				selectedCombatTarget: { label: 'Wolf treads', modifiers: [] },
			},
			interaction: {
				actionError: null,
				pendingCombatResolution: {
					outcome: 'D',
					outcomeLabel: 'Miss',
					details: [],
				},
				pendingRamResolution: [{
					actionType: 'MOVE',
					unitId: 'onion-1',
					rammedUnitId: 'wolf-1',
					rammedUnitFriendlyName: 'Wolf',
					destroyedUnitId: '',
					details: [],
				}],
			},
			notifications: {
				snapshotError: null,
				shouldShowSnapshotError: false,
				shouldShowSessionError: false,
				sessionError: null,
				shouldShowActionError: false,
				sessionWinner: 'defender',
				shouldShowGameOverToast: true,
				playerPresenceNotification: null,
				dismissPlayerPresenceNotification: vi.fn(),
			},
		})

		render(<AppOverlayLayer {...props} />)

		expect(screen.getByTestId('combat-resolution-toast')).toBeInTheDocument()
		expect(screen.getByTestId('ram-resolution-toast')).toBeInTheDocument()
		expect(screen.getByTestId('game-over-toast')).toBeInTheDocument()
	})

	it('renders and dismisses player presence notifications', () => {
		const dismissPlayerPresenceNotification = vi.fn()
		render(<AppOverlayLayer {...createProps({
			notifications: {
				snapshotError: null,
				shouldShowSnapshotError: false,
				shouldShowSessionError: false,
				sessionError: null,
				shouldShowActionError: false,
				sessionWinner: null,
				shouldShowGameOverToast: false,
				playerPresenceNotification: { role: 'defender', status: 'disconnected' },
				dismissPlayerPresenceNotification,
			},
		})} />)

		expect(screen.getByTestId('player-presence-toast')).toHaveTextContent('Defender disconnected')
		fireEvent.click(screen.getByRole('button', { name: /dismiss player presence notification/i }))
		expect(dismissPlayerPresenceNotification).toHaveBeenCalledOnce()
	})
})