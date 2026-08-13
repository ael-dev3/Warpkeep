# Inner Keep construction V1

The Inner Keep turns gathered resources into visible, persistent growth inside
the player's own castle. This document fixes the Alpha V1 product and authority
contract. The compatible client may ship through the existing protected-main
Pages workflow, but the implementation remains inactive until separately
reviewed publication, catalog seed, Builder backfill, runtime asset
verification, and activation steps are complete.

## Player loop

1. Enter **Inner Keep** from the Realm menu or the player's own castle record.
2. Select any valid ground inside the continuous buildable interior and choose
   one of four quarter-turn orientations.
3. Review one of six buildings, its exact cost, effect, footprint, and duration.
4. Confirm one construction or upgrade project.
5. The server settles stored resources, deducts the exact recipe, and occupies
   the castle's one internal Builder.
6. A scaffolded worksite and construction shroud remain visible until the
   authoritative completion is observed.
7. The completed building persists; completed economy levels discount their
   matching resource in later Inner Keep projects.

The four external gathering Workers remain independent. V1 has no queue,
second Builder, speedup, cancellation, demolition, relocation, refund, wallet,
token, payment, or Community Mark spending.

## Compound and placement

The palisade encloses a 96 x 80 meter compound. Its continuous authoritative
support rectangle is x `[-44, 44]` and z `[-40, 32]`, leaving a four-meter
interior wall setback.
Placement snaps to 0.5-meter increments and accepts only 0 / 90 / 180 /
270-degree rotations. The server checks the oriented footprint corners,
permanent road/civic exclusions, and every existing building before a project
can spend resources.

The initial town is intentionally mostly empty. Its permanent presentation is
limited to the palisade, gate, road spine, civic commons, and modest
non-functional civic dressing. City Barracks and Grand Covenant Cathedral are
not prebuilt landmarks: both are catalog choices that appear only after the
player places and constructs them. A castle can contain at most one instance
of each of the six building kinds, and an upgrade retains the building's
persisted transform.

A dirt apron, district lanes, staggered perimeter planting, and a rounded
terrain shoulder soften the wall edge without adding gameplay authority. The
retained `inner_keep_slot_v1` table is compatibility-only and must contain zero
rows.

The deterministic presentation manifest lives in
`src/components/inner-keep/innerKeepPresentationLayoutPolicy.ts`. It records the layout
ID and version, the empty compatibility-slot list, all 38 selected source asset
IDs, their exact content-addressed High/Balanced/Compact runtime paths,
constructible footprint templates, fixed civic transforms, scale, picking and
clearance roles, quality availability, road/wall clearances, and camera
presets. Its SHA-256 digest is
`533ff0c18624445af874f97b71d1d3ae4c6cb4a61f8b7732ba905ee10a61b443`.

The server's compact free-placement policy includes that presentation digest,
so the client and activation tooling pin combined layout digest
`1b3a452794c28f8d7f8814ce6064da8582725d34bb0ee0271d51f40c2fbdfad7`.
The presentation-only palisade correction is independently pinned at
`e3a6e117e7610cb942432c18d0c1ce38485a5c3b6e37069bdc07787e7ef273a8`.
Decorative transforms remain client presentation data; player building
transforms are integer server state and are revalidated authoritatively.

## Buildings

| Building | Level-1 recipe (Food / Wood / Stone / Gold) | Completed effect |
| --- | ---: | --- |
| City Mill | 300 / 900 / 600 / 0 | Food construction cost −5% per level |
| Lumber Camp | 500 / 700 / 650 / 0 | Wood construction cost −5% per level |
| City Stoneworks | 500 / 900 / 450 / 0 | Stone construction cost −5% per level |
| City Goldworks | 700 / 1,200 / 1,000 / 500 | Gold construction cost −5% per level |
| City Barracks | 800 / 1,600 / 1,400 / 300 | No V1 construction discount |
| Grand Covenant Cathedral | 1,200 / 1,800 / 3,200 / 1,200 | No V1 construction discount |

Each building has five completed levels, for thirty exact level-policy rows.
Only a completed economy level grants a discount. Its matching discount is 500
basis points per completed level and is capped at 2,500 basis points. A
building's completed level applies to the matching resource portion of its own
next upgrade. Barracks and Cathedral use no matching resource, grant zero
discount basis points, and remain placement/construction outcomes rather than
initial scenery. Effects do not alter passive production, Worker gathering,
expeditions, existing balances, or Marks.

## Costs and time

Target-level multipliers are exact integers:

| Target level | Multiplier | Duration |
| ---: | ---: | ---: |
| 1 | 10,000 bps | 24 hours |
| 2 | 22,400 bps | 48 hours |
| 3 | 37,632 bps | 78 hours |
| 4 | 56,197 bps | 112 hours |
| 5 | 78,676 bps | 151 hours |

The documented, inactive continuation is 196, 247, 305, 370, and 444 hours
for Levels 6–10. V1 neither exposes nor accepts those levels.

For each resource, the server multiplies the Level-1 base by the target-level
multiplier, divides by 10,000, and rounds upward to the next ten whole
resources. It then applies the matching completed-building discount and rounds
upward to ten again. All authority uses checked integer arithmetic. The exact
effective deduction is recorded in a caller-private receipt. The policy digest
binds the 10,000-basis-point denominator, ten-resource rounding quantum, every
multiplier, discount, base recipe, duration, and balance cap.
The reviewed V1 policy digest is
`cbffcdc223b5d99625cab7549f3a5ae211c725893574b629aa83f8260668a779`.

The server starts the timer at the reducer timestamp. Construction continues
offline and finishes through a scheduled reducer. A later authoritative Inner
Keep entry read can reconcile exactly one caller-owned, canonical overdue
project when the component is active and the Worker backend is ready. Before
the deadline, a missing schedule fails closed without mutation. Deactivated
entry reads are also mutation-free. Browser clocks only present time remaining
and cannot grant completion.

## Affordability audit

`npm run report:inner-keep-affordability` covers all 42 combinations of the six
Level-1 buildings and seven current terrain-rate profiles. Its review must
account for the generic roster's ability to assign multiple Workers to one
resource; travel remains excluded from the minute estimate and must stay a UI
caveat. Only resources already settled into the authoritative account can
enable Build.

No first choice requires a completed Inner Keep discount, so no building is a
mathematical prerequisite. Goldworks, Barracks, and Cathedral require explicit
Gold gathering because passive terrain Gold remains zero. The largest raw
Level-5 resource component is 25,180, or 2.518 percent of the 1,000,000 account
cap.

## Authority and privacy

Public state contains only the versioned layout/catalog, the empty compatibility
slot table, and each castle building's kind, local X/Z microunits, quarter-turn
rotation, completed and target levels, phase, public timestamps, and revision.
The absence of a building row means that building kind has not been built.

Caller-private state contains Builder ownership, the active project pointer,
exact receipts and request keys, deducted costs, and resource balances. A
player command supplies a building kind, integer local X/Z transform,
quarter-turn rotation, bounded idempotency key, `expectedTargetLevel`, canonical
decimal `expectedProjectRevision`, `expectedPolicyDigest`, and
`expectedLayoutDigest`. The four expected values are untrusted
quote-and-placement-binding compare-and-set assertions. SpacetimeDB derives the
FID, castle, current target, current policy digest, and current layout digest
from authority. After a prior accepted receipt has short-circuited
idempotently, a new request first verifies the policy and layout digests, then
transactionally reconciles an exact overdue project before checking the target
and aggregate-revision assertions against that reconciled graph. Any mismatch
rolls the whole reducer back, so no reconciliation, settlement, or deduction
commits. A current request then derives costs, discounts, time, settlement, and
outcome.

Starting a project validates the single Builder, grid, rotation, support
boundary, permanent exclusions, oriented footprint collisions, uniqueness,
level cap, and quote-binding assertions before materializing authoritative
Worker/resource settlement. Active expedition reservation capacity remains
preserved. The server then validates stored balances. Resource deduction,
project state, Builder state, schedule, and transform-bound receipt commit as
one transaction or not at all. Replaying the same accepted request returns the
same result and cannot deduct twice; an upgrade cannot relocate or rotate its
persisted building.

## Presentation contract

Portrait Mini App presentation is primary: header and resources at the top,
the compound in the main area, one reachable Builder bar at the bottom, and a
contextual sheet for placement, build, and upgrade details. Desktop uses the
same controller with a persistent right-side panel.

Every catalog choice and persisted building has a native accessible control
independent of WebGL picking. If 3D initialization or a required asset fails,
a functional placement schematic retains the same six-building catalog,
valid-ground policy, resources, Builder timer, and guarded actions. Reduced
motion uses a static construction shroud.

Accepted placement and build-menu routes use one bounded light host cue. A newly
observed authoritative project uses one restrained confirmation cue, and a
constructing-to-complete transition uses one success cue while the player is
viewing. Repeated gestures are suppressed, the effects mute setting also mutes
these haptics, and visible plus screen-reader feedback never depends on them.

The world and Inner Keep share the existing Realm canvas, renderer, quality
preference, recovery path, and animation scheduler. Entering the Inner Keep
must not create another WebGL context or animation loop. The finished model is
not instantiated visibly while the public project is constructing. If the
model is not ready at completion, the worksite remains until it is safe to
reveal without an empty or white frame.

Portrait framing uses a raised front-facing fit that keeps the complete
compound and east drain on screen at the 390 x 844 reference viewport. The
camera accepts only a nine-meter focus offset in either world axis and tracks
screen-space drags at a reduced ratio. Drag motion is mapped through the
current screen basis so horizontal and vertical
gestures remain direct, while orientation changes select the correct camera
rig and preserve the player's bounded focus and manual zoom intent.

## Living presentation and budgets

The exact static selection renders a mostly empty civic shell around continuous
buildable ground. Its fixed pieces establish the walls, gate, central road,
commons, lighting, signs, benches, and restrained dressing without placing any
of the six functional buildings. High quality presents all 20
selected ambient actors: eight citizens and twelve patrol units, including six
mounted characters. Balanced and Reduced retain smaller deterministic casts.
Civic routines use only Greet, Idle, Walk, and Work. Patrols use Idle and Walk;
combat clips are excluded. Conversation bubbles and every ambient identity are
synthetic presentation, never player chat or server state.

The detailed ecology layer continues across a 144 x 144 meter estate with nine
named topographic features. A separate 416 x 544 meter, presentation-only
countryside ring carries deterministic field colors, crop tufts, and sparse
hedgerows into the scene fog. It shares the detailed terrain edge exactly but
never participates in picking, navigation, resources, routes, or placement.
Its independently reviewed presentation digest is
`20e1a2f00edbaee520aa96f67d651721da6786e29c19d555fa7bfda161e9eacc`;
the digest source-binds the canonical layout before recording the overscan and
its stricter renderer-only pan subset. The canonical portrait pose is raised
and steepened so tall viewports keep their ground rays inside the reviewed
near/far range instead of exposing a background edge.
The complete wall footprint remains on an exact level,
rounded plateau. Its five-meter corners and 5.5-meter feather blend into
ridges, stone shelves, meadows, woodland margins, and a south-eastern lake.
One strictly downhill watercourse runs from its north-eastern headwater, along
the east-wall rill, and into that lake. It is still rendered as two logical
water surfaces, so water detail stays bounded.

Grass, actors, trees, wildlife, resource scenery, roads, and the wagon all use
the same deterministic terrain-height sampler. Grass clears fixed authored
footprints, persisted buildings, water banks, unsafe slopes, central and district
roads, routes, and the four leveled scenic resource pads. The outer patrol road
detours around both the headwater and lake, keeping its complete surface dry.
It carries existing mounted and foot characters beyond the walls without
creating another population or claiming unit authority.

| Quality | Actors (mounted / patrol) | Compound trees | Grass | Max active fps | Scene graph max (draws / triangles) | Renderer evidence max (draws / triangles) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| High | 20 (6 / 12) | 18 | 3,000 | 30 | 650 / 900,000 | 1,000 / 1,200,000 |
| Balanced | 12 (4 / 6) | 12 | 1,800 | 24 | 550 / 520,000 | 700 / 750,000 |
| Reduced | 8 (2 / 4) | 6 | 600 | 18 | 400 / 250,000 | 450 / 350,000 |

The exterior has its own quality budget:

| Quality | Authored trees across eight species | Scenic resource structures | Rabbits | Trade wagons | Far crop tufts / hedgerow trees |
| --- | ---: | ---: | ---: | ---: | ---: |
| High | 72 | 8 | 10 | 1 | 320 / 32 |
| Balanced | 44 | 6 | 7 | 1 | 192 / 20 |
| Reduced | 22 | 4 | 4 | 1 | 96 / 10 |

The four resource families and supply wagon are presentation-only uses of the
reviewed Warpkeep-Assets runtime models. High and Balanced use their Balanced
outer-estate LODs so the compound keeps the close-detail budget; Reduced uses
Compact. These models do not create gathering sites, balances, assignments,
collision, or production. Rabbits prefer the exact optional three-LOD
[`rabbit-runtime-ui-bundle-2026-07-30`](https://github.com/ael-dev3/Warpkeep-Assets/releases/tag/rabbit-runtime-ui-bundle-2026-07-30)
selection and use a bounded procedural rabbit fallback when it is unavailable.
That fallback preserves the same 10 / 7 / 4 count and deterministic anchors;
the [exact selection record](../reference/assets/2026-07-30-lowlands-rabbit/)
retains its narrow authorization and license boundary.

Reduced quality uses static population and ecology presentation. Explicit
reduced motion sets the animation cap to zero. Fixed static instancing is
budgeted at 90 / 89 / 80 draws and 142,916 / 78,532 / 37,523 triangles for
High / Balanced / Reduced. Population models are separately capped at
207 / 131 / 78 draws and 65,000 / 40,000 / 16,000 triangles before the
combined scene ceilings above are enforced.

Runtime loading uses one globally bounded, static-first queue. Each asset gets
one transient retry. Abort drains and disposes every request, and a weaker
retry cannot replace a stronger settled bundle. The authored static scene
appears only with complete exact static coverage, so procedural and authored
static scenery never mix. Population may retain the strongest verified partial
coverage. A terminal missing completed-building prefab falls back to the
bounded procedural completed model rather than leaving a permanent scaffold.
The exterior keeps separate terrain, tree, resource, wagon, and wildlife
status. One optional family can degrade to its own bounded fallback without
removing the compound or another healthy family. Quality budgets cap each
layer independently before the combined scene ceiling is enforced.

## Asset boundary

The selected source is the exact
`inner-keep-3d-asset-library-2026-08-02-v1.zip` release attachment, 234,962,670
bytes with SHA-256
`f13bc9e7b8e32a6767b1959307a202d894123f384e11fd19550d75e0dfe5f6c9`.
The reviewed selection contains 38 selected assets across six families, 114
High/Balanced/Compact GLBs, and six previews. Its language-neutral parsed-JSON digest is
`cf1fdac091e310cce3362d43403be938fe7946e46df906f2efb8cff601497c6d`.
The bounded installer verifies the attachment and extracts only that allowlist
into content-addressed runtime paths.

The exact owner authorization recorded on 2026-08-04 permits those files in the
public Warpkeep repository and official runtime. Its historical instruction
described the Grand Covenant Cathedral as the main building and the Barracks as
a garrison anchor. Later reviewed product direction keeps those exact authorized
assets but makes both player-built outcomes rather than prebuilt anchors; this
changes presentation/placement policy, not the authorization scope. The
presentation manifest pins their installed paths and constructible footprints;
the current procedural scene remains the fail-closed visual fallback while an
asset loads or if WebGL initialization fails.

This exact-use authorization does not relicense the mixed-source archive,
grant general derivative or redistribution rights, authorize substitutes, or
approve activation, merge, or deployment.

The separately reviewed population selection contains 20 actors and 40
content-addressed Balanced/Compact GLBs at digest
`79237fbe85a4db7a0592eb0c27cc00f8e72e85e58be867bec4dd35992f0b87f7`.
It is sourced from the 2026-08-03 Citizens and Unit Corps releases and is
authorized only for this public repository and official client. The complete
archive pins, per-file hashes, animation contracts, and unchanged license
limits live in the
[dated population record](../reference/assets/2026-08-04-inner-keep-population/).

## Release gates

`npm run qa:inner-keep` runs the dedicated local-only synthetic presentation
matrix. Its 18 cases add a High living compound and an active civic
conversation to the empty compound, completed Levels 1–5, construction at
1/50/99 percent, authoritative completion reveal, occupied Builder,
insufficient-resource, compact-quality, reduced-motion, missing-asset, and
functional 2D-fallback cases. The browser probe reuses the reviewed
signed-Chrome, private DevTools-pipe, and exact-loopback guards. It captures
only synthetic screenshots in memory and reports aggregate counts and
booleans. WebGL cases require one live renderer, one context, one animation
owner, zero slot pads, zero slot controls, six catalog controls when the
catalog is open, the exact living-scene counts, and both scene-graph and
post-render GPU counters under the tabled ceilings. The 2D case requires zero
WebGL allocation and the same functional catalog/placement authority.

The page at `/dev/inner-keep-qa.html` is a Vite-development entry guarded by
`assertLocalQaRuntime`. It is not a production build input, and the production
output verifier rejects its path, source markers, and scenario manifest.

Merging source code to protected `main` triggers the existing verified Pages
deployment, with the Inner Keep entry still hidden. It does not activate
construction. Backend module publication, catalog seed, Builder backfill,
activation, and production smoke testing remain separate owner-reviewed
actions. The rollback is forward-safe: deactivate new starts, hide entry,
retain every row and deducted resource, and allow valid active schedules to
finish or be repaired through a separately reviewed path. There is no
destructive schema rollback.
