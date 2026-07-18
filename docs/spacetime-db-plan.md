# SpacetimeDB closed-alpha plan

Warpkeep contains a TypeScript SpacetimeDB authority module under
[`spacetimedb/`](../spacetimedb/). It is authoritative shared-world code, not a
browser mock.

> **Alpha 0.3.2 is live on backend protocol 3; authority remains invite-only.**
> The guarded additive module was published to the existing Maincloud database
> with deletion prohibited, the deterministic 1,261-cell Genesis world and 100
> close-outward slots were seeded, deliberately admitted founders received
> permanent castles, and public shared auth plus realm entry are enabled. Exact founder counts and
> identities remain in the private operational record. Only the privately
> recorded source, deployment, aggregate, probe, and QA coordinates attest that
> state; an arbitrary local checkout does not.

The checked-in Alpha 0.3.10 candidate is deliberately ahead of that live
checkpoint. It retains backend protocol 3 and the previously reviewed,
separately approval-gated 10,000-cell / 2,000-resource-capable-anchor Genesis
definition, appends one private resource table, the bounded 24-site Gold Mine
wagon loop, the shared forest suffix, and a bounded 96-site Tier-I Wheat Farm
Food loop. It does not attest a production publish, world transition, resource
backfill, Gold/forest/Food setup, or deployment. Alpha 0.3.6 remains the
verified public release.

## Version contract

| Component | Pinned version |
| --- | --- |
| SpacetimeDB CLI | `2.6.1` (`052c83fe984a4c4eb7bb4f9afa5c6b1903891d87`) |
| Browser client SDK | `2.6.1` |
| TypeScript server SDK | `2.6.1` |
| Deployed backend protocol | `3` |
| Checked-out backend protocol | `3` |
| Deployed world generation | `2` (1,261 cells) |
| Checked-out world generation | `3` candidate (10,000 cells; 2,000 resource-capable anchors) |
| Checked-out economy candidate | resource authority v4, Gold expedition tables v5, forest tables v6, and Food expedition tables v7 (all undeployed) |

Bindings are generated from the local module and committed at
[`src/spacetime/module_bindings/`](../src/spacetime/module_bindings/).
`npm run stdb:verify-bindings` regenerates to a temporary directory and fails on
any difference. Private-table query/subscription surfaces remain absent from the
browser. The deployed auth-v2 wire names remain pinned to
`auth_resolver_get_fid_admission_v2`, `get_my_admission_status_v2`,
`bootstrap_player_v2`, and `admin_get_alpha_status_v2`; verification catches
SpacetimeDB 2.6's default trailing-digit case conversion.

`npm run stdb:verify-additive-migration` proves the checked-out schema locally
against a disposable, loopback-only SpacetimeDB 2.6.1 server. It publishes the
independently frozen v1, additive-v2, additive-v3, additive-v4, additive-v5,
additive-v6, and additive-v7 fixtures plus the checked-out module with
`--delete-data=never`; proves refs 0–18 and their rows remain exact while
private `resource_account_v1` appends at ref 19, Gold at refs 20–24, forest at
refs 25–26, and Food at refs 27–31. It exercises empty, synthetic non-empty,
idempotence, resource lifecycle, Food/Gold table visibility and coexistence,
the Food raw-passive reserve, populated 1,261-to-10,000 expansion, target
retry, partial state, and rollback refusal. It never contacts Maincloud and is
neither production inspection nor production publish, expansion, or
Gold/forest/Food setup approval.

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

Production and this checkout report `WARPKEEP_BACKEND_PROTOCOL_VERSION = 3`.
This backend-only compatibility value is separate from the player-facing release and
`HEGEMONY_GENESIS_001`. Any lifecycle-admitted principal may call
`get_alpha_backend_info`; the browser rejects a protocol/seed mismatch before
bootstrap or subscription. The procedure is static and performs no database
lookup.

## Schema

| Table | Visibility | Purpose |
| --- | --- | --- |
| `allowed_fid` | private | FID primary key, enabled flag, auth epoch, invitation metadata and note. |
| `world_tile` | public | Frozen row shape. Live production contains the exact 1,261-cell generation-two predecessor; the candidate appends 8,739 rows for an exact 10,000-cell target. |
| `player` | public | Frozen legacy v1 table with its original exact column order and public opaque OIDC Identity column. It must remain empty and is never read, written, or subscribed by protocol v2. |
| `castle` | public | One persistent level-one keep per FID and one occupant per tile. |
| `admin_audit` | private | Admin action trace only. |
| `player_v2` | public | Active identity-free FID plus bounded public presentation/game fields. |
| `player_ownership_v2` | private | Active one-to-one FID ↔ opaque SpacetimeDB OIDC Identity authorization binding. |
| `realm_v1` | public | Genesis realm identity, seed, radii, capacity, generation, and active flag. |
| `world_tile_meta_v1` | public | Generation-qualified ring, sector, terrain, passability, movement, and static-content sidecar; generation-two rows remain exact while generation-three rows append. |
| `castle_slot_v1` | public | One hundred immutable close-outward castle coordinates. |
| `castle_slot_claim_v1` | private | One-to-one FID/castle/slot founding claim. |
| `realm_profile_v1` | public | Trusted bounded profile, founding dates/status, and optional aggregate Marks presentation. |
| `mark_account_v1` | private | Authoritative non-transferable Mark accounting. |
| `snap_burn_credit_v1` | private | Deduplicated finalized Ethereum mainnet burn receipts bound to one scan batch. |
| `fid_wallet_attribution_v1` | private | Rows belonging to a complete trusted wallet snapshot generation. |
| `wallet_attribution_snapshot_v1` | private | Singleton identifying the complete current wallet snapshot. |
| `snap_scan_cursor_v1` | private | Finalized-block and pinned contract/implementation checkpoint. |
| `snap_scan_batch_v1` | private | Pending/finalized atomic scan-application transaction. |
| `alpha_terms_acceptance_v1` | private | Immutable FID/version/time evidence for the current Alpha Terms gate. |
| `resource_account_v1` | private | Candidate caller-scoped Food, Wood, Stone, and Gold account with authoritative settlement time and policy version. |
| `gold_site_v1` | public | Candidate immutable catalog of exactly 24 canonical Tier-I Gold Mine coordinates, tier, and active state. |
| `gold_node_occupation_v1` | public | Candidate identity-minimized Mine occupancy: site, public origin castle, phase, and server-derived lifecycle timestamps. |
| `gold_expedition_v1` | private | Candidate FID-bound wagon lifecycle, route-derived timing, private settlement cursor, and accrued/credited Gold. |
| `gold_expedition_idempotency_v1` | private | Candidate caller-request receipt that makes same-request dispatch bounded and exactly-once. |
| `gold_expedition_schedule_v_1` | public-safe scheduler projection | Candidate minimal schedule target; it has only already-public lifecycle fields and is never a gameplay subscription surface. |
| `realm_forest_layout_v1` | public | Candidate immutable reviewed forest layout metadata; it has no ownership, actions, resources, or collision authority. |
| `realm_forest_instance_v1` | public | Candidate fixed-point visual forest transforms selected from the reviewed layout only. |
| `food_site_v1` | public | Candidate immutable catalog of exactly 96 canonical Tier-I Wheat Farm coordinates, tier, and active state. |
| `food_node_occupation_v1` | public | Candidate identity-minimized Wheat Farm occupancy: site, public origin castle, phase, and server-derived lifecycle timestamps. |
| `food_expedition_v1` | private | Candidate FID-bound Food-wagon lifecycle, route-derived timing, private settlement cursor, and accrued/credited Food. |
| `food_expedition_idempotency_v1` | private | Candidate caller-request receipt that makes same-request Food dispatch bounded and exactly-once. |
| `food_expedition_schedule_v_1` | public-safe scheduler projection | Candidate minimal Food schedule target; it has only already-public lifecycle fields, and its target reducer is internal-only rather than a gameplay subscription surface. |

The exact original table prefix remains
`allowed_fid`, `world_tile`, `player`, `castle`, `admin_audit`; the deployed v2
pair follows it unchanged. Protocol 3 appends exactly 12 tables at references
7–18 and never rewrites that seven-table deployed prefix. The Alpha 0.3.10
candidate appends private `resource_account_v1` at ref 19, then the five Gold
tables at refs 20–24, the two forest tables at refs 25–26, and the five Food tables at refs
27–31. Generated browser bindings omit accessors for every private
resource/Gold/Food authority table. The active browser keeps its six inherited
Realm projections—`world_tile`, `world_tile_meta_v1`, `player_v2`, `castle`,
`realm_v1`, and `realm_profile_v1`—and may additionally subscribe only to the
public Gold and Food site/occupation projections plus the validated public
forest layout/instances. It does not subscribe to the frozen legacy `player`,
the slot-plan table, or either public-safe scheduler projection.

Authorization requires a consistent public `player_v2` row and matching private
`player_ownership_v2` row, plus a complete founding graph. Partial, duplicate,
mismatched, castle-only, claim-only, or drifted state fails closed. The bridge
issues only FID identity; the module ignores optional profile claims in JWTs.
Trusted public profile and private wallet snapshots use separate reviewed
Hermes mutation paths and are never accepted from browser input.

The renderer's visual apron is not authoritative data. Static
`resource-capable` and `core-capable` labels reserve deterministic capacity; in
the Alpha 0.3.10 candidate, only the compiled Gold policy may select 24 passable
resource-capable anchors for a separately approved server-side installation. A
separate compiled Food policy selects exactly 96
passable Lowland/Meadow resource-capable anchors, excludes the Gold catalog,
forest clearance, castle clearance, and protected-corridor clearance, and pins
the resulting fixed catalog by policy version and digest. Labels and GLB bytes
never create browser authority, a balance, a resource yield, a building, unit,
combat, alliance, chat, or season state.

## Admission and bootstrap

First admission starts at epoch `1`; epoch `0` is reserved for structured
non-enabled resolver results and is invalid player authority. The complete
world must match either the exact generation-two rollout predecessor or the
exact generation-three target, and all generation-two slot rows must remain
exact. In one transaction,
`admin_allow_fid` creates or re-enables the admission row, assigns the next
close-outward unclaimed slot, creates the permanent level-one castle and reverse
occupancy link, creates the private slot claim and zero Mark account, creates
the public realm profile, and appends the audit record. Any missing canonical
row, drift, capacity exhaustion, or inconsistent graph aborts the entire
transition.

Repeated allow of an enabled founder is idempotent and preserves the same
castle. Disable blocks immediately without deleting founder state. Re-enable
increments the epoch exactly once and preserves the founder. An enabled legacy
epoch-zero row fails closed and must be inspected and deliberately migrated by
an approved operator rather than silently accepted.

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
denied player call creates a public player, ownership binding, castle, profile,
claim, Mark account, or Terms row.

`bootstrap_player_v2` is transactional and idempotent, but it no longer chooses
or creates a castle:

1. derive the FID from strict player claims;
2. require enabled admission and exact current epoch;
3. require the exact already-founded castle/claim/occupancy/profile/Mark graph;
4. allow both v2 player/ownership rows to be absent for first bootstrap, but if
   either exists require the pair to be complete and bound to the current sender;
5. insert private `player_ownership_v2` and public `player_v2`, and set the
   profile's first-authentication time; the v2 player row explicitly stores
   undefined `username`, `displayName`, and `pfpUrl`.

Admission and bootstrap never read or write legacy `player`, even when its row
count is non-zero. They require the exact canonical static world and a
bidirectionally consistent castle/occupancy/slot graph; any mismatch fails
`STATE_INTEGRITY`. After bootstrap, `accept_alpha_terms_v1` requires the exact
current version and explicit boolean, inserts immutable private FID/version/time
evidence idempotently, and only then makes aggregate Mark fields public. A
cancelled browser intent cannot activate the subscription after a late reducer
acknowledgement. The browser pins protocol 3 plus both generation name and
numeric seed before admission or subscription.

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
admin_expand_genesis_world_v3
admin_allow_fid
admin_disable_fid
admin_bump_auth_epoch
admin_get_alpha_status
admin_get_alpha_status_v2
admin_get_alpha_status_v3
admin_get_alpha_status_v4
admin_get_fid_auth_epoch  # rollback compatibility only
admin_seed_genesis_tier_i_gold_sites_v1
admin_seed_genesis_forest_layout_v1
admin_seed_genesis_tier_i_food_sites_v1
admin_upsert_realm_profile_v1
admin_replace_fid_wallet_snapshot_v1
admin_begin_snap_scan_batch_v1
admin_credit_snap_burn_v1
admin_finalize_snap_scan_batch_v1
admin_get_snap_scan_batch_aggregate_v1
admin_backfill_resource_accounts_v1
```

`admin_seed_world` is idempotent for its ordinary exact seed states, refuses
conflicting rows, and will not expand the exact generation-two predecessor.
Only `admin_expand_genesis_world_v3` may perform that reviewed transition.
`admin_allow_fid` is idempotent for enabled state; `admin_disable_fid` blocks
gameplay; `admin_bump_auth_epoch` revokes prior access tokens. Operator wrappers
obtain admin tokens in memory, support dry-run/read-only checks, and require
confirmation for mutations.

The old single-row wallet upsert wire is retained only to return
`PROTOCOL_RETIRED`; complete generation-qualified replacement is mandatory.
Scan application is a pending/finalized batch state machine: begin freezes the
exact cursor and wallet snapshot, each credit is batch-bound and deduplicated,
and finalize advances the cursor atomically only when expected counts and exact
micro-unit totals reconcile. Retries are exact and a competing cursor or
snapshot fails closed.

`admin_get_alpha_status_v3` returns privacy-safe aggregate counts covering all
19 deployed protocol-3 tables, all 12 appended references, occupied tiles,
founder/orphan/invariant counts, exact static-world drift, protocol version, and
world seed. It returns no FID, Identity, profile, address, receipt, token, or
audit payload. The scan batch aggregate is likewise counts/totals/booleans only.
Candidate `admin_get_alpha_status_v4` is a separate closed contract containing
founder/castle/Mark counts, resource-account coverage and invariants, protocol,
and policy version for ref 19 without returning balances or identities. The
Alpha 0.3.10 candidate's Gold loop does not treat that v4 aggregate as a v5 rollout
attestation: any future Gold-site installation needs a separately reviewed
counts-only aggregate contract for the 24-site placement, occupation, and
private-expedition invariants. Legacy and v2 aggregate wires remain available
for staged compatibility checks.

The Alpha 0.3.10 Food candidate likewise does not treat a v4 resource aggregate,
a Gold aggregate, or a forest-layout check as a v7 attestation. Any future Food
installation needs its own reviewed, identity-safe aggregate contract for the
append-only refs 27–31, exact 96-site policy/version/digest, public occupation,
private idempotency/expedition invariants, and the Food reservation invariant.
No aggregate may expose FIDs, routes, request keys, balances, or accrued output.

## Maincloud and rollout safety

The closed-alpha database coordinate is `warpkeep-89e4u` on
`https://maincloud.spacetimedb.com`. Recorded Alpha 0.2 inspection found 61
world tiles and empty allowlist/player/castle state, but that historical record
must be rechecked read-only before any future mutation. The bounded, counts-only
v2 aggregate recorded during Alpha 0.3.1 reproduced that baseline
without exposing rows and confirmed the additive pair and zero orphan state
after the guarded publication. That historical publication changed schema only:
it did not mutate admission, player, ownership, castle, allowlist, or world rows.

The Alpha 0.3.2 protocol-3 rollout is complete: it froze all seven inherited
table references, appended 12, seeded the 1,261-cell world and 100 slots, and
assigned permanent castles to deliberately admitted founders. The following
sequence is the historical rollout record. Its zero-state aggregates are pre-seed and pre-founding
checkpoints, not current production expectations and not reusable authority:

1. run `npm run stdb:verify-additive-migration` and retain its local,
   loopback-only artifact receipt;
2. obtain separate approval to disable and attest production Worker public auth
   and frontend shared-alpha entry, then keep both disabled through schema, seed,
   founding, and staged verification;
3. perform only an explicitly approved, bounded, read-only Maincloud inspection
   and require the complete then-deployed protocol-v2 aggregate—not merely the
   legacy player count—to match the historical 61-tile, zero-player/ownership/
   castle/admission checkpoint and all integrity invariants;
4. obtain separate owner approval for the production protocol-v3 schema publish;
5. publish only through the guarded path, which pins the reviewed CLI and exact
   database identity, reruns the local proof and deployed-v2 aggregate, binds
   the single SHA-256 receipt to the prebuilt artifact, uses
   `--delete-data=never`, forbids `--break-clients`, and closes stdin so an
   unexpected prompt stops the operation;
6. immediately require the exact protocol-v3 preseed aggregate: all 12 appended
   tables empty, 61 unoccupied world rows, zero drift/orphan/invariant counts,
   and the expected protocol/seed identity;
7. obtain a separate owner approval for canonical generation-v2 seeding; never
   combine schema publication and seeding into one implied action;
8. immediately require the exact seeded-empty aggregate: 1,261 world metadata
   rows and world tiles, one realm, 100 slots, zero claims/founders/private
   operator state/Terms rows, and zero static-world drift or integrity errors;
9. run profile and wallet source preparation locally with privacy-safe reports;
   install no scheduler until a successful reviewed manual dry run, and require
   separate approval for every operator apply;
10. admit each FID only through a separately approved atomic founding action,
    then immediately run the read-only
    `--require-genesis-v3-founded-aggregate --expected-founder-count=N` stage
    before any wallet snapshot, scan, player login, or Terms write; the stage
    verifies exact counts and every v3 invariant but intentionally receives and
    reports no FID, so compare identities and the nearest-slot prefix against the
    private founding plan and reducer evidence;
11. separately approve and verify the exact frontend artifact and hosted QA;
12. re-enabling either production switch, merge, tag, release, and every other
    configuration change remain distinct approvals.

That initial guarded publisher required an explicit fresh zero-count
confirmation and forbade `--break-clients`. A future republish or recovery must
instead derive an explicitly reviewed expected aggregate from a fresh,
privacy-safe inspection of the current founded state; it must not reuse the
historical zero-admission checkpoint. The current publisher requires explicit
canonical founder, authenticated player, and Terms-acceptance expectations,
including zeroes, plus an explicit `prebackfill`/`ready` resource stage and
`pre-expansion`/`expanded` world stage. It keeps private expectations out of
child arguments/environments and validates the matching founded and resource
aggregates against the immutable database identity before and after its single
`--delete-data=never` publish. The publisher never performs the resource
backfill or world expansion and never infers either lifecycle stage.
If preflight or publish reports any compatibility disagreement, stop; do not
bypass the guard. A post-publish inspection failure is indeterminate and must
be resolved read-only before any retry.

Those v4-oriented flags are not a Gold-v5 rollout stage or a Gold-site seed
approval. Before any Alpha 0.3.10 production consideration of the v5 Gold loop, the append-only v5
schema, exact 24-site policy/digest, resource-account preservation,
identity-free public occupancy projection, and private expedition invariants
require their own reviewed read-only aggregate design and explicit owner
authority. No current repository command is permission to infer or combine that
approval with module publication, the resource backfill, the world transition,
or Pages deployment.

The same separation applies to the Alpha 0.3.10 Food v7 suffix. An asset
delivery, local migration proof, Gold/forest setup, or v4 resource checkpoint
does not authorize production publication of refs 27–31, Food-site seeding, a
worker change, Pages deployment, custom-domain/DNS modification, or enablement.
Each requires its own explicit owner approval after a fresh read-only
precondition.

No earlier approval implies a later one. If any state or coordinate differs,
stop and report it; never erase/recreate data, auto-advance an epoch, admit a
FID, or fall back to the legacy resolver implicitly. See the
[activation runbook](./operations/alpha-activation.md).

## What follows this slice

With the identity/session chain, generation-two protocol-3 world, deliberately
admitted founders, and shared realm live at the recorded Alpha 0.3.2 backend
coordinates, the checked-in Alpha 0.3.10 candidate carries the bounded private
resource loop, 10,000-cell world definition, a 24-site Gold Mine wagon pilot,
and a separate 96-site Tier-I Wheat Farm wagon loop. Food and Gold may each run
one wagon from the same castle concurrently, but all ownership, capacity, route,
time, reward, and replay decisions remain server-side. Food credits exactly one
completed server minute for at most 30 days and reserves raw passive Food through
its deadline so delayed schedules and concurrent Gold expiry cannot truncate or
duplicate it. These are undeployed candidate authorities, not a public release
or a production state claim. No other resource nodes, queues, units, scouting,
combat, alliances, seasons, or activity reports are introduced. AI may produce
flavor or summaries, but never write authority tables directly.
