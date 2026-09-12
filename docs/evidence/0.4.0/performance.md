# 0.4 performance acceptance contract

Established 2026-09-06 before final visual implementation/measurement.
Status: **budgets established; synthetic cadence reporting added; no final measurements or pass claimed**.
Scope: final production-build 0.4 world/keep path, not a standalone demo.

## Synthetic observer instrumentation — 2026-09-10

The DEV Keep04 harness now derives nearest-rank p50, p95 and p99 frame-interval
values from valid rendered RAF timestamps and publishes the sample count with
each bounded observation. Loading, fallback, disposal and malformed timestamps
are excluded; a missing sample remains `null` rather than becoming a fabricated
zero. This makes future Windows/emulated captures easier to review against the
profiles below, but it is still synthetic instrumentation. It does not measure
GPU upload, retained heap, production transfer, physical devices or the required
owner journey, and it does not change any acceptance result.

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

| Profile | Viewport / quality | CPU/network shaping | Cold usable 0.4 scene p95 | Rendered frame interval p95 |
| --- | --- | --- | --- | --- |
| Desktop | 1440x900 / high | No CPU slowdown; 20Mbps down, 5Mbps up, 40ms RTT | <=10 seconds | <=33.4ms |
| Mobile emulation | 390x844 / balanced | 4x CPU slowdown; 10Mbps down, 2Mbps up, 80ms RTT | <=15 seconds | <=50ms |
| Mobile reduced | 390x844 / reduced | Same emulation shaping | <=15 seconds | <=75ms |
| Mobile landscape | 844x390 / balanced | Same emulation shaping | <=15 seconds | <=50ms |

Reduced rendering is intentionally capped at 15fps by the existing keep plan.
Ruling: use 75ms p95 for that profile rather than the plan's blanket mobile 50ms,
which contradicts its 66.7ms scheduling interval. This resolves the specification
conflict before measurement, not in response to a failed result. Cost if wrong:
reduced mode may feel less smooth; verify touch responsiveness separately.

The desktop/high 30fps and balanced 24fps caps remain. Measure input-to-next-visible
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
