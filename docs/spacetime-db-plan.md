# SpacetimeDB closed-alpha plan

Warpkeep contains a TypeScript SpacetimeDB authority module under
[`spacetimedb/`](../spacetimedb/). It is authoritative shared-world code, not a
browser mock.

> **Protocol-v2 Alpha 0.3.1 is active; authority remains invite-only.** The
> guarded additive module has been published to the existing Maincloud database
> with deletion prohibited. The exact v2 aggregate remains empty apart from the
> 61 canonical world tiles and audit count. The reviewed Worker and exact-main
> Pages frontend were enabled in Worker-first order after their paused gates and
> one privacy-safe owner canary passed. No FID is admitted. Only the privately
> recorded source, deployment, aggregate, probe, and canary coordinates attest
> that checkpoint; an arbitrary local checkout does not.

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
browser. The exact protocol-v2 wire names are pinned to
`auth_resolver_get_fid_admission_v2`, `get_my_admission_status_v2`,
`bootstrap_player_v2`, and `admin_get_alpha_status_v2`; verification catches
SpacetimeDB 2.6's default trailing-digit case conversion.

`npm run stdb:verify-additive-migration` proves the protocol-v2 module locally
against a disposable, loopback-only SpacetimeDB 2.6.1 server. It publishes a v1
fixture, an additive-v2 fixture, and the checked-out module with
`--delete-data=never`, verifies the frozen legacy shapes and retained rows, and
exercises empty, synthetic non-empty, idempotence, partial-state, and rollback
refusal cases. It never contacts Maincloud and is neither production inspection
nor production publish approval.

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
connect. `onConnect` permits a current admitted player, an exact fresh Hermes
administrator, or the exact fresh resolver principal because SpacetimeDB runs
the lifecycle hook before authenticated HTTP procedures. A resolver credential
presented while fresh can technically establish a WebSocket and public-table
subscriptions that may persist until transport disconnect, and can call static
`get_alpha_backend_info` while fresh. It cannot read private tables, bootstrap
or mutate as a player, or pass Hermes/admin guards; protected calls independently
recheck expiry.

Admin tokens remain exact `sub: "service:hermes"`, exactly
`roles: ["warpkeep-admin"]`, and at most 300 seconds. Privileged player,
resolver-procedure, and admin authority remain disjoint.

`WARPKEEP_BACKEND_PROTOCOL_VERSION = 2` is a backend-only compatibility
contract, separate from the player-facing release and
`HEGEMONY_GENESIS_001`. Any lifecycle-admitted principal may call
`get_alpha_backend_info`; the browser rejects a protocol/seed mismatch before
bootstrap or subscription. The procedure is static and performs no database
lookup.

## Schema

| Table | Visibility | Purpose |
| --- | --- | --- |
| `allowed_fid` | private | FID primary key, enabled flag, auth epoch, invitation metadata and note. |
| `admin_audit` | private | Admin action trace only. |
| `world_tile` | public | Exactly 61 canonical radius-four Lowlands gameplay hexes. |
| `player` | public | Frozen legacy v1 table with its original exact column order and public opaque OIDC Identity column. It must remain empty and is never read, written, or subscribed by protocol v2. |
| `player_v2` | public | Active identity-free FID plus public presentation/game fields. |
| `player_ownership_v2` | private | Active one-to-one FID ↔ opaque SpacetimeDB OIDC Identity authorization binding. |
| `castle` | public | One persistent level-one keep per FID and one occupant per tile. |

The exact original table prefix remains
`allowed_fid`, `world_tile`, `player`, `castle`, `admin_audit`; the v2 tables are
appended after it. Browser bindings expose no `player_ownership_v2` table
accessor, and the active browser subscribes only to `world_tile`, `player_v2`,
and `castle`. Authorization requires a consistent public `player_v2` row and
matching private `player_ownership_v2` row; partial, duplicate, mismatched, and
castle-only state fails closed. The local bridge issues only FID identity and no
optional profile claims. The module independently ignores any optional
`username`, `display_name`, or `pfp_url` JWT fields and does not use token
authority as a public-profile write path.

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

The Worker issues a fresh 15-second JWT with exact
`sub: "service:auth-epoch-resolver"` and sole role
`warpkeep-auth-epoch-resolver`, plus exact `resolver_fid` equal to the procedure
argument; the module retains a 60-second rejection ceiling. The procedure is
read-only, independently revalidates the resolver principal and one-FID binding,
and its HTTP SATS-JSON response is exactly:

```txt
["missing", 0]
["disabled", 0]
["enabled", <positive u32>]
```

Malformed/inconsistent state fails closed. The bridge calls the exact
documented HTTP endpoint with `[fid]`, validates a two-field JSON response, and
never exposes the result as browser-controlled input.

`admin_get_fid_auth_epoch({ fid })` remains unchanged and admin-only solely for
rollback compatibility. Its raw epoch/baseline-zero result is not the v2
issuance contract.

The legacy module wires `get_my_admission_status` and `bootstrap_player` remain
present only for exact schema/client compatibility and immediately fail with
`PROTOCOL_RETIRED`; they perform no lookup or mutation. The active browser uses
only:

```txt
get_my_admission_status_v2({})
bootstrap_player_v2({})
```

Missing/disabled status is handled by the bridge's tokenless pending path. No
denied call creates a v2 player, ownership, or castle row.

`bootstrap_player_v2` is transactional and idempotent:

1. derive the FID from strict player claims;
2. require enabled admission and exact current epoch;
3. allow both v2 player/ownership rows to be absent for first bootstrap, but if
   either exists require the pair to be complete and bound to the current sender;
4. preserve an existing consistent v2 player/castle pair;
5. allocate the first deterministic unoccupied canonical tile (`0,0` first);
6. insert private `player_ownership_v2`, public `player_v2`, and castle rows and
   atomically mark occupancy; the v2 player row explicitly stores undefined `username`,
   `displayName`, and `pfpUrl`.

Protocol-v2 admission and bootstrap never read or write legacy `player`, even
when its row count is non-zero. They also require the exact canonical 61-tile
terrain and a bidirectionally consistent castle/occupancy graph; any mismatch
fails `STATE_INTEGRITY`. The browser pins both the generation name and numeric
seed before admission or subscription.

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
admin_get_alpha_status_v2
admin_get_fid_auth_epoch  # rollback compatibility only
```

`admin_seed_world` is idempotent and refuses conflicting rows.
`admin_allow_fid` is idempotent for enabled state; `admin_disable_fid` blocks
gameplay; `admin_bump_auth_epoch` revokes prior access tokens. Operator wrappers
obtain admin tokens in memory, support dry-run/read-only checks, and require
confirmation for mutations.

`admin_get_alpha_status_v2` returns privacy-safe aggregate counts for legacy
players, v2 player/ownership consistency, castles, world tiles, allowlist rows,
audits, protocol version, and world seed. It returns no FID, Identity, token, or
profile payload. The legacy aggregate remains available for compatibility and
continues to count only the frozen legacy `player` table.

## Maincloud and rollout safety

The historical closed-alpha database coordinate is `warpkeep-89e4u` on
`https://maincloud.spacetimedb.com`. Recorded Alpha 0.2 inspection found 61
world tiles and empty allowlist/player/castle state, but that historical record
must be rechecked read-only before any future mutation. The current bounded,
counts-only v2 aggregate reproduced that baseline without exposing rows and
confirmed the additive pair and zero orphan state after the guarded publication.
The publication changed schema only: it did not mutate admission, player,
ownership, castle, allowlist, or world rows.

The v2 rollout must be staged, exact-head verified, and explicitly approved at
each authority boundary. This head uses an additive protocol-v2 design: the
exact legacy `player` shape and original table prefix stay frozen, while public
`player_v2` and private `player_ownership_v2` are appended. Historical evidence
that legacy `player` was empty does not waive a fresh zero-row check. The
recorded Alpha 0.3.1 checkpoints completed steps 1 through 11 below. Every
future republish or rollout repeats the applicable gates:

1. keep `PUBLIC_AUTH_ENABLED=false` and the frontend shared-alpha switch false;
2. run `npm run stdb:verify-additive-migration` and retain its local,
   non-production evidence;
3. approve a fresh, bounded, read-only Maincloud inspection and require
   the deployed-v1 `players` field (the legacy count) to equal zero; any legacy
   row or enabled epoch-zero allowlist row is a hard stop, with no automatic
   migration or deletion;
4. obtain separate explicit owner approval for the production module publish;
5. publish only through the guarded path, which pins the reviewed CLI binary and
   immutable existing database identity, repeats the current local migration
   proof and deployed v1 aggregate in the same run, binds the proof's single
   SHA-256 receipt to the exact prebuilt artifact, rechecks it before
   `--js-path`, uses `--delete-data=never`, never uses `--break-clients`, and
   closes stdin so any compatibility prompt stops the operation;
6. verify module protocol 2, `admin_get_alpha_status_v2`, exact v2 resolver and
   player wires, private ownership isolation, active-browser `player_v2` use,
   legacy-wire retirement, and committed bindings;
7. separately approve the additive `SessionFamily` Durable Object migration;
8. separately approve configuration of the independent session-cookie secret;
9. separately approve a Worker deploy with public auth still false and verify
   discovery/JWKS, resolver probe, retired v1 routes, and config attestation;
10. separately approve the v2 frontend deploy with realm access still false;
11. after hosted exact-head paused verification, require final authority and
   proceed in strict order: enable Worker public auth, pass its enabled
   public/private checks, enable/deploy the exact frontend, then perform
   immediate owner QA with dual-disable handling for any discrepancy.

The current guarded publisher requires the explicit fresh zero-count
confirmation and forbids `--break-clients`. If preflight or publish reports any
compatibility disagreement, stop; do not bypass the guard.

No earlier approval implies a later one. If any state or coordinate differs,
stop and report it; never erase/recreate data, auto-advance an epoch, admit a
FID, or fall back to the legacy resolver implicitly. See the
[activation runbook](./operations/alpha-activation.md).

## What follows this slice

With the identity/session chain and tokenless pending-admission QA now approved
and live at the recorded Alpha 0.3.1 coordinates, later versions may add
server-authoritative resource timers, queues, units, scouting, combat,
alliances, seasons, or activity reports. AI may produce flavor or summaries,
but never write authority tables directly.
