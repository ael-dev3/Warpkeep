# SpacetimeDB closed-alpha plan

Warpkeep contains a TypeScript SpacetimeDB authority module under
[`spacetimedb/`](../spacetimedb/). It is authoritative shared-world code, not a
browser mock.

> **Local protocol-v2 draft — not published.** The checked-out module, bridge,
> browser, tests, and bindings describe the next contract. This work did not
> publish or mutate Maincloud, migrate a Durable Object, configure a production
> secret, deploy a Worker/frontend, or enable auth. Historical production
> records are not evidence that this local v2 head is live.

## Version contract

| Component | Pinned version |
| --- | --- |
| SpacetimeDB CLI | `2.6.1` (`052c83fe984a4c4eb7bb4f9afa5c6b1903891d87`) |
| Browser client SDK | `2.6.1` |
| TypeScript server SDK | `2.6.1` |
| Local backend protocol | `2` |

Bindings are generated from the local module and committed at
[`src/spacetime/module_bindings/`](../src/spacetime/module_bindings/).
`npm run stdb:verify-bindings` regenerates to a temporary directory and fails on
any difference. Private-table query/subscription surfaces remain absent from the
browser. The
exact resolver wire name is pinned to `auth_resolver_get_fid_admission_v2` and
verified despite SpacetimeDB 2.6's default trailing-digit case conversion.

## Identity and authorization

SpacetimeDB receives a bridge-issued access JWT using `.withToken(jwt)`. The
stable player subject is `farcaster:<verified decimal fid>`; no browser session
reference, reducer argument, or display field chooses the account.

The local player contract requires:

- exact issuer, expected audience, and `token_type: "spacetime-access"`;
- `auth_version: 2`;
- positive safe decimal FID and exact subject/FID equality;
- positive unsigned 32-bit `auth_epoch`;
- exactly empty roles;
- matching `session_iat`/`session_exp` with a maximum 600-second window,
  preserved through connection-token exchange and rechecked against module
  time on every player call.

Anonymous, malformed, missing, disabled, and epoch-mismatched players cannot
connect. `onConnect` permits only a current admitted player or an exact fresh
Hermes administrator. The resolver principal is intentionally HTTP-procedure
only and cannot acquire a subscription-bearing WebSocket connection.

Admin tokens remain exact `sub: "service:hermes"`, exactly
`roles: ["warpkeep-admin"]`, and at most 300 seconds. Player, resolver, and admin
authority are disjoint.

`WARPKEEP_BACKEND_PROTOCOL_VERSION = 2` is a backend-only compatibility
contract, separate from the player-facing release and
`HEGEMONY_GENESIS_001`. A permitted player/admin may call
`get_alpha_backend_info`; the browser rejects a protocol/seed mismatch before
bootstrap or subscription.

## Schema

| Table | Visibility | Purpose |
| --- | --- | --- |
| `allowed_fid` | private | FID primary key, enabled flag, auth epoch, invitation metadata and note. |
| `player_ownership` | private | One-to-one FID ↔ opaque SpacetimeDB OIDC Identity authorization binding. |
| `admin_audit` | private | Admin action trace only. |
| `world_tile` | public | Exactly 61 canonical radius-four Lowlands gameplay hexes. |
| `player` | public | FID plus public presentation/game fields; no opaque SpacetimeDB OIDC Identity. |
| `castle` | public | One persistent level-one keep per FID and one occupant per tile. |

Browser bindings expose no `player_ownership` table accessor. Authorization
requires a consistent public player row and matching private ownership row;
partial or mismatched state fails closed. The local bridge issues only FID
identity and no optional profile claims. The module independently ignores any
optional `username`, `display_name`, or `pfp_url` JWT fields and does not use
token authority as a public-profile write path.

The renderer's visual apron is not authoritative data. No resource, building,
unit, combat, alliance, chat, or season authority is added in this slice.

## Admission and bootstrap

First admission starts at epoch `1`; epoch `0` is reserved for structured
non-enabled resolver results and is invalid player authority. Repeated allow of
an enabled row is idempotent. Disable blocks immediately. Re-enable increments
once. An enabled legacy epoch-zero row fails closed and must be inspected and
deliberately migrated by an approved operator rather than silently accepted.

The dedicated bridge resolver is:

```txt
auth_resolver_get_fid_admission_v2({ fid })
```

It requires a fresh maximum-60-second JWT with exact
`sub: "service:auth-epoch-resolver"` and sole role
`warpkeep-auth-epoch-resolver`. It is read-only and returns exactly:

```txt
missing  -> authEpoch 0
disabled -> authEpoch 0
enabled  -> authEpoch >= 1
```

Malformed/inconsistent state fails closed. The bridge calls the exact
documented HTTP endpoint with `[fid]`, validates a two-field JSON response, and
never exposes the result as browser-controlled input.

`admin_get_fid_auth_epoch({ fid })` remains unchanged and admin-only solely for
rollback compatibility. Its raw epoch/baseline-zero result is not the v2
issuance contract.

`get_my_admission_status` remains useful after an admitted token connects, but
missing/disabled status is now handled by the bridge's tokenless pending path.
No denied call creates a player or castle.

`bootstrap_player` is transactional and idempotent:

1. derive the FID from strict player claims;
2. require enabled admission and exact current epoch;
3. allow both player/ownership rows to be absent for first bootstrap, but if
   either exists require the pair to be complete and bound to the current sender;
4. preserve an existing consistent player/castle pair;
5. allocate the first deterministic unoccupied canonical tile (`0,0` first);
6. insert private ownership, public player, and castle rows and atomically mark
   occupancy; the player row explicitly stores undefined `username`,
   `displayName`, and `pfpUrl`.

## Browser continuity boundary

The access JWT lives only in browser JavaScript memory and expires within 600
seconds. It is never the 30-day continuity mechanism. The bridge separately
owns a maximum-30-day server-side rotating family referenced by an
`__Host-warpkeep_session; Secure; HttpOnly; SameSite=Strict; Path=/` cookie.
Pending families issue no token. Bound epoch mismatch/missing/disabled,
origin/expiry failure, and stale replay revoke the family.

SpacetimeDB neither reads nor stores that cookie/family. It validates only each
short-lived access/connection token and current private admission.

## Hermes-only operations

Exact fresh Hermes authority is required for:

```txt
admin_seed_world
admin_allow_fid
admin_disable_fid
admin_bump_auth_epoch
admin_get_alpha_status
admin_get_fid_auth_epoch  # rollback compatibility only
```

`admin_seed_world` is idempotent and refuses conflicting rows.
`admin_allow_fid` is idempotent for enabled state; `admin_disable_fid` blocks
gameplay; `admin_bump_auth_epoch` revokes prior access tokens. Operator wrappers
obtain admin tokens in memory, support dry-run/read-only checks, and require
confirmation for mutations.

## Maincloud and rollout safety

The historical closed-alpha database coordinate is `warpkeep-89e4u` on
`https://maincloud.spacetimedb.com`. Recorded Alpha 0.2 inspection found 61
world tiles and empty allowlist/player/castle state, but that historical record
must be rechecked read-only before any future mutation. This v2 work made no
live observation and claims no deployment state.

The v2 rollout must be staged, exact-head verified, and explicitly approved at
each authority boundary. Removing opaque OIDC Identity from public `player`
rows and adding private `player_ownership` is a breaking schema change, not an
implicitly additive publish:

1. keep `PUBLIC_AUTH_ENABLED=false` and the frontend shared-alpha switch false;
2. approve read-only Maincloud inspection, record aggregate player state without
   exposing identities, and review how every existing row would be reconciled;
3. separately approve the breaking-schema migration/compatibility plan and a
   guarded non-destructive module publish with `--delete-data=never`; a generic
   module-publish approval is insufficient;
4. verify module protocol 2, private ownership isolation, exact resolver
   response, legacy rollback procedure, and committed bindings;
5. separately approve the additive `SessionFamily` Durable Object migration;
6. separately approve configuration of the independent session-cookie secret;
7. separately approve a Worker deploy with public auth still false and verify
   discovery/JWKS, resolver probe, retired v1 routes, and config attestation;
8. separately approve the v2 frontend deploy with realm access still false;
9. only after hosted exact-head verification and owner QA, require final
   explicit approval for any Worker public-auth enable and frontend realm enable.

The current guarded publisher forbids `--break-clients`. If preflight reports
that the reviewed privacy split cannot be applied through the non-breaking
guarded path, stop and require a separately implemented, reviewed, and explicitly
approved migration mechanism; do not bypass the guard.

No earlier approval implies a later one. If any state or coordinate differs,
stop and report it; never erase/recreate data, auto-advance an epoch, admit a
FID, or fall back to the legacy resolver implicitly. See the
[activation runbook](./operations/alpha-activation.md).

## What follows this slice

Only after the identity/session chain and tokenless pending-admission QA are
approved and live should Warpkeep add server-authoritative resource timers,
queues, units, scouting, combat, alliances, seasons, or activity reports. AI
may produce flavor or summaries, but never write authority tables directly.
