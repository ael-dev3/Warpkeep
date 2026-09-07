# Gameplay, identity and visual quality audit

Source snapshot: 2026-09-07, `1600f4b`; see [execution handoff](execution-handoff.md)
for subsequent fixes. Findings below distinguish defects, intentional constraints
and missing acceptance. Do not treat every closed gate as a bug to remove.

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

## Findings requiring action

### G01 — healthy refresh can tear down the scene and move focus

Priority: high integration correctness. At audited source, the real hook polls
every five seconds in `src/ptr/gameplay04/useGameplay04Controller.ts`. Its
controller publishes `loading` on an ordinary refresh even after a verified view.
`Keep04Screen.tsx` mounts `Keep04SceneHost` only in `ready` and moves focus to Back
on ready-to-not-ready. The host unmount disposes assets, canvas and context.

This source chain predicted renderer recreation/focus loss during healthy polls;
the subsequent held-response integration regression reproduced both cases.
It also prevents `createKeep04Scene.ts` from seeing construction-to-complete in
the same scene, which its reveal effect requires. Existing immediate-read/static
controller tests do not cover a held real refresh response through a React render.

Required correction: reproduce with real hook/controller + screen, hold a second
read, verify scene/host and focused control continuity; keep actions unavailable
while refresh is unresolved. Resolve changed authoritative state in place. Failed
reads, expired scope, pending/uncertain commands must still block or retire as
appropriate. Do not retain an expired capability or allow stale-state mutations
merely to preserve the picture. The bounded correction and focused verification
are recorded in the [continuation record](execution-handoff.md). Final rendered
performance/owner acceptance still remains separate.

### G02 — short PTR sessions can interrupt the intended first journey

Priority: product acceptance risk, not a security defect. PTR owner JWT lifetime
is at most 120 seconds (`spacetimedb/ptr/src/ownerPolicy.ts`). At expiry,
`src/ptr/PtrRealmProvider.tsx` closes the connection, retires capability and returns
to unknown; `WarpkeepExperience.tsx` returns the player to the menu. Current tests
explicitly require a fresh access check. No automatic renewal is implemented in
that provider at the audit snapshot.

A two-minute level-one build and a ten-minute first journey cross this boundary.
Exercise genuinely authorized renewal/re-entry early, including an ambiguous
command near expiry. Verify the authoritative read explains what actually
committed; never silently submit a new irreversible command. If this prevents a
usable journey, document a bounded fresh-authorization UX correction. Do not
lengthen TTL, keep old capability alive, invent tokens or weaken epoch/database
checks. This audit did not request or implement a policy change.

### G03 — real route timing and improved return are unproved

`tests/gameplay04KeepModules.test.ts` invokes actual bundled adapter code through
`PtrHarness`, with synthetic routes, controlled clock and renewed auth fixtures.
Its “actual PTR” title means actual adapter, not networked live PTR. The test
checks the next dispatch captures improved yield, not that the improved return
is credited within ten minutes on the real atlas.

Record real route lengths, dispatch/return timestamps, deductions, building
completion, subsequent improved dispatch **and credited return**, wall time and
renewal/background overhead. Do not extrapolate from a one-edge test atlas. No
connected ten-minute gameplay acceptance runner was found in the inspected
integration/smoke/connected tooling. Existing atlas/G001 probes are not substitutes.

### V01 — water polish must target the renderer actually used by 0.4

The [Pelagic study](../../operations/2026-09-06-water-visual-reference.md) is bounded
inspiration, not copied source or completed implementation. Actual 0.4/PTR water
comes from `src/greater-realm/createGreaterRealmSceneRuntime.ts` (`waterMesh`),
using per-cell geometry and a standard material with color/opacity animation.
The richer analytic wave/foam shader in `components/realm/realmWaterLayer.ts` is
used by legacy G001 `createRealmScene.ts`, not this runtime.

Do not claim the advanced legacy shader is already integrated into PTR, or alter
G001 water appearance to satisfy 0.4. Use a bounded 0.4-owned material/helper if
implementation evidence calls for it; preserve public-cell geometry, hydrology,
picking and scheduling. No FFT ocean, extra reflection/refraction scene passes,
physics, free flight, underwater mode or new environmental interactions. Judge
the result at strategic-camera scale and the existing 390px mobile budgets.

### V02 — visual completeness exceeds current rendered evidence

Recorded evidence includes a stable 36-case Windows native-Chrome synthetic
capture at earlier source and a later 390×844 balanced interactive placement check.
Offline voxel-plan generation reduced one measured CPU4 preparation workload from
about 19–25ms to 1.3–2.8ms. Those are useful specific results, not final acceptance.
See [Windows capture](../../evidence/0.4.0/windows-keep-capture-2026-09-06.md) and
[visuals](../../evidence/0.4.0/visuals.md), including their remaining limitations.

Small-building readability, landscape/offscreen action coverage, the full
all-six progression matrix and final source-bound captures remain. Fallback
geometry tests for every kind/level do not establish prefab readability at mobile
full-fit. The expected `docs/evidence/0.4.0/renderer.md` was absent at this snapshot;
provide the required evidence destination or an explicit approved ledger mapping.
Do not silently treat another passing component note as closing that gate.

## Acceptance matrix to finish

| Required proof | Existing support | Missing result / method |
| --- | --- | --- |
| Actual-owner representative loop (R02/R03/R07) | Pure and adapter tests, typed real bindings, route controls | Genuine isolated PTR journey; economy building + improved return ≤10m |
| All six effects/progression | Numeric matrix and construction/upgrade tests | Explicit per-family matrix distinguishing core, adapter, generated-binding and rendered evidence |
| Retry/expiry/reconnect (R08) | Exact envelope/scope tests | Cross-expiry uncertain outcome, background/resume and realm-switch owner journey |
| G001 preservation (R09) | Narrow freeze guard tests and separate presentation paths | Recorded deployed identities/admitted baseline; real players/timers/reconnect/presentation preserved |
| G002 closed (R10) | Bundled denial-before-storage tests | Live denial plus authenticated before/after no-unauthorized-write evidence |
| Art/voxel/fallback (R04/R05) | Integrated mesher, art profile, fixture captures | Empty/placement blocked/legal/construction/completion/all levels; desktop, portrait, landscape, reduced/motion/fallback |
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

The correct next work is targeted integration and real acceptance, not replacing
the already-tested transition core or inflating scope to postpone the finish line.
