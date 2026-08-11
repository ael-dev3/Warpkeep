# Warpkeep SpacetimeDB module

This module is the server authority for Warpkeep's invite-only Alpha. The
browser renders the realm; it cannot grant admission, choose an owner, supply a
balance, advance a timer, or decide an expedition outcome.

## Compatibility

| Contract | Current value |
| --- | ---: |
| SpacetimeDB CLI and package | 2.6.1 |
| Browser/backend wire protocol | 3 |
| Player authentication contract | 2 |
| Genesis world generation | 3 |
| Append-only schema generation | 16 (review-only Realm Chat suffix) |
| Alpha 0.3.12 suffix | Water refs 37–40; Stone refs 41–45 |
| Generic worker suffix | refs 47–52; active |
| Access-request suffix | ref 53; active |
| Daily Marks suffix | private refs 54–55; activation is separate |
| Inner Keep suffix | refs 56–63; inactive until separate seed, backfill, client, asset, and activation gates |
| Realm Chat suffix | refs 64–71; review-only and not publishable or activatable by this build |

Deployed tables retain their original declaration order and shape. Later
features append new tables; they do not rename or delete existing data. The
frozen protocol-v1 `player` table remains public for schema compatibility but
is not read or written by current authority paths. Active opaque identity
bindings live only in private `player_ownership_v2` rows.

## Authority model

```text
Farcaster approval
  -> Warpkeep authentication bridge
  -> short-lived, browser-bound player credential
  -> SpacetimeDB validates issuer, audience, FID, session, and auth epoch
  -> reducers derive the caller's player, castle, and private state
```

Authentication proves a Farcaster identity. It does not create admission or
ownership. A founder must already have a complete, server-created graph:

- enabled admission with a positive authentication epoch;
- one canonical castle-slot claim and castle;
- one private resource and Community Marks account;
- one public, sanitized Realm profile;
- after first sign-in, one private FID-to-OIDC-identity binding.

Initial admission requires a trusted normalized Farcaster username and public
HTTPS portrait. Later presentation updates or clears do not revoke castle
ownership or gameplay authority.

## State boundaries

Public subscriptions contain only shared-world presentation:

- the canonical realm, terrain metadata, castle slots, castles, and active
  player/profile projections;
- shared forest layout metadata and fixed tree instances;
- Gold Mine, Wheat Farm, Logging Camp, and Stone Quarry catalogs;
- activated Water layout, body/cell topology, and shared environment data;
- identity-minimized site occupations containing a site, phase, public
  timeline, and origin castle;
- active four-worker roster and generic node-lease projections; the public
  rows contain no FID, cargo, accrual, balance, request, or auth data;
- the inactive Inner Keep layout, an empty public compatibility-slot table,
  six-building policy, thirty target-level recipes, and identity-minimized
  castle building rows with authoritative placement transforms;
- the dormant, body-free Realm Chat readiness row;
- public Community Marks projection only when its policy permits it.

Private tables contain admission, ownership, unclaimed-slot decisions, resource
and Marks accounts, agreement evidence, daily-grant receipts, operator audit,
expedition state, retry receipts, and balances. Retired compatibility tables
remain private and frozen to preserve the deployed append-only schema; current
authority paths do not write or interpret them.

Inner Keep Builder rows, exact cost receipts, idempotency keys, and construction
schedules are private. Player clients obtain only their own Builder/resources
projection and accepted-request status through caller-authenticated procedures;
browser bindings contain none of those private tables.

Realm Chat channel authority, permanent archive, bounded recent cache, message
and report rate ledgers, idempotency receipts, reports, and moderation evidence
remain private. A caller-authenticated procedure rechecks gameplay authority
and active-channel state on every bounded recent read; generated browser
bindings contain no recent table. Chat is disabled and collects no production
data in this build.

The pinned SDK requires scheduled expedition rows to be public. Those rows are
therefore deliberately minimal: schedule/stage identifiers, site, origin
castle, and an already-public lifecycle timestamp. They contain no FID,
credential, request key, private expedition identifier, route, or balance, and
the browser does not subscribe to them.

## World and resources

Genesis 001 contains 10,000 persistent cells and 100 permanent castle sites.
The generation-three definition preserves every prior world row and the first
founding sites. See [GENESIS_001_GENERATION_V3.md](GENESIS_001_GENERATION_V3.md)
for the deterministic world contract.

The activated Water layout adds a shared coastline, lakes, and rivers without
regenerating the land world. Its public rows contain fixed topology and
presentation parameters, not player state or per-frame simulation.

Each founded castle has a private Food, Wood, Stone, and Gold account. Passive
terrain production settles in completed ten-minute server quanta. Gold passive
terrain production is disabled; Gold comes from its expedition authority.

Gold, Food, Wood, and Stone each have an independent expedition:

- the client submits only a canonical site ID;
- the provider owns a random idempotency key and reuses it only for the same
  unresolved attempt;
- the server derives caller, castle, route, timing, capacity, rate, and award;
- one castle may run at most one expedition for each resource type;
- public occupation remains until the wagon completes its return;
- settlement and return are server scheduled and exact-once;
- private reservations prevent passive collection or another lifecycle from
  truncating a valid Food, Wood, or Stone award.

The additive generic-worker suffix defines four stable workers per founded
castle. Any idle worker can gather Gold, Food, Wood, or Stone, and multiple
workers may gather the same resource at different nodes. Worker assignments
use the same canonical site catalogs, route authority, 60-second quantum, and
30-day cap as the legacy expeditions. The caller's private read projects exact
server-time availability without a write; scheduled expiry and explicit
dispatch/recall commands materialize complete quanta. There is no per-minute
write loop and no `collect` command for generic workers.

The active suffix was introduced through separate, attested staging,
deterministic four-worker backfill, legacy drain, and activation steps.
Activation requires exact resource/account and site-catalog state plus an
explicit 0.3.x client capability, source commit, and artifact attestation.
Module publication never repeats those mutations. A bounded admin-only
forward-repair path can restore one specifically attested missing return
schedule; it cannot select a player row, alter balances, or delete data.

## Inactive Inner Keep construction

Schema generation 15 appends eight tables without changing refs 0–55:

| Ref | Table | Visibility and purpose |
| ---: | --- | --- |
| 56 | `inner_keep_layout_v1` | public inactive layout root and digests |
| 57 | `inner_keep_slot_v1` | retained public compatibility table; exactly zero rows |
| 58 | `inner_keep_building_catalog_v1` | public six-building policy |
| 59 | `inner_keep_build_level_v1` | public exact recipes and timers |
| 60 | `castle_inner_keep_building_v1` | public durable building/project projection |
| 61 | `castle_inner_builder_v1` | private one-Builder authority |
| 62 | `castle_inner_build_receipt_v1` | private exact deduction/idempotency receipt |
| 63 | `castle_inner_construction_schedule_v_1` | private scheduler correlation |

Catalog seed creates six policy rows and thirty level rows but no castle
buildings. City Mill, Lumber Camp, City Stoneworks, City Goldworks, City
Barracks, and Grand Covenant Cathedral are all player construction choices;
Barracks and Cathedral are not prebuilt anchors.
The reviewed construction-policy digest is
`cbffcdc223b5d99625cab7549f3a5ae211c725893574b629aa83f8260668a779`,
and the presentation-bound combined layout digest is
`1b3a452794c28f8d7f8814ce6064da8582725d34bb0ee0271d51f40c2fbdfad7`.

One project reducer accepts a building kind, signed local X/Z microunits,
quarter-turn rotation in milli-degrees, bounded request key,
`expectedTargetLevel`, canonical decimal `expectedProjectRevision`, and
`expectedPolicyDigest` plus `expectedLayoutDigest`. The four expected values are
untrusted quote-and-placement-binding compare-and-set assertions. The server
derives ownership, the current target, current policy digest, and current layout
digest. After an accepted receipt has had its idempotent short-circuit, a new
request verifies policy/layout digests and transactionally reconciles any exact
overdue project. It validates the transform against the half-meter grid,
quarter turns, the continuous x `[-44, 44]` / z `[-40, 32]` support, permanent
road/civic exclusions, and every persisted building footprint, then checks the
target and aggregate revision against the reconciled graph. A mismatch rolls
the whole reducer back before reconciliation, settlement, or deduction can
commit. It then derives discounts, stored-resource cost, timestamps, Builder
capacity, and completion. It settles current Worker accrual, then commits
deduction, project, Builder, schedule, and transform-bound receipt atomically.
The four gathering Workers remain independent from the one internal Builder.

The source tree does not make this component playable. A merge to protected
`main` triggers the existing verified Pages deployment of the compatible,
dormant client. Module publication, catalog seed, Builder backfill,
exact static-and-population runtime-registry verification, and activation
remain distinct owner-reviewed operations.

## Review-only Realm Chat authority

Schema generation 16 appends eight tables without changing refs 0–63:

| Ref | Table | Visibility and purpose |
| ---: | --- | --- |
| 64 | `realm_chat_status_v1` | public dormant readiness projection |
| 65 | `realm_chat_channel_v1` | private channel policy and sequence cursor |
| 66 | `realm_chat_message_v1` | private permanent message archive |
| 67 | `realm_chat_recent_v1` | private bounded recent-message cache |
| 68 | `realm_chat_rate_event_v1` | private rolling rate ledger |
| 69 | `realm_chat_send_receipt_v1` | private exactly-once send receipt |
| 70 | `realm_chat_report_v1` | private moderation report and evidence bounds |
| 71 | `realm_chat_report_rate_event_v1` | private bounded one-day report-ingress ledger |

The additive proof independently freezes v15, publishes the auth-neutral v16
fixture, seeds one typed row in every Chat table, rejects a v16-to-v15
downgrade, and verifies the real candidate preserves those rows. The receipt
binds separate v15 and v16 schema digests to one compiled artifact. This is
migration evidence only: staging, activation, client entry, and production
publication remain unauthorized.

The review-only authority uses atomic server-time report ceilings of
5/reporter/hour, 20/reporter/day, 20/message, 250/global/hour, and
1,000/global/day. Optional details are capped at 250 scalars/512 UTF-8 bytes;
new sends stop at 4,000 pending reports and new reports stop at 5,000. A
proposed 90-day erasure/anonymization workflow remains unapproved and
unimplemented release work; this schema adds no deletion scheduler.

## Entry agreement and Marks

Entry and gameplay require the exact current Alpha Terms and Hegemony Social
Contract bundle. Immutable evidence from explicitly retained earlier versions
may preserve an existing public Marks projection, but never satisfies the
current gameplay gate.

Community Marks are separate from economic resources. SpacetimeDB automatically
grants one Mark per eligible Realm day to each admitted player. The server owns
eligibility, cadence, amount, and replay protection; a browser cannot mint or
redirect a grant. Disabled admission pauses future grants without deleting the
existing balance. Marks have no transfer, redemption, purchase, airdrop, or
financial-reward loop and require no wallet or blockchain activity.

## Local development

From this directory:

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run test:pure
pnpm run stdb:build
```

Or run the complete module check:

```sh
pnpm run verify
```

From the repository root:

```sh
npm run stdb:verify-bindings
npm run stdb:verify-additive-migration
```

Pure tests do not connect to a database. The additive migration verifier uses
disposable loopback databases and a pinned CLI to prove declaration order,
data preservation, scheduled lifecycle behavior, and `--delete-data=never`.

## Production operations

Source code, a green build, or a merge does not authorize publication or
seeding. Production operations use the local Hermes tool with short-lived
credentials and an immutable database identity.

Read-only aggregate inspection:

```sh
npm run stdb:inspect-alpha-v3 -- --json
npm run stdb:inspect-alpha-v4 -- --json
npm run stdb:inspect-alpha-v8 -- --json
npm run stdb:inspect-alpha-v10 -- --json
npm run stdb:inspect-alpha-v12 -- --json
npm run stdb:daily-marks:inspect
```

Inner Keep v15 stays independently inactive. Its counts-only inspection and
deterministic plans use the guarded source-only operator:

```sh
npm run stdb:inner-keep:inspect
npm run stdb:inner-keep:plan-catalog
npm run stdb:inner-keep:plan-builders
```

Catalog seed, Builder backfill, activation, and deactivation are separate
commands. They require exact plan counts and default to a local dry-run record;
`--confirm` is mandatory for any reducer call. Activation is additionally
blocked before credentials or network unless both owner-authorized static and
population selections and their complete installed runtime registries verify.
See the
[Inner Keep activation runbook](../docs/operations/inner-keep-activation.md)
for the complete future owner-reviewed sequence. The publisher retains the
active-v14-to-inactive-v15 contract as a read-only rehearsal, but the current
v16 artifact has no production lane: every non-dry-run path fails before the
publish dependency. A later change must add an exact inactive-v15 predecessor,
protected Chat aggregates, and inactive-v16 postflight evidence. No command is
authorized by this source PR.

Component setup is separate from module publication and must be reviewed one
component at a time:

```sh
npm run stdb:seed-alpha-component -- gold --dry-run
npm run stdb:seed-alpha-component -- forest --dry-run
npm run stdb:seed-alpha-component -- food --dry-run
npm run stdb:seed-alpha-component -- wood --dry-run
npm run stdb:seed-alpha-component -- water --dry-run
npm run stdb:seed-alpha-component -- stone --dry-run
```

Confirmed commands require `--confirm`, the canonical production coordinates,
and fresh pre/post aggregate checks. Partial or drifted catalogs fail closed;
the tool does not repair or delete them.

Water visibility is activated separately after a canonical seed and clean v10
inspection with `npm run stdb:activate-alpha-water -- --dry-run`, followed by
the same command with `--confirm` when approved.

See the concise [component activation runbook](../docs/operations/alpha-component-activation.md),
[deployment recovery guide](../docs/operations/reconstruction/deployment-recovery.md),
and [security threat model](../docs/security/threat-model.md). Never place
tokens, QR payloads, proofs, player identities, private rows, or production
logs in repository files or public issue reports.
