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
| Append-only schema generation | 8 deployed |
| Draft Alpha 0.3.12 water suffix | candidate generation 9, refs 37–40 (not activated) |

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
- Gold Mine, Wheat Farm, and Logging Camp catalogs;
- identity-minimized site occupations containing a site, phase, public
  timeline, and origin castle;
- public Community Marks projection only when its policy permits it.

Private tables contain admission, ownership, unclaimed-slot decisions, resource
and Marks accounts, agreement evidence, wallet attribution, operator audit,
expedition state, retry receipts, and balances.

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

Each founded castle has a private Food, Wood, Stone, and Gold account. Passive
terrain production settles in completed ten-minute server quanta. Gold passive
terrain production is disabled; Gold comes from its expedition authority.

Gold, Food, and Wood each have an independent expedition:

- the client submits only a canonical site ID;
- the provider owns a random idempotency key and reuses it only for the same
  unresolved attempt;
- the server derives caller, castle, route, timing, capacity, rate, and award;
- one castle may run at most one expedition for each resource type;
- public occupation remains until the wagon completes its return;
- settlement and return are server scheduled and exact-once;
- private reservations prevent passive collection or another lifecycle from
  truncating a valid Food or Wood award.

Stone currently has passive terrain yield only. Quarry presentation assets do
not create a Stone site, reducer, schedule, or reward path.

## Entry agreement and Marks

Entry and gameplay require the exact current Alpha Terms and Hegemony Social
Contract bundle. Immutable evidence from explicitly retained earlier versions
may preserve an existing public Marks projection, but never satisfies the
current gameplay gate.

Community Marks are separate from economic resources. The current policy may
attribute an ordinary SNAP token burn on Ethereum mainnet; it does not create a
transfer, conversion, redemption, spending, airdrop, or financial-reward loop.

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
```

Component setup is separate from module publication and must be reviewed one
component at a time:

```sh
npm run stdb:seed-alpha-component -- gold --dry-run
npm run stdb:seed-alpha-component -- forest --dry-run
npm run stdb:seed-alpha-component -- food --dry-run
npm run stdb:seed-alpha-component -- wood --dry-run
```

Confirmed commands require `--confirm`, the canonical production coordinates,
and fresh pre/post aggregate checks. Partial or drifted catalogs fail closed;
the tool does not repair or delete them.

See the concise [component activation runbook](../docs/operations/alpha-component-activation.md),
[deployment recovery guide](../docs/operations/reconstruction/deployment-recovery.md),
and [security threat model](../docs/security/threat-model.md). Never place
tokens, QR payloads, proofs, player identities, private rows, or production
logs in repository files or public issue reports.
