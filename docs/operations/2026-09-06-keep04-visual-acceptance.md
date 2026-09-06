# Verdant Citadel QA instrumentation and acceptance ledger

Status: source instrumentation; Task 8 and release acceptance remain incomplete.
Source review of `d88e376bb84690d0d1553a8900e54553aa92cbf8` identified the issues
below. Round 1 source corrections passed independent source review; this is
still an unfinished development checkpoint:

- Capture provenance: configuration is now frozen during capture, including fault
  and effective reduced motion. Later idle configuration changes do not relabel
  retained samples or the captured last observation.
- Pre-frame readiness: the probe now waits for the requested navigation's document,
  exact URL/scenario/quality/fault/motion/viewport, and an actual frame with numeric
  renderer counters or terminal fallback. Stale documents/scenarios keep polling.
- Capture boundaries: repeated Start is disabled/guarded, Stop drains queued
  long tasks before disconnect/publish, and start/stop performance timestamps are
  recorded. New captures correctly re-establish long-task support.

Do not use the affected checkpoint reports as release acceptance evidence. The
Windows launcher addition still needs review and actual captures/measurements. Existing
build warnings remain warnings, not performance results.

Binding measurement gates: [0.4 performance contract](../evidence/0.4.0/performance.md).
DEV fixtures, production full-world/keep measurements, actual owner gameplay,
and a physical phone are four distinct evidence lanes. A passing unit suite or
synthetic screenshot does not prove the other lanes.

## Reproduce synthetic presentation

Use the existing task-owned Vite origin `http://127.0.0.1:4176`; do not start a
second server. Open `/dev/keep04-qa.html?scenario=all-six-level-five&quality=high`.
Allowed scenario names: `empty`, `mill-placement`, `blocked-placement`,
`mill-constructing`, `mill-complete`, `all-six-level-five`, `fallback`,
`reduced-motion`, `context-cycle`. Quality is `high`, `balanced`, or `reduced`.
The optional `motion=reduced` applies event-driven reduced motion to any state.

The actual `Keep04Screen`/`Keep04SceneHost` render decoded Task 2 wire shapes and
`presentState04`, not a second renderer. The all-six layout is checked against
`evaluatePlacement04` before decoding/rendering. Placement fixtures carry only
conspicuous local quote metadata; no real atlas response, resource location,
owner identity, connection, request envelope or gameplay authority is created.
Every command is suppressed by the synthetic controller. The real Workers panel
can be inspected, but genuine resource dispatch is not emulated by invented targets.

Open the top **Synthetic controller · local visual QA only · Controls** details
for scenario/quality, fixed graphics fault, mount/unmount, context loss/restore,
and observation controls. Faults exercise missing Mill prefab, failed voxel
preparation, and complete WebGL unavailability through compile-time DEV gates.
They cannot be enabled by a production query. Fallback contains all six actual
schematic silhouettes; missing-model exercises the real procedural Mill fallback.

Use the real Buildings/Worker controls to inspect catalog, permanent confirmation,
and Worker panel. On mobile/short landscape, the compact primary actions after
Resources use the same panels and retain opener focus. The schematic remains
default-open, user-collapsible and mounted across graphics recovery.

## Observation contract

Start bounded observation, perform the intended workload, then Stop and publish
observation. Read the JSON text from `output[data-qa-observation]` or inspect the
live `data-last-observation` attribute. No controller state is exposed. Maximum
retention is 12,000 host records and 12,000 long-task entries; `overflow` means
evidence is incomplete, never silently truncated acceptance. Publish does not
clear records. Start resets them only when no capture is already active and locks
scenario/quality/fault controls until Stop. Published configuration always belongs
to the retained capture, even after idle controls change. Start/stop timestamps
bound samples; Stop drains queued long-task entries before publication. Keep
long-task observer work separate from scene-owned resources.

| Field | Provenance |
| --- | --- |
| renderCalls, renderTriangles | Actual `renderer.info.render` after submission, including shadow work |
| rendererGeometries, rendererTextures | Actual `renderer.info.memory` counts, not bytes |
| ownedGeometryBytes, ownedTextureBytes | CPU-side scene-buffer estimates, not measured GPU allocation/release |
| voxelPreparationMs | Wall-clock synchronous dressing preparation; null when preparation unavailable |
| timestampMs | Rendered RAF callback timestamp for frame events; performance clock for lifecycle events |
| frameWorkMs | Scene update/render/host frame bookkeeping, excluding observer callback collection |
| pendingRafs, activeLoaders, activeListeners | Host-owned lifetimes only; loss retains one restoration listener |
| observerWorkMs | Harness serialization/recording overhead, not GPU work or full observer overhead |
| longTasks | Supported browser long-task observations; support explicitly reported |

All numeric fields are finite/nonnegative or null; unknown fields are dropped.
Observer exceptions cannot change rendering or cleanup. After disposal, missing
renderer counters are null, not invented zeros. An aborting asynchronous loader
may remain active until settlement; its later disposal observation reports that
transition. Upload bytes/time and retained GC heap remain null until a suitable
measurement transport supplies them. Do not infer GPU reclamation from scene disposal.

The scene is event-driven at rest even without reduced motion. Idle gaps between
requested frames are not frame pacing samples. Workloads must exercise real
placement/navigation or the actual completion reveal; retain raw samples and
separate requested input latency from idle time. No artificial continuous animation
or automatic feedback timestamp is introduced for a better benchmark result.

## Browser probe

`node scripts/qa-observer/keep04-browser-probe.mjs --base-url=http://127.0.0.1:4176`
accepts exactly that argument. No remote origin, credentials, arbitrary output,
profile or browser path is accepted. Outputs stay below `artifacts/keep04-qa/`
and use exclusive creation to avoid replacing earlier evidence. The CLI writes
an explicitly unmeasured manual plan, not an executed browser verifier. The exported
`runKeep04BrowserProbe(session)` supports the existing CDP `command` interface for
an already-owned browser session; it does not launch browser/server processes.
Its captures remain uninspected until images are actually reviewed.
The controller independently verified the existing CDP pipe transport with
Windows Chrome 151 in a disposable credential-free profile (version/targets/close
only, no navigation or measurements). The separate Windows-local entry point is:

```powershell
.git/ci-node-22.22.3/node.exe scripts/qa-observer/keep04-windows-capture.mjs --base-url=http://127.0.0.1:4176
```

Run only after source review with the existing controller-owned Vite server and
stable source. It verifies the fixed installed Google-signed Chrome executable
before/after launch and after capture, uses the existing inherited-pipe transport,
and enables exact-loopback request guards before navigation. The exact QA Document
response is paused before delivery and receives an additional enforced HTTP CSP:
`sandbox allow-scripts allow-same-origin; worker-src 'none'; frame-src 'none'; child-src 'none'; object-src 'none'; form-action 'none'`.
This synthetic-only policy natively denies auxiliary contexts and worker creation;
target discovery/closure is defense-in-depth, not prevention. Original bounded
response headers/status are preserved. Readiness and screenshots require confirmed
policy delivery for the exact requested document, reset on every navigation.
Cache is disabled to require a fresh guarded response. Security-policy errors fail
the run instead of accepting policy-altered rendering. This policy is prominently
recorded in provenance and is not production gameplay/performance configuration.
No arbitrary browser,
profile, output, origin, credentials, TCP debugger, software-renderer override,
or server-start argument is accepted. Fresh profiles stay under
`.cache/keep04-qa/profile-*`; captures and bounded provenance are exclusively
created under `artifacts/keep04-qa/windows-run-*`. Repeated runs never replace
earlier evidence. Profiles are retained; cleanup does not recursively delete them.

Each successful run writes 36 PNGs, `synthetic-render-observations.json`, and
`run-provenance.json`. The latter records executable identity, browser/backend,
source commit/tree and substantive dirt (read-only CRLF input normalization, with
no whitespace-equivalence diff flags, and untracked artifact/cache work areas
excluded), diagnostic classes/counts, and verified
owned-browser cleanup. HMR, navigation, output and cleanup failures cannot become
accepted evidence. Warnings are counted without retaining console arguments or
request bodies; absent metrics stay absent. Failed runs retain bounded failure
stage/provenance when output remains writable. Cleanup uses fresh-profile and
process-creation identities, never global Chrome termination. Uncertain cleanup
retains the profile and fails the run.

Source queries preflight attributes before conversion and reject any `filter`,
`ident`, or `working-tree-encoding` declaration, including disabled declarations;
no custom conversion executes. Git process-local `core.autocrlf=input` preserves
trailing spaces/tabs, final-newline changes and binary changes. No persistent
configuration, index or worktree normalization occurs. Inventory is bounded to
4,096 paths and each query to 15 seconds/1 MiB; unsupported/oversized source
inventory fails closed, never claims cleanliness. The controlled native-browser
popup/worker negative check and actual capture remain controller review gates.

The launcher is narrowly source-tested; its complete Windows navigation/capture
run remains controller-owned and unexecuted during implementation. Successful
capture still means images uninspected and performance not measured. Windows
transport is available; macOS is not a final dependency. Full Task 8/R11 production
measurements and the separate owner/phone/G001 lanes remain open.

Capture each named state at 1440x900/high, 390x844/balanced, 390x844/reduced and
844x390/balanced. Also inspect open catalog, Workers and permanent confirmation.
Record browser/backend/OS/scale, source commit/tree and whether DEV or production.
Do not measure during HMR edits: freeze the source for each captured run.

## Acceptance ledger (controller-owned final evidence)

| Lane/gate | Status / required evidence |
| --- | --- |
| Unit/source, genuine bindings | Task tests and final commit listed in ignored Task 8 report; binding provenance below |
| Synthetic render | Controller exploratory Chrome captures exist; stable-source captures and complete state/profile image review still required |
| Mobile primary reach | Representative 390px correction inspected by controller; primary buttons visible after resources, correct panel/focus; not full mobile acceptance |
| Mobile catalog resource visibility | Known limitation: panel lower in flow after schematic; resource totals scroll away during panel use |
| Mobile six-building identity | Full-fit small economy silhouettes remain tiny; explicit zoom/Fit available; readability not accepted solely from no-overflow |
| Context recovery | Controller exploratory loss/restore reached one canvas; HMR contaminated repeat timing; clean three-cycle evidence required |
| Production cold load/transfer | Not measured: ten cold runs/profile; realm UI/world/keep usable timings; compressed JS/static bytes, API separate |
| Production frame pacing | Not measured: three 60-second workloads/profile, nearest-rank p50/p95/p99, raw sample counts, work/long tasks and input latency |
| Production lifecycle/heap | Not measured: three warm-up + 20 world/keep cycles, ten realm cycles, three contexts; repeat balanced/reduced/reduced-motion/faults; GC heap baseline/growth |
| Actual owner journey | Not measured: initialize once, real location dispatch/return, Mill placement/completion, captured yield twelve next food expedition, reconnect persistence; elapsed target <=10 minutes |
| Physical phone | Not measured: device/browser/quality/thermal context, touch, resume/reconnect, frame pacing, fallback |
| G001 unchanged entry | Unit regressions separate from mandatory actual baseline visual comparison; no visual preservation claim yet |
| Deployment/final release | Controller-owned release assembly, production verification and Desktop handoff; no freeze or ship claim |

Keep the established profile gates unchanged: desktop p95 <=33.4ms, mobile
balanced/landscape <=50ms, reduced <=75ms; input feedback <=100ms; synchronous
voxel unit <=16ms. Draw/triangle targets 180/300000 high, 120/180000 balanced,
80/90000 reduced. Remaining transfer/heap gates are in the binding contract.
Keep-only mount cycles are explicitly not world/realm cycles.

## Requirement and provenance map

Tasks 0–2: accepted genuine SDK methods; isolated owner authority, exact replay,
strict immutable presentation and stale-scope rejection. Task 3: actual PTR host
and world/keep lifecycle. Tasks 4–5: resource selection, permanent construction
and completed benefits. Tasks 6–7: six silhouettes, bounded visual-only voxel
scenery, graphics fallback, accessibility, context recovery and cleanup. Task 8:
synthetic scenarios/observation, G001 comparison and honest separated evidence.
Real owner, phone and release closure remain gates, not fixture claims.

Accepted binding source: `966a95f2ce4c9a6bb70374832f5216e107f713c7`, tree
`9e07dbc493c3e186be710136ab411df3d80a8084`; retained generation capture
`.git/ptr-bindings-966a95f.json`; generated binding carry
`ccd11b29058a07f04118bf1a247b7f71cab0651b`. Controller accepted the five actual
gameplay accessors with matching provenance. No generated shim is introduced.
Task 8 starts from `e711523946a0982050461ce9f2e4b9fff3771a32`; exact final source
commit/tree and verification results belong in the Task 8 report and final
controller capture manifest rather than a self-referential commit placeholder.
