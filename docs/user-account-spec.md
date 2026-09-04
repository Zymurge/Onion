# User Account Specification

## Purpose

Define the smallest user account capability required by the game lobby and
existing gameplay API.

A user account identifies a player and provides the credentials needed to
obtain a JWT. It is not intended to become a general profile, identity, or
account-management system in this phase.

## Scope

Each account consists of:

- A server-generated UUID user ID used only as an internal database and
  authorization identifier.
- A unique friendly username used as the public player identity.
- An email address used as the login and contact identifier.
- A password used only to authenticate.

The server returns the friendly username and a signed JWT after successful
registration or login. The UUID remains inside the JWT and server-side records;
clients do not need to display it. Protected lobby and gameplay operations
continue to use the JWT.

## In Scope

### Account creation

- Accept an email address and password from an unauthenticated client.
- Accept a unique username as the public player identity.
- Validate all fields against the boundaries below, normalize the username and
  email for comparison, and store the accepted username/email plus a secure
  password hash.
- Generate the UUID on the server and reject duplicate usernames or email
  addresses.

### Field validation

- `username`: 4-20 characters. It may contain ASCII letters, digits, spaces,
  and printable ASCII punctuation/special characters. Control characters,
  line breaks, and leading or trailing spaces are rejected. Username
  uniqueness is case-insensitive; the accepted display form may preserve the
  user's casing.
- `password`: 8-20 characters using the same printable character set as the
  username. Spaces and special characters are allowed. No composition rule is
  required; the service does not require a digit, uppercase character, or
  symbol beyond the permitted-character rule. Passwords are validated exactly
  as entered and are never trimmed or normalized.
- `email`: a properly formatted internet email address using a standards-based
  email validator, with no whitespace or control characters. The validator
  must enforce normal address and domain syntax and the practical maximum
  address length of 254 characters. Validation does not verify that the
  mailbox exists or that the user controls it.

### Login

- Accept email and password credentials.
- Return the matching username and signed JWT when the credentials are valid.
- Return a generic invalid-credentials response when authentication fails.

### Identity for authorization

- Treat the JWT subject as the canonical user ID.
- Treat the username as the canonical public identity shown in lobby and game
  interfaces.
- Use the authenticated user ID for lobby membership, game ownership, player
  assignment, and gameplay authorization.
- Do not use the username or email address as a foreign key in game or event
  records.

## Data Model

The minimum persistent user record is:

| Field | Meaning |
| --- | --- |
| `id` | Server-generated UUID primary key |
| `username` | Normalized, unique public player identity |
| `email` | Normalized, unique login and contact identifier |
| `password_hash` | Salted password hash; never plaintext |
| `created_at` | Account creation timestamp |

No separate display name, avatar, preferences, or profile metadata is required
for the initial lobby; the username is the display name.

## API Surface

### `POST /auth/register`

Request:

```json
{
  "username": "swampwalker",
  "email": "player@example.com",
  "password": "..."
}
```

Successful response:

```json
{
  "username": "swampwalker",
  "userId": "<user-id>",
  "token": "<signed-jwt>"
}
```

Expected failure categories:

- `400 INVALID_INPUT` for malformed email, username, or password input.
- `409 USERNAME_TAKEN` when the normalized username is already registered.
- `409 EMAIL_TAKEN` when the normalized email is already registered.

### `POST /auth/login`

Request:

```json
{
  "email": "player@example.com",
  "password": "..."
}
```

Successful response has the same shape as registration. Invalid credentials
return `401 INVALID_CREDENTIALS`. Login uses email; the username remains the
public identity regardless of the login identifier.

## Credential and Token Handling

- Continue using the existing `@fastify/jwt` integration for signed JWTs.
- Continue using Node's built-in salted `scrypt` implementation for password
  hashing and constant-time comparison for verification.
- Never return, log, or persist a plaintext password.
- The JWT carries the UUID user ID in `sub`; lobby and gameplay routes use the
  shared verifier already established by the authentication layer.

No new authentication framework or password library is required for this
scope. The existing primitives are small, already integrated, and sufficient
for account creation and login.

## Explicitly Out of Scope

The initial account model does not include:

- Email ownership verification or verification emails.
- Password reset, password change, password recovery, or password rotation.
- Account deletion, suspension, or administrative user management.
- Multi-factor authentication or social login.
- User profiles, display names, avatars, preferences, or presence.
- Server-side JWT sessions, logout revocation, or token refresh.

Email verification can be added later if the project chooses an email delivery
provider and defines verification-token persistence, expiry, retry, and failure
handling. It is not needed to support the initial lobby flow.

## Identifier Policy

The UUID should remain the internal primary key even though the username is
unique. This keeps game memberships, event history, and JWT subjects stable if
the public username policy changes later. The username can be exposed in lobby
and gameplay UI without exposing the UUID.

The current implementation already has a username field but does not yet
store email addresses. The implementation pass will extend the user record and
auth payloads to include both fields.

## Resolved Policy Decisions

- Duplicate registration is allowed to reveal which field conflicts. Return
  `409 USERNAME_TAKEN` for a duplicate username and `409 EMAIL_TAKEN` for a
  duplicate email; do not collapse these into a generic conflict response.
- Failed-login throttling is out of scope for the initial implementation and
  may be considered as a Phase 2 operational feature.
