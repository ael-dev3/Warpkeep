# Warpkeep Alpha 0.3.10 — Tier-I Wheat Farm expeditions

**Status (18 July 2026): undeployed candidate. Alpha 0.3.6 remains the
verified public release.**

Alpha 0.3.10 is a source and review candidate stacked after the pending Gold
Mine and shared-forest work. It adds one bounded Food expedition loop; it does
not authorize a SpacetimeDB publication, Food-site seed, resource mutation,
Pages deployment, tag, GitHub Release, merge, or production-world action.

## Tier-I Wheat Farm catalog

- The reviewed Genesis 001 definition remains exactly 10,000 persistent cells
  with 2,000 resource-capable anchors; existing cells, slots, castles, Gold
  catalog, and forest layout remain immutable.
- A compiled placement policy selects exactly 96 active Tier-I Wheat Farms
  from passable Lowland/Meadow resource-capable anchors. It pins the complete
  catalog with a digest and excludes canonical Gold sites, forest instances and
  their one-hex clearance, permanent castle clearance, and protected travel
  corridors.
- The catalog is public only after a separately approved admin seed. Missing,
  partial, duplicate, malformed, or drifted Food rows do not invent a local
  substitute: they render no Food nodes while leaving the core Realm and Gold
  projection intact.

## One Food per completed server minute

- An admitted founder may dispatch one Food wagon from its own current castle
  to one available Wheat Farm. The browser sends only the reviewed site id and
  bounded idempotency key; the server derives identity, Terms, castle, route,
  server timestamps, capacity, phase, and reward.
- A wagon earns exactly one Food for each completed server minute after arrival,
  up to 30 days. Arrival, expiry, return, collection, and retries are
  replay-safe; browser time, browser movement, GLB geometry, and a UI counter
  never settle Food.
- Food and Gold have separate private expedition and idempotency tables. A
  founder may operate one Food wagon and one Gold wagon concurrently, while
  each resource loop still limits that castle to one of its own active wagons.
- Food capacity reserves both the complete 30-day Food award and raw passive
  Food through the gathering deadline. Every passive-settlement path preserves
  the remaining Food reservation, including concurrent Gold lifecycle work, so
  a delayed schedule cannot truncate, duplicate, or strand the award.

## Public map, private economy

- The public Food projection contains only the site coordinate/tier/status and
  an identity-free occupation timeline with the originating public castle.
  FIDs, request keys, routes, accrued Food, private expedition rows, and
  balances stay caller-private.
- Food Farm presentation uses exact provenance-pinned High, Balanced, and
  Compact Wheat Farm GLBs with a weighted shared Gold/Food model and animation
  budget. The substantially denser Farm family has strict per-resource limits
  and marker fallback; scene assets never determine collision, placement,
  movement, ownership, or rewards.
- The Food inspector can show the existing decorative Food artwork and the
  validated public/private projections. It never fabricates availability,
  inventory, ownership, or a gather result.

## Additive rollout gate

This candidate appends only five v7 SpacetimeDB tables: public Food sites,
public Food occupations, private Food expeditions, private idempotency receipts,
and the public-safe internal schedule projection. Generated bindings, the
empty/nonempty additive migration proof, deterministic catalog tests,
Food/Gold-concurrency tests, asset integrity checks, and browser presentation
tests must pass at the exact review head.

Any future production sequence remains separately owner-approved:

1. publish the reviewed additive module with deletion disabled;
2. run only the approved guarded Food-site seed after the predecessor world,
   resource, Gold-site, and forest gates are satisfied;
3. verify aggregate Food catalog, occupancy, route, and reservation invariants
   without exposing player identities or balances;
4. deploy the exact reviewed Pages SHA; and
5. perform bounded live verification without unintended state mutation.

No test, review, branch, merge, or client build grants this authority.

## Explicit non-features

This candidate does not add construction, upgrades, units, combat, scouting,
alliances, chat, trading, resource transfers, public inventories, wallets,
Marks spending, airdrops, rewards, or guaranteed financial value.
