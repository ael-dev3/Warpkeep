# Gameplay and visual implementation notes

Updated 2026-09-11 against the current PR #228 development branch at
`246d85ca72c171b8fd98a6c92e1b585463e03f15`; the functional source-bound
checkpoint remains `7a542a33` and the inspected working files are synchronized
with that branch. Earlier source hashes below remain dated evidence anchors,
not current review targets.
This refresh includes the focused Keep04 UI/scene run (161 tests across eight
files), including the accessible Worker Outbound → Gathering → Returning journey
rail and the reproducible Desktop handoff command; it has
no authenticated owner session or production call. Earlier executed results
keep their original source and limitations in the [execution handoff](execution-handoff.md).
The [visual foundation contract](visual-foundation-contract.md) is the short
reference-to-source decision layer for continuing the mobile presentation pass;
the complete URL and provenance inventory remains in the Desktop handoff.
The earlier `1600f4b` audit is the origin of findings G01–G03 and V01–V02;
G01 is now fixed in source by `555e505` and is not unfinished implementation.
The 2026-09-08 continuation update below supersedes G02's implementation gap;
its [executed evidence](../../evidence/0.4.0/isolation-lifecycle.md) has separate
source, test and browser limits from this original inspection.

The six-family progression matrix is now covered in source tests for every
policy building kind at levels 1–5, including authored-prefab footprint bounds
and fallback silhouettes. The 97-test focused building/visual run passed after
expanding the authored-prefab coverage; rendered browser review remains distinct
from physical-device and authenticated-owner acceptance.

The current product is **gather → choose → build → benefit → return**: gather
spendable resources, make a meaningful building choice, see the keep change,
and use the completed improvement on a later journey or project. Read
[product direction](../../design/warpkeep-direction.md) for the player promise;
this page keeps precise mechanics, implementation routes and evidence limits.

## Visual foundation and complete reference coverage

At the current published visual source checkpoint `5b9ba9657d6e66319f41aabd396faf2a6c947b29` (functional renderer/UI source `211b0b1a`), the owner direction prioritizes a professional mobile visual
foundation with simple interaction. Preserve the useful existing loop; deeper
simulation and elaborate editing remain later work. The full Desktop handoff
reference library informs one coherent Verdant Citadel, rather than a collection
of imported mechanics or rendering engines.

The current narrow-screen surface now presents resources as two readable columns
with safe-area padding and keeps the same scene, schematic and command order as
desktop. The visual treatment adds restrained depth and contrast to the resource,
scene and action surfaces without changing gameplay authority, renderer budgets or
the existing touch and keyboard gestures.

Incoming resource cards now carry a restrained violet edge and label while their
spendable balance stays prominent. This borrows the handoff's strategy-clarity
lesson without adding a second economy view or changing when returned resources
become spendable. Active Worker cards also name each reserved result and resource,
and expose that status as a polite update for assistive technology,
so a player can connect the aggregate pending rail to the journey that will unlock it.

Published forest grouping and moss/earth terrace tops improve separation between
buildings and their setting. The current source-render matrix covers empty,
mature, legal placement, blocked placement, construction, completion and
schematic fallback at desktop and 390px portrait profiles. The portrait WebGL
canvas uses the available scene-panel width while the toolbar remains padded;
desktop, short-landscape and fallback geometry are unchanged. Focused
scene/dressing tests and types passed. These captures use the actual Keep04
renderer with synthetic state and software rendering; they do not prove
physical-phone performance or authenticated owner usability.

The mapping below records lessons from the supplied handoff research, not a new
live audit of external projects. It retains open art questions rather than claiming
that every reference has already received final visual acceptance. Abbreviations
identify actual 0.4 owners: **K** keep composition, **B** building assembly,
**P** visual profile/camera, **H** scene host/lifecycle, **A** Greater Realm atlas,
**W** greaterRealmWaterSurface, **U** keep panels and gameplay presentation.
See the source routing table below for their entry points.

| Reference(s), all preserved from handoff | Existing 0.4 implementation | Visible gap/question | Mobile-conscious application now |
|---|---|---|---|
| Owner Astra voxel-engine Reddit | K/A use existing bounded greedy mesher and generated dressing | Meshing exists; surface rhythm and chunky joins still need art review | Refine a few material groups and terrace edges; retain bounded merged faces, no editable terrain |
| Owner Verdant Forest | K has tinted, instanced tree groups with curated gaps and near/far separation | Review remaining repetition against building silhouettes and selected-site views | Preserve layered composition and profile budgets while refining only visibly repetitive groups |
| Owner Pelagic Ocean | W now supplies two broad swells, fine ripple, teal/sky accents | Actual atlas-distance highlight scale and calm shoreline still need comparison | Tune existing single-pass slope/color amplitude at matching camera; preserve reduced branch and unchanged wet-cell footprint |
| Owner Dream Loop + Vesper demo | Representative scene harness plus the current 390/600/1440 comparison workflow exist | The latest matrix now has a coherent keep target; a final retained critique and physical-device comparison remain | Keep matching-resolution captures, independent concise critique and carried-forward issues; no realism mandate or arbitrary numeric gate |
| TUMBLE meadow | K instancing; A feature batching/quality limits | Meadow-to-forest transition and selective quiet areas need composition attention | Sparse authored foreground clumps and one shared motion rhythm only where visible; no wildlife simulation |
| The Long Silence | H pauses hidden work and respects reduced motion | Constant visual activity can obscure status even without audio | Keep broad quiet regions and finite confirmed-completion emphasis; sound design remains a later opt-in layer |
| Starfall | Separate scene host, profile and presentation-plan owners | Scene, HUD and selected target need a shared hierarchy at narrow size | Reserve negative space and contrast for selections; retain existing gesture and performance boundaries |
| Operation Ironhold | U exposes travel/gather/return; atlas owns journey visualization | Journey feedback can compete with terrain rather than read over it | One consistent route/activity accent and phase styling from current state; no new automation mechanics |
| Three.js Water Pro | W already avoids expensive ocean geometry | Rivers currently share broad water language; directional distinction merits a capture | Restrained directional visual cues for returned river/stream data; no new fluid simulation/reflection stack |
| Snowflow | A includes Frostmere palette and authoritative regional data | Cold ground can read as a flat biome tint | A few stable pale top-facing/retained-snow groups in presentation only; no weather simulation |
| Desert Dusky | A Sunscar warm palette and bounded props | Warm regions need silhouette and value hierarchy, not uniform orange | Layer two or three terrain tones, sparse silhouettes and quiet open space using existing geometry |
| SimonDev material demonstrations | K/P standard materials and directional lighting; A vertex colors | Material response can look uniformly rough/flat | Distinguish masonry, roof and timber through restrained roughness/value changes before adding textures |
| Procedural Terrains demo + ZyFou engine | A uses authoritative heights/presentation plans and streaming | Large-scale landform readability is more important than local noise | Shape visual bands from existing elevation; precompute display detail, do not replace world geography |
| three-stylized + stylized-components | K instancing and A batched terrain/features | Grass/ground cover should bridge forms without hiding targets | Study inexpensive instanced silhouettes and coherent wind; do not install whole shader packages by default |
| Selo Empire | U already distinguishes costs, incoming/confirmed return, Builder busy and benefit | Visual hierarchy across these explanations can still be too text-heavy | Consistent resource icons, spacing and status tone; preserve actual semantics and offline progression, no logistics expansion |
| Widelands | U separates spendable return from estimates; catalog deficits | “On the way” and available resources need instantly different presentation | Small visual grouping and contextual explanation within existing panels; no economy dashboard |
| Townscaper | B six families; K 0.45s scale reveal and bounded merged masonry courses per completed level | Authored models need a level cue that survives the overview camera | The level expression stays inside fixed footprints, uses one static merged presentation layer, and adds no freeform building system |
| Tiny Glade | Pale stone, dark timber, teal roofs, warm scaffold light, reused authored assets | Six buildings and ground props must feel like one authored place | Harmonize proportions/material groups and contact with ground; completed-level courses now support the mobile silhouette without per-frame work |
| Red Blob Mapgen4 | A regional colors, river/stream plans, coast cells and chunks | Macro geography may lose priority amid repeated decorative detail | Strengthen river/coast/ridge contrast and selected outlines with current map data; generation stays separate |
| EZ-Tree | Two existing tree assets, instanced and tinted in K | Repeated crowns offer limited natural variation | First curate transforms/tints; if assets are insufficient, author a tiny offline crown kit with matching low-detail silhouettes and measured payload |
| InstancedMesh2 | K already uses InstancedMesh; A streams/batches chunks | No evidence yet that per-instance culling improves this workload | Profile existing batches first; retain simple grass/voxel batches, consider medium-prop LOD only if measurements justify it |
| Razarion | Healthy refresh preserves keep scene; H context/reduced fallback | Returning should show stable place and honest connection state | Polish loading/re-entry visual continuity and subdued stale/refresh badges; no new tutorial or reconnect protocol |
| A Small World | Deterministic keep dressing and atlas visual plan; W single pass | Biome identity and focal silhouette need current representative comparison | Seeded QA views, curated palettes and quiet backgrounds; selective reflection only after simpler water is visibly insufficient |
| Dorfromantik | Existing gather/build/return purpose and readable regions | Calm art must still expose the next relevant object | Clear selected-site/route accent, subdued irrelevant terrain, coherent completed-state treatment; no quest system |
| Luminous Lake | W layered normals/quality branch, no CPU vertex-wave loop | Water tint/highlight relationship remains a material-review task | Borrow tint and broad/fine scale relationship; avoid live cube reflections and per-frame CPU grid deformation |
| Binary Greedy Meshing v2 | Existing material-aware bounded voxel mesher and generated dressing | Potential edge/precision artifacts should be judged at actual scale | Inspect chunk seams and merged surfaces; no native-throughput comparison or engine rewrite |
| Grassworks (secondary lead) | Existing grass/feature batching | Dense grass is not automatically useful at strategic scale | Visual study of density gradients only; no WebGPU dependency or unreviewed licensed package |
| noa (secondary lead) | Warpkeep already owns voxel presentation separately from rules | A replacement engine would expand scope without a visible foundation gain | Study mesher organization only; no Babylon/physics/editable-world migration |
| Mistwood Cottage (secondary lead) | K diorama and existing prefab loading budgets | Cozy scene density may hide excessive payload | Borrow restrained cottage/vegetation grouping; do not import unreviewed heavy media |
| Older map/castle/tree/Worker/resource attachments + Warpkeep-Assets | Current loaded prefabs, dressing and atlas assets have existing catalogs | Original image URLs are not all recoverable; fresh authorship must not erase credits | Use cataloged silhouettes and provenance as the starting kit; no guessed URLs or relabeling reused models |

### Background reference applications

| Group | How it informs this foundation |
|---|---|
| Tectonic structure DOI13614; uplift/fluvial erosion DOI12820; Priority-Flood DOI2013.04.024; tile erosion arXiv2210.14496 | Background for coherent relief/drainage. Current atlas data remains authority; use it to organize visual landforms, not introduce live erosion. |
| Crytek height-fog course; Three WebGPU manual/API and TSL | Atmospheric depth and rendering-architecture research. Current WebGL/standard-material/reduced path is real; do not require a WebGPU migration for art polish. |
| FFXIV chat tabs; Fortnite chat/reporting; Minecraft reporting/1.19.1/accessibility; Forge of Empires chat/reporting; Travian interaction/reporting | Historical communication/accessibility context. Apply legible labels, contrast, target sizes and calm hierarchy now. Chat channels, moderation/reporting flows and social mechanics are not new visual-foundation tasks. |


The forest rows' proposed grouping, terrace separation pass and completed-level
silhouette treatment are now implemented at the checkpoint above. Further work should concentrate on building
proportions, coherent material response, geographic hierarchy, selected-site and
construction views, loading/resume behavior and actual-device measurements.
Avoid repeating the completed forest/terrace changes as unfinished work.

September 9 review against the complete Desktop handoff confirmed this coverage
and the owner's simple-interaction scope. At `2e91f27`, the resource panel also
removed repeated zero-pending labels while retaining positive incoming amounts
and spendable balances. Matched synthetic empty/mature views supported that change;
physical-phone performance remains unverified. The portrait canvas now uses the scene panel width, preserving the padded
toolbar and desktop/landscape layouts. Camera tightening and roof recoloring require their own
evidence: tall edge placements must remain visible, and mixed vertex-colored
building meshes cannot be globally tinted without also changing walls and timber.

## Current state at a glance

The September 8 keep-to-atlas navigation correction preserves the specific Worker
selected through “Find resources for Worker …”. Previously the atlas reset to
Worker 1, which could dispatch a different idle Worker or leave the action disabled
while that Worker was busy. The selected ordinal is presentation state only: the
new atlas requires a fresh target, dispatch rechecks the authoritative idle state,
and a replacement capability clears Worker, target and duration selection. The
two affected suites passed 41 native DOM tests, including desktop/narrow width
fixtures and a Worker becoming busy during review; integrated app/config types
passed. This is not authenticated owner play or physical-device evidence.

| Area | What the source establishes | What remains unknown or unfinished |
| --- | --- | --- |
| 0.4 gameplay core | Persistent gathering, returns, construction, upgrades and six completed effects are implemented | Complete genuinely authorized owner journey on the real atlas |
| PTR integration | Scoped capability, real adapters and active-session renewal through fresh authorization/reconnect/preflight | Actual-owner renewal and complete live acceptance |
| Healthy refresh | Verified scene/focus retained while new commands stay disabled; regression added in `555e505` | Final browser/device/performance proof for the integrated release |
| G002 | Gameplay deliberately denies access before storage | Fresh live denial and no-unauthorized-write evidence; admissions TBD |
| Verdant Citadel | Distinct 0.4 keep composition, materials, dressing, progression, mobile framing and fallback paths exist | Physical-device readability/performance and final integrated-source acceptance |
| Voxels | Bounded reusable mesher, world adapters and generated keep dressing are connected | Final whole-path visual/performance acceptance |
| 0.4 water | Continuous returned wet hexes, world-coordinate swells/ripples and shared host-clock lifecycle | Final-source visual matrix, physical-device and agreed performance evidence |
| Shipping | Substantial implementation and local evidence exist | Final operating composition, deployment and live acceptance; see release notes |

Neither a closed G002 gate nor missing acceptance is automatically a broken
implementation. Conversely, a unit test or synthetic screenshot does not prove
that a real owner can complete the loop. The [release checklist](../../operations/0.4.0-release-checklist.md)
remains the acceptance ledger; this page does not add a competing set of gates.

## Where the current game lives

| Responsibility | Source and caller |
| --- | --- |
| Prices, gathering, travel and completed effects | [`policy.ts`](../../../spacetimedb/gameplay04/policy.ts) |
| Initialization, sequence and replay authority | [`keep.ts`](../../../spacetimedb/gameplay04/keep.ts), [`commands.ts`](../../../spacetimedb/gameplay04/commands.ts) |
| Journey timing, return credit and shared settlement | [`workerJourney.ts`](../../../spacetimedb/gameplay04/workerJourney.ts), [`workers.ts`](../../../spacetimedb/gameplay04/workers.ts), [`reconciliation.ts`](../../../spacetimedb/gameplay04/reconciliation.ts) |
| Placement, project start and completion | [`placement.ts`](../../../spacetimedb/gameplay04/placement.ts), [`construction.ts`](../../../spacetimedb/gameplay04/construction.ts) |
| Actual PTR transactions and scheduled callbacks | [`gameplayKeep.ts`](../../../spacetimedb/ptr/src/gameplayKeep.ts), [`gameplayWorkers.ts`](../../../spacetimedb/ptr/src/gameplayWorkers.ts), [`gameplayConstruction.ts`](../../../spacetimedb/ptr/src/gameplayConstruction.ts), [`gameplaySchedule.ts`](../../../spacetimedb/ptr/src/gameplaySchedule.ts) |
| Session/capability and owner expiry | [`PtrRealmProvider.tsx`](../../../src/ptr/PtrRealmProvider.tsx), [`ptrRealmConnection.ts`](../../../src/ptr/ptrRealmConnection.ts), [`ownerPolicy.ts`](../../../spacetimedb/ptr/src/ownerPolicy.ts) |
| Validated client state and exact command envelope | [`gameplay04State.ts`](../../../src/ptr/gameplay04/gameplay04State.ts), [`createGameplay04Controller.ts`](../../../src/ptr/gameplay04/createGameplay04Controller.ts), [`useGameplay04Controller.ts`](../../../src/ptr/gameplay04/useGameplay04Controller.ts) |
| World-to-keep navigation and resource selection | [`PtrGameplay04SurfaceHost.tsx`](../../../src/ptr/PtrGameplay04SurfaceHost.tsx), [`GreaterRealmWorldScene.tsx`](../../../src/components/realm/GreaterRealmWorldScene.tsx) |
| Keep decisions, placement and presentation | [`Keep04Screen.tsx`](../../../src/components/keep04/Keep04Screen.tsx), [`Keep04BuildingPanel.tsx`](../../../src/components/keep04/Keep04BuildingPanel.tsx), [`Keep04WorkerPanel.tsx`](../../../src/components/keep04/Keep04WorkerPanel.tsx), [`Keep04SceneHost.tsx`](../../../src/components/keep04/Keep04SceneHost.tsx) |
| Art profile, buildings and asset lifetime | [`keep04VisualProfile.ts`](../../../src/components/keep04/keep04VisualProfile.ts), [`createKeep04Scene.ts`](../../../src/components/keep04/createKeep04Scene.ts), [`createKeep04Buildings.ts`](../../../src/components/keep04/createKeep04Buildings.ts), [`loadKeep04Assets.ts`](../../../src/components/keep04/loadKeep04Assets.ts) |
| Decorative voxel surface and keep dressing | [`voxelSurfaceMesh.ts`](../../../src/components/realm/voxelSurfaceMesh.ts), [`keep04VoxelDressing.ts`](../../../src/components/keep04/keep04VoxelDressing.ts), [`planKeep04DressingSource.ts`](../../../src/components/keep04/planKeep04DressingSource.ts) |
| Actual PTR/world water | [`createGreaterRealmSceneRuntime.ts`](../../../src/greater-realm/createGreaterRealmSceneRuntime.ts), `waterMesh` and [`greaterRealmWaterSurface.ts`](../../../src/greater-realm/greaterRealmWaterSurface.ts) |

The historical [`inner-keep-construction.md`](../../design/inner-keep-construction.md)
describes a different dormant V1 policy. Do not use its economy discounts or
timings as 0.4 mechanics. Likewise, `realmWaterLayer.ts` and `createRealmScene.ts`
serve the preserved G001 presentation, rather than the new PTR world/keep path.

## Implemented mechanics snapshot

These values come from the current shared policy, not a live observation or an
immutable promise. Keep numeric changes in policy, tests and these technical
notes together; product-facing pages need the decisions and benefits, not every
constant.

| Rule | Current implementation |
| --- | --- |
| Economy | Food, Wood, Stone, Gold; four permanent Worker slots and one Builder |
| Gathering choices | 60 seconds, 10 minutes, 1 hour or 8 hours |
| Base gathering yield | 10 units per completed 10-second gathering quantum |
| Base travel | 2 seconds per server-validated route edge |
| Spendable credit | On completed return; pending yield cannot fund construction |
| Building progression | Levels 1–5; base cost multipliers 1 / 3 / 7 / 15 / 31 |
| Base build durations | 2 minutes / 15 minutes / 1 hour / 4 hours / 12 hours |
| Placement | Permanent accepted transform; draft cancellation is free, accepted construction has no cancellation/refund path |
| Balance ceiling | 1,000,000 per resource; return outcome distinguishes earned, credited and overflow |

| Building | Level-one Food / Wood / Stone / Gold | Completed effect |
| --- | --- | --- |
| Mill | 20 / 40 / 20 / 0 | Food yield gains 20% of base per level |
| Lumber Camp | 20 / 20 / 40 / 0 | Wood yield gains 20% of base per level |
| Stoneworks | 40 / 20 / 20 / 0 | Stone yield gains 20% of base per level |
| Goldworks | 40 / 60 / 40 / 20 | Gold yield gains 20% of base per level |
| Barracks | 60 / 80 / 80 / 40 | Travel duration reduces by 5% per level |
| Cathedral | 80 / 100 / 120 / 60 | Future construction duration reduces by 5% per level |

Economy gains are linear additions to base yield, not compounding multipliers.
Journey travel/yield rates are captured when dispatched; a later completion
does not retroactively change that journey. Construction captures the accepted
cost and duration. The server reconciles due work atomically before accepting a
new current command; the UI reaching zero remaining time cannot finish it.

The client distinction is equally important: `ready` allows commands;
`refreshing` preserves a previously verified view but blocks commands; `pending`
and `uncertain` preserve the immutable original request for confirmation or exact
retry. Stale quotes require another review, and an expired or changed capability
retires the controller. A displayed balance, selected site or retained picture
is never enough to authorize a new mutation.

## Follow one building decision through the system

`PtrGameplay04SurfaceHost` keeps the gameplay controller alive while the owner
switches between atlas and keep. Resource navigation returns to the actual
world selector; a validated same-generation atlas selection supplies the atlas
assertion used by later commands. The host rejects copied, expired or mismatched
PTR capabilities before mounting the gameplay surface.

In the keep, `Keep04BuildingPanel` derives a quote from the decoded view and
selected permanent transform. It shows exact costs, resource deficits, effect,
Builder state and placement consequences. Confirm sends that reviewed quote to
`createGameplay04Controller`, which checks it again and captures an immutable
envelope containing sequence, expected keep/atlas revision, policy/layout,
transform, cost and duration. Draft cancellation sends no gameplay command.

The capability in `ptrRealmConnection.ts` rechecks current realm/session scope
around the SDK call. The PTR construction procedure enters a real transaction,
requires the authenticated owner and verified atlas, then uses the shared
construction core to reconcile due work and validate/deduct/start atomically.
The result acknowledges that exact sequence/revision; the client then reads
authoritative state. The scene shows construction and completion from that
state. The matching economy benefit is captured by a subsequent dispatch and
becomes spendable only when the improved return is credited. That final return,
rather than an updated label or accepted dispatch alone, closes the first loop.

## Implemented strengths to preserve

- The shared 0.4 economy is real code in `spacetimedb/gameplay04/`, not just a
  design. All six recipes have levels 1–5, cost multipliers 1/3/7/15/31 and build
  times 2m/15m/1h/4h/12h. Economy yield gains are 20% per completed level;
  Barracks improve travel and Cathedral improves future construction. These are
  the current 0.4 rules, not the old 24-hour legacy construction proposal.
- Persistent transitions implement four Workers, one Builder/project, permanent
  transforms, checked arithmetic, bounded receipt history, exact replay, stale
  revision rejection, once-only settlement and rollback on intermediate failures.
  Policy, Worker, keep and construction tests cover substantive unhappy paths.
- PTR procedures use the shared core inside real SDK transaction adapters after
  `requirePtrOwner` and verified atlas binding. Resource nodes/routes are resolved
  from indexed server state, not client-provided yield/path claims. Scheduler
  callbacks validate system caller, exact callback and assignment/project state;
  delayed browser access is not the authority for completion.
- G002 procedures deliberately throw `GENESIS002_GAMEPLAY_CLOSED` before storage;
  gameplay tables are private and population checks require them empty. This is
  correct for a deployed sealed realm. Keep it closed; live zero-write evidence
  still needs to be obtained.
- Client capability branding and pre/post-await scope checks reject forged,
  copied, borrowed, expired and cross-session access. Commands retain immutable
  original envelopes on uncertain outcomes and demand reconfirmation for changed
  quote terms. No optimistic resources, completion or ownership are granted.
- G001 freeze policy keeps player access enabled while disabling new admission
  mutations and access requests. Seven module tests passed during this audit;
  that is not a substitute for the actual deployed baseline/preservation check.
- The keep has separate 0.4 composition, materials, lighting, camera fitting,
  tiered dressing and six procedural fallbacks. Four Worker cards, real resource
  navigation, spendable/pending amounts, exact costs/effects/deficits, placement
  validity and permanence warnings provide useful decision feedback.
- A reusable bounded greedy voxel mesher is integrated in world terrain/features
  and keep dressing. It removes shared faces, merges compatible faces, bounds
  typed-array/index sizes and keeps decorative occupancy out of gameplay authority.
- GPU ownership, loader cancellation, disposal, demand-driven rendering,
  30/24/15fps caps, DPR limits, hidden-page suspension, schematic fallback and
  reduced-motion support are meaningful existing safeguards. Retain them.

## Findings and remaining acceptance

### G01 — healthy refresh scene/focus loss: fixed in source

The original audit found that ordinary five-second and focus refreshes published
`loading`, unmounting the scene and moving focus despite a healthy session.
The held-response integration regression reproduced it. Commit `555e505`
corrected the controller and screen: an already verified view now enters
`refreshing`, keeps the same scene/assets/canvas/focus, and reconciles the next
verified state in place. New commands remain blocked during the read.

[`Keep04SceneHost.test.tsx`](../../../tests/Keep04SceneHost.test.tsx) exercises the
real hook/controller/screen path with delayed polling and focus reads, changed
construction state, failed/malformed/expired responses and uncertain commands.
The [continuation record](execution-handoff.md) records 134 passing tests in eight
focused suites reported for the correction, followed by explicit app and Vite
configuration typechecks. SDK/assets/GPU are fixtures in this evidence. This
documentation refresh rechecked the source and commit diff, but did not rerun
those tests. Preserve the fix; final rendered and owner acceptance remain open.

### G02 — active PTR expiry continuation implemented; owner acceptance remains

The original `781e51e` inspection found that every expiry returned the owner to
the menu. The 2026-09-08 correction preserves an active PTR journey through fresh
authorization, same-FID/database/epoch verification and a new connection/preflight.
Transient failures offer retry in place. The old capability is retired at hard
expiry, and no draft or command envelope crosses sessions. Menu admission still
expires to unknown and requires an explicit check.

A two-minute level-one build and a ten-minute first journey cross this boundary.
Local tests now exercise construction completion, ambiguous requests, repeated
renewal, denial, scope changes and late cancellation. The rendered recovery view
and notice were reviewed in a synthetic local fixture. The 120-second server
maximum is unchanged. Complete the actual-owner background/resume and improved
return journey, including stable-host account changes; see the
[continuation record](../../evidence/0.4.0/isolation-lifecycle.md).

### G03 — real route timing and improved return are unproved

`tests/gameplay04KeepModules.test.ts` invokes actual bundled adapter code through
`PtrHarness`, with synthetic routes, controlled clock and renewed auth fixtures.
Its “actual PTR” title means actual adapter, not networked live PTR. The test now
checks that the first economy building completes, the next dispatch captures the
improved yield, and its scheduled return credits that improved result exactly
once. This closes the local adapter proof while leaving the real-atlas and
actual-owner ten-minute acceptance open.

Record real route lengths, dispatch/return timestamps, deductions, building
completion, subsequent improved dispatch **and credited return**, wall time and
renewal/background overhead. Do not extrapolate from a one-edge test atlas. No
connected ten-minute gameplay acceptance runner was found in the inspected
integration/smoke/connected tooling. Existing atlas/G001 probes are not substitutes.

### V01 — water polish must target the renderer actually used by 0.4

The [Pelagic study](../../operations/2026-09-06-water-visual-reference.md) is visual
inspiration, not copied source. Actual 0.4/PTR water comes from
`src/greater-realm/createGreaterRealmSceneRuntime.ts` (`waterMesh`), which now uses
`greaterRealmWaterSurface.ts` for a continuous single-pass surface with layered
swells and ripples. The September 8 implementation and its bounded evidence are
recorded below; the earlier color/opacity-only implementation is superseded.
The richer analytic wave/foam shader in `src/components/realm/realmWaterLayer.ts` is
used by legacy G001 `createRealmScene.ts`, not this runtime.

Do not claim the advanced legacy shader is already integrated into PTR, or alter
G001 water appearance to satisfy 0.4. Use a bounded 0.4-owned material/helper if
implementation evidence calls for it; preserve public-cell geometry, hydrology,
picking and scheduling. The immediate need is readable depth, shoreline and
surface movement at strategic-camera scale within the existing mobile budgets.
An ocean simulation or extra render passes would need a demonstrated benefit
and measured cost; the reference study alone is not a reason to introduce them.

### V02 — visual completeness exceeds current rendered evidence

Recorded evidence includes a stable 36-case Windows native-Chrome synthetic
capture at earlier source and a later 390×844 balanced interactive placement check.
Offline voxel-plan generation reduced one measured CPU4 preparation workload from
about 19–25ms to 1.3–2.8ms. Those are useful specific results, not final acceptance.
See [Windows capture](../../evidence/0.4.0/windows-keep-capture-2026-09-06.md) and
[visuals](../../evidence/0.4.0/visuals.md), including their remaining limitations.

Small-building readability, landscape/offscreen action coverage and final
source-bound captures remain. The six-family level matrix and authored-prefab
footprint checks are now covered by `tests/keep04Buildings.test.ts`, while the
browser review in `docs/evidence/0.4.0/visuals.md` records the all-six completed
scene separately from physical-device proof. The renderer evidence destination
is now [`docs/evidence/0.4.0/renderer.md`](../../evidence/0.4.0/renderer.md). It
records the actual owners, fallback/context lifecycle and retained browser
observations without treating source tests or browser captures as physical
performance or authenticated-owner acceptance.

## Acceptance matrix to finish

| Required proof | Existing support | Missing result / method |
| --- | --- | --- |
| Actual-owner representative loop (R02/R03/R07) | Pure and adapter tests, typed real bindings, route controls | Genuine isolated PTR journey; economy building + improved return ≤10m |
| All six effects/progression | Numeric matrix and construction/upgrade tests | Explicit per-family matrix distinguishing core, adapter, generated-binding and rendered evidence |
| Retry/expiry/reconnect (R08) | Exact envelope/scope tests | Cross-expiry uncertain outcome, background/resume and realm-switch owner journey |
| G001 preservation (R09) | Narrow freeze guard tests and separate presentation paths | Recorded deployed identities/admitted baseline; real players/timers/reconnect/presentation preserved |
| G002 closed (R10) | Bundled denial-before-storage tests | Live denial plus authenticated before/after no-unauthorized-write evidence |
| Art/voxel/fallback (R04/R05) | Integrated mesher, art profile, six-family level matrix, fixture captures and browser all-six completion review | Final source-bound desktop/mobile captures, physical-device readability/performance, renderer/fallback budgets and reduced/motion proof |
| Lifecycle/performance (R06) | Cleanup and scheduler tests; diagnostic counters | Final production source/artifact measurements, context cycles, repeated switching, physical-device evidence separately labeled |

## Performance gates — do not substitute emergency caps

The authoritative [performance contract](../../evidence/0.4.0/performance.md) defines
method and budgets. This summary is a routing aid, not a replacement or relaxed gate.

| Profile | Cold usable scene p95 | Frame interval p95 | Static transfer through world + keep |
| --- | --- | --- | --- |
| 1440×900 desktop/high | ≤10s | ≤33.4ms | ≤12MiB |
| 390×844 balanced / 844×390 landscape | ≤15s | ≤50ms | ≤8MiB |
| 390×844 reduced | ≤15s | ≤75ms (15fps design) | ≤5MiB |

- Requested input feedback p95 ≤100ms; JavaScript through usable keep ≤2MiB
  compressed. Count fonts, bootstrap/menu/media and started prefetches, not just
  keep assets. Raw pinned asset sizes are not compressed network measurements.
- Keep target draws/triangles: high 180/300k; balanced 120/180k; reduced 80/90k.
  Emergency runtime `hardDraws`/`hardTriangles` are not acceptance budgets.
- Ten cold runs per profile and three 60-second workloads after warm-up; record
  source/build, browser/GPU/network/CPU shaping and all samples. Localhost does not
  prove live network latency; RTX3090 emulation does not prove phone performance.
- Three warmup cycles, 20 world/keep cycles, 10 realm re-entry cycles and three
  context-loss/restoration cycles. At most one renderer/canvas, zero scene-owned
  leftovers after disposal, stable warmed GPU resource counts. Heap final
  ≤baseline+8MiB and growth ≤0.25MiB/cycle. Unsupported measurement is missing,
  not zero. Reduced motion is event-driven; hidden decoration must stop.
- Verify actual action/placement regions and touch interactions, not just an
  attractive initial header screenshot. A usable schematic is required recovery,
  not a replacement for mandatory successful WebGL visual acceptance.

After the requested documentation/source checkpoint is published, resume the
integrated owner journey, reauthorization usability, visual completion and
measured acceptance. Use current tests and source as foundations. If improving
the game requires a design correction, record its player benefit, consequences
and verification rather than treating historical implementation choices as
permanent limits or restarting working systems without a reason.

## Continuous Greater Realm water — 2026-09-08

`greaterRealmWaterSurface.ts` now supplies the actual scene runtime's water
material. World-coordinate swells, restrained ripples and soft highlights replace
whole-chunk color/opacity pulsing. Adjacent returned wet hexes meet at their exact
cell boundaries; the previous inset exposed artificial dry seams inside a water
body. No cell is inferred or added, and water height, boats and navigation retain
their existing owners. The material keeps standard lighting/fog in one pass,
adds no texture or vertex attribute, and reduces fine detail on the reduced profile.

The existing host clock controls motion. Newly uploaded chunks receive the same
effective time as resident chunks before rendering, including between ambient
ticks. Reduced motion, visibility, context rebuilding and single disposal retain
their existing lifecycle. If shader insertion points change, the material keeps
its usable standard fallback.

Both water/scene suites passed **43 tests** on Windows and native Linux. App/config
types passed after explicitly typing minimal renderer test fixtures. Independent
review caught the streaming phase issue; its new regression now covers the
original failure before another animation tick. Geometry checks cover exact wet
cell extents, unchanged attributes/counts/heights and preservation during motion.

Rendered review used the actual runtime and world-screen host with synthetic
public fixtures, plus a wider neighboring-water fixture. Desktop and 390×844
views rendered without observed shader errors; balanced, high, reduced-detail
and reduced-motion surfaces were inspected. Forced context loss/restoration
returned a rendered surface, and runtime disposal released all fixture geometries.
The wide fixture retained four GPU draws; this is a small-scene observation, not
a frame-time, physical-phone or whole-game performance result. Authentic owner
play, final-source visual coverage and agreed performance workloads remain open.

## Clearer keep feedback — 2026-09-08

The ready keep now explains saved progress and resource return instead of showing
an uncertain-action warning on every visit. First-time entry says **Establish
keep** and still submits only the existing initialize intent. The scene no longer
prints an engineering asset caption; asset files and provenance credits remain
unchanged. Uncertain outcomes retain their explicit check and same-request retry.

Building and Worker panels describe gathering rates in seconds and explain that
an expedition retains its starting rate. Completed maximum-level cards show the
current benefit without a fictional next benefit or a list of zero shortages.
Server rates, balances, spendability, placements and command authorization are
unchanged. Maximum-level upgrade confirmation remains disabled.

Six existing component/presentation suites passed 114 tests, including placement,
benefits, refresh/focus, recall authority, scene lifecycle and initialization.
The app type check passed. The actual synthetic keep rendered at desktop and
390×844; the mobile catalog retained reachable controls and displayed the revised
benefits. These observations do not establish physical-device performance or the
authenticated owner's journey.

## Worker journey readability — 2026-09-09

Each active Worker card now presents the same three-stage journey in a compact
mobile rail: **Outbound**, **Gathering**, then **Returning**. The active stage is
exposed as an accessible current step, completed stages remain visually settled,
and the detail copy explains that the captured rate stays fixed and resources
remain unavailable until the Realm confirms return. This is presentation-only;
the server phase, captured yield, return credit and recall authority remain the
source of truth. The change is covered by the 76-test focused run above.
