# Warpkeep SpacetimeDB module

This directory is the server-authoritative closed-alpha module for Warpkeep.
It is independent of the static Pages client: title/menu visitors do not create
a SpacetimeDB identity, and gameplay authority comes only from a strictly
validated bridge-issued OIDC access token.

> **Local protocol-v2 draft — not published.** The security changes described
> below exist in this checkout. This work did not inspect or mutate Maincloud,
> publish a module, seed a world, change an allowlist, deploy a Worker/frontend,
> configure a secret, run a Durable Object migration, or enable public auth.

The historical production database and issuer remain recovery context only.
They must not be described as running this local v2 module until an explicitly
approved publish and exact-head verification have completed.

## Version compatibility

- Installed CLI: `spacetimedb 2.6.1` (commit `052c83fe984a4c4eb7bb4f9afa5c6b1903891d87`)
- Server package: `spacetimedb 2.6.1`
- Module TypeScript: `5.6.3`
- Local backend wire protocol: `2`

Run locally after installing directory dependencies:

```sh
pnpm install
pnpm run verify
```

`pnpm run stdb:build` invokes `spacetime build --module-path .`. Pure tests
cover JWT principals/claims, session windows, admission/epoch transitions,
resolver response policy, connection gating, and the deterministic radius-four
Lowlands map. They do not connect to or publish a database.

## Authority and tables

```txt
verified Farcaster SIWF
  -> trusted Warpkeep bridge
  -> structured private admission resolution
  -> 600-second protocol-v2 player access JWT
  -> admitted SpacetimeDB connection
  -> public player/castle/world_tile state
```

Private tables:

- `allowed_fid`: manual admission, enabled flag, and per-FID auth epoch.
- `player_ownership`: the one-to-one FID ↔ opaque SpacetimeDB OIDC Identity
  authorization binding.
- `admin_audit`: administrative action trace.

Public tables:

- `world_tile`: exactly 61 canonical radius-four Lowlands gameplay cells; the
  30-cell visual apron remains client-only.
- `player`: a stable Farcaster FID plus public presentation/game fields; it
  contains no opaque SpacetimeDB OIDC Identity.
- `castle`: one level-one keep per admitted FID and one occupant per tile.

Private-table query/subscription accessors are omitted from generated browser
bindings. Code generation may retain inert schema types, but those types expose
no rows or subscription authority.

## Player token and connection contract

Player JWTs must have:

- exact configured issuer and audience;
- `token_type: "spacetime-access"`;
- `auth_version: 2`;
- exact `sub: "farcaster:<fid>"` and a positive safe decimal FID;
- positive `auth_epoch` in `1..u32::MAX`;
- exactly empty `roles`;
- integer `session_iat`/`session_exp` with a maximum 600-second window.

The custom deadline is rechecked against authoritative module time on every
player call, including after SpacetimeDB exchanges the original access JWT for
a connection token. Epoch zero is never valid player authority. Optional
`username`, `display_name`, and `pfp_url` JWT fields are ignored for persistence;
they are never a bootstrap profile-write channel.

`onConnect` accepts only a currently enabled player whose token epoch matches
the private row, or a fresh exact Hermes administrator. Missing, disabled,
epoch-mismatched, expired, malformed, resolver, and unrelated principals cannot
open a subscription-bearing connection. Gameplay reducers independently repeat
player admission and private-ownership checks. A missing public/private half or
an identity mismatch fails closed.

The separate admin principal remains exact:

```txt
sub: service:hermes
roles: [warpkeep-admin]
maximum session: 300 seconds
```

Admin roles are never inferred from a player or resolver token.

## Admission, resolver, and bootstrap

First admission starts at epoch `1`. Repeating an already-enabled allow is
idempotent; disabling blocks player authority; re-enabling rotates exactly once;
and maximum-epoch re-enable fails before table or audit mutation. Existing
enabled epoch-zero state fails closed under the v2 resolver and player parser
and therefore requires deliberate operator inspection before rollout.

The bridge's dedicated resolver procedure is:

```txt
auth_resolver_get_fid_admission_v2({ fid })
```

It is callable only with a fresh JWT having exact
`sub: "service:auth-epoch-resolver"`, exactly
`roles: ["warpkeep-auth-epoch-resolver"]`, and a maximum 60-second window. The
principal cannot open a WebSocket subscription and has no admin authority. The
procedure performs a read-only lookup and returns exactly one of:

```json
{ "state": "missing", "authEpoch": 0 }
{ "state": "disabled", "authEpoch": 0 }
{ "state": "enabled", "authEpoch": 1 }
```

The enabled epoch shown is illustrative and may be any positive `u32`. An
enabled epoch-zero row is an invalid state and fails closed rather than being
reported as enabled.

`admin_get_fid_auth_epoch({ fid })` remains byte-compatible and admin-only for
rollback. It returns a raw epoch/baseline zero and must not be used for new v2
issuance or refresh.

`get_my_admission_status` remains a caller-specific status procedure for an
already admitted connection. Missing/disabled users are resolved by the bridge
before any player access token or database connection exists.

`bootstrap_player` is transactional and idempotent. It derives the FID only
from signed claims, requires current admission, and atomically creates the
private ownership binding, public player projection, castle, and tile occupancy;
the first fixture receives `0,0`. The local bridge issues no optional profile
claims, and the module independently ignores any optional profile-shaped JWT
fields: new public player rows explicitly insert undefined `username`,
`displayName`, and `pfpUrl`. A future profile mutation requires a separate
reviewed authorization path.

## Admin operations

Exact fresh Hermes authority is required for:

- `admin_seed_world`
- `admin_allow_fid`
- `admin_disable_fid`
- `admin_bump_auth_epoch`
- `admin_get_alpha_status`
- rollback-only `admin_get_fid_auth_epoch`

No real FID is seeded in source or by a verification script. Operator wrappers
must keep admin JWTs in memory, support read-only/dry-run inspection, and require
confirmation for mutations.

## Backend compatibility metadata

`WARPKEEP_BACKEND_PROTOCOL_VERSION = 2` is an internal wire contract, separate
from the player-facing release and the `HEGEMONY_GENESIS_001` realm label.
`get_alpha_backend_info` is available only to a permitted player/admin
connection and returns static protocol/world-seed metadata. It exposes no
whitelist, identity, audit, or live aggregate data. The browser must reject a
protocol/seed mismatch before bootstrap or subscription.

SpacetimeDB 2.6's default case converter would spell a trailing version digit
as `_v_2`; the module pins the resolver's canonical wire name to exact `_v2`.
Generated bindings and regression tests verify that exact external name.

## Browser session boundary

The module accepts only the maximum-600-second access JWT; it does not receive
or store the long-lived browser session reference. The separate bridge tier
owns a maximum-30-day rotating family referenced by a
`__Host-warpkeep_session; Secure; HttpOnly; SameSite=Strict; Path=/` cookie.
The access JWT stays in browser JavaScript memory only. Pending families yield
no token, and bound epoch mismatch/missing/disabled or stale replay revokes the
server-side family.

The module deliberately stores no SIWF proof, relay token, QR payload, browser
session cookie, private key, or admin credential.

## Approval-gated schema rollout

No command in this README authorizes external mutation. This local module removes
opaque OIDC Identity from the public `player` schema and adds private
`player_ownership`; that is a breaking schema change even though the publish must
preserve data. A generic additive publish approval is insufficient. A future
rollout must keep Worker public auth and the frontend shared-alpha switch false
while it:

1. obtains explicit approval for read-only Maincloud inspection and records
   current player/ownership state without exposing row identities;
2. obtains a separate explicit approval for the reviewed breaking-schema
   migration/compatibility plan and non-destructive protocol-v2 module publish
   (`--delete-data=never`); if any existing player data cannot be reconciled,
   stop rather than deleting or auto-migrating it;
3. verifies generated bindings contain no private ownership accessor and checks
   the exact structured resolver;
4. separately approves the additive session-family Durable Object migration and
   secret configuration;
5. separately approves a Worker deploy with public auth still false and checks
   its configuration attestation;
6. separately approves the v2 frontend deploy with its realm switch false;
7. requires a final explicit approval before any public-auth or realm enable.

The current guarded publish path forbids `--break-clients`. If local or read-only
preflight reports that the approved schema cannot be applied through that path,
stop. Changing the migration implementation or publish guard requires its own
review and explicit approval; this README does not authorize bypassing it.

See the [activation and recovery runbook](../docs/operations/alpha-activation.md).
If any coordinate or state differs, stop; do not erase, recreate, auto-migrate,
or admit a FID.
