# Alpha 0.3.8 — Genesis 001 world capacity release record

**Status:** verified protected-`main` public release, 18 July 2026. Any
separate backend/world operation remains approval-gated.

**Live release:** Alpha 0.3.8

**Backend protocol:** 3 (unchanged)

**World generation:** generation-three rollout remains a separate gated operation;
the public release record does not itself authorize it.

Alpha 0.3.8 prepares Genesis 001 for future naturally distributed Food, Wood,
Stone, and Gold nodes by expanding the persistent authoritative world to
exactly 10,000 cells. It does not place resource nodes or add a new playable
resource-node mechanic.

The source candidate also carries forward Alpha 0.3.7's undeployed private
resource accounts and deterministic terrain-yield collection. That bounded
account loop is distinct from future map nodes and remains subject to its own
publication, backfill, verification, and frontend release gates.

## World definition

- Preserves every one of the 1,261 generation-v2 cells byte-for-byte.
- Preserves all 100 permanent castle slots, their generation-v2 identity, and
  their close-outward allocation order.
- Adds 8,739 persistent cells: the remainder of a complete radius-57 disc plus
  81 cells arranged as six balanced, contiguous side-centred arcs on ring 58.
- Uses a radius-60 visual envelope without treating visual apron cells as
  authoritative state.
- Provides exactly 2,000 future resource-capable sites while keeping that
  metadata presentation-neutral and mechanically inactive.
- Keeps all 8,750 passable cells connected with no articulation point.

## Persistence and rollout safety

- Uses the existing public world, metadata, realm, and slot tables; no table or
  column is replaced.
- Adds one admin-only exact-CAS reducer for the reviewed 1,261-to-10,000
  transition.
- Makes routine world seeding refuse the deployed generation-v2 realm so a
  recovery command cannot expand production accidentally.
- Performs the 8,739 tile inserts, 8,739 metadata inserts, and singleton realm
  update atomically while preserving the realm creation timestamp.
- Accepts an exact generation-v3 target as a zero-write retry; partial, mixed,
  duplicate, altered, or unexpected state fails closed.
- Separates the pre-expansion and expanded production aggregate gates and
  requires an explicit publisher world stage.
- Adds a confirmation-only Hermes operator pinned to the immutable production
  database identity. It verifies the founded v3 graph and either the exact
  pre-backfill or ready v4 private-resource aggregate before and after the
  transition. It is prepared but has not been run against production.

## Rendering scale

- Builds terrain from the authoritative tile-key set, including the deliberate
  partial outer ring.
- Preserves the complete radius-22 founding terrain byte-for-byte at the former
  4/3/2 subdivision profiles, then uses seam-matched coarse topology outside it.
- Attests the complete radius-60 surface at 203,406 / 139,338 / 93,498 terrain
  triangles for High / Balanced / Reduced, with zero degenerate triangles and
  exactly two-triangle incidence at every internal mesh edge.
- Caps semantic and generic decoration work with deterministic budgets rather
  than scaling every detail family linearly to 10,000 cells.
- Preserves founding-district detail preferentially, keeps overview framing
  bounded to the actual perimeter, and retains the existing close castle view.
- Supports the complete generation-v2 and generation-v3 snapshot contracts
  during rollout, while rejecting mixed snapshots.

## Verification completed locally

- Exact 10,000-cell count, ring distribution, content budgets, v2 digests,
  connected passable graph, and zero articulation points.
- Radius-22 geometry digests, adaptive topology counts, perimeter/internal edge
  incidence, Euler characteristic, zero degenerates, and failure-path cleanup.
- SpacetimeDB typecheck/module build and generated-binding generation.
- Disposable real-module migration proof with one complete admitted founder,
  castle, claim, profile, Marks account, and exact pre-backfill resource state.
  The atomic expansion completed in under 100 ms across repeated local
  loopback runs, preserved predecessor/dynamic digests and timestamp, and
  passed a zero-write retry.

The loopback timing is evidence for the candidate, not a guarantee for
Maincloud. Production publication, production expansion, frontend deployment,
and any future resource-node placement remain separate approval boundaries.

## Not included

No construction, upgrades, units, combat, alliances, trading, public resource
balances, Marks spending, token reward, airdrop, or guaranteed financial value
is added. Alpha participation remains experimental and offers no guaranteed
reward or return.
