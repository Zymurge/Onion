# Accessibility Overview Specification

**Status:** Active planning document
**Target baseline:** WCAG 2.2 AA for core gameplay workflows
**Scope:** Web client accessibility, including the connection gate, game shell,
map, rails, overlays, event streams, diagnostics, and action controls.

This document defines the accessibility baseline for Onion. It is an engineering
acceptance contract, not a claim of formal WCAG certification. The audit should
prioritize tasks that block a keyboard-only player or prevent a screen-reader
user from understanding game state, available actions, errors, and results.

## Goals

1. Make every essential game workflow usable without a mouse.
2. Give every interactive control a stable semantic role, accessible name, and
   understandable state.
3. Make phase, role, connection, loading, error, action, and victory changes
   perceivable without relying on color, hover, animation, or pointer position.
4. Preserve the authoritative-state model in accessible presentations: the UI
   must announce failure or missing state rather than silently inventing a view.
5. Provide equivalent keyboard and screen-reader access to information currently
   exposed through map gestures, hover states, tooltips, or visual overlays.
6. Keep accessibility behavior covered by focused component tests and a small
   number of browser-level checks for critical workflows.

## Non-Goals

- Formal third-party WCAG certification.
- Replacing the tactical map with a non-visual interface. The map needs an
  equivalent structured interaction and inspection path alongside its visual
  presentation.
- Reworking gameplay rules, transport policy, or authoritative snapshot rules.
- Solving every visual design issue before the core interaction and announcement
  paths are usable.

## Core Principles

### Semantic controls

Use native buttons, links, form controls, headings, lists, and landmarks where
possible. A control must not depend on a styled `div`, mouse event, or tooltip to
be operable or understandable.

### Visible and predictable focus

Keyboard focus must be visible, must not be hidden behind overlays, and must
follow the user's task. Opening an overlay or dialog moves focus into it when
appropriate; closing it restores focus to the initiating control when practical.

### State is announced

The UI must expose meaningful changes such as phase changes, connection loss,
action rejection, loading completion, combat results, game over, and diagnostic
failure through appropriate live-region or focus behavior. Live regions should
be scoped so routine event traffic does not repeatedly interrupt unrelated work.

### Information has an equivalent path

Hover-only detail, color-only status, map-only selection, pointer gestures, and
visual marker differences must have an equivalent text, keyboard, or structured
control path.

### No accessibility-only divergence from authority

Accessible labels and summaries must be derived from the same authoritative
snapshot and event data as the visual UI. They must not infer unit identity,
stack membership, phase, or outcome from incomplete data.

## Definition Of Done

The accessibility baseline is complete when all of the following are true for
the core game workflows:

### Keyboard operation

- A user can connect or load a game, dismiss errors, refresh state, open and
  close diagnostics, inspect units, select legal actors and targets, submit or
  cancel actions, acknowledge opponent results, and inspect victory/game-over
  state using keyboard input only.
- No essential action requires right-click, hover, drag, double-click, or a
  pointer coordinate on the map without an equivalent keyboard path.
- Tab order follows the visual and task order. Focus does not enter hidden,
  disabled, or stale controls.
- Focus indicators remain visible against every supported surface and state.

### Screen-reader semantics

- Each page and major panel has an appropriate landmark or heading structure.
- Every input has a programmatic label, including connection fields and map
  controls.
- Every button and disclosure has an accessible name that describes its action,
  not only its icon, number, or visual styling.
- Selection, pressed, expanded, disabled, loading, error, active-phase, and
  connection states are exposed programmatically.
- Lists, event streams, dialogs, overlays, and map-equivalent controls expose
  their relationships and current contents without requiring CSS inspection.

### Dynamic feedback

- Loading, transport errors, invalid snapshots, rejected actions, combat or ram
  results, phase changes, opponent results, and game-over state are announced in
  a controlled and non-duplicative way.
- Focus moves to newly blocking error or confirmation UI when user action is
  required, and returns to a sensible initiating control after dismissal.
- Live updates do not steal focus from an unrelated user task.
- Reduced-motion preferences are respected for transitions and attention cues.

### Map and visual parity

- Every map action available through click or context menu has an equivalent
  rail, list, or keyboard path.
- A user can identify the selected unit, target, reachable destination, combat
  range, occupied cell, stack membership, destroyed state, escape objective, and
  illegal-move feedback without color alone.
- Map-only information has a structured alternative in the rails or inspector.
- Text remains readable at increased browser zoom and on narrow viewports.

### Testing and audit evidence

- Component tests cover accessible names, roles, state attributes, keyboard
  activation, focus behavior, and live-region output for each corrected slice.
- Critical connect, action, error, and game-over paths have at least one browser
  check using keyboard interaction and accessible locators.
- An accessibility audit records the tested routes, browser and assistive-tech
  assumptions, unresolved issues, and any intentional exceptions.
- New components do not introduce tooltip-only information or pointer-only
  actions without a documented equivalent.

## Current Strengths

The existing client already provides several useful foundations:

- Most action surfaces use native `button` elements and form controls.
- Selection controls expose `aria-pressed` in the rails and target lists.
- Connection fields use visible labels through the shared `ConnectField`.
- Error overlays, combat results, game-over results, and the inactive event
  stream use live-region or alert roles in several paths.
- The map zoom control has a programmatic label.
- The API and snapshot contracts already reject invalid authoritative data rather
  than requiring the accessible UI to recover silently.

These are starting points, not completion evidence. Each surface still needs
behavioral keyboard and announcement tests.

## Known Gaps

The following gaps are confirmed or require an explicit audit before being
considered complete.

### P0: Information or action is inaccessible

- **Inactive event details are tooltip-only.** `InactiveEventStream` places
  `entry.details` in an HTML `title` on a non-focusable list item. Details are
  unavailable as a reliable keyboard or screen-reader interaction path. Replace
  this with an expandable or otherwise explicit disclosure that has a stable
  accessible name and preserves the concise summary.
- **Map interaction is pointer-led.** Movement currently uses a context-menu
  gesture and map selection is driven by rendered cell/unit interaction. Provide
  equivalent rail or structured map controls for selecting occupants, targets,
  and reachable destinations without requiring pointer coordinates.
- **Debug popup manipulation is mouse-only.** Dragging and resizing use document
  mouse listeners and the resize handle is not a keyboard control. Movement and
  sizing must either become optional pointer enhancements around a keyboard-safe
  dialog or expose keyboard-operable layout controls.

### P1: Focus and semantic state

- **Debug diagnostics lacks dialog focus management.** The portal has no explicit
  dialog semantics, focus entry, focus containment strategy, or focus restoration
  contract. Its close control and any action controls should be reachable in a
  predictable order.
- **Transient overlays need a focus policy.** Error, confirmation, combat-result,
  ram-result, and game-over surfaces use live-region roles, but the audit must
  verify when focus should move, how dismissal works, and whether updates are
  announced once rather than duplicated.
- **Event-stream live updates need interruption control.** The inactive stream
  currently uses a broad `role="status"` container. Define which new entries are
  announced, how loading and error messages are scoped, and how an active user
  can review updates without focus being stolen.
- **Accessible names and state are inconsistent across utility surfaces.** Some
  controls rely on `title` for supplementary meaning, and status blocks expose
  connection or last-update context primarily through visual text and title
  attributes. Audit names, descriptions, and state changes together.

### P2: Coverage and visual robustness

- **No repository-wide automated accessibility gate is defined.** Component tests
  exist, but the project does not yet require an accessibility matcher or a
  repeatable browser audit for the core routes.
- **Focus visibility, contrast, zoom, and reduced motion need a systematic
  audit.** Existing CSS and state styling should be checked across active,
  inactive, disabled, selected, destroyed, error, and waiting states rather than
  assumed compliant from markup alone.
- **Complex map and stack presentations need structured reading order.** The
  visual board, collapsed stacks, inspector, and rail selection state should be
  checked so screen-reader output identifies unit type, friendly name, status,
  position or group, and available action without requiring visual inspection.

## Audit Order

1. Establish the test and audit harness: accessible queries, keyboard helpers,
   focus assertions, and a small browser smoke path.
2. Fix `InactiveEventStream` details and define the event announcement policy.
3. Define the keyboard-equivalent map and target-selection path.
4. Add dialog and overlay focus management, beginning with diagnostics and errors.
5. Audit control names, state attributes, focus visibility, contrast, zoom, and
   reduced motion across the shell and rails.
6. Run the critical workflow audit and update this document with resolved gaps,
   remaining exceptions, and evidence.

## Acceptance Record

Each implementation slice should update this section or link a short audit note
with:

- affected route and components;
- keyboard path tested;
- accessible names, roles, and state verified;
- focus entry, dismissal, and restoration behavior;
- live-region behavior verified;
- component and browser tests added;
- known residual gaps.
