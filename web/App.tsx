/**
 * ============================================================================
 * Onion Web UI — application shell (INDEX FILE)
 * ============================================================================
 *
 * THIS FILE IS DELIBERATELY THIN. It is an index + wiring diagram, not a place
 * to put logic. If you are about to add more than a few lines of behavior here,
 * it belongs in one of the modules listed in the routing map below.
 *
 * The full pre-refactor implementation is preserved at `web/App.tsx.ref`.
 * Authors of the modules below should port logic FROM that reference file.
 * STATUS: scaffold. The `lib/app*` and `components/App*` modules below do not
 * exist yet; this file defines the contracts they must satisfy.
 *
 * ---------------------------------------------------------------------------
 * AGENT ROUTING MAP — read only what your task needs
 * ---------------------------------------------------------------------------
 * Working on...                     | Read these files
 * ----------------------------------|----------------------------------------
 * Login / token expiry / 401        | lib/appAuthRedirect.ts
 *                                   | lib/authSession.ts, lib/authRouting.ts
 * Which game/transport is bound     | lib/appSessionWiring.ts
 *                                   | lib/sessionBinding.ts, lib/httpGameClient.ts
 * Injected test client -> seam      | lib/appRequestTransportAdapter.ts
 * Unbound / idle session behavior   | lib/appIdleSessionFallbacks.ts
 * Snapshot load, refresh, live WS   | lib/gameSessionController.ts, lib/useGameSession.ts
 * "Begin Turn" / locked controls    | lib/appTurnHandoffGate.ts, lib/turnKey.ts
 * Unit selection, move, ram, fire   | lib/useBattlefieldInteractionState.ts
 * Derived view models / labels      | lib/useBattlefieldDisplayState.ts
 *                                   | lib/battlefieldViewBuilders.ts
 * Error overlays & toast visibility | lib/appNotificationPolicy.ts
 * Button intent / command handlers  | lib/appCommands.ts, lib/shellControlRouting.ts
 * Diagnostics sent to the server    | lib/appClientDiagnostics.ts
 * Debug logs / debug popup          | lib/appDebugTelemetry.ts, lib/useDebugDiagnostics.ts
 * Page structure & rail props       | components/AppShellLayout.tsx
 * Overlay/toast rendering           | components/AppOverlayLayer.tsx
 * Terminal "game aborted" screen    | components/GameAbortedScreen.tsx
 *
 * ---------------------------------------------------------------------------
 * PORTING NOTES for the agents authoring the modules above
 * ---------------------------------------------------------------------------
 * A. PROP CONVENTION: App.tsx passes GROUPED objects (session, gate, display,
 *    interaction, commands) into AppShellLayout. AppShellLayout is the single
 *    fan-out point and passes FLAT primitive props down into the header, rails,
 *    and stage. Do not thread grouped objects past AppShellLayout.
 * B. App.tsx.ref contains TWO near-duplicate "turn state transition" logging
 *    effects (one emits `ts:`, the other `atMs:`), so every transition is
 *    logged twice. Port them as ONE effect in lib/appDebugTelemetry.ts.
 * C. `display.error` keeps its current name. It means SNAPSHOT VALIDATION
 *    FAILED and is terminal — do not confuse it with the recoverable
 *    `session.state.error` transport failure. See invariants 4 and 5.
 * D. Preserve all existing `data-testid` hooks when moving JSX; the web and
 *    E2E suites assert on them (app-shell, app-ready, session-sync-probe,
 *    game-aborted, app-<state>-state).
 *
 * ---------------------------------------------------------------------------
 * INVARIANTS (do not break without updating docs/web-ui-spec.md)
 * ---------------------------------------------------------------------------
 * 1. Server snapshots are authoritative. Live WS events are refresh HINTS only;
 *    never synthesize or mutate snapshot values locally.
 * 2. One App instance maps to exactly one game session.
 * 3. Turn handoff is a 3-phase contract: inactive -> acknowledgement -> active.
 * 4. An invalid snapshot is TERMINAL: report diagnostic, abort the session, and
 *    render GameAbortedScreen. It is intentionally not dismissible.
 * 5. Transport errors are RECOVERABLE and must stay dismissible.
 *
 * ---------------------------------------------------------------------------
 * EXECUTION ORDER (hooks below are order-dependent — data flows downward)
 * ---------------------------------------------------------------------------
 *   session -> events -> gate -> interaction -> display -> notifications
 *                                                       -> commands
 * ============================================================================
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
      overlays={<AppOverlayLayer commands={commands} display={display} notifications={notifications} />}
    />
  )
}

export default App
