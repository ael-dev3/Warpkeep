# Technical architecture

Warpkeep is an admission-gated persistent-world alpha. The current player
experience is the verified Alpha 0.3.6 realm exploration and castle
presentation release. The checked-in Alpha 0.3.10 candidate carries a bounded
private resource loop, the 10,000-cell Genesis world candidate, a 24-site Gold
Mine wagon pilot, a shared decorative forest layout, and a 96-site Wheat Farm
Food extension, but it is not deployed. Construction, spending, combat, and
social systems are deliberately not live.

## Authority boundaries

- The browser owns presentation and short-lived client state only. It never
  decides admission, castle ownership, resource totals, timers, or outcomes.
- The Cloudflare identity bridge independently verifies Farcaster sign-in and
  brokers bounded OIDC/browser sessions. It is separate from game authority and
  public admission.
- The SpacetimeDB module is authoritative for admission, world, player, and
  castle state. Private ownership and administrative records are not public
  browser authority.
- Public projections exist for display and navigation. They do not grant a
  player power to alter authoritative state.

## Alpha 0.3.10 candidate resource, world, Gold, and Food boundary

The candidate appends one private `resource_account_v1` row per founded castle.
It is keyed by FID, uniquely bound to the authoritative castle, and stores whole
Food, Wood, Stone, and Gold units, a server settlement cursor, revision, and
exact policy version. Initial balances are 200, 150, 100, and 25 respectively;
each balance is capped at 1,000,000.

Food, Wood, and Stone production is a pure, versioned terrain policy evaluated
in complete ten-minute quanta. The module derives caller FID, castle, terrain,
rates, balances, and transaction time. `collect_resources_v1` accepts no input
and settles only quanta after the stored cursor. A capped account still advances
its cursor so discarded historic production cannot later reappear.

Gold has one separate issuance path: a completed server-authoritative wagon
gathering minute. The dispatch accepts only a canonical site id and bounded
idempotency key; the module derives admission, Terms, current castle, passable
route, timing, rate, and one-wagon limit. Arrival, gathering, expiry, and
return use replay-safe internal schedules. The browser cannot move a wagon,
choose a clock, credit Gold, or reopen an occupied Mine.

`get_my_resource_state_v1` accepts no FID. Admission, current player/castle
ownership, exact Alpha Terms acceptance, the resource graph, and the separate
private Marks account must all validate before the caller receives their own
projection. The strict browser decoder requires the exact caller FID, bigint
wire values, known terrain and policy versions, monotonic observations, and
bounded totals. A failed initial read prevents the Realm subscription and any
later lifecycle failure tears down the authority connection. The client never
applies an optimistic balance.

Peer resource rows remain private and the established six-table public Realm
subscription is unchanged. Community Marks stays in `mark_account_v1` under
its existing policy; resource collection cannot convert, duplicate, credit,
transfer, or spend Marks.

The same candidate defines Genesis 001 generation three as exactly 10,000
persistent cells: every cell of the generation-two radius-20 predecessor, the
remainder of a complete radius-57 disc, and 81 balanced cells on ring 58. The
maximum authoritative radius describes that partial-ring envelope; it does not
claim a complete radius-58 disc. All 100 permanent castle slots and their
close-outward generation-two order remain unchanged.

An admin-only exact-state reducer atomically inserts 8,739 world rows and 8,739
metadata rows, then updates the singleton realm while preserving its creation
timestamp. Routine seeding refuses to perform this transition. Exact
generation-two and generation-three snapshots are accepted during rollout;
partial, duplicate, altered, or mixed states fail closed. Two thousand
resource-capable metadata sites support a separate, digest-pinned Gold-site
policy. That policy selects exactly 24 passable Tier-I Gold Mines; capacity
metadata alone does not create a node or alter resource yields.

Gold-site and Gold-occupation projections are public only to the extent needed
to render a site, originating castle, phase, and server-derived lifecycle
timeline. Expedition, retry, account, request, route, accrued-output, and
balance records stay private to the owning caller. The public Realm projection
therefore never leaks a FID or Gold balance.

## Alpha 0.3.10 candidate Food expedition extension

The current candidate appends five Food tables at refs 27–31, after the
unchanged v5 Gold and v6 forest suffixes: public `food_site_v1`, public
identity-minimized `food_node_occupation_v1`, private
`food_expedition_v1`, private `food_expedition_idempotency_v1`, and the
public-safe `food_expedition_schedule_v_1`. The schedule repeats only already
public timing and is not a gameplay subscription surface; its reducer accepts
only the internal scheduler principal. FIDs, idempotency keys, routes, accrual,
credited Food, and resource balances remain private.

The immutable `genesis-001-tier1-food-sites-v1` policy selects exactly 96
active Tier-I Wheat Farms and pins their reviewed catalog with digest
`25d451ea4c8d94e0ff439d3a79873df47b4fd1cbeba887358017cfa8fb304bb7`.
Candidates are passable, `resource-capable` Lowland or Meadow cells in the full
Genesis map. The policy excludes the Gold catalog, forest transforms and their
one-hex clearance, permanent castle slots and their two-hex clearance, and
protected travel corridors with their one-hex clearance. A deterministic
farthest-point selection then spreads the fixed catalog; browser random state,
graphics quality, and asset geometry cannot add, remove, or reroll a Food node.

Food uses a distinct wagon lane from Gold. One castle may operate one Food
wagon and one Gold wagon concurrently, while each resource type still enforces
its own one-wagon-per-castle and one-occupation-per-site limits. A Food dispatch
accepts only a canonical site ID and bounded idempotency key. The module derives
the caller, Terms acceptance, current castle, passable route, timestamps,
occupancy, capacity, and lifecycle. It credits exactly one Food for each
completed server-derived minute of a 30-day gathering phase; a browser cannot
select a clock, route, owner, rate, phase, reward, or settlement result.

Unlike Gold, Food also has passive terrain production. Before dispatch, the
server preflights raw, uncapped passive Food through the fixed gathering deadline
plus the full 43,200-Food wagon award against the account cap. The remaining
award is preserved as a private reservation through Food state reads, Food and
general resource collection, Food expiry/return, and a concurrent Gold expiry.
Thus a late schedule or another legitimate settlement path cannot silently
truncate the reserved award or credit a completed minute twice; private phase,
timestamps, idempotency, and settlement cursors make every transition replay
safe.

The three Wheat Farm GLBs are integrity-pinned visual media under a
provenance-required delivery record. They may render a reviewed Food site but
do not supply collision, placement, routes, occupancy, ownership, balances,
rewards, or any other authority. Their presence in `public/` does not authorize
production seeding, deployment, DNS changes, public relicensing, or a gameplay
rule outside the reviewed server policy.

## Shared forest presentation boundary

The Alpha 0.3.10 candidate retains public `realm_forest_layout_v1` metadata and
`realm_forest_instance_v1` rows. They form one immutable visual catalog for the
preserved Genesis founding Lowlands: a reviewed layout version, exact layout and
asset-catalog digests, and 210 fixed-point tree selectors/transforms. They do
not contain FIDs, ownership, routes, resources, collision, or actions. The
outer generation-three world remains unpopulated until a separately reviewed
layout version is approved.

An admin-only, idempotent seeder accepts only the reviewed version/count/digest
and rejects unknown, duplicate, partial, or drifted rows before inserting a
missing canonical row. The player client renders a complete validated catalog
or no new forest layer. It never uses graphics quality, Gold occupation, wagon
motion, or a browser random generator to decide whether a shared tree exists;
quality selects only an immutable model LOD.

## Authentication presentation

FID is the only identity coordinate. Username, display name, biography, and PFP
are sanitized public presentation fields. A tab-scoped cache may restore those
fields only when its exact FID matches an authoritative cookie refresh; it
cannot restore a session or choose identity. Browser-bound S256 flow, rotating
HttpOnly session families, short-lived OIDC handoff, and SpacetimeDB admission
remain separate fail-closed gates.

Remote profile presentation is optional and fail-closed. Only reviewed
provider/path pairs or the fixed same-origin observer placeholder may enter the
bounded JPEG/PNG/static-WebP loader. It omits credentials and referrer, refuses
redirects, caps time, transfer bytes, dimensions, and decoded pixels, then draws
one temporary blob decode into a static canvas and disposes it. The DOM keeps a
local monogram fallback throughout; profile delivery never grants identity or
session authority.

## Client presentation

The player is built with React, TypeScript, Vite, Three.js/WebGL, and responsive
CSS. The title, menu, and realm share quality preferences while preserving
reduced-motion and non-WebGL fallbacks. Genesis readiness is validated before
the Realm appears. In the 0.3.10 candidate, the caller's private resource
projection and public Gold-site projection must also validate before the
public Realm subscription begins. The Food extension renders only a
complete validated public Food catalog and identity-minimized occupation view;
malformed or partial Food data never creates a permissive "available" node.
The
renderer uses the exact authoritative tile-key set, so the deliberate partial
ring is never expanded into invented cells, and bounds semantic detail work
deterministically as the radius-60 presentation envelope grows.

Founded keeps use one realm-lifetime castle/base prefab repository. Each
graphics profile pairs an integrity-pinned GameReady castle with its matching
authored landscape base, then shares those resources through instanced LOD
buckets. The pair loads and fails as one assembly. Selection, labels, camera
focus, culling, and disposal remain presentation concerns; authoritative
coordinates and ownership come only from the validated snapshot.

Runtime GLBs use immutable SHA-prefixed filenames plus exact length/hash checks.
The prior release's public castle paths retain their former bytes so cached
clients and rollback remain safe. Source packages stay offline; checked-in
runtime files, installers, dated manifests, and provenance records define the
reviewable asset boundary.

Concurrent castle/base byte requests share a transport only for the same
integrity-pinned URL and normalized timeout policy; individual cancellation
cannot abort another consumer, while the final pending cancellation stops the
transport. The mounted-Realm prefab repository coalesces LOD acquisitions,
owns one retain per cached entry, retires only after pending acquisitions and
active leases both reach zero, and disposes shared resources exactly once.
Retired or failed entries do not revive during that Realm lifetime. An empty
authoritative castle set reaches readiness with zero presented models.

The tree GLB family remains visual media, not map authority. The shared forest
tables are independently authored visual state: they select reviewed asset IDs
and fixed transforms, while the renderer derives only terrain-contact height.
Trees never enter picking, navigation, collision, ownership, economy, or
server gameplay rules.

## Local QA boundary

Unit and rendered-browser lanes cover readiness, responsive UI, WebGL models,
labels, picking, fallbacks, and cleanup. The optional macOS QA observatory is a
local, machine-bound test subsystem. Production build checks reject its broker,
fixture, endpoint, and procedure markers from Pages assets. It owns no Worker,
SpacetimeDB, player, or admission authority.

The migration proof uses disposable protocol-3 fixtures. It verifies that the
private resource table and versioned operations append without renumbering or
deleting deployed schema, separately proves the atomic 1,261-to-10,000 world
transition with preserved founding state and an idempotent target retry, and
then verifies the additive Gold-site, occupation, expedition, retry, and
schedule records. It is not a production publication.
Existing founders require a separate exact-count, idempotent Hermes backfill;
the v4 inspection returns only aggregate coverage and invariant counts, never
FIDs or balances.

The additive v6 proof extends that same lifecycle with public forest metadata
and instances at refs 25–26. It is not a production publication. The static
forest layout has its own guarded, idempotent admin seed; its verification
requires one layout row, exactly 210 instances, and the pinned layout/catalog
digests.

The additive v7 proof extends the same disposable lifecycle with the five Food
tables at refs 27–31, the 96-site digest-pinned Wheat Farm catalog, public
identity-minimized occupation, private retry/accrual state, and an internal-only
schedule target. It exercises Food/Gold coexistence and the raw passive-Food
reservation through collection and delayed lifecycle processing. This is local
evidence only, never production publication, Food-site seeding, or a deploy
authorization.

## Delivery

Semantic versions name release lines; an annotated tag and exact build SHA
identify a public deployment. Protected CI validates frontend behavior,
configuration, provenance, asset integrity, production exclusions, and additive
backend compatibility before Pages publishes. Worker and SpacetimeDB operations
remain separate release decisions.

For Alpha 0.3.10, the safe production order is additive module publication,
explicitly owner-approved founder backfill, explicit exact-state world
expansion, separately approved Gold-site, forest-layout, and Food-site setup,
generation-three plus resource-specific aggregate verification, exact reviewed
Pages deployment, then live build verification. Each mutable step is a separate
approval boundary. The v7 publication and exact 96-site Food setup do not
inherit authority from a Gold or forest setup, asset delivery, migration proof,
merge, or Pages build. Source completion or a client merge authorizes none of
those production operations. The custom domain and DNS remain untouched unless
separately authorized.

## Repository guide

- `src/components` — player presentation
- `src/farcaster` — identity-entry state and browser presentation boundary
- `src/spacetime` — generated client boundary
- `spacetimedb` — authoritative server module
- `services/auth-bridge` — independently verifying identity/session bridge
- `scripts` — build, asset, QA, and release tooling
- `docs` — current decisions, release records, recovery, and provenance

Start with the [README](../README.md), [product direction](design/warpkeep-direction.md),
[roadmap](design/roadmap.md), [verified Alpha 0.3.6 release notes](releases/alpha-0.3.6.md),
and the [Alpha 0.3.10 candidate notes](releases/alpha-0.3.10.md).
