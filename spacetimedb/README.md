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
| Append-only schema generation | 15 (review-only Realm Chat suffix) |
| Alpha 0.3.12 suffix | Water refs 37–40; Stone refs 41–45 |
| Generic worker suffix | refs 47–52; active |
| Access-request suffix | ref 53; active |
| Daily Marks suffix | private refs 54–55; activation is separate |
| Realm Chat suffix | refs 56–62; review-only, unseeded, and unpublishable |

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
- public Community Marks projection only when its policy permits it.
- if separately activated in a future release, Realm Chat status and only its
  newest bounded 128-message projection.

Private tables contain admission, ownership, unclaimed-slot decisions, resource
and Marks accounts, agreement evidence, daily-grant receipts, operator audit,
expedition state, retry receipts, and balances. Retired compatibility tables
remain private and frozen to preserve the deployed append-only schema; current
authority paths do not write or interpret them.

Realm Chat's channel sequence, message archive, rate ledger, send receipts, and
reports are also private. They are absent from the player binding and ordinary
Realm snapshot; the browser receives only the bounded public pair plus
caller-gated send, report, and indexed history operations.

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

## Review-only Realm Chat

Protocol V15 appends a server-authoritative persistent Realm Chat foundation.
The module derives sender FID, channel, UUIDv7 message identity, sequence,
timestamp, visibility, rate decisions, and report context. Sends are
exactly-once across ambiguous client retries; recent public state is capped at
128 rows; history reads at most 50 exact sequence keys; and private reports
preserve a context range that cannot expand after submission.

Public moderation uses body-free tombstones while private admin evidence keeps
the original record. Admin status verifies the entire bounded public projection
against the private archive. Operational mutations are admin-only and audited.

This code does not authorize use. Server activation is not compiled, the
client entry flag is false, and the production publisher rejects a V15
mutation. See the [implementation and research record](../docs/design/realm-chat-v1-implementation.md)
and [controlling contract](../docs/design/realm-chat-v1-contract.md).

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
