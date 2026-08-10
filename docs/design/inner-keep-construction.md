# Inner Keep construction V1

The Inner Keep turns gathered resources into visible, persistent growth inside
the player's own castle. This document fixes the Alpha V1 product and authority
contract. The compatible client may ship through the existing protected-main
Pages workflow, but the implementation remains inactive until separately
reviewed publication, catalog seed, Builder backfill, runtime asset
verification, and activation steps are complete.

## Player loop

1. Enter **Inner Keep** from the Realm menu or the player's own castle record.
2. Select one of eight medium construction slots.
3. Review one of four economy buildings, its exact cost, effect, and duration.
4. Confirm one construction or upgrade project.
5. The server settles stored resources, deducts the exact recipe, and occupies
   the castle's one internal Builder.
6. A scaffolded worksite and construction shroud remain visible until the
   authoritative completion is observed.
7. The completed building persists and discounts the matching resource in
   later Inner Keep projects.

The four external gathering Workers remain independent. V1 has no queue,
second Builder, speedup, cancellation, demolition, relocation, refund, wallet,
token, payment, or Community Mark spending.

## Compound and slots

The canonical presentation uses the Grand Covenant Cathedral as its permanent
northern main-building anchor, with the Barracks to the west, a gate and
perimeter, a road and plaza spine, eight medium economy-capable slots, and four
large reserved future slots. All twelve slots are visible from the first
release. The browser renders deterministic decorative scenery, but the server
accepts only a fixed slot ID and footprint class; it never accepts coordinates
or transforms.

The palisade encloses a 40.4 x 36 meter compound, about 1,454 square meters.
The re-spaced build pads retain at least 0.2 meters of proved separation for
the largest Level-5 economy-building footprints. A dirt apron, district lanes,
staggered perimeter planting, and a rounded terrain shoulder soften the wall
edge without adding collision or gameplay authority.

The four large slots are visible, reserved, and non-actionable in V1. A castle
can contain at most one instance of each actionable building kind.

The deterministic presentation manifest lives in
`src/components/inner-keep/innerKeepPresentationLayoutPolicy.ts`. It records the layout
ID and version, all twelve slot transforms, all 38 selected source asset IDs,
their exact content-addressed High/Balanced/Compact runtime paths, fixed and
slot-relative transforms, scale, footprint, picking and clearance roles,
quality availability, road/slot/wall clearances, and camera presets. Its
SHA-256 digest is
`0a976765d6f6e740eb6282fca90f59b412ecbd7ed382f001da89a0b7abeca756`.

The server's compact slot-policy digest includes that presentation digest, so
the client and activation tooling pin the combined layout digest
`dec272175dc96085b26d2bc96125e77c6433331c698f150d80dfbbb4881ee3d7`.
Decorative transforms remain client presentation data rather than database
rows, and the browser never sends a transform to construction authority.

## Buildings

| Building | Level-1 recipe (Food / Wood / Stone / Gold) | Completed effect |
| --- | ---: | --- |
| City Mill | 300 / 900 / 600 / 0 | Food construction cost −5% per level |
| Lumber Camp | 500 / 700 / 650 / 0 | Wood construction cost −5% per level |
| City Stoneworks | 500 / 900 / 450 / 0 | Stone construction cost −5% per level |
| City Goldworks | 700 / 1,200 / 1,000 / 500 | Gold construction cost −5% per level |

Each building has five completed levels. Only a completed level grants an
effect. The matching discount is 500 basis points per completed level and is
capped at 2,500 basis points. A building's completed level applies to the
matching resource portion of its own next upgrade. Effects do not alter
passive production, Worker gathering, expeditions, existing balances, or Marks.

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

The server starts the timer at the reducer timestamp. Construction continues
offline and finishes through a scheduled reducer. A later authoritative Inner
Keep entry read can reconcile exactly one caller-owned, canonical overdue
project when the component is active and the Worker backend is ready. Before
the deadline, a missing schedule fails closed without mutation. Deactivated
entry reads are also mutation-free. Browser clocks only present time remaining
and cannot grant completion.

## Affordability audit

`npm run report:inner-keep-affordability` checks all 28 combinations of the
four Level-1 buildings and seven current terrain-rate profiles. Starting from
zero stored resources, each recipe fits within one day of passive production
plus concurrent deliberate Worker gathering at the current one-resource-per-
minute rate. Travel is deliberately excluded from the minute estimate and must
remain a UI caveat; only resources already settled into the authoritative
account can enable Build.

All four first choices remain reachable on every terrain without a completed
Inner Keep discount, so none is a mathematical prerequisite. Goldworks always
requires an explicit Gold assignment. The largest raw Level-5 resource
component is 9,450, below one percent of the 1,000,000 account cap.

## Authority and privacy

Public state contains only the fixed layout and catalog plus each castle's
building kind, slot, completed and target levels, phase, public timestamps, and
revision. The absence of a building row means the slot is empty.

Caller-private state contains Builder ownership, the active project pointer,
exact receipts and request keys, deducted costs, and resource balances. A
player command supplies a canonical slot ID, building kind, bounded idempotency
key, `expectedTargetLevel`, canonical decimal `expectedProjectRevision`, and
`expectedPolicyDigest`. The three expected values are untrusted quote-binding
compare-and-set assertions. SpacetimeDB derives the FID, castle, current target,
and current policy digest from authority. Before a new mutation, it verifies the
three assertions, then derives costs, discounts, time, settlement, and outcome.

Starting a project validates the single Builder, slot, footprint, uniqueness,
level cap, and quote-binding assertions before materializing authoritative
Worker/resource settlement. Active expedition reservation capacity remains
preserved. The server then validates stored balances. Resource deduction,
project state, Builder state, schedule, and receipt commit as one transaction or
not at all. Replaying the same accepted request returns the same result and
cannot deduct twice.

## Presentation contract

Portrait Mini App presentation is primary: header and resources at the top,
the compound in the main area, one reachable Builder bar at the bottom, and a
contextual sheet for slot, build, and upgrade details. Desktop uses the same
controller with a persistent right-side panel.

Every slot and building has a native accessible control independent of WebGL
picking. If 3D initialization or a required asset fails, a functional 12-slot
schematic retains the same catalog, resources, Builder timer, and guarded
actions. Reduced motion uses a static construction shroud.

Accepted slot and build-menu routes use one bounded light host cue. A newly
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

Portrait framing uses a front-facing fit that keeps every authored building
and the full east drain on screen at the 390 x 844 reference viewport, with at
least 10 CSS pixels of measured edge clearance. After the player pans or
zooms, resize and orientation changes preserve that choice instead of snapping
the camera back to its initial pose.

## Living presentation and budgets

The exact static selection renders 76 fixed authored placements around the
twelve canonical slot pads. The Cathedral remains the northern focal point and
the Barracks remains the western garrison. High quality presents all 20
selected ambient actors: eight citizens and twelve patrol units, including six
mounted characters. Balanced and Reduced retain smaller deterministic casts.
Civic routines use only Greet, Idle, Walk, and Work. Patrols use Idle and Walk;
combat clips are excluded. Conversation bubbles and every ambient identity are
synthetic presentation, never player chat or server state.

The ecology layer now continues across a 68 x 76 meter estate with nine named
topographic features. The complete wall footprint remains on an exact level,
rounded plateau. Its five-meter corners and 5.5-meter feather blend into
ridges, stone shelves, meadows, woodland margins, and a south-eastern lake.
One strictly downhill watercourse runs from its north-eastern headwater, along
the east-wall rill, and into that lake. It is still rendered as two logical
water surfaces, so water detail stays bounded.

Grass, actors, trees, wildlife, resource scenery, roads, and the wagon all use
the same deterministic terrain-height sampler. Grass clears fixed authored
footprints, reserved slots, water banks, unsafe slopes, central and district
roads, routes, and the four leveled scenic resource pads. The outer patrol road
detours around both the headwater and lake, keeping its complete surface dry.
It carries existing mounted and foot characters beyond the walls without
creating another population or claiming unit authority.

| Quality | Actors (mounted / patrol) | Compound trees | Grass | Max active fps | Scene graph max (draws / triangles) | Renderer evidence max (draws / triangles) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| High | 20 (6 / 12) | 18 | 2,400 | 30 | 390 / 420,000 | 750 / 720,000 |
| Balanced | 12 (4 / 6) | 12 | 1,400 | 24 | 310 / 215,000 | 380 / 260,000 |
| Reduced | 8 (2 / 4) | 6 | 480 | 18 | 235 / 110,000 | 260 / 130,000 |

The exterior has its own quality budget:

| Quality | Authored trees across six species | Scenic resource structures | Rabbits | Trade wagons |
| --- | ---: | ---: | ---: | ---: |
| High | 72 | 8 | 10 | 1 |
| Balanced | 44 | 6 | 7 | 1 |
| Reduced | 22 | 4 | 4 | 1 |

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
budgeted at 91 / 90 / 81 draws and 204,592 / 105,632 / 52,013 triangles for
High / Balanced / Reduced. Population models are separately capped at
207 / 131 / 78 draws and 65,000 / 40,000 / 16,000 triangles before the
combined scene ceilings above are enforced.

Runtime loading uses one globally bounded, static-first queue. Each asset gets
one transient retry. Abort drains and disposes every request, and a weaker
retry cannot replace a stronger settled bundle. The authored static scene
appears only with complete exact static coverage, so procedural and authored
landmarks never mix. Population may retain the strongest verified partial
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
`00304c5dbf819cec6cb656996c1105f64efcf36acf8099c431f5b04b822679f0`.
The bounded installer verifies the attachment and extracts only that allowlist
into content-addressed runtime paths.

The exact owner authorization recorded on 2026-08-04 permits those files in the
public Warpkeep repository and official runtime, with the Grand Covenant
Cathedral as the main northern visual anchor and the Barracks as the western
garrison. The presentation manifest pins their installed paths and transforms;
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
owner, twelve scene pads, twelve native controls, the exact living-scene
counts, and both scene-graph and post-render GPU counters under the tabled
ceilings. The 2D case requires zero WebGL allocation and the same twelve
controls.

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
