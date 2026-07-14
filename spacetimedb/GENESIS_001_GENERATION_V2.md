# Genesis 001 generation v2

Status: local Alpha 0.3.2 candidate only. This document does not authorize a
Maincloud publish, world seed, admission, profile lookup, or token scan. The
recorded production checkpoint remains backend protocol 2 with the original 61
world rows until a separately reviewed rollout proves otherwise.

## Independent version coordinates

| Coordinate | Candidate value |
| --- | --- |
| Product | Alpha 0.3.2 |
| Auth contract | 2 (unchanged) |
| Backend compatibility protocol | 3 |
| Realm | `GENESIS_001` |
| Seed name | `HEGEMONY_GENESIS_001` |
| Numeric seed | `3445214658` |
| World generation | 2 |
| Authoritative radius | 20 |
| Client render radius | 22 |
| Player capacity / castle slots | 100 |

Old clients and a protocol-3 browser paired with the currently deployed
protocol-2 backend fail closed at the compatibility gate. Auth-v2 procedure and
reducer names remain independently versioned and byte-exact.

## Deterministic world

The pointy-top axial disc contains exactly `1 + 3r(r + 1) = 1,261` cells at
radius 20. Generation retains the established radial `(ring, q, r)` order and
the original seed/hash functions. The first 61 radius-four rows are therefore
field-for-field and order-for-order identical to the deployed prefix; the
candidate adds exactly 1,200 rows for rings 5 through 20.

Pinned SHA-256 digests:

- original 61 `world_tile` records:
  `bf2626063eb79649b493053baf708ddbdbf025df6d4a2338c32a9dedcfeed47c`;
- complete generation-v2 world, metadata, and slot identity:
  `79ff57deceab26e0d8ae29019786f7cb8a3976a9f81e259d3e4c2b9be3315d11`.

Terrain and static content are separate deterministic layers. The exact static
content allocation is:

| Content | Cells |
| --- | ---: |
| Castle slots | 100 |
| Resource-capable | 250 |
| Core-capable | 175 |
| Empty passable wilderness | 400 |
| Scenic/blocking geography | 160 |
| Reserve | 176 |
| Total | 1,261 |

All 1,101 passable cells form one component. A deterministic Tarjan test finds
zero articulation points, so no single passable cell accidentally divides the
realm. Every castle slot is passable, lies in that component, has at least three
adjacent empty passable cells, and is separated from every other slot by at
least two hex steps.

Slots are chosen by deterministic farthest-point sampling after pinning the
three founding-district coordinates `(0,0)`, `(2,-1)`, and `(-1,2)`. Their
pairwise distances are 2, 2, and 3. The remaining slots extend through all six
sectors and out to ring 18.

## Fail-closed seeding

`planCanonicalWorldSeed` validates every existing world, realm, metadata, and
slot row before returning any write plan. It never overwrites drift.

- the deployed 61-row prefix plans exactly 1,200 outer world rows, 1,261
  metadata rows, one realm row, and 100 slots;
- a complete canonical seed plans zero writes;
- a partial but canonical seed plans only the exact missing records;
- unknown keys, duplicates, field drift, metadata drift, realm drift, or slot
  drift fail with `WORLD_SEED_CONFLICT` before a reducer write begins.

The reducer remains admin-only and transactional. Its audit label includes the
generation and radius. The pure policy suite covers idempotence and conflict
rollback without accessing an external database.

## Append-only schema candidate

The deployed table refs 0 through 6 remain byte-identical and in place. The
candidate appends refs 7 through 18:

| Ref | Table | Access | Purpose |
| ---: | --- | --- | --- |
| 7 | `realm_v1` | public | Stable realm/generation identity |
| 8 | `world_tile_meta_v1` | public | Terrain/content/passability sidecar |
| 9 | `castle_slot_v1` | public | Immutable slot coordinates |
| 10 | `castle_slot_claim_v1` | private | FID/castle allocation relation |
| 11 | `realm_profile_v1` | public | Sanitized, visibility-gated presentation |
| 12 | `mark_account_v1` | private | Authoritative game-only Mark totals |
| 13 | `snap_burn_credit_v1` | private | Immutable, event-neutral burn credit receipt |
| 14 | `fid_wallet_attribution_v1` | private | Immutable generation-qualified attribution rows |
| 15 | `wallet_attribution_snapshot_v1` | private | Current complete snapshot generation/count |
| 16 | `snap_scan_cursor_v1` | private | Finalized-chain scanner checkpoint |
| 17 | `snap_scan_batch_v1` | private | Resumable two-phase scan/apply state |
| 18 | `alpha_terms_acceptance_v1` | private | Immutable FID/version acceptance evidence |

The public profile exposes optional aggregate fields only through an explicit
visibility flag; authoritative Mark totals remain private. Wallet addresses and
burn receipts are private. Address attribution is intentionally non-unique so
conflicting trusted evidence can be represented and quarantined rather than
silently discarded.

`snap_burn_credit_v1` models an ordinary SNAP token burn on Ethereum mainnet.
It does not encode or imply a HyperSnap-specific burn product or workflow. The
candidate includes a reviewed fixed-point reducer contract and a local dry-run
scanner policy, but `marks:apply` remains hard-disabled and no chain scan or
account credit has been performed against production.

## Local migration proof

`npm run stdb:verify-additive-migration` uses only an ephemeral loopback
SpacetimeDB 2.6.1 server and `--delete-data=never`. It advances independent
fixtures to the frozen seven-table checkpoint, then proves:

- refs 0 through 6, their fields, indexes, constraints, and access remain exact;
- the 12 candidate tables occupy refs 7 through 18 with exact fields/access;
- the real module matches an independent schema-only v3 fixture;
- empty and synthetic nonempty legacy rows and the 61-row world remain intact;
- a prebuilt artifact can be republished idempotently;
- populated v3 state prevents rollback to the seven-table v2 schema.

The proof does not query Maincloud and does not authorize publication.

## Versioned aggregate verification stages

The production verifier keeps the deployed legacy and protocol-v2 flags for
recovery compatibility and adds two exact protocol-v3 stages for a future,
separately approved rollout:

```sh
npm run verify:alpha-production -- --require-additive-v3-preseed-aggregate
npm run verify:alpha-production -- --require-genesis-v3-seeded-empty-aggregate
```

The preseed stage is valid only after the additive protocol-v3 module exists
and before generation-v2 seeding: it requires the preserved 61 world rows,
zero rows in every appended table, protocol 3, the pinned seed coordinates,
zero occupied tiles, a canonical static-world drift check, and zero for every
orphan, founder, wallet-ambiguity, projection, and Mark ledger invariant.

The seeded-empty stage is valid only after the separately approved canonical
seed and before profiles, wallet snapshots, scans, credits, or admissions: it
requires 1,261 world rows, 1,261 metadata rows, one realm, 100 castle slots,
zero mutable candidate rows and occupied tiles, and the same zero-invariant
contract. Every u64
value must be a canonical decimal string and the returned object must contain
the exact reviewed key set. Child output is parsed but never mirrored.

The seeded-empty flag intentionally says `v3`: generation remains version 2,
but the inspected backend aggregate contract is protocol 3. Merely documenting
or implementing these read-only gates does not authorize running them against
Maincloud.

## Implemented local candidate and remaining gates

The local candidate now implements atomic admit-and-found behavior, permanent
castle reuse on first login and re-enable, trusted profile/private wallet
updates, exact one-to-one Mark crediting, a counts-only v3 aggregate, a
two-provider fail-closed dry-run scanner, and browser bindings for only the
public protocol-3 tables. The first three slots remain deliberately adjacent;
no founding FID is embedded in source or public documentation.

This still does not authorize or claim the production phases. Maincloud schema
publication, the 1,200-row/sidecar seed, private operator inputs, initial scan,
credit application, admission/founding, public-stat activation, frontend
deployment, merge, tag, and release each remain separate reviewed gates. No
production credential, FID, wallet address, transaction receipt, private row,
or mutable game state was accessed while implementing these local paths.
