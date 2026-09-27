import type { PlayerConnectionStatus } from '../../shared/websocketProtocol.js'

type PlayerPresenceToastProps = {
	role: 'onion' | 'defender'
	status: PlayerConnectionStatus
	onDismiss: () => void
}

export function PlayerPresenceToast({ role, status, onDismiss }: PlayerPresenceToastProps) {
	const playerLabel = role === 'onion' ? 'Onion player' : 'Defender'
	const message = status === 'connected' ? `${playerLabel} reconnected` : `${playerLabel} disconnected`

	return (
		<aside className={`player-presence-toast player-presence-toast-${status}`} role="status" aria-live="polite" data-testid="player-presence-toast">
			<div>
				<strong>{message}</strong>
				<span>{status === 'connected' ? 'The match is live again.' : 'The match is waiting for them to return.'}</span>
			</div>
			<button type="button" onClick={onDismiss} aria-label="Dismiss player presence notification">Dismiss</button>
		</aside>
	)
}