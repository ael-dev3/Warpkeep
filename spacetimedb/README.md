# Warpkeep SpacetimeDB module

This directory is the server-authoritative closed-alpha module for Warpkeep.
It is independent of the static Pages client: title/menu visitors do not create
a SpacetimeDB identity, and gameplay authority comes only from a strictly
validated bridge-issued OIDC access token.

> **Alpha 0.3.2 is live on backend protocol 3.** The module described below is
> deployed only at its privately recorded Maincloud schema, artifact,
> aggregate, and resolver coordinates. Publication used the pinned CLI with
> deletion prohibited and preserved the existing database identity. The
> 1,261-cell Genesis world and its 100 close-outward castle slots are seeded,
> deliberately admitted founders hold their permanent castles, and public shared
> auth and realm entry are enabled. Exact founder counts and identities remain in the
> private operational record rather than this public document.

The production database and issuer run the recorded exact Alpha 0.3.2 release,
while the player authentication contract remains v2. That deployment does not
attest an arbitrary checkout. Every future republish requires a fresh proof,
bounded aggregate, recorded authority, and exact-source verification.

> **This checkout contains the live protocol-3 / generation-v2 contract.** It
> expands Genesis 001 to 1,261 deterministic cells, appends 12 versioned tables,
> and defines 100 permanent castle slots. See
> [Genesis 001 generation v2](./GENESIS_001_GENERATION_V2.md) for exact counts,
> digests, privacy boundaries, and release invariants.

## Version compatibility

- Installed CLI: `spacetimedb 2.6.1` (commit `052c83fe984a4c4eb7bb4f9afa5c6b1903891d87`)
- Server package: `spacetimedb 2.6.1`
- Module TypeScript: `5.6.3`
- Deployed backend wire protocol: `3`
- Checked-out backend wire protocol: `3`
- Player authentication contract: `2` (unchanged)
- Local world generation: `2`

Run locally after installing directory dependencies:

```sh
pnpm install
pnpm run verify
```

`pnpm run stdb:build` invokes `spacetime build --module-path .`. Pure tests
cover JWT principals/claims, session windows, admission/epoch transitions,
resolver response policy, connection gating, the deterministic radius-20
Genesis map, inner-61 preservation, castle-slot distribution/connectivity, and
fail-closed seed planning. They do not connect to or publish a database.

From the repository root, `npm run stdb:verify-additive-migration` runs the
pinned SpacetimeDB 2.6.1 CLI against disposable loopback-only databases. It
starts from the independently frozen deployed seven-table checkpoint and proves
the 12 protocol-3 tables append at refs 7 through 18 with
`--delete-data=never`. It does not inspect or mutate Maincloud and is not
production publish approval.

## Authority and tables

```txt
verified Farcaster SIWF
  -> trusted Warpkeep bridge
  -> structured private admission resolution
  -> 600-second protocol-v2 player access JWT
  -> admitted SpacetimeDB connection
  -> public player_v2/castle/world_tile state
```

Inherited auth-v2 private tables in live protocol 3:

- `allowed_fid`: manual admission, enabled flag, and per-FID auth epoch.
- `player_ownership_v2`: the one-to-one FID ↔ opaque SpacetimeDB OIDC Identity
  authorization binding.
- `admin_audit`: administrative action trace.

Inherited auth-v2 public tables in live protocol 3:

- `world_tile`: the inherited declaration whose historical protocol-2
  checkpoint contained 61 canonical radius-four cells. Protocol 3 preserves
  that declaration and now contains 1,261 canonical radius-20 rows; visual
  apron cells remain client-only.
- `player`: the frozen protocol-v1 compatibility table, preserved with its
  original public visibility, exact field order, and Identity column. Protocol
  v2 never reads, writes, or subscribes to it. Historical inspection recorded
  zero rows; a fresh zero-row check is mandatory before any publish.
- `player_v2`: the active public FID and presentation/game projection. It
  contains no opaque SpacetimeDB OIDC Identity.
- `castle`: one level-one keep per admitted FID and one occupant per tile.

The live protocol-3 schema preserves those seven declarations exactly
and appends public `realm_v1`, `world_tile_meta_v1`, `castle_slot_v1`, and
`realm_profile_v1`. It appends private `castle_slot_claim_v1`,
`mark_account_v1`, `snap_burn_credit_v1`, `fid_wallet_attribution_v1`,
`wallet_attribution_snapshot_v1`, `snap_scan_cursor_v1`,
`snap_scan_batch_v1`, and `alpha_terms_acceptance_v1`. Authoritative Mark
totals, FID-bearing slot claims, wallet attribution, burn receipts, scan
lifecycle, and versioned Terms acceptance are never public. Optional public
community aggregates remain absent unless the authenticated player accepts the
exact current Terms version.

The protocol-3 `world_tile` table contains the same frozen declaration. Its
completed admin-only seed appended exactly 1,200 canonical outer rows after
validating the original 61. Terrain/content metadata and 100 immutable slot
coordinates live in sidecar tables, so no inherited row or field was rewritten.

Private-table query/subscription accessors are omitted from generated browser
bindings. The protocol-3 bindings expose only the eight public tables:
the frozen legacy `player` compatibility accessor, active `world_tile`,
`player_v2`, and `castle`, plus `realm_v1`, `world_tile_meta_v1`,
`castle_slot_v1`, and `realm_profile_v1`. They contain no accessor for
`allowed_fid`, `admin_audit`, `player_ownership_v2`, slot claims, authoritative
Mark accounts, wallet attribution, burn receipts, or scan cursors. Browser
bindings also omit wallet snapshot metadata, scan batches, and Terms acceptance
history. The active browser subscribes to exactly six protocol-3 projections:
`world_tile`, `world_tile_meta_v1`, `player_v2`, `castle`, `realm_v1`, and
`realm_profile_v1`. It does not subscribe to static slot rows or the frozen
legacy `player`; that compatibility accessor exists solely because the deployed
table remains public and must remain empty.

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

In protocol 3, `admin_allow_fid` is the atomic founding boundary.
After validating the complete canonical generation, one transaction creates or
preserves the admission row, permanent slot claim, level-one castle, reverse
tile occupancy, hidden public profile, zeroed private Mark account, and audit.
The first three deterministic assignments are the close founding district at
`(0,0)`, `(2,-1)`, and `(-1,2)`. Repeating allow is idempotent; disabling and
re-enabling rotate authority without deleting or moving founder state.

`bootstrap_player_v2` is separately transactional and idempotent. It derives
the FID only from signed claims, requires current admission, and binds the
already-founded assignment by creating only private `player_ownership_v2` and
public `player_v2`. It never creates, moves, or replaces a castle and never
reads or writes legacy `player`. Missing, partial, duplicate-identity,
mismatched, or castle-only state fails closed. Indexed per-FID checks keep the
player status/bootstrap/terms hot paths bounded; full 1,261-row integrity scans
remain on admin seed/founding/audit transitions.

The bridge issues no optional profile claims, and the module ignores any
profile-shaped JWT fields. Trusted public profile and private wallet snapshots
have dedicated exact-admin reducers and are sanitized again in the module.
`accept_alpha_terms_v1` is an idempotent admitted-player transition using the
current exact Terms version. It first inserts immutable private evidence keyed
by FID and Terms version, including when aggregate visibility was already on;
only that genuinely Terms-gated post-bootstrap call exposes aggregate Mark
fields in `realm_profile_v1`. A later Terms version creates a distinct record.

## Admin operations

Exact fresh Hermes authority is required for:

- `admin_seed_world`
- `admin_allow_fid`
- `admin_disable_fid`
- `admin_bump_auth_epoch`
- `admin_get_alpha_status`
- `admin_get_alpha_status_v2`
- `admin_get_alpha_status_v3`
- `admin_upsert_realm_profile_v1`
- `admin_replace_fid_wallet_snapshot_v1`
- `admin_begin_snap_scan_batch_v1`
- `admin_credit_snap_burn_v1`
- `admin_finalize_snap_scan_batch_v1`
- `admin_get_snap_scan_batch_aggregate_v1`
- rollback-only `admin_get_fid_auth_epoch`

No real FID is seeded in source or by a verification script. Operator wrappers
must keep admin JWTs in memory, support read-only/dry-run inspection, and require
confirmation for mutations.

`admin_get_alpha_status` retains the legacy aggregate shape. The new
`admin_get_alpha_status_v2` returns privacy-safe counts for legacy players,
`player_v2`, ownership rows, consistent v2 pairs, both orphan directions,
castles, admission and audit totals, plus static protocol/world metadata. It
never returns a FID, Identity, profile, allowlist row, note, or audit record.

`admin_get_alpha_status_v3` remains counts-only while covering all 12 appended
tables, occupied tiles, and canonical static-world drift in addition to orphan,
ambiguity, projection, duplicate-reference, and ledger-reconciliation counters.
The trusted update and
credit reducers are idempotent and fail closed on policy mismatch, wallet
ambiguity, chain/contract/implementation/code-hash mismatch, duplicate event or
burn ID, disabled attribution, overflow, and ledger drift. The retired
single-row wallet reducer always fails: a complete generation-CAS snapshot is
required. A scan batch freezes that snapshot, exact cursor, attestation, range,
credit count, and micros total; credits update batch counters atomically, and
finalization advances the cursor only after indexed receipt reconciliation.
The counts-only batch aggregate exposes none of the batch ID, hashes, wallets,
events, or FIDs. The module does not decide Ethereum finality; a separately
reviewed two-provider operator must prove that before beginning a batch. The
local operator's apply transport remains deliberately disabled.

## Backend compatibility metadata

Production and this checkout use
`WARPKEEP_BACKEND_PROTOCOL_VERSION = 3` as an internal wire contract, separate
from the player-facing release, auth contract 2, world generation 2, and the
`HEGEMONY_GENESIS_001` realm label.
`get_alpha_backend_info` is available to every lifecycle-admitted principal,
including the resolver, and returns only static protocol/world-seed metadata.
It performs no database lookup and exposes no whitelist, identity, audit, or
live aggregate data. The browser must reject a protocol/seed mismatch before
bootstrap or subscription. The browser and backend must continue to agree on
this protocol and seed pair; deploying a mismatched side fails closed.

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

No command in this README authorizes external mutation. The recorded protocol-2
schema already preserves the five-table production-v1 prefix and appends the
public `player_v2` plus private `player_ownership_v2`. The deployed protocol-3
schema preserves that complete seven-table prefix exactly, then appends twelve
explicitly versioned tables. Its migration rewrites no prefix table and does not
use the frozen legacy `player` as a new authorization path.

The loopback-only proof command:

```sh
npm run stdb:verify-additive-migration
```

uses the pinned CLI and `--delete-data=never` against disposable loopback-only
databases. It verifies exact refs 0-18, unchanged seven-table signatures,
indexes and visibility, empty and synthetic nonempty row preservation, exact
protocol-3 visibility, a module-to-independent-fixture match, idempotent artifact
republish, and refusal of a guarded v2 rollback after a v3 row is populated.
This proves only controlled local fixtures; it neither observes Maincloud nor
authorizes a production republish or world mutation.

The historical Alpha 0.3.2 rollout used the following fail-closed sequence. Its
zero-admission checkpoints describe that earlier pre-founding interval, not the
current founded realm, and are not reusable expected values for a future
republish or recovery:

1. obtains explicit approval for the containment deployment that disables both
   production switches, then attests the disabled Worker and frontend state
   before any schema or seed mutation;
2. obtains explicit approval for a fresh read-only Maincloud aggregate
   inspection without exposing row identities;
3. stops if legacy `player` is not exactly empty, if an enabled epoch-zero row
   exists, or if any aggregate/schema coordinate disagrees; nonzero legacy state
   requires a separately implemented and reviewed migration, never dual-write;
4. obtains explicit approval for the guarded production module publish, whose
   same-run protected aggregate must reproduce the expected seven-table state
   and whose publisher pins the reviewed CLI binary plus canonical existing
   database identity, then binds the proof's SHA-256 receipt to the exact
   prebuilt artifact and rechecks it before `--js-path`;
5. publishes only with `--delete-data=never`, without `--break-clients`, and
   verifies exact table refs/access, unchanged v2 auth wires, private-table
   isolation, protocol-3 metadata, and the post-schema-empty aggregate with the
   read-only `--require-additive-v3-preseed-aggregate` verifier stage;
6. separately reviews and approves the generation-v2 seed, which must add
   exactly 1,200 world rows, 1,261 metadata rows, one realm row, and 100 slots
   while retaining the pinned inner-61 digest, then proves the exact
   seeded-but-mutable-state-empty boundary with
   `--require-genesis-v3-seeded-empty-aggregate`;
7. generates and reviews browser bindings only after the authoritative schema
   is known, keeping every private table out of the browser surface;
8. separately approves any Worker/frontend deploy with public auth and realm
   entry still false and checks configuration attestation;
9. before founding, independently reviews the exact counts-only founded-state
   verifier, then requires final authority for each founding admission and runs
   `--require-genesis-v3-founded-aggregate --expected-founder-count=N`
   immediately after every separately approved founding action, before wallet
   snapshots, scans, player login, or Terms acceptance; exact FID and nearest-slot
   prefix evidence stays in the private plan because the aggregate exposes no
   identities;
10. enables public auth only after all staged aggregates pass, then enables and
   deploys only the exact reviewed frontend, passes the enabled
   public/private gates, and runs immediate owner QA with dual-disable handling
   for any discrepancy.

For any future republish or recovery, derive an explicitly reviewed expected
aggregate from a fresh, privacy-safe inspection of the current founded state;
never substitute the historical zero-admission checkpoint. If the CLI requests
a compatibility override, the protected aggregate does not match that reviewed
state, or the exact additive plan cannot be applied, stop. Do not weaken the
publisher, delete data, use `--break-clients`, or write the legacy player table.

See the [activation and recovery runbook](../docs/operations/alpha-activation.md).
If any coordinate or state differs, stop; do not erase, recreate, auto-migrate,
or admit a FID.
