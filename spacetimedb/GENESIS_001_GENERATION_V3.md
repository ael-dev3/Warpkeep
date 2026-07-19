# Genesis 001 generation v3

## Status

Generation v3 was introduced in Alpha 0.3.8 and remains the Alpha 0.3.12 world definition. It is an additive
expansion of the generation-v2 predecessor, not a second realm. The completed
module publication and world-state transition were separately approved; this
document grants no authority to publish or mutate production again.

## Exact shape

A complete hex disc cannot contain exactly 10,000 cells:

- radius 57 contains 9,919 cells;
- radius 58 contains 10,267 cells.

Genesis 001 therefore contains the complete radius-57 disc plus 81 cells on
ring 58. The ring-58 cells form six contiguous, side-centred arcs with sector
quotas `14, 13, 14, 13, 14, 13`. `authoritativeRadius = 58` is the maximum
envelope; clients must use the authoritative tile-key set rather than assume a
complete radius-58 disc. The visual render envelope is radius 60.

```text
authoritative cells        10,000
complete inner disc radius     57
maximum authoritative ring     58
partial ring-58 cells           81
render envelope radius          60
permanent castle slots         100
player capacity                100
```

All 100 castle slots remain the exact generation-v2 rows and allocation order.
No founder coordinate, castle, claim, profile, account, admission, Terms row,
or wallet/scan record changes as part of the expansion.

## Static metadata budgets

The metadata describes future placement capability; it does not create a
resource node or playable mechanic.

| Static content | Total | Added outside generation v2 |
| --- | ---: | ---: |
| Scenic blocker | 1,250 | 1,090 |
| Empty | 3,200 | 2,800 |
| Resource-capable | 2,000 | 1,750 |
| Core-capable | 1,400 | 1,225 |
| Castle slot | 100 | 0 |
| Reserve | 2,050 | 1,874 |
| **Total** | **10,000** | **8,739** |

The 8,750 passable cells form one connected component with no articulation
point. Protected axial corridors and the partial-boundary approaches are never
selected as scenic blockers.

## Frozen predecessor

Generation v2 remains an immutable compatibility boundary:

- 1,261 world-tile rows;
- 1,261 metadata rows;
- one generation-v2 realm row at authoritative radius 20/render radius 22;
- 100 generation-v2 castle-slot rows.

Tests pin the complete v2 tile, metadata, and slot SHA-256 digests separately
from the generation-v3 digest. Generation-v3 metadata uses new deterministic
channels only for the 8,739 added cells, so no existing terrain/content value
is re-ranked.

## Persistence and transition

No table, column, or index is replaced. The transition uses the existing
`world_tile`, `world_tile_meta_v1`, `realm_v1`, and `castle_slot_v1` tables:

| State | World tiles | Metadata | Realms | Slots |
| --- | ---: | ---: | ---: | ---: |
| Exact predecessor | 1,261 | 1,261 | 1 (generation 2) | 100 |
| Exact target | 10,000 | 10,000 | 1 (generation 3) | 100 |
| Delta | +8,739 | +8,739 | one exact row update | 0 |

`admin_expand_genesis_world_v3` is the only reducer permitted to transition the
deployed predecessor. It requires the admin principal and explicit expected
tile, metadata, and generation values. Before writing it classifies the full
static snapshot as exactly generation 2 or exactly generation 3 and checks the
castle/occupancy graph. Unknown, duplicate, partial, altered, or same-count
mixed state fails closed.

The reducer inserts all 8,739 tile/metadata pairs and updates the singleton
realm in one SpacetimeDB transaction. The realm `createdAt` timestamp is
preserved. An exact generation-v3 invocation with target expectations is a true
no-op with no audit write. Routine `admin_seed_world` refuses any exact
generation-v2 realm so ordinary recovery cannot trigger the expansion.

Before either transition or no-op, the reducer also requires a complete
founding graph and an exact private-resource lifecycle state: either every
founder is still awaiting the one-time resource backfill, or every founder has
one consistent resource account. Partial, orphaned, or invariant-breaking
resource state blocks the world operation. The guarded Hermes operator repeats
that v4 aggregate before and after the transaction and requires it unchanged.

## Rollout boundary

The original Alpha 0.3.8 production sequence was intentionally split:

1. Prove the exact current 1,261-cell founded aggregate.
2. Publish the additive module with `--delete-data=never`.
3. Prove the same predecessor again under the new module.
4. Obtain separate approval for `admin_expand_genesis_world_v3`.
5. Prove the exact 10,000-cell founded aggregate and unchanged dynamic counts.
6. Use only the expanded aggregate gate for future republishes.

The publisher requires an explicit `--genesis-world-stage=pre-expansion` or
`--genesis-world-stage=expanded`; it never infers the world state. Hermes
requires the immutable production database identity and an explicit
command-line confirmation for expansion.

The disposable loopback migration proof seeds a populated exact generation-v2
fixture, proves routine-seed refusal, publishes the checked-out module without
data deletion, runs the expansion, verifies preserved founding/static digests and
realm timestamp, and proves an idempotent retry. This local proof is required
as a local release check but is not production approval.

## Client compatibility

During the bounded rollout, the browser and aggregate-only QA attestation may
accept either the complete generation-v2 contract or the complete
generation-v3 contract. Mixed counts, realm fields, metadata, or tile sets are
rejected. Once a snapshot is accepted, rendering uses its authoritative keys;
the partial ring is never filled in by browser inference.

Renderer work is bounded independently from world area. Terrain geometry uses
the radius-60 envelope, while deterministic budgets cap semantic features and
generic decoration instances and preserve the established founding district
before selecting outer detail.
