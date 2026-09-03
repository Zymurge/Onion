# Game Lobby High-Level Specification

## Purpose

The game lobby is the coordination layer between authenticated users and the
active gameplay engine. It manages who can create and enter a game, how a game
moves from a waiting game into active play, and the minimum information clients
need to connect to that game.

The lobby does not own turn rules, movement, combat, victory, or authoritative
in-game state. Once a game starts, those responsibilities remain with the
existing gameplay engine.

## Scope and Order

The lobby work is divided into the following steps and should be explored and
designed in this order:

1. User creation and management
2. Game creation
3. Game membership and join
4. Game lifecycle management
5. Game start
6. Membership lock after start
7. Lobby-to-game handoff
8. Client integration with the existing gameplay flow

The implementation uses automatic readiness when both player roles are filled,
persists coarse game status, exposes waiting games for discovery, and lets the
host explicitly start a ready match. User-controlled readiness and richer
visibility policy remain future work.

## Step 1: User Creation and Management

Establish the user identity and account operations the lobby depends on.

See [user-account-spec.md](user-account-spec.md) for the detailed initial
account scope.

- Support authenticated user creation and login using the existing JWT-based
  authentication system.
- Define the minimum user identity and account state needed by lobby actions,
  without introducing administrative account management.

## Step 2: Game Creation

Allow an authenticated user to create a new game.

- Create a game for a selected scenario and assign the creating user as its
  initial player and host.
- Establish the initial game configuration and available player roles needed
  for another player to join.

## Step 3: Game Membership and Join

Allow eligible authenticated users to enter an existing game.

- Join a waiting game and receive an available player role without allowing
  duplicate membership or conflicting role assignments.
- Track the relationship between users and games so each participant can
  authenticate against the games they belong to.

## Step 4: Game Lifecycle Management

Define and persist the coarse lifecycle states that control what game membership
operations are allowed.

- Create games in `waiting` with a persisted host identity.
- Transition a full roster to `ready`, transition to `active` when the host
  explicitly starts the game, and transition to `completed` when a winner is
  persisted.
- Reject joins and open-lobby discovery after the game leaves `waiting`.

## Step 5: Game Start

Allow a game to move from lobby coordination into gameplay.

- Only the authenticated host may start a full `ready` game.
- Starting a game persists a `STARTED` event and transitions the match to
  `active` before gameplay actions are accepted.
- Expose the persisted lifecycle status and host identity in authoritative game
  responses.

## Step 6: Membership Lock After Start

Make the player roster stable once gameplay begins.

- Prevent new joins, role changes, or other roster mutations after the game
  has started.
- Ensure every active player has a stable role and identity for gameplay
  authorization and event delivery.

## Step 7: Lobby-to-Game Handoff

Define the boundary and data handoff between lobby state and the gameplay
engine.

- Provide clients with the game ID, assigned role, scenario context, and
  connection information required to load the existing gameplay experience.
- Ensure the gameplay engine receives a complete, immutable starting roster
  and scenario selection rather than continuing to depend on lobby operations.

## Step 8: Client Integration

Connect the web and other clients to the lobby flow without redesigning the
active gameplay surface.

- Replace the current out-of-band game ID sharing flow with lobby-backed game
  creation, joining, and transition into the existing game screen.
- Preserve the current JWT authentication, REST operations, WebSocket live
  updates, and authoritative snapshot behavior once a client enters gameplay.

The web client currently provides the lobby-backed flow through the dashboard
and open-game list. A host can start a ready match from the dashboard; the
client calls `POST /games/{id}/start` and enters the game screen only after the
server confirms the match is `active`.

## Explicitly Deferred to Phase 2

### User-Controlled Readiness

Participants do not currently signal readiness independently; the game becomes
`ready` automatically when both roles are filled. A separate ready-up flow
remains deferred, while the host start policy is implemented through
`POST /games/{id}/start`.

### Game Status and Discovery

Basic status and waiting-game discovery are implemented. Richer visibility rules
and potentially public, private, or invite-only games remain deferred.

## Boundary Summary

The lobby answers:

- Who is this user?
- Which users belong to this game?
- Which scenario and roles were selected?
- Is the game allowed to start?
- Has the roster been locked?
- How does a client enter the active game?

The gameplay engine answers:

- What is the authoritative game state?
- Which actions are legal?
- How do movement, combat, phases, and victory resolve?
- Which live events and snapshots should clients receive?
