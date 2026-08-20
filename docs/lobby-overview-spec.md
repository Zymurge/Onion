# Game Lobby High-Level Specification

## Purpose

The game lobby is the coordination layer between authenticated users and the
active gameplay engine. It manages who can create and enter a game, how a game
moves from an open lobby into active play, and the minimum information clients
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

Game readiness and game status/discovery are Phase 2 items and are
intentionally excluded from this initial pass.

## Step 1: User Creation and Management

Establish the user identity and account operations the lobby depends on.

See [user-account-spec.md](user-account-spec.md) for the detailed initial
account scope.

- Support authenticated user creation and login using the existing JWT-based
  authentication system.
- Define the minimum user identity and account state needed by lobby actions,
  without introducing administrative account management.

## Step 2: Game Creation

Allow an authenticated user to create a new game lobby.

- Create a lobby for a selected scenario and assign the creating user as its
  initial player and host.
- Establish the initial game configuration and available player roles needed
  for another player to join.

## Step 3: Game Membership and Join

Allow eligible authenticated users to enter an existing lobby.

- Join an open lobby and receive an available player role without allowing
  duplicate membership or conflicting role assignments.
- Track the relationship between users and games so each participant can
  authenticate against the games they belong to.

## Step 4: Game Lifecycle Management

Define the coarse lifecycle states that control what lobby operations are
allowed.

- Establish the transition from an open lobby to a startable lobby and then to
  an active game, with invalid transitions rejected.
- Allow appropriate pre-start membership changes, while keeping gameplay state
  and turn progression outside the lobby's responsibility.

## Step 5: Game Start

Allow a game to move from lobby coordination into gameplay.

- Permit the authorized host to start the game when the lobby's required
  creation conditions are satisfied.
- Create or finalize the authoritative gameplay setup exactly once and expose
  the resulting game identity to both participants.

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

- Replace the current out-of-band game ID sharing flow with lobby-backed
  creation, joining, and transition into the existing game screen.
- Preserve the current JWT authentication, REST operations, WebSocket live
  updates, and authoritative snapshot behavior once a client enters gameplay.

## Explicitly Deferred to Phase 2

### Game Readiness

Readiness would let participants indicate that they are prepared to start and
would add rules for when the host may start. It is not part of this initial
lobby scope.

### Game Status and Discovery

Status and discovery would provide lobby listings, visibility rules, richer
status information, and potentially public, private, or invite-only games. It
is not part of this initial lobby scope.

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
