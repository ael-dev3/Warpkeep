# Living Verdant Vale and Greater Realm daylight — 2 October 2026

The owner asked on 1–2 October 2026 for visual improvements, new 3D models, a
populated world, better mechanics and "a map with a soul", delivered as a
separate pull request from the 0.4 release candidate. This note records what
that work changes, which source owns it, what was actually verified and what
remains open. It does not change the release checklist, the release sequence
or any acceptance gate.

## The player problem

The 0.4 keep floated as a flat olive platform on a grey void: no setting, no
people, no visible sign that Workers were away or coming home. The 0.4
Greater Realm floated on a near-black background with dark fog; its people,
rabbits and boats were brown cylinders and boxes too small to read, castles
were sand-coloured blocks, and a Worker's journey existed only as a small 2D
polyline in a side panel. A returning Keeper also had to work out the next
useful action from several panels.

## What changed

| Area | Change | Source owner |
| --- | --- | --- |
| Keep setting | A decorative valley around the raised plinth: river, three lanes with stone bridges, wheat/lavender/sprout/soil fields with hedgerows, two hamlets, farmsteads, two windmills and a watermill, deterministic woods, birch banks, poplar avenues and stones | `src/components/keep04/createKeep04Landscape.ts`, `src/components/keep04/keep04Terrain.ts` |
| Keep fortifications | Rear towers and wall, low camera-side corner towers, squat gate turrets, crenellated front walls and a causeway with ramp to the vale road; all off the legal deck | `createKeep04Landscape.ts`, `src/components/keep04/keep04Models.ts` |
| Courtyard | The legal deck is a mown lawn (vertex colour only; geometry, legality and picking unchanged) | `src/components/keep04/createKeep04Scene.ts`, `keep04VisualProfile.ts` |
| Keep life | Villagers on walkways planned from real doors to the reserved civic network; the four Workers line up by the commons when idle, leave through the gate when outbound and come home with resource-coloured cargo when returning; builders at an active project; gate wardens, farmers, shepherds, sheep, birds, chimney smoke, banners, carts, boats and a warp crystal on the civic seal | `src/components/keep04/createKeep04Life.ts`, `keep04InnerPaths.ts`, `keep04Models.ts` |
| Model kit | Code-authored, untextured, vertex-coloured low-poly models merged or instanced into a handful of draw calls | `src/components/keep04/keep04ModelKit.ts`, `keep04Models.ts`, `keep04Random.ts` |
| World atmosphere | Daylight haze (same fog density), a sea of low cloud beyond the returned window, a few high clouds and birds, outside the fitted world group | `src/greater-realm/greaterRealmAtmosphere.ts`, `src/components/realm/createGreaterRealmWorldCanvasHost.ts` |
| World actors | Villagers with heads and hats, hopping rabbits and sailing boats replace the cylinder/box placeholders; villagers face the way they stroll | `src/greater-realm/greaterRealmActorGeometry.ts`, `src/greater-realm/createGreaterRealmSceneRuntime.ts` |
| World castles | The voxel castle uses the shared palette: stone plinth, pale masonry, teal roofs, timber gate, lit windows, violet banner; the region accent now tints rather than paints it | `src/components/realm/greaterRealmVoxelPresentation.ts`, `createGreaterRealmWorldCanvasHost.ts` |
| Own journeys on the map | Each active Worker route as a violet trail with a destination ring; the Worker walks it by the captured times, works at the site, turns back part-way after an outbound recall and returns with cargo | `src/greater-realm/greaterRealmJourneyLayer.ts`, `src/ptr/gameplay04/gameplay04Journeys.ts`, `src/components/realm/GreaterRealmWorldScene.tsx`, `src/ptr/PtrGameplay04SurfaceHost.tsx` |
| Next step | A steward's advice card after construction progress: build what spendable stock already covers while the Builder is free; otherwise send an idle Worker for the uncovered shortage of the next improvement (counting returning resources and planning past an active project); otherwise when the current project or next return should land | `src/components/keep04/keep04NextStep.ts`, `Keep04Screen.tsx`, `Keep04Screen.css` |

## Authority and data boundaries

Everything above is presentation of already-validated state. The keep scene
receives a new optional `workers` field carrying only ordinal, phase,
resource and the confirmed phase start/end times; the scene rejects any other
worker field, as it already rejects economics on buildings. The world map
receives the captured route and journey times for the owner's own Workers
from the validated keep state. Nothing new is pickable: picking still sees
only building roots, placement still uses the legal plane, and the walkway
planner never consults or changes placement legality. Steward actions only
open the existing catalog or resource search. No server, schema, binding,
generated output, admission or G001/G002 code changed. G001 keeps its legacy
renderer because its Greater Realm presentation remains gated off.

## Ambient life contract

The keep previously had no idle render loop. Ambient life is an explicit,
bounded opt-in on `Keep04SceneHost` (`ambientLife`), enabled by the keep
screen for the high and balanced qualities without reduced motion:

- frames run at the existing quality caps (30/24 fps) with the existing
  phase-kept cadence and no catch-up bursts;
- decoration stops while the page is hidden or the scene is scrolled out of
  view, and sleeps after `KEEP04_AMBIENT_WINDOW_MS` (two minutes) without
  input or a state change; any input, reconciliation or return wakes it;
- the reduced quality and reduced motion keep the original no-idle-loop
  contract with the same placed, still population.

The world reuses its existing ambient scheduler; the atmosphere and journey
layers advance only on frames that host already renders.

## Budgets and measured evidence

Decorative cost is charged to the existing prefab admission budget (including
shadow submissions on high), so the vale and its life can never crowd out an
authored building. Tests admit all six authored models at their pinned
catalog cost beside the vale and life at every quality, and keep telemetry
inside the high 180/300k, balanced 120/180k and reduced 80/90k targets.
World actor byte estimates equal the uploaded geometry; the castle stays
inside its 600-instance upload reserve; the host draw-call and instance
reserves include the atmosphere and journey layers.

Synthetic local measurement on 2 October 2026, local Vite dev build, headless
Chrome 154 with ANGLE/D3D11 on an RTX 3080 Ti, `living-keep` fixture, 20 s
bounded observation with ambient life on:

| Profile | Frames | Frame work p50/p95 | Interval p50/p95 | Renderer calls / triangles |
| --- | --- | --- | --- | --- |
| 1440×900 high | 600 | 1.4 / 1.9 ms | 33.3 / 33.7 ms | 73 / 255,628 (incl. shadows) |
| 1440×900 balanced | 481 | 1.1 / 1.5 ms | 34.7 / 50.3 ms | 55 / 108,148 |
| 390×844 balanced (emulated) | 480 | 1.0 / 1.4 ms | 34.1 / 50.3 ms | 54 / 108,028 |

No long tasks were recorded. The interval percentiles sit at the frame cap
plus 60 Hz display jitter because ambient frames are cadence-limited by
design; frame work stays under 2 ms. A separate reduced capture measured 51
calls and 79,006 triangles (target 80/90k). These are desktop-GPU synthetic
results. They do not establish phone frame pacing, thermal behaviour, battery
cost, cold load, production transfer, the world/keep switch workload or owner
acceptance; R06 and the physical-device gates remain open.

## Verification

Focused suites pass locally on Windows (Node 24.19 / npm 11.7 rather than the
pinned Node 22 / npm 10.9.8): the new `keep04LivingVale`, `Keep04AmbientLife`,
`keep04NextStep` and `greaterRealmDaylightJourneys` suites, plus the existing
Keep04 scene/host/screen/placement/accessibility/benefit/QA suites and the
Greater Realm runtime, plan, host, world-scene, voxel and PTR surface suites.
Updated existing tests change only where the contract changed deliberately:
the scene now owns more disposable instanced batches, the countdown test
allows the one paced ambient frame, the ambient boat hull is measured from its
bounds instead of box parameters, and the pinned QA scenario lists include
`living-keep`. Rendered review used the local QA harnesses at 1440×900 and
390×844, including `?scenario=living-keep` and the Greater Realm host page
with `?journeys=1`.

## Release integration

This branch is based on the reviewed PR #380 head and is not part of it. It
changes eleven prepared-closure members (keep04 scene, host, screen and CSS,
visual profile, world host and scene, voxel presentation, scene runtime,
presentation plan and the PTR surface host) and adds new source files they
import. Integrating it therefore follows the existing source-change route:
fresh native prepare/check and generated-family derivation from the merged
source. No release-tool, workflow, closure manifest or generated file was
edited by hand.

## Open follow-ups

- Physical-phone frame pacing, battery and thermal review of the ambient keep
  and the world atmosphere.
- Owner review of the art direction (vale density, daylight world palette).
- The world's ambient population still follows the atlas ambience classes; a
  richer authored population needs an atlas/generator decision.
- A persistent "while you were away" summary would need an agreed local
  storage policy; the steward card is stateless.
