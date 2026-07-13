# Warpkeep Alpha 0.3.1

Alpha 0.3.1 is a security-first release for Warpkeep's Farcaster-native shared
realm boundary. It binds sign-in proof to the requesting browser, replaces
browser-readable long-lived authority with short memory-only access tokens and
rotating HttpOnly session families, and makes intentional player consent the
only way to activate authentication.

This release does not widen admission, create players or castles, or change the
authoritative world. Public authentication remains fail closed unless the
separately reviewed production controls are deliberately enabled.

## Player-facing entry boundary

- **ENTER REALM** first opens an unchecked **ALPHA PARTICIPATION TERMS** dialog.
  No cookie refresh, Farcaster challenge, QR/deep link, proof exchange, or
  database connection occurs before the player checks the agreement and selects
  **CONTINUE TO SIGN-IN**.
- Acceptance exists only in component memory for one entry attempt and
  authorizes one continuation. Cancel, close, Escape, browser Back, unmount,
  failure, expiry, completion, and retry discard it. A later attempt starts
  unchecked.
- Direct `#realm` navigation normalizes to the menu and carries no consent or
  authorization intent. Anonymous focus, visibility, and pageshow events cannot
  silently restore a cookie session.
- The concise Alpha notice stores no identity or tracking record and is not a
  substitute for complete Terms of Service, Privacy Policy, or legal review.

## Authentication and authorization hardening

- Every Farcaster proof exchange uses a fresh browser-private verifier and its
  S256 challenge. Legacy unbound public exchange paths remain retired.
- Access tokens stay in JavaScript memory, expire within ten minutes, and carry
  exact protocol-v2 claims. Session references use Secure, HttpOnly,
  SameSite=Strict `__Host-` cookies with bounded rotation and server revocation.
- Remember-device behavior is an explicit opt-in. Sign-out clears local
  authority, records a non-secret logout intent, and attempts server-family
  revocation without logging identity, cookie, token, proof, or QR material.
- Unadmitted identities receive tokenless pending-admission state. Admitted
  players require a positive authorization epoch, while resolver and operator
  authority remain separate, exact, and least privilege.
- The official browser reads only the identity-free `player_v2` projection.
  Private `player_ownership_v2` records have no generated browser table
  accessor.

## Release and migration boundary

The checked-in protocol-v2 module, session-family Durable Object migration,
managed secret, Worker configuration, and frontend are coordinated rollout
stages. They are not applied merely by merging source. Each production mutation
or deployment requires its own owner approval, runs with public authentication
disabled, and must pass exact-source/configuration verification before the next
stage.

The module migration is additive. It preserves the exact production table
prefix—`allowed_fid`, `world_tile`, legacy `player`, `castle`, and
`admin_audit`—including the legacy player's original public `identity` field.
That legacy table and its retired writer remain only for wire compatibility;
protocol v2 never reads, writes, or subscribes to it, and publication requires a
fresh aggregate proof that it is empty. Public `player_v2` and private
`player_ownership_v2` are appended after the five-table prefix.

The protocol-v2 status procedure reports counts only: legacy/v2 players,
private ownerships, consistent pairs, both orphan classes, world/admission data,
castles, audit-entry count, and fixed protocol/seed metadata. It never returns
an identity, FID, profile, note, audit row, token, or credential.

Preparing this release changes no production admission, player, castle, or world
data. It does not rotate secrets, publish a schema, apply a Durable Object
migration, deploy a Worker or Pages build, or re-enable public authentication.
As documented here, protocol v2 is not published and remains awaiting a
separate owner approval.

## Verification contract

The release gate requires:

- deterministic browser, Worker, exact Workerd, and SpacetimeDB module tests;
- TypeScript validation and canonical plus GitHub Pages production builds;
- dependency, registry-signature, runtime-asset, file-size, license, and
  generated-binding verification;
- a pinned-CLI, disposable-loopback migration proof that preserves the exact
  five-table prefix and empty/nonempty fixtures, appends only the two v2 tables,
  detects partial state, proves idempotence, and refuses a guarded v1 rollback
  before schema change, with a single SHA-256 receipt binding the same prebuilt
  artifact to any separately approved guarded publish;
- exact numeric/name generation matching and bidirectional canonical
  world/castle/occupancy integrity checks;
- keyboard, focus-trap, screen-reader semantics, mobile viewport, short
  landscape, reduced-motion CSS, pagehide/back-forward, cancellation, retry,
  and direct-route consent regressions;
- exact-head hosted Verify and CodeQL checks plus independent blocker-only
  review;
- separately approved, bounded production rollout and read-only verification
  while public authentication remains disabled.

After any approved publish, verification requires zero legacy players, zero
one-sided v2 rows, and matching v2 projection/ownership pair counts. A failed or
indeterminate migration is recovered only through a reviewed additive forward
fix with fresh approval—never data deletion, database recreation,
`--break-clients`, or a schema downgrade.

The `v0.3.1` tag and GitHub Release are created only after the canonical public
build reports the final protected-main commit exactly.
