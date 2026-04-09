# Onion Web UI UX First Pass (Core Game Interface)

## Goals

1. Make turn context and legal next actions obvious within 2 seconds.
2. Reduce action mistakes by encoding phase/role constraints in the UI.
3. Keep map and action composer visible together on desktop.
4. Focus on desktop gameplay quality first and defer tablet/mobile decisions.

## Design Principles

1. Clarity before decoration.
2. "What can I do now?" is always answered by the interface.
3. Read model and write model are adjacent: state + action panel.
4. Failure messages should teach the next correct action.

## Core Game Screen Layout

## Desktop (>= 1200px)

Three-column shell:

1. Left Rail (Status and Context)
   1. Game header: game ID, scenario, turn, phase.
   2. Player context: your role, active side marker, connection status.
   3. Onion card + defender summary list (compact).

2. Center Stage (Map and Selection)
   1. Hex map canvas/grid.
   2. Hover/selection details overlay.
   3. Optional coordinate and terrain indicators.

3. Right Rail (Actions and Events)
   1. Action composer card.
   2. Last action result and errors.
   3. Event timeline (latest first with seq).

## Header Utility Controls (Updated)

*Footer utility controls are now officially embedded in the header instead of a footer row.*

Header now includes:

1. Refresh button and last-sync timestamp (unobtrusive, top right).
2. Events fetch status indicator.
3. Connection status indicator (small green/red light with label).
4. Debug diagnostics toggle (near connection status; when active, streams debug output to a read-only, scrollable popup window).
5. Active side is indicated by highlighting (or glowing) the game phase when the current player is active. When waiting on the other player, the phase chip shows an animated faded crosshatch pattern.

---

## Implementation Status (March 2026)

### Complete or Present

- Three-column desktop shell layout
- MapBoard with seamless SVG terrain, unit rectangles, and coordinate display
- Onion and Defender overview cards in left rail
- Role badge, phase, turn, scenario, and game ID in header
- Actionable highlighting for units and onion
- Crude but functional event timeline in lower right rail
- Header utility controls: refresh button, last-sync timestamp, event sync status indicator
- Debug diagnostics toggle with floating, draggable, resizable popup window
- Mock debug output stream in popup (ready for backend wiring)
- **Phase signaling: active/inactive phase pill with glowing green highlight and animated crosshatch for waiting state**

### Partial or Incomplete

- No explicit connection status indicator yet (placeholder for WebSocket integration)
- Selection inspector and hover overlays not present
- Error banners/diagnostics not present
- No live backend wiring; mock data only

---

## Next Steps Todo List

1. Add connection status indicator with WebSocket integration (for Phase 3)
2. Add selection inspector and hover overlays to map
3. Add error banners/diagnostics handling
4. Prepare for backend wiring and live data
5. ~~Introduce scenario display name (user-facing), plumb through all layers~~ ✓ Done
6. ~~Change game ID to integer, plumb through all layers~~ ✓ Done

## Tablet and Mobile (Deferred)

1. Not in initial UX scope.
2. Revisit after gameplay learning from desktop sessions.
3. Capture interaction pain points before defining responsive behavior.

## Information Hierarchy

## Primary (Always Visible)

1. Current phase.
2. Turn ownership indicator via control treatment:
   1. Your turn: action controls and actionable units are highlighted.
   2. Opponent turn: controls are lowlighted/disabled.
3. No dedicated winner region in normal layout.
4. Endgame result is displayed as an overlay when the game ends.
5. Action composer readiness state.
6. Map selection state.

## Secondary

1. Detailed unit stats.
2. Full event payload details.
3. Diagnostic metadata for errors.

## Action Composer UX

## Modes

1. Move mode.
2. Fire mode (single unit or onion weapon).
3. Multi-attacker fire mode.
4. End phase.

## Behavior

1. Mode picker only shows legal actions for current phase and role.
2. Required fields are progressive:
   1. Choose attacker first or target first depending on mode.
   2. Remaining field options filtered to legal/likely options where possible.
3. Units with actions available in the current mode are highlighted on the map and in list views.
4. Provide an "Available Units" list for the current mode with pertinent stats (type, status, movement remaining if relevant, weapon readiness summary).
5. Submit button states:
   1. Disabled: incomplete or clearly invalid draft.
   2. Ready: complete payload and phase-legal.
   3. Submitting: spinner + input lock.
6. On success:
   1. Show success banner with sequence number.
   2. Refresh game snapshot from response payload.
7. On failure:
   1. Keep draft inputs.
   2. Show compact message + expandable technical details.

## Map Interaction Model (First Pass)

1. Click unit selects attacker candidate.
2. Click hex sets destination for move drafts.
3. Click target unit sets target for fire drafts.
4. Selected objects are highlighted with clear visual state.
5. Destroyed units are non-interactive by default.

## Map Zoom and Overlay Controls

1. The map supports interactive zooming:
   - Mouse wheel zooms in/out, centered on the pointer.
   - A floating zoom slider overlay (lower left) allows precise zoom control.
   - The minimum zoom always fits the entire map in the viewport; maximum zoom allows close inspection.
   - The slider is always visible, styled as an overlay, and does not affect map layout or scrollbars.
   - Zooming preserves the current map center and scroll position.
2. Panning is performed by scrolling the map viewport (native scrollbars or drag, as supported).
3. The UI prevents page overflow and disables text selection during map drag for a seamless experience.

Fallback support:

1. Manual coordinate and unit ID input remains available in composer advanced section for edge cases.

## Unit and Weapon Presentation Rules

1. Operational units: show actual weapon status.
2. Disabled/recovering units: show effective weapon availability as disabled.
3. Destroyed units: show weapons as not applicable.
4. Destroyed defenders remain visible in lists but clearly de-emphasized.

## Event Timeline UX

1. Each row shows: seq, type, concise summary, timestamp.
2. Error-level events are color-coded and pinned near top until acknowledged.
3. "Jump to latest" appears after scroll drift.
4. Duplicate event suppression via sequence key.

## Accessibility Baseline

1. Keyboard navigation for all controls.
2. Map interactions mirrored by form controls.
3. Clear focus rings and tab order.
4. Color is never the only status indicator.

## Visual Direction (First Pass)

1. Tone: tactical command console with warm industrial palette.
2. Typography: readable, high-contrast, no tiny dense text blocks.
3. Use strong section framing to separate state, map, and actions.
4. Animation: subtle, event-driven only (selection changes, success/failure notifications).

## Initial Component Inventory

1. `GameHeaderBar`
2. `TurnPhaseBadge`
3. `RoleIndicator`
4. `MapBoard`
5. `SelectionInspector`
6. `ActionComposer`
7. `ActionResultBanner`
8. `OnionStatusCard`
9. `DefenderListCard`
10. `EventTimeline`
11. `RefreshStatusBar`

## First Prototype Task Slice

1. Static shell with desktop-focused layout.
2. Header and context cards bound to mocked game snapshot.
3. Map panel placeholder with selectable mock units.
4. Action composer skeleton with disabled/ready states and available-units list.
5. Event timeline seeded with mock events.

## Usability Checkpoints (Before API Wiring)

1. New user can identify active role and phase in under 3 seconds.
2. User can find primary action path without reading docs.
3. Error treatment leaves user with obvious next step.
4. User can identify actionable units in current mode without opening extra dialogs.
