# Onion Minor Bugs (Temp)

## 1. Inactive Window Shows Onion's Own Actions

- **Bug:** The Onion's own actions are still visible in the inactive event window during its inactive phases. The window should start at the Defender Move phase of the current turn.

- **Likely Root Cause:** The client logic for trimming the inactive event stream is not correctly identifying the phase boundary for the current turn. It may be using the previous turn's phase or not filtering events based on the correct phase transition (should filter out Onion actions after the last ONION_MOVE/ONION_COMBAT and only show events from DEFENDER_MOVE onward).
- **Relevant Code:**
  - `web/lib/useInactiveEventStream.ts`:
    - `trimInactiveWindowEvents(events)` (lines 507–515): Trims events after the first PHASE_CHANGED event.
    - Usage (lines 614–616): Only trims by the first PHASE_CHANGED, not specifically by DEFENDER_MOVE phase.
- **Root Cause Detail:** The trimming logic does not specifically look for the Defender Move phase; it just slices after the first phase change, which may include Onion actions from the current turn.

## 2. Tread Attack Roll 'D' Shows 'Disabled' Instead of 'Miss'

- **Bug:** When a roll of 'D' occurs while attacking Onion treads, the inactive events display 'disabled' in both the event header and the outcome text. According to the roll-to-result mapping, 'D' should be normalized to 'miss'.
- **Likely Root Cause:** The inactive-stream label logic was only recognizing the legacy `onion` target id and the `:treads` selection suffix, while the server-side combat event for Onion treads uses the concrete Onion id such as `onion-1`.
- **Relevant Code:**
  - `web/lib/useInactiveEventStream.ts`:
    - `resolveCombatOutcomeLabel(event, relatedEvents)` (lines 160–185): For outcome 'D', returns 'missed' when the target is recognized as Onion and tread loss follows, otherwise falls back to other labels.
    - `isOnionTarget(targetId)` (lines 120–131): Determines if the target is the Onion.
  - `server/engine/combat.ts` (lines 200–210, 621–623): Onion tread attacks resolve to the Onion's concrete id, not the bare `onion` string.
- **Root Cause Detail:** The UI and server were using different target-id shapes for the same Onion tread attack. Once the inactive stream recognizes the concrete Onion id, both the header and outcome resolve to `missed`.

## 3. Onion Cannot Target Swamp as Defender

- **Bug:** The earlier Swamp repro was based on an incorrect AP target assumption. AP is infantry-only, so Swamp should not be targetable by AP at all.
- **Likely Root Cause:** The shared unit definition had AP weapons widened beyond infantry. The target list was behaving consistently with that bad data.
- **Relevant Code:**
  - `shared/unitDefinitions.ts` (lines 153–160): AP Gun weapons should allow targeting only infantry.
  - `docs/game-rules.md` (lines 93–94): AP is effective only against Infantry.
- **Root Cause Detail:** The bad repro assumed a non-infantry target should be valid for AP. The corrected rule is that AP should not target Swamp.

---

(Temporary doc for tracking minor bugs and root cause analysis. To be triaged and fixed in future sprints.)
