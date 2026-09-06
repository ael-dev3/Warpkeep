# Task 6 — Verdant Citadel renderer

Status: DONE. Representative art gate approved by the controller before commit on 2026-09-06. Independent code review belongs to the controller; no subagents/helpers/reviewers were dispatched.

## Scope and implementation

- New actual Three.js scene mounted through the accepted `Keep04Screen`, with its accessible placement schematic retained as an expandable alternate. No policy, transport, server, G001 scene, pinned catalog/asset, dependency manifest, or release-infrastructure edits.
- Exact specified palette; elevated orthographic civic-center camera; full scenic-envelope fit with 10% margin; bounded pan/zoom, directional key/hemisphere fill, high-only supported PCF shadows. No free flight, postprocessing, mechanics expansion, prebuilt Cathedral/Barracks, or scenery picks.
- Flat legal support at y=0, subtle deterministic vertex-color modulation, pale exterior voxel terraces, low yielding perimeter and open civic/gate spine. Existing fixed counts of 18/12/6 decorative trees are instanced in two staggered exterior bands.
- Bounded voxel planning stops occupancy before the shared mesher; enforces cells/faces/quads/96-byte reservations before emission. Geometry uses normalized Int8 normals and Uint8 cloned palette colors. Bounded failure uses the simple perimeter fallback, with partial geometry cleanup.
- All six pinned families, uniformly normalized inside exact policy footprints; distinct procedural family fallbacks; levels 1–5 mesh numeral badges and zero-to-four pennants; bounded construction scaffold/work light; short presentation-only completion reveal. Reduced motion skips the reveal. Selection/draft changes retain keyed building instances and never reload assets.
- Neutral pinned loader requests exactly six building IDs and two used tree IDs, no population. Controller approved high→balanced source tier and balanced/reduced→compact; no required family dropped because of raw-file size alone. Catalog byte/triangle/draw preflight precedes requests; actual geometry/material texture inspection precedes prefab attachment, with budget-rejected prefabs replaced by bounded silhouettes.
- Actual-component, loopback/DEV-gated React harness includes `EMPTY_WIRE04` and decoder-validated Mill construction/completion fixtures. Mill yield comes from shared policy (12 at level 1). Construction timestamps are relative to fixture creation (15 seconds elapsed, 105 seconds remaining), not ancient epoch constants. Its conspicuous synthetic decoder context is not a session/capability/player identity and is never published by the renderer. No network gameplay calls.

## TDD evidence

All commands ran from `C:/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree`, using pinned Node 22.22.3.

Initial RED:

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/keep04VisualProfile.test.ts tests/keep04VoxelDressing.test.ts tests/keep04Buildings.test.ts tests/keep04Scene.test.ts
Test Files  4 failed (4)
Tests       no tests
Failed to resolve import ../src/components/keep04/keep04VisualProfile
Failed to resolve import ../src/components/keep04/keep04VoxelDressing
Failed to resolve import ../src/components/keep04/createKeep04Buildings
Failed to resolve import ../src/components/keep04/createKeep04Scene
```

This was the task-required missing-module RED before implementation. Initial GREEN of the same command: 4 files passed, 44 tests passed, exit 0.

Host/harness RED:

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/keep04Scene.test.ts
Test Files 1 failed (1)
Failed to resolve import ../src/components/keep04/Keep04SceneHost
```

Host/harness and existing screen GREEN: the four scene files plus `tests/keep04Screen.test.tsx`: 5 files passed, 62 tests passed, exit 0.

Accounting/boundary regression RED:

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/keep04Buildings.test.ts tests/keep04Scene.test.ts
Test Files 2 failed (2)
Tests 2 failed | 38 passed (40)
geometryBytes expected 36, received 1200
uploadBytes expected 128, received 1292
nested economic field: expected function to throw an error
```

The first caught counting an entire backing ArrayBuffer instead of the actual uploaded attribute range; the second caught accepting extra economic fields inside a BuildingView. Fixed with attribute/interleaved-buffer deduplication and closed visual/nested field checks. The rectangular mip expectation (92 bytes for a 2×8 RGBA texture with mips) and actual-geometry budget-rejection case also pass.

Art/fixture RED:

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/keep04VisualProfile.test.ts tests/keep04VoxelDressing.test.ts tests/keep04Scene.test.ts
Test Files 3 failed (3)
Tests 8 failed | 13 passed (21)
scenic projected corner 1.2913922971244487 exceeds 0.9090919090909091
terrace linear red 0.19607843137254902 is not greater than 0.35
createKeep04QaSnapshot is not a function
```

GREEN of the same command after expanded fit, masonry palette, and validated fixture factory: 3 files passed, 21 tests passed, exit 0.

Final surface-composition RED:

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/keep04Scene.test.ts
Tests 1 failed | 11 passed (12)
legal deck color attribute: expected undefined to be defined
```

GREEN after flat modulation and irregular fixed-count forest framing: 12 tests passed. Final disposal RED from the same command caught retired telemetry still declaring `sceneryInstances:6` and `voxelQuads:40`; both now return zero on disposal.

## Final verification

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/keep04VisualProfile.test.ts tests/keep04VoxelDressing.test.ts tests/keep04Buildings.test.ts tests/keep04Scene.test.ts tests/voxelSurfaceMesh.test.ts tests/innerKeepAuthoredPresentation.test.ts tests/innerKeepSceneLayer.test.ts tests/keep04Screen.test.tsx tests/PtrGameplay04SurfaceHost.test.tsx tests/PtrRealmProvider.test.tsx tests/WarpkeepExperiencePtrRealm.test.tsx
Test Files  11 passed (11)
Tests       180 passed (180)
Duration    15.10s
exit 0; no warnings/errors in test output

.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -b
exit 0; no output

git diff --cached --check
exit 0; no output
```

Coverage includes 30 parameterized six-family/five-level fallback cases, footprint bounds, low triangles, material ownership/sharing, silhouette/badge names, every-profile voxel determinism/caps, full projected framing, explicit building-only picks, y=0 half-metre placements, unchanged keyed objects, no timer-driven project completion, six-max-level scene targets, oversized actual prefab fallback, no economic/identity renderer fields, unsupported-WebGL fallback, valid actual-component fixtures, existing keep UI and real PTR routing.

An unnecessary whole-root run was launched once:

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run
exec session 28821; root PID 40168
greaterRealmCutoverOperationJournal.test.ts: 52 failed / 53
SafePublishError: The Greater Realm publish supervisor directory was not private.
```

Other completed failures included native Windows notification deploy/token-budget ownership tests. Per controller clarification, stopped this task-owned redundant process and its inspected worker PIDs; verified root PID absent; handle exited 1 without an aggregate completion summary. **Interrupted, not passed.** No ownership restrictions were bypassed and no unrelated code was repaired. Supported-environment whole-release verification remains controller-owned.

## Ownership and measurement boundaries

- Host owns the asset bundle and disposes scene children first, then bundle, then renderer/context. Late/aborted loads dispose their bundle. Scene/building disposal is idempotent. Cloned/tinted materials are owned locally; building source geometries/textures remain bundle-owned. Tree geometry/material clones and instancing buffers are scene-owned. Shadow render targets are retired via the directional shadow's disposal.
- `SceneTelemetry04` counts unique uploaded BufferAttribute/InterleavedBuffer ranges and attached material texture allocation (including mips and shared-texture deduplication), not the entire unrelated backing array. Graph draw/triangle counts are explicitly not shadow-pass counts. Host data attributes separately expose actual `renderer.info.render` calls/triangles after rendering, along with scene buffer/texture accounting.
- Scene byte accounting is not a GPU-driver residency query; renderer-managed shadow render-target storage, driver overhead, and retained CPU source copies are not falsely reported as measured uploaded material textures. No separate pre-existing keep aggregate byte ceiling was invented. Existing world upload/residency ceilings were untouched.
- Catalog raw transfer is a conservative keep-only preflight, **not** the combined production response-encoded world/bootstrap/keep transfer. Controller approved lower source tiers without an invented per-keep reserve. Final <=12/8/5MiB total and <=2MiB JS, response encoding, all-six shadow work, frame timing, synchronous voxel <=16ms, repeated-switch heap/GPU/resource behavior, physical-device tests and live owner journey remain Tasks 7/8/release measurement gates. No performance acceptance claimed from raw metadata, unit tests or representative screenshots.

## Representative visual review and preview

Controller inspected actual Chrome 1440×900/high and 390×844/balanced renders before commit, not screenshot surrogates. Corrections: scenic envelope beyond legal-deck fit; pale masonry terrace contrast; supported PCF shadows (old deprecated PCFSoft warning gone after reload); valid Mill fixture/yield/time; independently bounded mobile canvas height and full-width desktop layout; flat restrained deck modulation and staggered forest. Final representative direction explicitly approved. This does not approve all-six detailed mobile silhouette legibility or final visual/performance acceptance.

Preview remains running for controller review:

```text
.git/ci-node-22.22.3/node.exe node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4176 --strictPort
exec session 69918
http://127.0.0.1:4176/dev/keep04-qa.html?quality=high
http://127.0.0.1:4176/dev/keep04-qa.html?quality=balanced
```

Toolbar selects empty/construction/completion fixture and quality; `motion=reduced` disables presentation reveal. This is local fixture evidence only. No remote push or production change was made by this implementer.

## Files and self-review

Created the six specified renderer files under `src/components/keep04/`, the three specified DEV preview files, and the four specified test files. Modified only accepted `src/components/keep04/Keep04Screen.tsx` for host/alternate integration. This report is the fifteenth task file. Exact task paths were staged; unrelated dirty worktree and the controller's intervening evidence-doc commit were preserved. No package installation or explicit node_modules/shared asset edits.

Self-review examined the staged source diff, ownership graph, field boundary, profile admission and test assertions. Fixed the typed-array overcount, nested field acceptance, expired/inconsistent fixture, retired telemetry, deprecated shadow option, and observed visual framing/layout issues. Typecheck also caught and corrected a canvas-event type and attribute-array type. Remaining later-task gates are explicitly listed above; there is no claimed release readiness.
