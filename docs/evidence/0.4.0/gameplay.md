# 0.4 gameplay integration evidence

Recorded 2026-09-06. **R02/R03/R07 remain incomplete.** The following accepted
source components and local fixture tests are not a live owner playtest.

## Panel dismissal during a request or refresh — 2026-09-12

Inspection of the real PTR host at `9ac3ee36` exposed a caller mismatch that the
standalone screen test missed. The screen kept Close/Escape available during a
pending command or refresh, but the host rejected its dismissal request before
handling `panel: null`. Focus moved to the opener while the panel stayed open.

The host now handles dismissal before its ready/view guard. Dismissal clears
only the local placement draft and traverses to the existing keep ancestor.
The same controller, pending command and last confirmed scene/resources remain.
Opening panels, selecting buildings and issuing commands retain their existing
readiness and authority checks.

Eight integrated regressions exercise the actual `RealmMapScreen` host and
controller across browser/MiniApp, Close/Escape and held mutation/refresh cases.
All eight first failed at the panel-removal assertion, then passed after the
one-line guard move. They check retained scene/resource DOM, balances, opener
focus, unchanged pending signal, no extra read or replay, and held-refresh
completion without reopening. An initial missing matcher registration failed
before those behavioral assertions; that setup attempt is not the red result.

Pinned Windows Node 22.22.3 passed all 68 host/screen tests without skips, plus
both explicit app and Node TypeScript noEmit projects. Independent review found
no actionable defect. The pre-existing viewport-refresh test still emits React
`act` warnings; the new cases do not. These are controlled DOM tests, not a
physical-device or authenticated-owner acceptance record.

The change is developed separately on `codex/0.4-pending-panel-dismissal`, based
on the published PR #240 integration. The host is a prepared-closure member, so
its new bytes still require canonical complete-family preparation/check and
integration before release acceptance. Do not hand-edit its manifest digest.

## Reviewed source checkpoints

| Component | Accepted commits | Evidence and limits |
| --- | --- | --- |
| Realm-bound client and generated bindings | `ccd11b2`, `6b1d2e4` | See `bindings-client.md`; no arbitrary RPC or structurally forged capability |
| Strict state, presentation, quotes and placement | `53bede2` | Runtime decoding, authoritative balances and pending returns, shared policy-based quotes and permanent footprint validation |
| Command/controller lifecycle | `df7acb8`, `615597c` | Single-flight commands, original-envelope uncertain retry, authoritative refresh on stale quotes, explicit renewed confirmation |
| Keep controls and schematic | `16f5c02`, `91bf888` | Four Workers, six building choices, resource deficits, permanent placement, repeated rejected-quote review recovery |
| Actual frontend PTR route integration | `acd62c7ce785939cbe8a16ca4ef3b63291a31e08` | Provider publishes capability only after preflight/bridge; lazy matched host; world/keep navigation; actual selected-resource assertions; bounded returned-route inset |
| Verdant Citadel renderer | `b020f7c`, `2c460f8` | New 0.4 composition/materials, bounded decorative voxels, six pinned prefab families and distinct procedural fallbacks, keyed reconciliation; actual-host frame-cadence repair independently reviewed |

Each checkpoint passed its task-scoped independent spec and quality review.
Task 5 review found no defects. Its cross-task limitations remain mandatory
release acceptance: real owner gameplay, server behavior on deployed modules,
physical-device behavior, graphics performance and actual new-renderer cleanup.

## Task 5 local verification

The implementation report records these commands and results on the Windows
worktree at `acd62c7`:

```text
npm test -- tests/WarpkeepExperiencePtrRealm.test.tsx tests/PtrGameplay04SurfaceHost.test.tsx tests/greaterRealmWorldScene.test.tsx tests/ptrRealmConnection.test.ts tests/PtrRealmProvider.test.tsx tests/ptrGameplay04Capability.test.ts tests/gameplay04Controller.test.ts tests/gameplay04ControllerLifecycle.test.tsx tests/Keep04Screen.test.tsx tests/Keep04PlacementUi.test.tsx tests/Keep04Benefits.test.tsx
# 11 suites, 219 tests passed, exit 0

npm test -- tests/realmMapScreen.test.tsx tests/useRealmSurfaceNavigation.test.tsx tests/realmSurfaceNavigation.test.ts tests/ptrGameplay04Bindings.test.ts tests/gameplay04ClientState.test.ts tests/gameplay04ClientPlacement.test.ts tests/gameplay04Presentation.test.ts
# 7 suites, 151 tests passed, exit 0

& .git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -b
# No output, exit 0
```

Tests use real branded frontend capability/controller paths with synthetic SDK
responses and world runtime/canvas fixtures. They cover copied/wrong-generation
capability rejection, stale selection invalidation, explicit Worker/duration,
pending-command navigation, resource focus and returned route bounds. The route
inset is two-dimensional; it does not prove 3D Worker animation. The keep is still
schematic at this checkpoint, so future WebGL world/keep exclusivity must be
measured again with the actual renderer.

## Remaining acceptance

Task 6 source review accepted the renderer after the cadence fix. Its report
records 191 passing tests across 11 focused renderer/UI/route suites and pinned
TypeScript build-mode validation at `2c460f8`. Tests cover all six procedural
fallbacks across five levels and actual host scheduling with controlled RAF
timestamps; these are not measured real-device frame times. Existing pinned
models are reused assets, not newly authored Astra models.

Representative actual Chrome renders at desktop 1440×900/high and 390×844/balanced
were inspected for the settled composition. These synthetic local fixtures do
not establish all-six visual coverage, full-path transfer/performance budgets,
GPU cleanup or the live owner journey. Task 7 owns context recovery, resource
cleanup (including explicit forest-instance disposal) and accessible fallback;
Task 8 owns broader rendered acceptance and measurements.

Demonstrate dispatch, gathering, return, first construction, completion and the
improved subsequent return through the actual authenticated owner's isolated PTR
on actual atlas routes. Record the first economy building **and improved return
within ten minutes**, all six effects/progression, reconnect/background/switching
and failure behavior. Do not infer these outcomes from fixture time advancement,
button availability, test totals or a successful source push.

## Nested panel closure — 2026-09-08

The real keep host treated the child screen's explicit close request as one Back
step. Closing or pressing Escape from a building review therefore left the
catalogue open; closing Workers after switching from placement reopened the prior
building panel. Component-only selection tests did not expose the history-backed
caller mismatch.

Source commit `0d98599c1f26ecc74c4182fc587cd21278c3af63` adds traversal to an exact existing ancestor and closes to the
keep root. It retains the separate Back action, browser-history serialization,
lost-popstate watchdog and session reset. Closing discards the placement draft;
Forward may revisit a presentation route but cannot restore that draft or submit
a command. Focus returns to the opener and the panel's expanded state closes.

The actual host, screen and navigation hook reproduced the original defect with
synthetic ready state and no gameplay submissions. The exact five-path repair
passed 96 tests across the host, screen, navigation and HUD suites on native Linux,
with app/configuration noEmit checks and independent source review. Tests cover
Close/Escape in browser and Mini App modes, nested placement/Worker panels, focus,
Back/Forward, absent ancestors, concurrent traversal attempts and identity reset.
A pre-existing viewport-refresh React `act` warning remained; no tests failed.

The reviewed patch SHA-256 is
`a88d74dea4ca87a3284aa2e53632d30a28b52cd80cf7280f9e2bb2752940c3ca`.
Its test input was exact `b306eed` plus that source patch in an independent checkout
with owned dependency copies. No server behavior, physical-device performance,
rendered visual acceptance or authenticated owner play is established by these DOM
tests. The changed runtime bytes also require their actual generated source
manifest/workflow references; the publication record identifies that derivation
separately from full native source preparation.
