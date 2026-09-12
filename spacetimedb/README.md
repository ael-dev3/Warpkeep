# Warpkeep SpacetimeDB authority

SpacetimeDB owns Warpkeep's persistent gameplay. The browser renders the realm;
it cannot grant admission, choose an owner, supply a balance, advance a timer or
decide a command outcome. This directory contains distinct realm modules and a
shared 0.4 rules core; they are not interchangeable deployment targets.

## Choose the module and generation

| Source | Responsibility and current scope |
| --- | --- |
| [src](src/index.ts) | Established G001 authority, compatibility tables and earlier prepared features. Preserve existing player state, access and normal timers alongside the new-admission freeze. |
| [genesis002](genesis002/src/index.ts) | Separate sealed G002 module. Private atlas/import and gameplay-shaped contracts exist, but player gameplay procedures reject with `GENESIS002_GAMEPLAY_CLOSED`; future admissions remain undecided. |
| [ptr](ptr/src/index.ts) | Separate owner PTR module. Authenticated transaction adapters connect atlas-backed gathering, keep initialization and construction to the 0.4 rules core. |
| [gameplay04](gameplay04) | Shared pure command, placement, Worker, construction and reconciliation rules. It is not a standalone database or an authentication boundary. |

The playable 0.4 path is the actual owner's PTR session, not G001's dormant Inner
Keep V1 or G002's closed player API. Its resources become spendable at
authoritative Worker return; economy buildings improve matching yield, Barracks
shorten travel and the Cathedral shortens future construction. The older G001
gathering and construction-discount policies below describe a different generation.

Start with the [architecture](../docs/technical-architecture.md),
[source map](../docs/agent-notes/0.4.0/repo-map.md) and
[0.4 handoff](../docs/agent-notes/0.4.0/README.md). Use the
[gameplay specification](../docs/superpowers/specs/2026-09-05-warpkeep-0.4-gameplay-design.md)
for intended rules and the [infrastructure audit](../docs/agent-notes/0.4.0/release-and-infrastructure.md)
for operating gaps and dated evidence. Source implementation does not establish
current owner play or deployment.

## Source and verification entry points

| Work | Start here |
| --- | --- |
| G001 schema, access and Worker authority | [schema](src/index.ts), [access policy](src/genesis001AccessPolicy.ts), [Worker authority](src/castleWorkerAuthority.ts), [module tests](tests) |
| PTR identity and private atlas | [auth](ptr/src/auth.ts), [owner reducers](ptr/src/ownerReducers.ts), [atlas reads](ptr/src/atlasReadReducers.ts) |
| 0.4 keep, gathering and construction | [shared core](gameplay04), PTR [keep](ptr/src/gameplayKeep.ts), [Workers](ptr/src/gameplayWorkers.ts), [construction](ptr/src/gameplayConstruction.ts), [schedule](ptr/src/gameplaySchedule.ts) |
| G002 isolation and closed player surface | [auth](genesis002/src/auth.ts), [policy](genesis002/src/policy.ts), [gameplay boundary](genesis002/src/gameplayKeep.ts) |
| Transaction-adapter integration tests | Root [keep tests](../tests/gameplay04KeepModules.test.ts), [Worker tests](../tests/gameplay04WorkersModules.test.ts), [construction tests](../tests/gameplay04ConstructionModules.test.ts) |

Each module has its own package and locked dependencies. From the repository root,
after installing dependencies into the intended independent verification checkout:

```sh
pnpm --dir spacetimedb run verify
pnpm --dir spacetimedb/genesis002 run verify
pnpm --dir spacetimedb/ptr run verify
npm test -- tests/gameplay04KeepModules.test.ts tests/gameplay04WorkersModules.test.ts tests/gameplay04ConstructionModules.test.ts
```

Use the pinned SpacetimeDB CLI/package version and package-manager versions.
G001 `verify` runs types, its separate Node/tsx tests and module build. G002/PTR
`verify` run their types and module builds; the shared gameplay and adapter suites
live under repository-root Vitest. One package's successful check is not coverage
of the other modules. Bindings and recovery schema fixtures must be generated
through their source-owned tools; follow the source map before changing them.

## G001 reference

The following compatibility, state and legacy feature contracts describe G001.
They do not activate those features or define the successor 0.4 policy.

## Compatibility

| Contract | Current value |
| --- | ---: |
| SpacetimeDB CLI and package | 2.6.1 |
| Browser/backend wire protocol | 3 |
| Player authentication contract | 2 |
| Genesis world generation | 3 |
| Append-only schema generation | 17 (review-only Greater Realm suffix) |
| Alpha 0.3.12 suffix | Water refs 37–40; Stone refs 41–45 |
| Generic worker suffix | refs 47–52; active |
| Access-request suffix | ref 53 retained; new submissions suspended by current release policy |
| Daily Marks suffix | private refs 54–55; activation is separate |
| Inner Keep suffix | refs 56–63; inactive until separate seed, backfill, client, asset, and activation gates |
| Realm Chat suffix | refs 64–71; review-only and not publishable or activatable by this build |
| Greater Realm suffix | refs 72–83; guarded cutover tooling exists, while checked-in publication, import, activation, and presentation approvals remain false |

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

Greater Realm release, chunk, navigation, cell, slot, claim, resource, and
activation rows are private. Only identity-minimized occupancy and inactive
atlas, six-region aggregate, and worker-readiness projections are public. A
commit-bound launcher, immutable artifact proof, shared operator/token
authority, and crash-resumable journal now guard the dedicated v17 cutover
lane, but every checked-in production approval remains false. Schema presence
or tooling availability grants no release authority.

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

The retained legacy resource-specific model gives Gold, Food, Wood and Stone
independent expeditions:

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

Fresh legacy dispatch is rejected once the generic Worker rollout enters drain
or active state. Retained tables and earlier expedition contracts are compatibility
context; trace [reservation authority](src/resourceExpeditionReservationAuthority.ts)
and the actual rollout state before selecting the live command path.

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

The source tree does not make this component playable. The Pages workflow first
classifies verified `main` source; its preparation lane can skip deployment.
A merge alone does not activate the dormant client. Module publication, catalog seed, Builder backfill,
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

## Review-only Greater Realm migration boundary

Schema generation 17 appends exactly twelve tables without changing refs 0–71:

| Refs | Tables | Visibility and purpose |
| ---: | --- | --- |
| 72–77 | `greater_realm_release_v1` through `greater_realm_castle_claim_v1` | private release, chunk, navigation, cell, slot, and claim authority |
| 78 | `greater_realm_cell_occupancy_v1` | public identity-minimized occupancy |
| 79–80 | `greater_realm_resource_node_v1`, `greater_realm_activation_v1` | private resource and activation authority |
| 81–83 | `realm_atlas_v1`, `realm_atlas_visible_region_v1`, `realm_worker_system_v2` | public inactive atlas, six-region aggregates, and worker readiness |

`npm run stdb:verify-additive-migration` starts a disposable loopback server,
builds and publishes the frozen v16 predecessor, seeds representative legacy
Water, Inner Keep, and Chat rows, and records every predecessor-table row
digest. It then installs the real 86-table current candidate, compares the
frozen 84-table v17 prefix and the two private canary tables with their exact
auth-neutral fixtures, seeds one typed sentinel in each v17 table, proves exact
row preservation across an idempotent artifact republish, and rejects
current-candidate-to-v17, v17-to-v16, and older rollback attempts with deletion
disabled. Its protocol-v18 success receipt independently binds the v11 through
v17 prefix digests, the exact 86-table current-candidate digest, and the compiled
artifact digest.

This command is local migration evidence only. Production v17 work is
available solely through exact rows of the reviewed
[Greater Realm production launch envelope](../docs/operations/greater-realm-production-launch-envelope.sh.txt),
which binds protected source, immutable artifact evidence, shared authority,
late private credentials, and crash recovery. Its publication, import,
activation, presentation, and notification approvals remain false; neither
this proof nor the existence of guarded tooling authorizes an operation.

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

Use the [0.4 infrastructure audit](../docs/agent-notes/0.4.0/release-and-infrastructure.md)
and [infra access guide](../docs/operations/0.4.0-infra-access.md) to identify the
actual immutable realm and current operating path. G002 and PTR are recorded as
already existing; their checked-in fresh-create publishers reject an existing
target. A schema-compatible, data-preserving update and ambiguous-outcome
reconciliation must be connected to the real caller before those tools can
update the existing realms. Do not infer absence, emptiness or deployed gameplay
from a package version or source tree.

Source publication, local module checks and successful deployment are different
outcomes. Preserve legitimate writes during updates and recovery; current
G001/G002/PTR integration status belongs in the linked audit and release evidence.

### Historical G001 v17 operating contract

The following describes the guarded Greater Realm cutover lane and retained
legacy aliases. It is a reference for that generation, not the complete 0.4
operating interface. During that cutover, legacy production npm aliases are
deliberate refusal stubs and direct TypeScript invocation is prohibited.

The only supported production boundary is an exact command row in the reviewed
[Greater Realm production launch envelope](../docs/operations/greater-realm-production-launch-envelope.sh.txt),
as described by the
[cutover runbook](../docs/operations/greater-realm-production-cutover.md).
That boundary covers the dedicated v17 publisher, import, relocation,
verification, recovery, and seven narrowly enumerated Hermes admission and
notification rows. It accepts canonical owner-private credential paths and
opens required secrets only after protected source, local proof, and authority
checks. It never accepts an environment-carried secret or a shell pipe.

Legacy aggregate inspection, Daily Marks, Inner Keep, component seed, Water
activation, and repair operators remain unavailable until separately reviewed
post-cutover launch rows are added. The generic legacy/v15 publisher is also
unavailable. The dedicated v17 lane exists, but all relevant checked-in
approvals remain false and its source alone authorizes nothing.

Local-only `npm run stdb:verify-bindings` and
`npm run stdb:verify-additive-migration` remain valid development evidence;
they do not contact production. See the
[component activation runbook](../docs/operations/alpha-component-activation.md),
[Inner Keep activation runbook](../docs/operations/inner-keep-activation.md),
[deployment recovery guide](../docs/operations/reconstruction/deployment-recovery.md),
and [security threat model](../docs/security/threat-model.md). Never place
tokens, QR payloads, proofs, player identities, private rows, or production
logs in repository files or public issue reports.
