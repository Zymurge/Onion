/**
 * Thin application shell: compose session, gate, interaction, display,
 * notification, command, and layout hooks. Keep behavior in their owning
 * modules and preserve hook order because data flows downward.
 *
 * Route focused work to the smallest relevant surface:
 * - Auth and session binding: lib/appAuthRedirect.ts, lib/appSessionWiring.ts
 * - Snapshot and live synchronization: lib/gameSessionController.ts, lib/useGameSession.ts
 * - Turn handoff: lib/appTurnHandoffGate.ts
 * - Battlefield interaction and display: lib/useBattlefieldInteractionState.ts, lib/useBattlefieldDisplayState.ts
 * - Notifications and commands: lib/appNotificationPolicy.ts, lib/appCommands.ts
 * - Diagnostics and telemetry: lib/appClientDiagnostics.ts, lib/appDebugTelemetry.ts
 * - Shell layout and overlays: components/AppShellLayout.tsx, components/AppOverlayLayer.tsx
 *
 * Current contracts:
 * - Server snapshots are authoritative; live events are refresh hints only.
 * - One App instance maps to one game session.
 * - Turn handoff is inactive -> acknowledgement -> active.
 * - Invalid snapshots terminate the session; transport errors remain dismissible.
 * - AppShellLayout is the grouped-prop fan-out point. Preserve existing test IDs.
 */

import { ConnectGate } from './components/ConnectGate'

// --- Shell render composition ----------------------------------------------
/** Full battlefield page. Sole fan-out point: grouped props in, flat props out. */
import { AppShellLayout } from './components/AppShellLayout'
/** Stacked error overlays plus combat, ram, and game-over toasts. */
import { AppOverlayLayer } from './components/AppOverlayLayer'
/** Terminal screen shown when the session is aborted and unrecoverable. */
import { GameAbortedScreen } from './components/GameAbortedScreen'

// --- Session wiring: auth -> transport -> binding -> controller -------------
/** Resolves props plus auth into an active binding, controller, and live state. */
import { useAppSessionWiring } from './lib/appSessionWiring'
/** Redirects to login on token expiry or a 401 from any session request. */
import { useAuthExpiryRedirect } from './lib/appAuthRedirect'

// --- Turn handoff gating ----------------------------------------------------
/** Computes acknowledgement keys and the control/screen lock flags. */
import { useTurnHandoffGate } from './lib/appTurnHandoffGate'

// --- Battlefield state (already extracted; reuse as-is) ---------------------
/** Owns selection, move planning, ram prompts, and action submission. */
import { useBattlefieldInteractionState } from './lib/useBattlefieldInteractionState'
/** Derives display-ready view models and validates the snapshot shape. */
import { useBattlefieldDisplayState } from './lib/useBattlefieldDisplayState'

// --- Cross-cutting policy ---------------------------------------------------
/** Decides which error/toast is visible and tracks per-error dismissals. */
import { useAppNotificationPolicy } from './lib/appNotificationPolicy'
/** All user-intent handlers (advance phase, confirm combat, refresh, dismiss). */
import { useAppCommands } from './lib/appCommands'
/** Reports CLIENT_SESSION_READY and SNAPSHOT_INVALID; aborts on invalid snapshot. */
import { useClientDiagnosticsReporter } from './lib/appClientDiagnostics'
/** Change-gated debug logging for session reloads and turn transitions. */
import { useAppDebugTelemetry } from './lib/appDebugTelemetry'
/** Debug popup open state, layout, and captured log lines. */
import { useDebugDiagnostics } from './lib/useDebugDiagnostics'
/** Polls and buffers opponent events shown while the local player is inactive. */
import { useInactiveEventStream } from './lib/useInactiveEventStream'

import type { GameClient } from './lib/gameClient'
import type { LiveEventSource } from './lib/gameSessionTypes'
import type { WebRuntimeConfig } from './lib/appBootstrap'
import './App.css'

export type AppProps = {
  /** Test/story seam. When provided, bypasses HTTP transport construction. */
  gameClient?: GameClient
  gameId?: number
  liveEventSource?: LiveEventSource
  /** Injectable navigation for tests; defaults to window.location.replace. */
  navigate?: (path: string) => void
  runtimeConfig?: WebRuntimeConfig
  /** Renders the connect gate when no session is bound yet. */
  showConnectionGate?: boolean
}

function App({
  gameClient,
  gameId,
  liveEventSource,
  navigate,
  runtimeConfig,
  showConnectionGate = false,
}: AppProps) {
  // 1. Resolve the session: auth -> transport -> binding -> controller -> state.
  const session = useAppSessionWiring({ gameClient, gameId, liveEventSource, runtimeConfig })

  useAuthExpiryRedirect({ authSession: session.authSession, error: session.state.error, navigate })

  // 2. Opponent activity feed; also the source of remote GAME_ABORTED signals.
  const inactiveEventStream = useInactiveEventStream({
    activeGameId: session.activeGameId,
    activeTurnActive: session.turn.isActive,
    currentTurnNumber: session.turn.number,
    lastAppliedEventSeq: session.state.lastAppliedEventSeq,
    pollEvents: session.binding?.requestTransport.pollEvents,
  })

  // 3. Turn handoff contract: decides what the player may touch right now.
  const gate = useTurnHandoffGate({
    activeGameId: session.activeGameId,
    controller: session.controller,
    inactiveEventStream,
    sessionStatus: session.state.status,
    turn: session.turn,
  })

  // 4. Battlefield behavior, then derived presentation.
  const interaction = useBattlefieldInteractionState({
    activeSessionController: session.controller,
    isLifecycleActive: session.turn.isLifecycleActive,
    activeTurnActive: session.turn.isActive,
    clientSnapshot: session.state.snapshot,
    clientSnapshotPhase: session.turn.phase,
    catalog: session.state.catalog,
    isControlledSession: session.isControlled,
    isInteractionLocked: gate.controlsLocked,
    isSelectionLocked: gate.screenLocked,
  })

  const display = useBattlefieldDisplayState({
    activeSessionBinding: session.binding,
    combatBaseSnapshot: interaction.interactionState.combatBaseSnapshot,
    interactionState: interaction.interactionState,
    sessionState: session.state,
  })

  // 5. Cross-cutting policy. Note: `display.error` is a snapshot VALIDATION
  //    failure (terminal), not a transport error (recoverable).
  const notifications = useAppNotificationPolicy({
    activeGameId: session.activeGameId,
    actionError: interaction.actionError,
    sessionError: session.state.error,
    snapshot: session.state.snapshot,
    snapshotError: display.error,
  })

  const debug = useDebugDiagnostics()

  const commands = useAppCommands({
    acknowledgeTurn: gate.acknowledgeCurrentTurn,
    catalog: session.state.catalog,
    controlsLocked: gate.controlsLocked,
    display,
    inactiveEventStream,
    interaction,
    notifications,
    setDebugOpen: debug.setDebugOpen,
  })

  useClientDiagnosticsReporter({
    binding: session.binding,
    controller: session.controller,
    sessionState: session.state,
    snapshotError: display.error,
  })

  useAppDebugTelemetry({ display, gate, inactiveEventStream, session })

  // --- Terminal / pre-session screens (order matters) ------------------------
  if (!session.isControlled && showConnectionGate) {
    return <ConnectGate runtimeConfig={runtimeConfig} onConnectedSession={session.setConnectedSession} />
  }

  if (session.state.status === 'aborted') {
    return <GameAbortedScreen message={session.state.error?.message} />
  }

  return (
    <AppShellLayout
      commands={commands}
      debug={debug}
      display={display}
      gate={gate}
      inactiveEventStream={inactiveEventStream}
      interaction={interaction}
      session={session}
      overlays={<AppOverlayLayer commands={commands} display={display} interaction={interaction} notifications={notifications} />}
    />
  )
}

export default App
