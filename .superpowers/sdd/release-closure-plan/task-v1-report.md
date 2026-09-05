# Task V1 report — integrated bounded voxel renderer

## Status

Implemented on assigned base `b2ac2d41c64680e400032919f920897141ee395d` in two source/test commits:

- `f1e821d` — `feat(renderer): integrate bounded voxel terrain`
- `28abbbe` — `feat(renderer): expose voxel timing telemetry`

The implementation is the live Greater Realm/PTR scene path, not a detached demo. It changes no G001 renderer, admission policy, backend/schema, authentication, package/lock, generated binding, network, reducer, browser-storage, or persistence path. The known stale G002 navigation query alone changed from `Not admitted` to `Sealed`; its `data-admission=not-admitted`, blocked-entry, and sealed-status assertions remain.

This task does not establish the separate full server-backed playable progression goal, publication/deployment, an authenticated owner journey, or physical-device acceptance.

## Implemented component

- `voxelSurfaceMesh.ts` validates safe integer coordinates, uint8 materials, duplicate membership, cross-set material agreement, total occupancy caps, and exposed-face caps before unbounded growth. It traverses only occupied coordinates, buckets six-direction exposed faces by plane/material, greedily merges deterministic rectangles, and emits indexed Float32/normalized Int8/normalized Uint8/Uint32 arrays at exactly 96 bytes per quad. Plans are immutable, renderer-neutral, signature-bearing, and retain no caller arrays or GPU objects.
- `greaterRealmVoxelPresentation.ts` fixes High/Balanced/Reduced steps at `cellSize/4` + `cellSize/8`, `cellSize/2` + `cellSize/4`, and `cellSize` + `cellSize/2`; occupancy/face caps are 32768/16384/8192 and terrain-quad caps are 4096/2048/512. Returned public hex cells alone rasterize to a shared world grid with nearest-axial half-open ownership, four/three/two-voxel surface slabs, water-safe vertical quantization, chunk-local Float32 coordinates, and full emitted/context identity. Fixed prefabs provide a keep/four towers/battlements, broken ruin walls, signpost crossbar, tapered upright waystone, and post/lantern.
- `greaterRealmPresentationPlan.ts` accepts optional original occlusion cells, stores bounded terrain/prefab plans and fallback reasons, reserves `max(voxel terrain, cells * 648)` and per-kind `max(voxel prefab, primitive)`, and preserves all water/routes/actors/resources/nonvoxel accounting without allocating typed arrays or Three geometry.
- `createGreaterRealmSceneRuntime.ts` passes original core+apron context before existing apron filtering, includes quality/mesher/topology/halo identity, creates named indexed terrain and instanced feature geometry only in `flushUploads`, preserves one terrain draw and existing picking/access authority, and disposes/rebuilds on identity, revision, context, and lifecycle changes. Voxel preparation/construction errors alone fall back per layer; unrelated runtime validation remains visible.
- `createGreaterRealmWorldCanvasHost.ts` replaces the cylinder castle with one shared indexed voxel castle `InstancedMesh`. Existing transforms, instance colors, own-castle highlighting, targets, and the 65,536-byte castle / 98,304-byte host reserves remain enforced. Castle preparation/construction has the same truthful primitive fallback boundary.
- Runtime, host, and React canvas telemetry now expose voxel mode, resident triangles/quads, current-frame voxel upload bytes, preparation milliseconds, current-frame emission milliseconds, fallback count, and reasons.

## TDD evidence

All production behavior was preceded by a focused failure:

1. Neutral mesher RED: pinned Vitest exited 1 because `src/components/realm/voxelSurfaceMesh` did not exist. GREEN: 15/15 tests.
2. Atlas/prefab adapter RED: pinned Vitest exited 1 because `greaterRealmVoxelPresentation` did not exist. GREEN: 7/7, later 8/8 after the wet-water regression.
3. Presentation planning RED: 2/9 failed on missing voxel plan/reservation fields. GREEN: 9/9.
4. Runtime integration RED: 3/15 failed on absent named voxel objects, halo disposal, and telemetry. GREEN: 15/15, later 16/16 after injected preparation fallback.
5. Construction fallback RED failed on absent fallback telemetry; preparation fallback RED initially escaped `setView`. Both became GREEN without a production injection hook.
6. Host RED: 2/8 failed on primitive castle attributes/missing combined telemetry. GREEN: 8/8. A later injected castle-preparation RED left zero castles; GREEN retained one instanced fallback layer at 9/9.
7. Canvas telemetry RED: 1/15 failed on absent voxel dataset. GREEN: 15/15.
8. Wet terrain RED reproduced a returned wet surface rounded through water (`0.125 > 0.124`). GREEN keeps it at/below the returned hydrological surface.
9. Timing telemetry RED: runtime and canvas tests failed on absent finite timing fields/datasets. GREEN: runtime + host + React scene 40/40.

## Final source gates

Pinned compiler, after all source/test commits:

```text
.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc \
  -p tsconfig.app.json \
  --tsBuildInfoFile .git/voxel-runtime.tsbuildinfo
exit 0; no diagnostics
```

Pinned covering gate, `--maxWorkers=1`, containing both new suites, all four modified suites, and all four required unchanged policy/navigation/PTR suites:

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run \
  tests/voxelSurfaceMesh.test.ts \
  tests/greaterRealmVoxelPresentation.test.ts \
  tests/greaterRealmPresentationPlan.test.ts \
  tests/greaterRealmSceneRuntime.test.ts \
  tests/greaterRealmWorldCanvasHost.test.ts \
  tests/greaterRealmWorldScene.test.tsx \
  tests/realmChoicePolicy.test.ts \
  tests/realmChoiceMenuIntegration.test.tsx \
  tests/greaterRealmHostQaNavigation.test.tsx \
  tests/WarpkeepExperiencePtrRealm.test.tsx \
  --maxWorkers=1

Test Files  10 passed (10)
Tests       117 passed (117)
Skipped     0
Duration    35.30s
exit        0
```

`git diff --cached --check` was clean before both source/test commits. Only exact owned paths were staged; the inherited LF/autocrlf dirt, root `node_modules` junction, and unrelated `__pycache__` entries were not staged or changed.

## Browser evidence

The controller exercised the existing production-canvas Greater Realm/PTR QA route in real local Windows Chrome, using a fresh dedicated profile and the synthetic decoded public fixture. No voxel demo route was created.

Final pre-commit three-profile artifacts, each with `mobile.png`, `metrics.json`, and `journey.json`:

- High: `.git/voxel-viewport-high-2Cb4xF` — 870 triangles, 435 quads, 28 draws, voxel mode, zero fallbacks.
- Balanced mobile emulation: `.git/voxel-viewport-balanced-UfDw4U` — 478 triangles, 239 quads, 23 draws, voxel mode, zero fallbacks.
- Reduced: `.git/voxel-viewport-reduced-bQpabP` — 234 triangles, 117 quads, 17 draws, voxel mode, zero fallbacks.

All three commands exited 0 in 6.31/6.03/5.86 seconds. The controller visually inspected every PNG: stepped slabs, towered castles, water, and profile-specific geometry were present; the High wet-surface alignment improved after the quantization repair. Each profile completed three menu → PTR → menu cycles with zero canvases in menu and exactly one active canvas; each also verified G002 sealed rejection before PTR entry. A separate Balanced timing sample at `.git/voxel-viewport-balanced-Irnwx0/metrics.json` measured 8.200000047683716 ms plan preparation, 478 resident triangles, voxel mode, and zero fallbacks.

The regular snapshots sampled emission/upload after the admitted upload frame had become idle. A later document-start `MutationObserver` capture at `.git/voxel-viewport-reduced-EEUctE/metrics.json` observed 12 metric mutations during initial Reduced-profile admission: maximum voxel upload 10,272 bytes, maximum emission 0.5999999046325684 ms, and maximum preparation 3.700000047683716 ms. Its three return/entry cycles passed in voxel mode with zero fallbacks. This is representative synthetic two-chunk initial-frame evidence, not a worst-case budget proof. Focused runtime tests additionally prove nonzero admitted-frame accounting and exact reserve dominance. Injected preparation/construction tests exercise fallback and disposal deterministically, but no browser fallback screenshot was captured.

The 390x844 mobile emulation had 390px inner/client/scroll widths and no outside buttons. Existing panels obscure much of the map on mobile; this is recorded as an existing UX constraint, not expanded into a V1 panel redesign. Earlier 89-frame headless emulation measured median 16.6 ms, p95 17.1 ms, max 283.4 ms including warmup. Three-cycle heap samples were GC-dependent (Reduced 49.5 → 51.5 → 53.0 MB) and are not proof of either a leak or leak absence; deterministic exact disposal tests are the lifecycle source gate.

## Limits and concerns

- Browser evidence is synthetic and emulated. It is not an authenticated owner playtest or physical-phone evidence.
- The observed 10,272-byte / 0.6-ms initial Reduced-profile upload is a representative synthetic two-chunk sample, not worst-case geometry or budget proof; broader browser performance acceptance remains a follow-up.
- The pale voxel palette is materially different from the former flat green terrain. Geometry, water, silhouettes, seams, and fallback were source/browser reviewed, but further art direction may choose a different fixed palette without changing authority or meshing.
- The complete backend-backed progression journey remains a separate pending release requirement. This renderer does not admit G002, wire legacy G001 commands into PTR, mutate game state, or prove deployment/publication.

## Review fix round 1 — 2026-09-05

Source/test commit: `273b751` — `fix(renderer): ground and bound voxel integration` (parent base `3f9879c73d815b9fe9130d39ea19a26f4f699476`). Only the three reviewed production paths and four affected test paths were staged.

### Important finding closure

1. Ground-attached runtime landmarks, ambient actors, land routes, crossings, and renderer-local resources now share the same per-cell quantized surface calculation as successful voxel terrain. The choice is made after terrain construction, so both preparation and construction fallback retain raw presentation elevations. The runtime exposes only an optional selected voxel surface to the host; after each upload flush, castle matrices and selection targets use that surface, while an absent/fallback surface retains the castle DTO's raw elevation. Castle identity now includes the returned cell fields that control surface height.
2. `createGreaterRealmVoxelGeometry` now owns a try/cleanup/rethrow boundary around every post-`BufferGeometry` allocation operation. An injected failure on the second attribute attachment disposes the partial geometry exactly once. Runtime lifecycle probes assert exact voxel geometry, material, and `InstancedMesh` disposal across context loss/restoration, profile-runtime replacement, final disposal, and repeated disposal.
3. Terrain planning now rejects any emitted local lattice coordinate whose value or next voxel edge cannot be represented exactly in Float32. Adjacent decoded public cells at the full signed-i32 elevation extremes reproduce this guard, and presentation planning converts it into the existing bounded flat-terrain fallback with its unchanged reservation.

### Fix-round RED/GREEN evidence

All commands used pinned `.git/ci-node-22.22.3/node.exe` and `--maxWorkers=1`.

- Adapter RED: `vitest run tests/greaterRealmVoxelPresentation.test.ts` exited 1 with 2 failed / 8 passed. The extreme adjacent-i32 span did not throw, and a fault on the second `BufferGeometry.setAttribute` call observed zero partial-geometry disposals. GREEN: 10/10, exit 0.
- Runtime grounding RED: `vitest run tests/greaterRealmSceneRuntime.test.ts` exited 1 with 7 failed / 22 passed. All six High/Balanced/Reduced boundary-side landmark cases remained at raw elevation, as did the actor/land-route case. GREEN after the shared selected-surface grounder: 29/29, exit 0. Adding exact lifecycle probes retained GREEN at 30/30.
- Host castle RED: `vitest run tests/greaterRealmWorldCanvasHost.test.ts` exited 1 with 12 failed / 9 passed across both sides of every profile boundary and both voxel/fallback selections. GREEN after post-flush selected-surface resolution: 21/21, exit 0.
- Affected five-suite gate (`voxelSurfaceMesh`, voxel adapter, presentation plan, runtime, host): 5/5 files, 86/86 tests, exit 0.
- Fresh pinned TypeScript: `node_modules/typescript/bin/tsc -p tsconfig.app.json --tsBuildInfoFile .git/voxel-runtime.tsbuildinfo`; exit 0, no diagnostics.
- Fresh full covering gate with the original ten required paths: 10/10 files, 146/146 tests, skipped 0, exit 0, 35.19 seconds.

### Controller evidence after stable source

The controller's actual local Chrome Balanced 390x844 synthetic-fixture run passed 30 menu/active cycles with zero/one canvases respectively, then used real `WEBGL_lose_context`: context-lost telemetry reported zero uploaded chunks; restoration retained the same canvas and rebuilt two chunks at 478 triangles, 23 draws, voxel mode, and zero fallbacks. Artifacts are `.git/voxel-viewport-soak-s4Aca0/{metrics,journey,recovery}.json` plus `recovery.png`. The observed initial maxima were 22,944 upload bytes, 0.80 ms emission, and 10.70 ms preparation. Heap samples ranged from 43,042,003 to 65,575,173 bytes (first 52,598,485; last 64,047,646) and remain GC-dependent, not evidence of leak absence.

This closes the three source-review findings only. Browser evidence remains representative and synthetic; mobile panel usability, long-duration/physical-device behavior, authenticated owner progression, publication, and the separate full backend-backed playable journey remain outside this source fix and are not claimed as accepted.

## Review fix round 2 — 2026-09-05

Source/test commit: `168b475` — `fix(renderer): resolve emitted terrain grounding` (parent base `e35ef88aad1f00600dd5386714a07cc844ffd160`). Only `createGreaterRealmSceneRuntime.ts` and the runtime/host regression suites were staged.

This section supersedes round 1's statement that all three source-review findings were closed. Round 1 independently closed partial-construction cleanup and Float32 span precision, but its owner-handle grounding lookup left this cross-owner emitted-apron case open; round 2 closes that remaining source finding.

The remaining grounding defect came from using a castle's ownership handle as its render-resource lookup. Runtime apron deduplication can make a neighboring selected chunk the only resource that actually emits that returned coordinate. The runtime now maintains a bounded coordinate index over uploaded resources' emitted `terrainCells`; insertion happens with resource upload and identity-checked removal happens before disposal. `getTerrainSurfaceY` resolves the indexed emitter and returns its quantized surface only when that exact resource uses voxel terrain; preparation/construction fallback still returns no voxel surface, so the host keeps raw castle elevation.

### Fix-round RED/GREEN evidence

- Exact fixture RED with pinned Node: clone owner chunk A, set LOD1, remove core `(-1,1)`, decode it, retain chunk B whose apron emits `(-1,1)`, then upload both. The runtime returned `undefined` instead of Reduced surface `0`; the real-runtime host placed castle 2 at `0.169` instead of `0.03`. The two-file command exited 1 with 2 failed / 51 passed.
- The real host test initially inspected only Reduced's first admitted chunk. Its frame harness was corrected to drain scheduled upload frames. Mutation-checking that corrected test against the restored owner-only lookup failed both focused reproductions: runtime 1 failed / 30 skipped, exit 1; host 1 failed / 21 skipped, exit 1. Restoring the emitted-coordinate index made both focused tests pass.
- Runtime coverage also uses a real Balanced selected neighboring resource whose valid i32 elevation span triggers bounded terrain preparation fallback; the indexed coordinate truthfully returns no voxel surface and aggregate mode is mixed.
- Focused runtime+host GREEN: 2/2 files, 54/54 tests, exit 0.
- Fresh pinned TypeScript: `node_modules/typescript/bin/tsc -p tsconfig.app.json --tsBuildInfoFile .git/voxel-runtime.tsbuildinfo`; exit 0, no diagnostics.
- Fresh full ten-path covering gate: 10/10 files, 149/149 tests, skipped 0, exit 0, 35.64 seconds.

### Controller fallback evidence

The controller's actual local Chrome Balanced 390x844 synthetic run at `.git/voxel-viewport-fallback-YmVnaW` injected failure only when attaching normalized Uint8 voxel colors, without a production hook. Across three menu/entry cycles plus real context loss/restoration it observed 19 injected failures, fallback mode with five reasons, zero voxel triangles, two chunks, 23 draws, two castles, and four resources. All cycles retained zero menu canvases and one active canvas; restoration changed context-lost true to false on the same canvas and rebuilt the same five fallback reasons. `recovery.png` visibly contains flat-hex/primitive fallback. The screenshot is narrow functional evidence, not professional art, authenticated-owner, physical-device, or full gameplay acceptance.
