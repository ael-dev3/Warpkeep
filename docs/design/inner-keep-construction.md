# Inner Keep construction V1

The Inner Keep turns gathered resources into visible, persistent growth inside
the player's own castle. This document fixes the Alpha V1 product and authority
contract. The compatible client may ship through the existing protected-main
Pages workflow, but the implementation remains inactive until separately
reviewed publication, catalog seed, Builder backfill, asset authorization, and
activation steps are complete.

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

The canonical layout contains one central keep, a gate and perimeter, a road
and plaza spine, eight medium economy-capable slots, and four large reserved
future slots. All twelve slots are visible from the first release. The browser
renders deterministic decorative scenery, but the server accepts only a fixed
slot ID and footprint class; it never accepts coordinates or transforms.

The four large slots are visible, reserved, and non-actionable in V1. A castle
can contain at most one instance of each actionable building kind.

The deterministic presentation manifest lives in
`src/components/inner-keep/innerKeepPresentationLayoutPolicy.ts`. It records the layout
ID and version, all twelve slot transforms, all 36 selected source asset IDs,
their exact content-addressed High/Balanced/Compact runtime paths, fixed and
slot-relative transforms, scale, footprint, picking and clearance roles,
quality availability, road/slot/wall clearances, and camera presets. Its
SHA-256 digest is
`96c20cac900e02234e53b36a15069d4e7c12057e5f1737c183f6c31cdb38b8b6`.

The server's compact slot-policy digest includes that presentation digest, so
the client and activation tooling pin the combined layout digest
`dc314255b0046f5b43be836b52ab4b7af94a2d25992031f75aee89b1a81490c7`.
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
effective deduction is recorded in a caller-private receipt.

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
player command supplies only a canonical slot ID, building kind, and bounded
idempotency key. SpacetimeDB derives the FID, castle, level, costs, discounts,
time, and outcome.

Starting a project first materializes authoritative Worker/resource settlement
while preserving active expedition reservation capacity. It then validates the
single Builder, slot, footprint, uniqueness, level cap, and stored balances.
Resource deduction, project state, Builder state, schedule, and receipt commit
as one transaction or not at all. Replaying the same accepted request returns
the same result and cannot deduct twice.

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

## Asset boundary

The selected source is the exact
`inner-keep-3d-asset-library-2026-08-02-v1.zip` release attachment, 234,962,670
bytes with SHA-256
`f13bc9e7b8e32a6767b1959307a202d894123f384e11fd19550d75e0dfe5f6c9`.
The reviewed selection contains 36 selected assets across five families, 108
High/Balanced/Compact GLBs, and four previews. Its language-neutral parsed-JSON digest is
`6763aeb1755d800b817a0d5174182474d3836a928c59beb4b4fdf65f5d1f6ec3`.
The bounded installer verifies the attachment and extracts only that allowlist
into content-addressed runtime paths.

The presentation manifest records those paths as planned data for review; it
does not install, fetch, or authorize an asset. The current procedural scene
remains the fail-closed visual fallback while runtime use is pending. An
authorized asset integration must implement the same pinned transforms and
combined digest rather than inventing an unreviewed placement at load time.

The release record does not itself authorize copying archive-only files into
the public Warpkeep runtime. No selected GLB or preview may be committed until
an exact owner authorization record covers the public repository and official
runtime. This is an integration-use gate, not a relicensing request.

## Release gates

`npm run qa:inner-keep` runs the dedicated local-only synthetic presentation
matrix. Its 16 cases cover an empty compound, completed Levels 1–5,
construction at 1/50/99 percent, the authoritative completion reveal, occupied
Builder and insufficient-resource states, compact quality, reduced motion,
missing optional art, and the functional 2D fallback. The browser probe reuses
the reviewed signed-Chrome, private DevTools-pipe, and exact-loopback guards.
It captures only synthetic screenshots in memory and reports aggregate counts
and booleans. WebGL cases require one renderer, one context, one animation
owner, twelve scene pads, and twelve native controls; the 2D case requires no
WebGL allocation and the same twelve controls.

The page at `/dev/inner-keep-qa.html` is a Vite-development entry guarded by
`assertLocalQaRuntime`. It is not a production build input, and the production
output verifier rejects its path, source markers, and scenario manifest.

Merging source code to protected `main` triggers the existing verified Pages
deployment, with the Inner Keep entry still hidden. It does not activate
construction. Publication, catalog seed, Builder backfill, activation, smoke
testing, and any asset-use authorization remain separate owner-reviewed
actions. The rollback is forward-safe: deactivate new starts, hide entry,
retain every row and deducted resource, and allow valid active schedules to
finish or be repaired through a separately reviewed path. There is no
destructive schema rollback.
