# Onion CLI Client Spec

## Purpose

This document defines the Phase 1 command-line client for Onion. The CLI exists to prove that the backend can run a complete game end to end with two human players using two shell instances.

The CLI is a test and validation client first, not a polished user-facing product.

## Primary Goals

- Prove that a full game can be played through the REST API from setup to victory.
- Make manual backend testing fast and repeatable.
- Surface server validation errors clearly, especially out-of-phase actions.
- Render enough map and state information for a human to make legal decisions.
- Keep implementation small, explicit, and easy to debug.

## Non-Goals

- No reactive terminal UI framework.
- No WebSocket dependency in Phase 1.
- No automatic polling for opponent actions.
- No matchmaking or lobby UX beyond create and join.
- No persistence of local client-side game state beyond session convenience.
- No attempt to hide the game protocol from the tester.

## Operating Model

The Phase 1 CLI is intended for one person manually driving both sides from two separate shell instances.

- Shell A logs in as the Onion player.
- Shell B logs in as the defender player.
- The operator manually switches shells when a phase changes hands.
- Each shell fetches state on demand.
- Illegal or out-of-phase commands are expected during testing and should be shown exactly and clearly.

Because of this operating model, continuous polling is unnecessary. The CLI should support explicit refresh and event inspection, but it does not need background synchronization.

## Design Principles

- Use the existing backend stack: TypeScript on Node.js.
- Prefer directness over abstraction.
- Keep transport synchronous and request-driven.
- Make every action visible and inspectable.
- Fail loudly with server-provided errors.
- Keep map rendering legible rather than pretty.

## Technical Stack

- Language: TypeScript
- Runtime: Node.js
- HTTP: native fetch or a very small wrapper around it
- CLI prompts: inquirer
- Output styling: chalk
- Validation: optional zod for response guards; do not block initial delivery on it

No React-style CLI framework should be used for the first version.

## High-Level Architecture

The client should be split into a small number of modules with clear responsibilities.

### 1. API Client

Responsible for all HTTP communication with the backend.

- Register
- Login
- List scenarios
- Get scenario details
- Create game
- Join game
- Get game state
- Submit action
- Fetch events

The API client should return parsed JSON and preserve backend error payloads without rewriting them.

### 2. Session Store

Responsible for local CLI context.

- Backend base URL
- Auth token
- User identity
- Current game ID
- Current role if known
- Last seen event sequence, if event browsing is used

The session store can start as an in-memory object per process. Optional file-based persistence can be added later if useful, but it is not required for Phase 1.

### 3. State Interpreter

Responsible for turning raw backend state into CLI guidance.

- Determine active side from current phase
- Determine whether the logged-in player should act or wait
- Enumerate allowed top-level commands for the current phase
- Convert state into concise summaries of units, weapons, positions, and targets
- Provide command payload builders for move, fire, and end phase

This module is important because it keeps protocol details out of the command loop.

### 4. Renderer

Responsible for all human-readable output.

The renderer should provide:

- Game summary header
- Current phase and active side
- Turn number
- Onion status summary
- Defender roster summary
- Recent events summary
- Map render
- Action result render
- Error render

### 5. Command Layer

Responsible for converting user intent into API calls.

Initial commands should include:

- `register`
- `login`
- `scenarios`
- `scenario show`
- `game create`
- `game join`
- `game load`
- `show`
- `refresh`
- `events`
- `move`
- `fire-weapon`
- `fire-unit`
- `combined-fire`
- `end-phase`
- `help`
- `exit`

### 6. Main Loop

Responsible for the interactive shell experience.

- Print current context
- Prompt for the next command
- Execute command
- Render response or error
- Return to prompt

This can be implemented as a straightforward REPL-style loop.

## Rendering Specification

The map does not need to be visually rich. It needs to be readable.

### Map Style

Render the board as an alternating offset grid so that adjacent rows visually imply hex geometry.

Example shape:

```text
 r00  [..][..][ON][..]
 r01    [..][rd][..][P ]
 r02  [..][cr][..][W ]
 r03    [..][..][..][CP]
      q00 q01 q02 q03
```

Guidelines:

- Prefix each row with the `r` coordinate.
- Offset alternating rows by two spaces.
- Show `q` coordinate labels beneath the grid.
- Use short terrain and unit markers.
- If a hex contains both terrain and unit significance, the unit marker wins and terrain is shown elsewhere in summaries.

### Suggested Markers

- Clear: `..`
- Ridgeline: `rd`
- Crater: `cr`
- Onion: `ON`
- Big Bad Wolf: `BW`
- Puss: `PU`
- Witch: `WI`
- Lord Farquaad: `LF`
- Pinocchio: `PI`
- Dragon: `DR`
- Little Pigs: `LP`
- Swamp: `CP`

Destroyed units should be omitted from the map and shown in event history instead.

### Supplemental Views

The map alone is not enough. The CLI should also display:

- Onion tread count
- Onion weapon status by battery/slot
- Defender unit list with position and status
- Whose turn it is
- Which commands are legal to attempt next

## Error Handling Requirements

Error display is a first-class feature of the CLI.

The CLI must show:

- HTTP status code
- Top-level backend error code
- Detail code when present
- Human-readable error string
- Current phase when returned by the API

This is especially important for manual testing of out-of-phase actions. The CLI should not try to hide or normalize these errors into vague local messages.

The canonical layer map for CLI tests and the rest of the system lives in [testing-strategy.md](testing-strategy.md).

Recommended error output shape:

```text
Action rejected
status: 422
code: MOVE_INVALID
detailCode: WRONG_PHASE
phase: DEFENDER_COMBAT
error: Not the Onion movement phase
```

## Command UX

The CLI should support two modes of use.

### Guided Mode

Prompt-driven command entry for common operations.

- Pick an action from a menu
- Fill in required fields through prompts
- Submit the generated payload

### Raw/Debug Mode

Direct command entry for backend testing.

- Allow explicit unit IDs and target IDs
- Optionally allow raw JSON action submission

Raw mode is useful because backend verification sometimes requires attempting invalid commands intentionally.

## Command Grammar

The CLI should support both typed commands and guided prompt flows. Typed commands are the primary contract and should be stable. Guided prompts are a convenience layer over the same grammar.

### General Rules

- Commands are case-insensitive at the verb level.
- IDs, usernames, passwords, scenario IDs, and target IDs remain case-sensitive.
- Words are separated by spaces.
- Arguments containing spaces must be quoted.
- Coordinate tokens may be written as `q,r` or as separate integers where explicitly allowed.
- Unknown commands should not be silently corrected.
- Invalid argument shapes should produce a local parse error before any HTTP call is made.

### Top-Level Grammar

The CLI grammar can be described in EBNF-like form:

```text
command            = help
                   | exit
                   | status
                   | config
                   | register
                   | login
                   | scenarios
                   | scenario_show
                   | game_create
                   | game_join
                   | game_load
                   | show
                   | refresh
                   | events
                   | move
                   | fire
                   | end_phase
                   | raw_action ;

help               = "help" [topic] ;
exit               = "exit" | "quit" ;
status             = "status" ;

config             = "config" "set" "url" url
                   | "config" "show" ;

register           = "register" username password ;
login              = "login" username password ;

scenarios          = "scenarios" ;
scenario_show      = "scenario" "show" scenario_id ;

game_create        = "game" "create" scenario_id role ;
game_join          = "game" "join" game_id ;
game_load          = "game" "load" game_id ;

show               = "show" [show_target] ;
refresh            = "refresh" ;
events             = "events" [after_clause] [limit_clause] ;

move               = "move" unit_id position ;
fire               = "fire" target_id { attacker_id } ;
end_phase          = "end-phase" ;

raw_action         = "raw" json ;

show_target        = "map" | "state" | "units" | "onion" | "defenders" | "events" ;
after_clause       = "after" seq ;
limit_clause       = "limit" number ;

role               = "onion" | "defender" ;
weapon_type        = "main" | "secondary" | "ap" | "missile" ;
position           = coord_token | q_value r_value ;
coord_token        = integer "," integer ;
q_value            = integer ;
r_value            = integer ;
```

### Canonical Commands

The following forms should be treated as the canonical CLI surface:

```text
help
help move
status
config set url http://localhost:3000
config show

register shrek swamp1234
login shrek swamp1234

scenarios
scenario show swamp-siege-01

game create swamp-siege-01 onion
game join 33333333-3333-4333-8333-333333333333
game load 33333333-3333-4333-8333-333333333333

show
show map
show state
show units
show onion
show defenders
show events
refresh

events
events after 12
events after 12 limit 20

move onion 1,10
move wolf-1 5,6

fire wolf-1 wolf-1
fire main main
fire onion wolf-1 puss-1
fire main wolf-1 puss-1 witch-1

end-phase

raw {"type":"END_PHASE"}
```

### Aliases

Aliases should be supported sparingly and resolve to the canonical forms internally.

```text
quit           -> exit
scen           -> scenarios
scen show      -> scenario show
create         -> game create
join           -> game join
load           -> game load
ls events      -> events
fp             -> fire
ep             -> end-phase
```

The help output should always show canonical commands, not aliases.

## Argument Semantics

### Position

Positions should be accepted in either of these forms:

```text
move onion 1,10
move onion 1 10
```

Internally both normalize to:

```json
{ "q": 1, "r": 10 }
```

### Unit Identifiers

The CLI should accept backend unit IDs exactly as returned by the server, for example:

- `onion`
- `wolf-1`
- `puss-1`
- `witch-1`
- `main`

The CLI should not invent local aliases for units in Phase 1.

### FIRE Attacker List

The `fire` command uses a variable-length attacker list after the target id.

Example:

```text
fire main wolf-1 puss-1 witch-1
```

This maps to:

```json
{
  "type": "FIRE",
  "attackers": ["wolf-1", "puss-1", "witch-1"],
  "targetId": "main"
}
```

If no attacker ids are provided, the CLI should reject the command locally.

### Raw JSON Submission

The `raw` command takes the remainder of the input line as a JSON object and submits it directly to `POST /games/{id}/actions`.

Example:

```text
raw {"type":"MOVE","unitId":"onion","to":{"q":1,"r":10}}
```

This mode exists for backend testing and should bypass all client-side action-shape convenience logic except basic JSON parsing.

## Parser Behavior

The parser should follow a predictable order:

1. Tokenize input.
2. Resolve aliases.
3. Match the command form.
4. Parse arguments into a typed local command.
5. Either execute directly or enter a prompt completion flow if required arguments are missing.

### Local Parse Errors

The CLI should produce local parse errors for:

- Unknown command verb
- Missing required arguments
- Invalid coordinate syntax
- Invalid `weaponIndex` value
- Missing attacker ids in fire
- Malformed JSON in `raw`

Example local parse error:

```text
Parse error
command: fire
error: expected a target id followed by one or more attacker unit IDs
usage: fire <targetId> <attacker1> [attacker2...]
```

These are distinct from backend validation failures.

## Prompt Completion Rules

Guided prompts should complete incomplete commands instead of forcing the user to remember every argument.

### Completion Strategy

- If the user enters only a top-level action verb, prompt for the missing fields.
- If the user enters some arguments, preserve them and only prompt for what is missing.
- If the current state is loaded, prompts should offer context-aware choices.
- The prompt layer should never invent command payloads that the user did not imply.

### Prompt Flows

#### `register`

If username or password is missing:

- Prompt for username
- Prompt for password

#### `login`

If username or password is missing:

- Prompt for username
- Prompt for password

#### `game create`

If arguments are missing:

- Prompt for scenario from `GET /scenarios`
- Prompt for role: `onion` or `defender`

#### `game join`

If `gameId` is missing:

- Prompt for game ID

#### `game load`

If `gameId` is missing:

- Prompt for game ID

#### `move`

If arguments are missing and state is loaded:

- Prompt for movable unit ID based on phase
- Prompt for destination coordinate

The prompt does not need to compute only legal destinations in Phase 1. It may accept any coordinate and rely on backend validation.

#### `fire-weapon`

If arguments are missing and state is loaded:

- Prompt for weapon type
- Prompt for weapon index
- Prompt for target ID from visible opposing units

#### `fire-unit`

If arguments are missing and state is loaded:

- Prompt for attacker unit ID
- Prompt for target ID

#### `combined-fire`

If arguments are missing and state is loaded:

- Prompt for one or more attacker unit IDs
- Prompt for target ID

#### `events`

If no arguments are supplied:

- Default to `after` = last seen sequence or `0`
- Default to a reasonable `limit`, such as `20`

## Phase-Aware Command Availability

The CLI should compute suggested commands from the current phase, but it should not hard-block manual testing commands except where there is no meaningful local context.

### Always Available

- `help`
- `status`
- `config show`
- `config set url`
- `scenarios`
- `scenario show`
- `game create`
- `game join`
- `game load`
- `show`
- `refresh`
- `events`
- `raw`
- `exit`

### Suggested by Phase

`ONION_MOVE`

- `move onion <q,r>`
- `end-phase`

`ONION_COMBAT`

- `fire-weapon <weaponType> <weaponIndex> <targetId>`
- `end-phase`

`DEFENDER_RECOVERY`

- `refresh`
- `show`

`DEFENDER_MOVE`

- `move <unitId> <q,r>`
- `end-phase`

`DEFENDER_COMBAT`

- `fire-unit <unitId> <targetId>`
- `combined-fire <unitId...> -> <targetId>`
- `end-phase`

`GEV_SECOND_MOVE`

- `move <unitId> <q,r>`
- `end-phase`

The CLI should display these as recommendations, not as client-enforced rules.

## Output Contract for Successful Commands

Every successful action command should produce:

- A one-line success summary
- Any returned events, in order
- A short updated phase/state summary

Example:

```text
Action accepted
seq: 42
event: ONION_MOVED from (0,10) to (1,10)
phase: ONION_MOVE
turn: 1
```

If the response includes a phase change, that should be visually obvious.

## Help Contract

`help` should support both a summary and topic-specific help.

Examples:

```text
help
help move
help fire-weapon
help raw
```

Topic help should include:

- Command purpose
- Usage line
- Examples
- Notes on backend validation behavior when relevant

## Minimal Implementation Contract

If implementation starts before every convenience feature is built, the minimum command surface that still satisfies Phase 1 is:

- `config set url`
- `register`
- `login`
- `scenarios`
- `game create`
- `game join`
- `game load`
- `show`
- `refresh`
- `move`
- `fire-weapon`
- `fire-unit`
- `combined-fire`
- `end-phase`
- `events`
- `raw`
- `help`
- `exit`

Everything else is optional until a complete manual game can be played end to end.

## Recommended Command Flow

### Startup Flow

1. Set backend URL if not already configured.
2. Login or register.
3. Create or join a game.
4. Load current state.
5. Enter command loop.

### Turn Flow

1. Run `show` or `refresh`.
2. Read current phase and active side.
3. Submit one or more legal actions.
4. Inspect the response and event output.
5. End phase when finished.
6. Switch to the other shell when the phase changes sides.

## File and Module Layout

One reasonable structure is:

```text
src/cli/
  index.ts              # process entrypoint
  repl.ts               # main loop
  commands/
    auth.ts
    games.ts
    actions.ts
    render.ts
  api/
    client.ts
    auth.ts
    games.ts
    scenarios.ts
  session/
    store.ts
  state/
    interpreter.ts
    selectors.ts
  render/
    map.ts
    summary.ts
    events.ts
    errors.ts
  types/
    cli.ts
```

This should stay small. If a module is only used once and stays under control, keep it flat.

## Backend Assumptions

Phase 1 CLI relies only on existing REST endpoints.

- `POST /auth/register`
- `POST /auth/login`
- `GET /scenarios`
- `GET /scenarios/{id}`
- `POST /games`
- `POST /games/{id}/join`
- `GET /games/{id}`
- `POST /games/{id}/actions`
- `GET /games/{id}/events`

Event fetching exists for manual inspection and recovery, not mandatory background polling.

## Implementation Plan

### Step 1. Scaffold the CLI package

- Add `src/cli` entrypoint
- Add CLI scripts to `package.json`
- Add minimal configuration for running via `tsx`

Deliverable: a process that starts and prints a prompt.

### Step 2. Build the API client

- Implement auth, scenario, game, state, action, and events calls
- Preserve backend error payloads exactly

Deliverable: a thin tested REST wrapper.

### Step 3. Add session handling

- Track current token, game, role, and backend URL in memory
- Add login/register/create/join/load commands

Deliverable: a usable authenticated shell.

### Step 4. Add state and summary rendering

- Render phase, turn, winner, onion status, and defenders
- Render recent events and action responses

Deliverable: a text client that can inspect live game state.

### Step 5. Add the offset hex renderer

- Render the scenario map with alternating row offsets
- Overlay units on terrain

Deliverable: a functional tactical display.

### Step 6. Add action commands

- Move
- Fire weapon
- Fire unit
- Multi-attacker fire
- End phase

Deliverable: a full manual play loop through the CLI.

### Step 7. Add strong error reporting

- Render status code, error code, detail code, message, and current phase
- Verify out-of-phase attempts are obvious and useful

Deliverable: CLI suitable for backend manual testing.

### Step 8. Add convenience features

- Help
- Last action replay
- Explicit refresh
- Event browsing since last seen sequence

Deliverable: easier manual regression testing.

## Acceptance Criteria

The CLI is successful when:

- Two shell instances can register/login separately.
- One shell can create a game and the other can join it.
- Both shells can inspect the same game state.
- The active shell can complete movement, combat, and end-phase actions.
- Illegal actions return backend errors clearly.
- The operator can play both sides manually to a terminal game result.
- No polling or reactive terminal framework is required.

## Future Evolution

Once the backend is proven through the CLI, the next client can add richer interaction without invalidating this architecture.

- File-backed session persistence
- Better action menus
- Optional polling or WebSocket sync
- Web client sharing renderer-independent API/state code
- AI client reusing the same API wrapper and command builders

Phase 1 should resist these additions until the proof client is complete
