# Warpkeep Alpha 0.3.9 — Gold Mine wagon expeditions and shared forests

**Status: historical undeployed candidate note. Alpha 0.3.8 is the verified
public protected-`main` release.**

Alpha 0.3.9 combines the reviewed Alpha 0.3.8 Genesis 001 world-capacity
candidate with one bounded, server-authoritative Gold Mine wagon loop and one
public, server-seeded shared forest layout. It is a source and review candidate
only. It does not authorize a SpacetimeDB publication, world/resource/Gold-site
or forest-layout setup, founder backfill, Pages deployment, tag, GitHub Release,
or merge.

## Bounded Gold Mine pilot

- The candidate retains the exact 10,000-cell Genesis 001 definition and its
  2,000 resource-capable anchors. Every generation-two cell and permanent
  founder slot remains fixed.
- A compiled, digest-pinned policy selects exactly 24 distinct Tier-I Gold
  Mines from passable resource-capable anchors. The policy rejects duplicates,
  impassable cells, and placements outside the canonical world.
- An admitted founder may dispatch one Hegemony supply wagon from its current
  castle to one available Gold Mine. The server derives the caller, terms,
  castle, site eligibility, route, timing, one-wagon limit, and all lifecycle
  timestamps; the browser contributes only a site id and idempotency key.
- After server-derived travel, a wagon gathers one whole Gold per completed
  server minute for at most 30 days. Arrival, gathering, expiry, and return are
  settled by replay-safe internal schedules; a stale or repeated event cannot
  create another occupancy lease or credit a minute twice.
- Food, Wood, and Stone retain their private server-time terrain policy. Gold
  is credited only through completed wagon-gathering minutes, so this candidate
  has no hidden second Gold production source.

## Public world, private economy

- The Realm may receive a public Gold-site catalog and public occupancy
  timeline: site, coordinate, tier, status, originating castle, phase, and
  server-derived lifecycle points. This makes an occupied Mine visible without
  exposing an owner FID, request key, route, accrued output, or balance.
- Private expedition, idempotency, and resource-account records remain caller
  scoped. Gold collection and schedule settlement use one authoritative private
  cursor and do not trust browser clocks, balances, rates, or position.
- Current admission, exact Terms acceptance, castle ownership, complete account
  graph, canonical map placement, and policy limits fail closed before dispatch
  or settlement. Community Marks remains a separate private authority with no
  conversion, transfer, credit, or spending path.

## Presentation and assets

- Gold Mines and Hegemony supply wagons use recorded, provenance-pinned High,
  Balanced, and Compact runtime assets. Model reuse, nearby-only animation, and
  safe marker fallback keep the shared map bounded.
- A transparent Gold Mine inspection illustration is decorative, pointer-inert
  record art. Interactive state derives only from the validated public
  projection; missing or contradictory data displays no fabricated Mine.
- The accessible inspection record identifies an available or occupied site
  without presenting private balances, FIDs, or gathering totals.

## Shared forest layout

- `realm_forest_layout_v1` and `realm_forest_instance_v1` append one public,
  digest-pinned, server-seeded visual catalog. It contains exactly 210 fixed
  tree transforms across 22 provenance-recorded asset families.
- The catalog covers the preserved 1,261-cell Genesis founding Lowlands. It is
  valid within the 10,000-cell candidate world but intentionally does not
  invent trees for the newer outer cells; an outer-world layout requires its
  own reviewed version, migration, and seed.
- Every player receives the same tree identity, species, position, rotation,
  scale, groves, and clearings. High, Balanced, and Compact settings select
  only the immutable model LOD.
- Trees are decorative only. The layout cannot change canonical terrain or its
  digest, `terrainKind`, passability, collision, movement costs, Gold sites,
  routes, castle slots, ownership, resource rates, or economy. Missing,
  partial, malformed, or unseeded public rows render no player forest rather
  than a local substitute.

## Additive rollout gate

The Gold pilot and shared forest layout are additive to the resource authority
and 10,000-cell world candidate. They require fresh generated bindings,
migration proof, asset integrity checks, public/private subscription checks,
deterministic placement and layout verification, and browser-render coverage
before review can be considered complete.

Any future production sequence remains separately owner-approved:

1. publish the reviewed additive module with deletion disabled;
2. perform the separately approved exact-state world expansion, then only the
   approved guarded resource and Gold-site setup operation;
3. verify aggregate account, site, occupancy, and placement-digest invariants
   without returning player identities or balances;
4. separately approve and invoke the v6 forest-layout seed, then verify one
   layout row, exactly 210 instance rows, and the pinned layout/catalog digests;
5. deploy the exact reviewed Pages SHA; and
6. perform bounded live verification without changing balances or state outside
   the approved operation.

No local test, successful review, merge, or client build grants production
authority.

## Explicit non-features

This candidate does not add construction, upgrades, units, combat, scouting,
alliances, chat, trading, resource transfers, public inventories, wallets,
Marks spending, airdrops, rewards, or guaranteed financial value.

## Release evidence

Fresh exact evidence is recorded only for the committed Alpha 0.3.9 review
head. Hosted checks and every production operation remain pending owner
approval.

Only a protected, verified, deployed commit may receive the annotated `v0.3.9`
tag and GitHub Release.
