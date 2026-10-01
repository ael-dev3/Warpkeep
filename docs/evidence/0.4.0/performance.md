# 0.4 performance acceptance contract

Established 2026-09-06 before final visual implementation/measurement.
Status: **Keep feedback repaired; four production-component profiles meet their cadence budgets; final production acceptance incomplete**.
Scope: final production-build 0.4 world/keep path, not a standalone demo.

## Repaired Keep production-component measurements — 2026-10-01

Signed repair source `0d36f06c7f2b1d65169be64e3aecc88b9e27096b` (H), tree
`c548e407d92b8cf7560452fcb9432af0c938f118`, is a direct child of the G baseline
below. Its genuine production-optimized Keep fixture uses the real components,
synthetic all-six-level-five presentation and trusted existing camera controls.
It does not grant player authority or replace the final-A application build.
This notes snapshot follows the final H run at 20:02:51.443 UTC and precedes
notes-checkpoint H2 signing/publication; resolve actual Git/PR evidence for continuation.

| Profile | Actual CPU GL submission interval p95, three 60-second samples | Unchanged ceiling | Result |
| --- | --- | --- | --- |
| Desktop high | 17.1 / 17.1 / 17.1ms | 33.4ms | Meets this workload's cadence budget |
| Portrait balanced | 17.5 / 17.6 / 34.0ms | 50ms | Meets this workload's cadence budget |
| Portrait reduced | 17.4 / 34.3 / 17.6ms | 75ms | Meets this workload's cadence budget |
| Landscape balanced | 17.4 / 18.8 / 34.2ms | 50ms | Meets this workload's cadence budget |

Desktop completes 19:34:23.617–19:38:01.595 UTC and portrait balanced completes
19:39:14.115–19:42:59.551 UTC. Portrait reduced completes
19:43:59.255–19:47:42.829 UTC, and landscape balanced completes
19:59:05.689–20:02:51.443 UTC. Each actual outer tool exits 0. All twelve samples
are cadence-eligible, have exact application-RAF/GL-burst pairing, no measurement
failure and no driver-limited result. The receipts retain actual Chrome
154.0.8037.58, GPU and viewport/DPR diagnostics. Desktop uses 1440×900/DPR 1;
portrait uses 390×844/DPR 3 with the prescribed CPU/network shaping.
Owned Chrome/profile and native server cleanup pass, and native H source/index
remain unchanged. The [local evidence record](local-operations.md#keep-feedback-repair-and-production-component-measurements--1-october-2026)
owns exact receipt hashes and process/build provenance.

Visible feedback now consumes the next display RAF, including promotion of an
already queued decorative frame. Autonomous reveal retains the 30/24/15fps phase,
one pending RAF and the bounded 1ms tolerance for reproduced deadline jitter.
The affected Windows suite passes 139 tests, native checks pass 50 tests, app
types pass and outgoing scanning finds no secrets. These checks and measured
submission cadence address the reproduced defect without changing the budgets.

The separate fixture build is bound to H; reused static assets remain bound to
the earlier `6e9f50bf` build. CPU submission cadence is not completed GPU work or
physical-phone evidence. Placement and basic controls, World workloads,
production world/keep and realm cycles, final-A cold
bootstrap, transfer/resource/heap acceptance and actual-owner/device testing
remain open. No full R06 or published 0.4 claim follows from these four profiles.
The first landscape attempt fails before timing because the synthetic fixture's
canvas is below the short viewport. The successful retry uses ordinary scrolling
into view before timing and records before/after geometry; profile, WebGL and all
measurement gates remain unchanged. This corrects the ignored measurement setup,
not product rendering. Both attempts retain their separate actual receipts.
The following baseline and earlier diagnostics retain their original source and
pre-repair state; their pending language is historical.

## Production-component Keep feedback baseline — 2026-10-01

Signed preparation source `a8feb8c4c8fc723d35124222999b72120f03009c`, tree
`96507e3f848196474d28c4a08bf4da69c664cdf8`, completes three 60-second
camera workloads per tested profile in a genuinely production-optimized,
separate Keep component fixture. Actual Chrome 154.0.8037.58 uses NVIDIA
RTX 3080 Ti through ANGLE/D3D11. Desktop uses 1440×900/DPR 1; portrait
uses 390×844/DPR 3 and 4× CPU slowdown. The balanced backing canvas is
546×456 for a 364×304 CSS region, confirming the quality pixel cap.

| Profile | Actual CPU GL submission interval p95, three samples | Existing ceiling |
| --- | --- | --- |
| Desktop high | 50.5 / 50.1 / 34.4ms | 33.4ms |
| Portrait balanced | 51.0 / 51.0 / 51.1ms | 50ms |
| Portrait reduced | 83.8 / 83.3 / 83.9ms | 75ms |

Each sample has exact correspondence between actual application RAF timestamps
and GL submission bursts, with eligible input delivery and no runtime failure.
Paired desktop application intervals independently reproduce the unevenness;
replay of the actual callbacks reproduces the existing scheduling decisions.
Camera feedback shares the decorative cap, and callbacks arriving 0.066–0.566ms
before its deadline can be rejected by the 0.05ms rounding tolerance. Low
render work alone therefore does not establish smooth interaction. Repair and
measure this behavior before accepting the release; keep the budgets unchanged.

The narrow repair separates visible feedback from decorative continuation:
input, zoom, inspection and reconciliation request the next display RAF,
including promotion of an already queued decorative frame. Autonomous reveal
continuation retains the 30/24/15fps phase and one pending RAF; a bounded 1ms
tolerance admits the reproduced sub-millisecond deadline jitter. Idle, hidden,
reduced-motion, disposal and context-restoration behavior remain covered.
The first feedback regression baseline fails all 22 added cases; the separate
ambient baseline fails three actual-host reveal cases. The corrected affected
suite passes 139 tests, zero failures/skips, at 19:14:49.502 UTC, with app
types and independent source review passing. Production remeasurement is still
required; unit regressions are not a measured speedup or an acceptance pass.

All three runs close their owned Chrome actors/profiles and native server
groups, preserve tracked source/index and retain raw receipts under
`artifacts/qa/october-release-r06-a8feb8c4-<profile>-advanced-wasm-20261001T183645336350Z-*`.
Desktop completes 18:40:21.877–18:44:00.554 UTC, portrait balanced
18:49:07.130–18:52:50.170 UTC, and reduced 18:56:28.632–19:00:11.243 UTC.
Retain the earlier fixture failure separately: its CSP omitted WebAssembly
permission; correcting that ignored fixture permission allowed the genuine
production decoder to run without changing product CSP or the measurement driver.

These observations use synthetic completed buildings and real existing camera
controls, without player authority. Static assets are byte-verified reuse from
the earlier `6e9f50bf` production build; they are not a new final-source build.
CPU submission intervals are not GPU completion or physical-phone measurements.
Placement, landscape, production world/keep switching, final-A cold bootstrap,
owner play and device acceptance remain open. This is a reproduced defect and
bounded baseline, not a full R06 pass or evidence that 0.4 has been published.

## Bounded DEV Keep heap lifecycle — 2026-10-01

Frozen native `8d3b4c38` completes actual Chrome 154/RTX 3080 Ti measurement at
390×844/4× CPU, with unshaped DEV loopback and the in-page recorder off.
Balanced, reduced, reduced-motion and fallback each complete three warmups,
a baseline and 20 post-GC samples. Fitted growth is 0.0566, 0.0556, 0.0556
and 0.0083 MiB/cycle respectively; final growth is about 1.36, 1.33, 1.35
and 0.27 MiB. All meet the existing local heap comparison limits below.
Samples measure the whole DEV page while Keep is mounted; the page recorder
stays off and numeric samples remain in the external observer. Final unmount
records resource counters, without post-unmount heap or retaining-path snapshots.
The positive fitted growth remains unexplained; these observations do not
establish a production leak or final production memory acceptance.
WebGL resources remain stable through nine real context restorations; final
scene disposal and actual owned process/profile cleanup are independently
verified. Raw observations, independently recomputed values and the retained
first teardown attempt are in the
[source-bound record](local-operations.md#completed-keyboard-readback-and-keep-lifecycle-heap--1-october-2026).

This measures a DEV Keep-only mount/disposal path. It does not measure production
world/keep switching, realm re-entry, app sockets/subscriptions, physical phones
or driver GPU memory. Full R06 remains incomplete; budgets are unchanged.

## Bounded production-menu observation — 2026-09-30

At `1ab86add`, a separate fresh-profile menu-only measurement completes on
actual Chrome 154/RTX 3080 Ti. Desktop first observed usable menu is 2.54s;
390×844 with 4× CPU throttling is 3.15s. Both use unshaped, uncompressed
loopback; their 10-second application callback interval p95 is approximately
17ms, with no failed/pending/late requests. These are callback observations,
not renderer draw/paint/GPU frame intervals. The
[source-bound local record](local-operations.md#prepared-menu-settings-and-full-suite-verification--30-september-2026)
retains raw receipts, cleanup, all limits and the earlier failed attempt.

This is one cold navigation per profile, with fresh application-default quality;
it does not meet the ten-run, shaped-network, world/keep, repeated-switch heap,
owner or physical-device workload below. R06 remains incomplete and its existing
budgets are unchanged. Settings' repaired narrow layout is verified separately.

## Keep asset-loading scope — 2026-09-27

The current source-only 0.4 candidate requests the two scenery models for an
empty Keep instead of all six building models at entry. Completed buildings
present in the first authoritative view are still requested before that scene
is shown; models for buildings appearing later hydrate the existing WebGL
scene. A missing optional model leaves a procedural silhouette, with one
bounded retry on connection or visible-tab resume. The complete catalog still
determines the quality and budget profile. This is a request-scope change, not
a measured speedup or a pass against any transfer, frame-time, or phone gate
below. Record production-build bytes and timings on the final source.

## Synthetic observer instrumentation — 2026-09-10

The DEV Keep04 harness now derives nearest-rank p50, p95 and p99 frame-interval
values from valid rendered RAF timestamps and publishes the sample count with
each bounded observation. Loading, fallback, disposal and malformed timestamps
are excluded; a missing sample remains `null` rather than becoming a fabricated
zero. This makes future Windows/emulated captures easier to review against the
profiles below, but it is still synthetic instrumentation. It does not measure
GPU upload, retained heap, production transfer, physical devices or the required
owner journey, and it does not change any acceptance result.

Cadence intervals connect only consecutive frames where the previous rendered
frame reported a scheduled successor RAF (`pendingRafs > 0`). One-shot,
event-driven renders break the sequence, so the idle time before a later user
action cannot be misreported as a slow frame. A workload that produces no
continuous RAF sequence correctly reports a null cadence percentile; measure
input-to-visible feedback separately.

During a visible local Chrome check on 2026-09-30, five fixture redraws were
separated by user-driven idle periods; the earlier collector incorrectly
reported a roughly 30.8-second p95 interval. After the correction, two isolated
event-driven redraws correctly produced zero cadence samples and null
percentiles. This validates the DEV recorder's idle-gap handling only; it is
not a production frame-rate measurement or a 0.4 performance pass.

The automated 36-case Windows screenshot launcher does not start or stop this
bounded recorder. Its synthetic-render-observations.json output contains one
latest-frame snapshot per case, not a cadence series or p50/p95/p99 result.
Do not infer frame-cadence acceptance from those screenshots. Use the recorder
controls to obtain bounded synthetic cadence evidence; the production workload
and device acceptance below still require their separately specified runs.

The same current-head Windows probe (`npm run qa:inner-keep`) passed all 18
synthetic cases, including the emulated 390x844 responsive path. The probe
confirms scenario, renderer and overflow contracts only; it does not supply
the timed production-build, transfer, heap or physical-device measurements
below.

## Reference profiles

Observed local hardware: Intel Core i7-12700F, NVIDIA RTX 3090,
34,175,356,928 bytes physical memory; installed Chrome 151.0.7922.174.
Record the actual browser version, graphics backend, OS and device scale in every
run. If software rendering is selected, label it and do not silently compare it
to the hardware profile. Revalidate before measurement.

The September 30 synthetic guarded capture separately observes Chrome
154.0.8037.58 and NVIDIA RTX 3080 Ti through ANGLE/D3D11 hardware. Its DEV PNGs
and latest-frame observations are not measurements against the table below;
the older reference profile above remains dated context, not the current machine
identity. Hardware observations do not establish acceptance or change budgets.

| Profile | Viewport / quality | CPU/network shaping | Cold usable 0.4 scene p95 | Keep render interval p95 | World ambient render interval p95 (60Hz RAF) |
| --- | --- | --- | --- | --- | --- |
| Desktop | 1440x900 / high | No CPU slowdown; 20Mbps down, 5Mbps up, 40ms RTT | <=10 seconds | <=33.4ms | <=50ms |
| Mobile emulation | 390x844 / balanced | 4x CPU slowdown; 10Mbps down, 2Mbps up, 80ms RTT | <=15 seconds | <=50ms | <=66.7ms |
| Mobile reduced | 390x844 / reduced | Same emulation shaping | <=15 seconds | <=75ms | <=83.4ms |
| Mobile landscape | 844x390 / balanced | Same emulation shaping | <=15 seconds | <=50ms | <=66.7ms |

Autonomous reduced rendering is intentionally capped at 15fps by the existing keep plan.
Ruling: use 75ms p95 for that profile rather than the plan's blanket mobile 50ms,
which contradicts its 66.7ms scheduling interval. This resolves the specification
conflict before measurement, not in response to a failed result. Cost if wrong:
reduced mode may feel less smooth; verify touch responsiveness separately.

## Per-path cadence ruling — 2026-10-01

Source review at `974a3ae6` found that the earlier shared cadence column described
Keep's 30/24/15fps policy, while the existing Greater Realm policy uses
[24/18/12fps](../../../src/greater-realm/greaterRealmRuntimePolicy.ts).
[Keep's draw loop](../../../src/components/keep04/Keep04SceneHost.tsx) still uses
30/24/15fps; its contract keeps the original 33.4/50/75ms ceilings. The separate world column corrects that
scope mismatch before world measurements; it does not change runtime policy
or relabel any earlier observation as a pass.

The [world ambient scheduler](../../../src/components/realm/realmAmbientScheduler.ts)
accumulates RAF time and carries the remainder at each capped step. On a regular
60Hz RAF clock, the 24/18/12fps periods can occupy up to three/four/five display
ticks: 50/66.67/83.33ms. The
[runtime](../../../src/greater-realm/createGreaterRealmSceneRuntime.ts) invalidates
visible water/actors at those steps; the
[canvas host](../../../src/components/realm/createGreaterRealmWorldCanvasHost.ts)
queues the actual render on the next RAF. In the settled ambient-only case this
shifts its phase, without adding a recurring display tick to the interval.
The world p95 ceilings are therefore 50/66.7/83.4ms for this 60Hz reference.
This is source-based scheduling analysis, not a measured frame or GPU result.
Record actual RAF/display cadence; a different or variable clock requires its
own stated expectation before grading, rather than silently changing these limits.

Grade continuous, requested decorative world renders against the world column.
Camera/selection controls can request renders independently of the ambient cap;
measure their input-to-next-visible feedback against the unchanged 100ms limit.
Do not turn gaps between isolated actions, reduced-motion updates or fallback
updates into dropped-frame intervals. Keep cold loading, upload/compilation long
tasks and active-control stalls in their own workload observations; settled
ambient sampling cannot conceal them. A scheduler RAF callback or passive
application callback is not an actual scene render or completed GPU frame.
Measure scene render submissions, frame work and available GPU evidence separately.
Use actual render timestamps; the scheduler's clamped simulation time is not
elapsed frame time.

Only the world decorative cadence scope is corrected. Load, input, transfer,
GPU/draw/triangle, upload, memory/resource, hidden-tab and owner/device requirements
remain unchanged. Full R06 is still incomplete.

Keep's desktop/high 30fps and balanced 24fps caps remain. Measure input-to-next-visible
feedback p95 <=100ms in all profiles. Reduced motion is event-driven: do not grade
idle frames as dropped frames; measure requested feedback/updates and idle RAF
cessation instead. Hidden tabs must stop decorative rendering.

## Workload and method

- Use the production build on a task-owned local server for controlled asset/CPU
  measurements and repeat live smoke/load checks after deployment. Record both;
  localhost is not evidence of production network latency.
- Ten cold runs per profile, with HTTP cache/service-worker cache cleared and
  fresh page context. Measure navigation start to usable realm UI and to first
  usable world scene, then first keep entry to usable keep. All must meet the
  profile limit. User login/approval waiting is separately timed, not counted as
  loading; retain all automatic authentication/bootstrap/network wait time.
- Usable means correct scene or intentional usable schematic fallback with
  responsive controls and authoritative loaded state, not a spinner or fake data.
  A graphics fallback cannot conceal unavailable gameplay or replace mandatory
  successful WebGL visual acceptance.
- After warm-up, record three 60-second samples: actual world navigation/dispatch
  controls, keep placement, and all-six-level-five keep. Report p50/p95/p99 frame
  intervals, frame-work duration, long tasks, actual GPU counters where available,
  and raw sample count. p95 uses nearest-rank sorted samples.
- Local fixtures can cover advanced building states without waiting 12 hours, but
  the ten-minute real owner journey remains separately mandatory.
- Record task-owned browser/CPU throttling settings and background load; do not
  discard slow runs without recording cause and all original samples.

## Transfer and GPU budgets

Measure production compressed transferred bytes (response encodedBodySize and
server encoding), with cache disabled. Include root/bootstrap JS, fonts and
assets needed through first world and keep entry; report API traffic separately.

- JavaScript needed through first usable keep: <=2MiB compressed in every profile.
- Total static transfer through first world and keep: <=12MiB high, <=8MiB
  balanced, <=5MiB reduced. Prefetches count if started in that interval.
- Optional assets loaded later must be separately listed; do not defer required
  scenery indefinitely merely to omit it from the measured window.
- Keep targets: high 180 draws / 300,000 triangles; balanced 120 / 180,000;
  reduced 80 / 90,000. Measure actual renderer work including shadow passes, not
  only scene-graph declarations. Preserve stricter existing world voxel/chunk,
  upload and residency caps; this contract does not increase them.
- Keep voxel preparation <=16ms per synchronous unit on the reference desktop;
  otherwise split/defer optional work or reduce density before acceptance.

## Repeated-switch resource budgets

After three warm-up world/keep cycles, record a baseline, then 20 more world/keep
cycles and 10 realm-selection/re-entry cycles with verified fresh scope handling.
Also run three context-loss/restoration cycles. Repeat balanced, reduced and
reduced-motion/fallback cases.

- At most one active world/keep canvas and renderer at any time.
- After final disposal: zero task-owned RAFs, active loaders, sockets/subscriptions
  and event listeners; distinguish app-wide resources from scene-owned resources.
- Settled geometry/texture counts and owned GPU bytes must return to the same
  warmed-state baseline for identical scene state after every cycle.
- Retained JS heap after explicit measurement GC: final <=baseline+8MiB and
  fitted post-warm-up growth <=0.25MiB/cycle. Keep raw per-cycle observations.
  Unsupported heap measurement is missing evidence, not a zero-byte result.
- No monotonic growth in retained scene objects, listeners or subscriptions.

## Physical devices and decision control

Emulation on an RTX 3090 does not establish physical-phone performance. Record any
available physical phone/browser/quality/thermal context separately, including
touch, background/resume, reconnect and fallback. No phone result is currently
recorded. Do not fabricate one or label viewport screenshots a device test.

Any change to these gates requires a dated material reason and release impact.
Do not raise limits merely to pass a failing measurement. All final result rows,
raw evidence links, artifact/source IDs and review verdicts remain pending.
