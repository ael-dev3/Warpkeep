# Warpkeep Alpha 0.3.11 — Tier-I Logging Camp expeditions

**Status (18 July 2026): undeployed candidate. Alpha 0.3.6 remains the
verified public release.**

Alpha 0.3.11 is a source and review candidate stacked after the pending Gold
Mine, shared-forest, and Wheat Farm work. It adds one bounded Wood expedition
loop; it does not authorize a SpacetimeDB publication, Wood-site seed, resource
mutation, Pages deployment, tag, GitHub Release, merge, or production-world
action.

## Tier-I Logging Camp catalog

- The reviewed Genesis 001 definition remains exactly 10,000 persistent cells
  with 2,000 resource-capable anchors; existing cells, slots, castles, Gold
  catalog, Food catalog, and forest layout remain immutable.
- A compiled placement policy selects exactly 96 active Tier-I Logging Camps
  from passable forest resource-capable anchors. It pins the complete catalog
  with a digest and excludes canonical Gold and Food sites, forest instances
  and their one-hex clearance, permanent castle clearance, and protected travel
  corridors.
- The catalog is public only after a separately approved admin seed. Missing,
  partial, duplicate, malformed, or drifted Wood rows do not invent a local
  substitute: they render no Wood nodes while leaving the core Realm and the
  existing Gold/Food projections intact.

## One Wood per completed server minute

- An admitted founder may dispatch one Wood wagon from its own current castle
  to one available Logging Camp. The browser sends only the reviewed site id and
  bounded idempotency key; the server derives identity, Terms, castle, route,
  server timestamps, capacity, phase, and reward.
- A wagon earns exactly one Wood for each completed server minute after arrival,
  up to 30 days. Arrival, expiry, return, collection, and retries are
  replay-safe; browser time, browser movement, GLB geometry, and a UI counter
  never settle Wood.
- Gold, Food, and Wood have separate private expedition and idempotency tables.
  A founder may operate one wagon of each kind concurrently, while each resource
  loop still limits that castle to one of its own active wagons.
- Food and Wood capacity reserve both the complete remaining 30-day award and
  raw passive production through each gathering deadline. The shared settlement
  bridge protects both fields during resource collection and Gold/Food/Wood
  lifecycle work, so a delayed schedule cannot truncate, duplicate, or strand
  either award.

## Public map, private economy

- The public Wood projection contains only the site coordinate/tier/status and
  an identity-minimized occupation timeline with the originating public castle.
  FIDs, request keys, routes, accrued Wood, private expedition rows, and
  balances stay caller-private.
- Logging Camp presentation uses exact provenance-pinned High, Balanced, and
  Compact GLBs with bounded shared node and wagon presentation plus safe marker
  fallback. Scene assets never determine collision, placement, movement,
  ownership, or rewards.
- The supplied high-resolution Logging Camp illustration is a separately
  provenance-pinned transparent inspection image. It is local, decorative,
  pointer-inert card art only; it does not derive from GLB bytes or determine
  placement, movement, ownership, balance, or rewards.

## Additive rollout gate

This candidate appends only five v8 SpacetimeDB tables: public Wood sites,
public Wood occupations, private Wood expeditions, private idempotency receipts,
and the public-safe internal schedule projection. Generated bindings, the
empty/nonempty v7-to-v8 additive migration proof, deterministic catalog tests,
Food/Wood/Gold concurrency tests, asset integrity checks, and browser
presentation tests must pass at the exact review head.

Any future production sequence remains separately owner-approved:

1. publish the reviewed additive module with deletion disabled;
2. run only the approved guarded Wood-site seed after the predecessor world,
   resource, Gold-site, forest-layout, and Food-site gates are satisfied;
3. verify aggregate Wood catalog, occupancy, route, and paired-reservation
   invariants without exposing player identities or balances;
4. deploy the exact reviewed Pages SHA; and
5. perform bounded live verification without unintended state mutation.

No test, review, branch, merge, or client build grants this authority.

## Explicit non-features

This candidate does not add construction, upgrades, units, combat, scouting,
alliances, chat, trading, resource transfers, public inventories, wallets,
Marks spending, airdrops, rewards, or guaranteed financial value.
