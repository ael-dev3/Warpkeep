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
