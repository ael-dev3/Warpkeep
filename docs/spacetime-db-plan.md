# SpacetimeDB closed-alpha plan

Warpkeep contains a TypeScript SpacetimeDB authority module under
[`spacetimedb/`](../spacetimedb/). It is authoritative shared-world code, not a
browser mock.

> **Alpha 0.3.8 is live on backend protocol 3; authority remains invite-only.**
> The guarded additive module was published to the existing Maincloud database
> with deletion prohibited. The deterministic 10,000-cell Genesis world and 100
> close-outward slots are live, deliberately admitted founders received
> permanent castles, and public shared auth plus realm entry are enabled. Exact founder counts and
> identities remain in the private operational record. Only the privately
> recorded source, deployment, aggregate, probe, and QA coordinates attest that
> state; an arbitrary local checkout does not.

Alpha 0.3.8 retains backend protocol 3, appends one private resource table, and
expands Genesis 001 to exactly 10,000 persistent cells. Its additive
publication, founder backfill, and world transition were separately approved;
the checkout alone does not attest their production state.

## Version contract

| Component | Pinned version |
| --- | --- |
| SpacetimeDB CLI | `2.6.1` (`052c83fe984a4c4eb7bb4f9afa5c6b1903891d87`) |
| Browser client SDK | `2.6.1` |
| TypeScript server SDK | `2.6.1` |
| Deployed backend protocol | `3` |
| Checked-out backend protocol | `3` |
| Deployed world generation | `3` (10,000 cells) |
| Checked-out world generation | `3` (10,000 cells) |

Bindings are generated from the local module and committed at
[`src/spacetime/module_bindings/`](../src/spacetime/module_bindings/).
`npm run stdb:verify-bindings` regenerates to a temporary directory and fails on
any difference. Private-table query/subscription surfaces remain absent from the
browser. The deployed auth-v2 wire names remain pinned to
`auth_resolver_get_fid_admission_v2`, `get_my_admission_status_v2`,
`bootstrap_player_v2`, and `admin_get_alpha_status_v2`; verification catches
SpacetimeDB 2.6's default trailing-digit case conversion.

The checked-out module also defines the additive
`admin_admit_founder_v1` wire described below. It is not part of the attested
Alpha 0.3.8 production surface until a separately approved, non-destructive
module publication has completed its exact pre- and post-publication checks.
A checkout, generated binding, merge, or approval to admit one FID does not
approve or attest that publication.

`npm run stdb:verify-additive-migration` proves the checked-out schema locally
against a disposable, loopback-only SpacetimeDB 2.6.1 server. It publishes the
independently frozen v1, additive-v2, additive-v3, and additive-v4 fixtures plus
the checked-out module with `--delete-data=never`; proves refs 0–18 and their
rows remain exact while private `resource_account_v1` appends at ref 19; and
exercises empty, synthetic non-empty, idempotence, resource-lifecycle,
populated 1,261-to-10,000 expansion, target-retry, partial-state, and
rollback-refusal cases. It never contacts Maincloud and is neither production
inspection nor production publish or expansion approval.

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
| `world_tile` | public | Frozen row shape. Live production contains the exact 10,000-cell generation-three world, including the preserved 1,261-cell generation-two predecessor. |
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
| `resource_account_v1` | private | Live caller-scoped Food, Wood, Stone, and Gold account with authoritative settlement time and policy version. |

The exact original table prefix remains
`allowed_fid`, `world_tile`, `player`, `castle`, `admin_audit`; the deployed v2
pair follows it unchanged. Protocol 3 appends exactly 12 tables at references
7–18 and never rewrites that seven-table deployed prefix. Alpha 0.3.8 appends
one private table at exact ref 19. Generated browser bindings contain only the
eight public table shapes and no accessor for any of the 12 private tables. The
active browser subscribes to the six projections it
needs: `world_tile`, `world_tile_meta_v1`, `player_v2`, `castle`, `realm_v1`, and
`realm_profile_v1`. It does not subscribe to the frozen legacy `player` table or
the slot-plan table.

Authorization requires a consistent public `player_v2` row and matching private
`player_ownership_v2` row, plus a complete founding graph. Partial, duplicate,
mismatched, castle-only, claim-only, or drifted state fails closed. The bridge
issues only FID identity; the module ignores optional profile claims in JWTs.
Trusted public profile and private wallet snapshots use separate reviewed
Hermes mutation paths and are never accepted from browser input.

The renderer's visual apron is not authoritative data. Static
`resource-capable` and `core-capable` labels reserve deterministic future sites
but create no resource, building, unit, combat, alliance, chat, or season
authority in this slice.

## Admission and bootstrap

First admission starts at epoch `1`; epoch `0` is reserved for structured
non-enabled resolver results and is invalid player authority. The complete
world must match either the exact generation-two rollout predecessor or the
exact generation-three target, and all generation-two slot rows must remain
exact. First-time founding uses `admin_admit_founder_v1`. Before submission, a
trusted operator resolves and reviews the founder's bounded public Farcaster
profile; the module independently normalizes it before any write and requires a
canonical username plus a valid HTTPS PFP URL. Display name and public bio
remain optional presentation fields and browser/JWT profile claims remain
untrusted.

In one transaction, `admin_admit_founder_v1` creates the admission row, assigns
the next close-outward unclaimed slot, creates the permanent level-one castle
and reverse occupancy link, creates the private slot claim, zero Mark account,
and complete resource account, writes the reviewed public realm profile, and
appends the audit record. Any absent required profile field, invalid profile
normalization, missing canonical row, drift, capacity exhaustion, or
inconsistent founder/resource graph aborts the entire transition. A castle can
therefore no longer be newly admitted with an empty public identity projection.

The legacy `admin_allow_fid` wire is retained only for idempotence or re-enable
of an already complete founder/resource/profile graph. It rejects a missing FID
instead of founding one, and it fails closed when the canonical username or
HTTPS PFP is absent. Repeated allow of an enabled founder preserves the same
castle. Disable blocks immediately without deleting founder state; a deliberate
re-enable increments the epoch exactly once and preserves the founder. An
enabled legacy epoch-zero row fails closed and must be inspected and
deliberately migrated by an approved operator rather than silently accepted.

Neither administrator path creates `player_v2` or
`player_ownership_v2`. Castle control binds only when the admitted founder
genuinely authenticates and calls `bootstrap_player_v2`, which derives the FID
from strict signed claims and binds the private ownership row to that exact
SpacetimeDB sender. Subsequent and future gameplay reducers must derive the
owned castle through that caller-bound graph rather than accept a caller-chosen
FID, castle, or owner selector.

There is one narrow recovery exception: exact-admin
`admin_upsert_realm_profile_v1` may update a structurally valid existing founder
whose profile row is incomplete, but the reducer must receive and persist a
complete normalized reviewed username-and-PFP projection. It cannot create,
move, or reassign the founder. Bootstrap, gameplay, ordinary player resolution,
and legacy `admin_allow_fid` remain complete-profile-only. The profile operator
can plan the repair only when current authoritative data supplies every missing
or invalid required field. An already-valid required field may retain its
sanitized reviewed last-known-good value when that one response is unavailable
or incomplete; an authoritative clear still stops. A fully blank row therefore
requires both current fields.

The local `stdb:admit-founder` wrapper keeps the FID, audit note, and resolved
profile out of argv and ordinary output. Its dry run writes an expiring,
content-attested `0600` reviewed plan; confirmation is bound to that exact plan,
the pinned profile transport and policy, and the immutable production database
identity. It never refetches at confirmation and claims the plan once directly
before reducer submission. The private request must also carry the exact
per-founder source-use approval phrase; historical transport provenance does
not authorize a lookup for a new founder. This operator contract is distinct
from module publication and mutation authority.

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
admin_admit_founder_v1
admin_allow_fid
admin_disable_fid
admin_bump_auth_epoch
admin_get_alpha_status
admin_get_alpha_status_v2
admin_get_alpha_status_v3
admin_get_alpha_status_v4
admin_get_fid_auth_epoch  # rollback compatibility only
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
`admin_admit_founder_v1` is the only first-time founding wire and requires the
complete normalized public identity projection. `admin_allow_fid` is
re-enable/idempotence compatibility for an already complete founder only;
`admin_disable_fid` blocks gameplay; `admin_bump_auth_epoch` revokes prior
access tokens. Operator wrappers obtain admin tokens in memory, support
dry-run/read-only checks, and require confirmation for mutations.

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
world seed. It returns
no FID, Identity, profile, address, receipt, token, or audit payload. The scan
batch aggregate is likewise counts/totals/booleans only. Live
`admin_get_alpha_status_v4` is a separate closed contract containing
founder/castle/Mark counts, resource-account coverage and invariants, protocol,
and policy version for ref 19 without returning balances or identities. Legacy
and v2 aggregate wires remain available for staged compatibility checks.

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

No earlier approval implies a later one. If any state or coordinate differs,
stop and report it; never erase/recreate data, auto-advance an epoch, admit a
FID, or fall back to the legacy resolver implicitly. See the
[activation runbook](./operations/alpha-activation.md).

## What follows this slice

With the identity/session chain, generation-three protocol-3 world,
deliberately admitted founders, private resource accounts, and shared realm live
at the recorded Alpha 0.3.8 backend coordinates, the release provides a bounded
private resource loop and persistent placement capacity. It does not place
resource nodes. Later versions may add those nodes, queues, units, scouting, combat,
alliances, seasons, or activity reports. AI may produce flavor or summaries,
but never write authority tables directly.
