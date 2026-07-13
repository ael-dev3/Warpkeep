# Warpkeep SpacetimeDB module

This directory is the server-authoritative closed-alpha module for Warpkeep.
It is independent of the static Pages client: title/menu visitors do not create
a SpacetimeDB identity, and gameplay authority comes only from a strictly
validated bridge-issued OIDC access token.

> **Local protocol-v2 draft — not published.** The security changes described
> below exist in this checkout. The loopback proof does not contact Maincloud; a
> separate bounded, counts-only read reproduced the closed-alpha baseline. This
> work did not mutate Maincloud, publish a module, seed a world, change an
> allowlist, deploy a Worker/frontend, configure a secret, run a Durable Object
> migration, or enable public auth.

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

From the repository root, `npm run stdb:verify-additive-migration` runs the
pinned SpacetimeDB 2.6.1 CLI against disposable loopback-only databases. It
proves the production-v1 table signatures remain unchanged while the two v2
tables are appended with `--delete-data=never`. It does not inspect or mutate
Maincloud and is not production publish approval.

## Authority and tables

```txt
verified Farcaster SIWF
  -> trusted Warpkeep bridge
  -> structured private admission resolution
  -> 600-second protocol-v2 player access JWT
  -> admitted SpacetimeDB connection
  -> public player_v2/castle/world_tile state
```

Private tables:

- `allowed_fid`: manual admission, enabled flag, and per-FID auth epoch.
- `player_ownership_v2`: the one-to-one FID ↔ opaque SpacetimeDB OIDC Identity
  authorization binding.
- `admin_audit`: administrative action trace.

Public tables:

- `world_tile`: exactly 61 canonical radius-four Lowlands gameplay cells; the
  30-cell visual apron remains client-only.
- `player`: the frozen protocol-v1 compatibility table, preserved with its
  original public visibility, exact field order, and Identity column. Protocol
  v2 never reads, writes, or subscribes to it. Historical inspection recorded
  zero rows; a fresh zero-row check is mandatory before any publish.
- `player_v2`: the active public FID and presentation/game projection. It
  contains no opaque SpacetimeDB OIDC Identity.
- `castle`: one level-one keep per admitted FID and one occupant per tile.

Private-table query/subscription accessors are omitted from generated browser
bindings. Code generation may retain an inert `PlayerOwnershipV2` schema type,
but it exposes no rows or subscription authority. The active browser subscribes
only to `world_tile`, `player_v2`, and `castle`; the generated legacy `player`
accessor exists solely because the production-compatible table remains public.

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
the private row, a fresh exact Hermes administrator, or the exact fresh resolver
principal required because SpacetimeDB executes the lifecycle hook before HTTP
procedures. Missing, disabled, epoch-mismatched, expired, malformed, and
unrelated principals cannot connect. A resolver credential presented while
fresh can technically establish a WebSocket and public-table subscriptions that
may persist until transport disconnect, and can call static
`get_alpha_backend_info` while fresh. It cannot read private tables, bootstrap
or mutate as a player, or pass Hermes/admin guards; protected calls independently
recheck expiry. Gameplay reducers repeat player admission and private-ownership
checks. A missing public/private half or an identity mismatch fails closed.

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

The production Worker sends a fresh 15-second JWT having exact
`sub: "service:auth-epoch-resolver"`, exactly
`roles: ["warpkeep-auth-epoch-resolver"]`, and exact `resolver_fid` equal to the
procedure argument; the module retains a 60-second rejection ceiling. The
procedure independently revalidates that principal and one-FID binding before
its read-only lookup. Its HTTP SATS-JSON wire response is exactly one of:

```json
["missing", 0]
["disabled", 0]
["enabled", 1]
```

The enabled epoch shown is illustrative and may be any positive `u32`. An
enabled epoch-zero row is an invalid state and fails closed rather than being
reported as enabled. The resolver has no private, player-mutation, or admin
authority; its bounded public-subscription/static-metadata capability is the
documented lifecycle residual above.

`admin_get_fid_auth_epoch({ fid })` remains byte-compatible and admin-only for
rollback. It returns a raw epoch/baseline zero and must not be used for new v2
issuance or refresh.

The exact protocol-v1 wires remain present only to prevent old clients from
reaching historical behavior:

```txt
get_my_admission_status
bootstrap_player
```

Both fail with `PROTOCOL_RETIRED`; the procedure performs no lookup and the
reducer performs no mutation. Protocol v2 uses only:

```txt
get_my_admission_status_v2
bootstrap_player_v2
```

Missing/disabled status is handled by the bridge's tokenless pending path before
any player access token or database connection exists.

`bootstrap_player_v2` is transactional and idempotent. It derives the FID only
from signed claims, requires current admission, and atomically creates the
private `player_ownership_v2` binding, public `player_v2` projection, castle,
and tile occupancy without reading or writing legacy `player`; the first fixture
receives `0,0`. Missing, partial, duplicate-identity, mismatched, or castle-only
state fails closed. The local bridge issues no optional profile claims, and the
module independently ignores any optional profile-shaped JWT fields: new
`player_v2` rows explicitly insert undefined `username`, `displayName`, and
`pfpUrl`. A future profile mutation requires a separate reviewed authorization
path. Admission, bootstrap, admitted-player guards, and the v2 aggregate also
validate the complete canonical 61-tile/castle graph in both directions; a
missing or altered terrain row, dangling occupancy, or mismatched castle link
fails `STATE_INTEGRITY`.

## Admin operations

Exact fresh Hermes authority is required for:

- `admin_seed_world`
- `admin_allow_fid`
- `admin_disable_fid`
- `admin_bump_auth_epoch`
- `admin_get_alpha_status`
- `admin_get_alpha_status_v2`
- rollback-only `admin_get_fid_auth_epoch`

No real FID is seeded in source or by a verification script. Operator wrappers
must keep admin JWTs in memory, support read-only/dry-run inspection, and require
confirmation for mutations.

`admin_get_alpha_status` retains the legacy aggregate shape. The new
`admin_get_alpha_status_v2` returns privacy-safe counts for legacy players,
`player_v2`, ownership rows, consistent v2 pairs, both orphan directions,
castles, admission and audit totals, plus static protocol/world metadata. It
never returns a FID, Identity, profile, allowlist row, note, or audit record.

## Backend compatibility metadata

`WARPKEEP_BACKEND_PROTOCOL_VERSION = 2` is an internal wire contract, separate
from the player-facing release and the `HEGEMONY_GENESIS_001` realm label.
`get_alpha_backend_info` is available to every lifecycle-admitted principal,
including the resolver, and returns only static protocol/world-seed metadata.
It performs no database lookup and exposes no whitelist, identity, audit, or
live aggregate data. The browser must reject a protocol/seed mismatch before
bootstrap or subscription.

SpacetimeDB 2.6's default case converter would spell a trailing version digit
as `_v_2`; the module pins these canonical wire names to exact `_v2`:

```txt
auth_resolver_get_fid_admission_v2
get_my_admission_status_v2
bootstrap_player_v2
admin_get_alpha_status_v2
```

Generated bindings and regression tests verify the exact external names.
The browser compatibility gate pins both `HEGEMONY_GENESIS_001` and its exact
numeric seed `3445214658`; agreement on only one representation is insufficient.

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

No command in this README authorizes external mutation. The local protocol-v2
schema is additive: it preserves the exact five-table production-v1 prefix,
freezes public legacy `player`, and appends public `player_v2` plus private
`player_ownership_v2`. No v2 admission, bootstrap, or browser runtime path reads
or writes the legacy table.

The loopback-only proof command:

```sh
npm run stdb:verify-additive-migration
```

uses the pinned CLI and `--delete-data=never` to verify unchanged legacy table
signatures and product-type order, empty and synthetic nonempty row preservation,
v2 visibility and constraints, idempotent republish, partial-state detection,
and refusal of a guarded v1 rollback before any schema change. This proves only the controlled local
fixtures; it neither observes Maincloud nor authorizes a production publish.

A future rollout must keep Worker public auth and the frontend shared-alpha
switch false while it:

1. obtains explicit approval for a fresh read-only Maincloud aggregate
   inspection without exposing row identities;
2. stops if legacy `player` is not exactly empty, if an enabled epoch-zero row
   exists, or if any aggregate/schema coordinate disagrees; nonzero legacy state
   requires a separately implemented and reviewed migration, never dual-write;
3. obtains separate explicit approval for the guarded production module publish,
   whose same-run protected v1 aggregate must independently reproduce the fresh
   zero result and whose publisher pins the exact reviewed CLI binary plus the
   canonical existing database identity, then binds the proof's one SHA-256
   receipt to the exact prebuilt artifact and rechecks it before `--js-path`;
4. publishes only with `--delete-data=never`, without `--break-clients`, and
   verifies `admin_get_alpha_status_v2`, exact v2 wires, private ownership
   isolation, generated bindings, and protocol metadata;
5. separately approves the additive session-family Durable Object migration and
   secret configuration;
6. separately approves a Worker deploy with public auth still false and checks
   its configuration attestation;
7. separately approves the v2 frontend deploy with its realm switch false;
8. requires a final explicit approval before any public-auth or realm enable.

If the CLI requests a compatibility override, the protected aggregate is not
zero, or the exact additive plan cannot be applied, stop. Do not weaken the
publisher, delete data, use `--break-clients`, or write the legacy player table.

See the [activation and recovery runbook](../docs/operations/alpha-activation.md).
If any coordinate or state differs, stop; do not erase, recreate, auto-migrate,
or admit a FID.
