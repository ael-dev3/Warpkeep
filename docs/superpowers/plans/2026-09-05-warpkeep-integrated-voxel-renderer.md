# Integrated Voxel Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax. This is one integrated task in the existing release-closure ledger, not a separate renderer demo or separate plan workspace.

**Goal:** Render real voxel terrain and recognizable voxel landmarks/castles in the existing owner PTR scene, within its current budgets and lifecycle.

**Architecture:** A renderer-neutral sparse surface mesher produces bounded indexed geometry. A Greater Realm adapter maps explicit public cells and fixed prefabs to that mesher; existing presentation planning, chunk scheduling and Three ownership consume it. Keep the flat/primitive paths as measured fallbacks.

**Tech Stack:** Existing TypeScript, Three.js, Vitest and browser QA; no dependency additions.

**Spec:** docs/superpowers/specs/2026-09-05-warpkeep-voxel-renderer-design.md

## Global Constraints

- The legacy Genesis 001 renderer and all server/game-state behavior stay intact.
- Only returned validated public atlas cells supply coordinates, elevation, biome/geology, water/shore cues and feature variants. No inferred hidden cells, private topology, new network calls, reducers, browser storage or persistence.
- Reuse High/Balanced/Reduced view policy and all existing total draw, instance, visible/resident chunk and upload ceilings.
- Do not raise whole-scene limits to accommodate the feature.
- No new admissions, backend schemas, generated bindings, root package/lock changes, or authentication changes.
- No global GPU caches, per-voxel Three objects, detached demo acceptance, or test-only production rendering activation.

## Task V1: Integrate bounded surface meshing into the live scene path

**Files and ownership:**
- Create `src/components/realm/voxelSurfaceMesh.ts`: integer occupancy validation, deterministic exposed-face/greedy-quad planning and typed-array emission; no Three imports.
- Create `src/components/realm/greaterRealmVoxelPresentation.ts`: fixed quality profiles, public-cell mapping, palette, prefab occupancy, Three geometry adapter. Split prefab catalogue into an adjacent focused file only if this module otherwise becomes unwieldy.
- Modify `src/greater-realm/greaterRealmPresentationPlan.ts`: retain full occlusion context, plan voxel bytes and prefab cost, preserve nonvoxel accounting.
- Modify `src/greater-realm/createGreaterRealmSceneRuntime.ts`: pass original returned core/apron context before apron filtering, replace terrain/features, bind signatures, upload/disposal/fallback telemetry.
- Modify `src/components/realm/createGreaterRealmWorldCanvasHost.ts`: replace the instanced castle geometry and account for it within existing host reserves.
- Modify `src/components/realm/GreaterRealmWorldScene.tsx`: forward voxel telemetry to the existing canvas dataset.
- Create `tests/voxelSurfaceMesh.test.ts` and `tests/greaterRealmVoxelPresentation.test.ts`.
- Extend `tests/greaterRealmPresentationPlan.test.ts`, `tests/greaterRealmSceneRuntime.test.ts`, `tests/greaterRealmWorldCanvasHost.test.ts`, `tests/greaterRealmWorldScene.test.tsx` with actual integration and lifecycle assertions.
- Run unchanged `tests/realmChoicePolicy.test.ts`, `tests/realmChoiceMenuIntegration.test.tsx`, `tests/greaterRealmHostQaNavigation.test.tsx` and `tests/WarpkeepExperiencePtrRealm.test.tsx`; these exact paths were verified in the current tree.

Baseline exception established before implementation: `greaterRealmHostQaNavigation.test.tsx:48` still queries Genesis002's accessible name as `Not admitted`, whereas the current policy and passing menu/policy tests require `Sealed`. The 8-suite baseline is85pass/1fail (33.86s,exit1). Repair this stale test query to `Sealed` as part of the integration test work, retain its `data-admission=not-admitted`/blocked-entry assertions, and run the full navigation case to expose any later failures. Do not change production admission behavior or remove the closed-entry assertion to obtain green. This is a known pre-voxel failure, not caused by meshing.

**Interfaces:** Keep public DTOs unchanged. Define the new neutral API as:

```ts
export type VoxelCell = Readonly<{ x: number; y: number; z: number; material: number }>;
export type VoxelSurfaceInput = Readonly<{
  voxels: readonly VoxelCell[];
  occluders?: readonly VoxelCell[];
  maximumVoxels: number;
  maximumFaces: number;
}>;
export function planVoxelSurface(input: VoxelSurfaceInput): VoxelSurfacePlan;
export function createVoxelSurfaceMeshData(plan: VoxelSurfacePlan): VoxelSurfaceMeshData;
```

`VoxelSurfacePlan` owns immutable sorted greedy quads, count/byte metadata and a deterministic signature; it holds no GPU resources. `VoxelSurfaceMeshData` contains Float32 positions, normalized Int8 normals, normalized Uint8 colors, Uint32 indices, occupied/exposed/merged-quad/triangle counts and exact uploadBytes. A quad uses four vertices and six indices: 48+12+12+24 = 96 bytes. Palette lookup is deterministic, bounded and shared by planning/emission. Reject unsupported material ids, duplicates inside each occupancy set, unsafe/noninteger coordinates and cap overflow. An emitter also present in occlusion context is allowed if its material agrees; context never emits faces.

- [ ] **1. Add and run neutral RED tests.** For one voxel assert 6 exposed faces, 6 quads, 12 triangles and 576 bytes. Two adjacent equal-material voxels have 10 exposed unit faces but 6 merged quads. Different materials preserve their boundary across coplanar faces. Add shuffled-input equality, six neighbour directions, empty/context-only input, one adjacent occluder (5 exposed faces), conflicting overlap, negative coordinates, NaN/fractional/unsafe coordinates, duplicate entries, occupancy/face cap boundaries and index bounds.

```ts
const plan = planVoxelSurface({
  voxels: [{ x: 0, y: 0, z: 0, material: 0 }],
  maximumVoxels: 8, maximumFaces: 12
});
const mesh = createVoxelSurfaceMeshData(plan);
expect(mesh.exposedFaceCount).toBe(6);
expect(mesh.triangleCount).toBe(12);
expect(mesh.uploadBytes).toBe(576);
expect(mesh.uploadBytes).toBe(mesh.positions.byteLength + mesh.normals.byteLength
  + mesh.colors.byteLength + mesh.indices.byteLength);
expect([...mesh.indices].every(index => index < mesh.positions.length / 3)).toBe(true);
```

Run pinned `.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/voxelSurfaceMesh.test.ts --maxWorkers=1`; record meaningful missing-module/API failures before implementation.

- [ ] **2. Implement sparse deterministic meshing and pass the neutral suite.** Bound and validate before insertion into maps. Iterate only occupied coordinates and six neighbours, never a bounding volume spanning distant coordinates. Bucket exposed faces by direction/plane/material, sort deterministic coordinates, greedily merge contiguous coplanar rectangles without crossing a material boundary. Count quads before allocating attributes. Emit consistent outward winding and axis normals; normalized signed-byte normals use -127/0/127. Reproduce exact planned bytes and retain no mutable caller arrays.

- [ ] **3. Add RED atlas/prefab tests and implement the fixed adapter.** Initial profiles use horizontal step `cellSize/4`, `cellSize/2`, `cellSize` and vertical step `cellSize/8`, `cellSize/4`, `cellSize/2` for high/balanced/reduced. Bound total emitting+context occupancy to 32768/16384/8192, exposed unit faces to 32768/16384/8192, merged terrain quads to 4096/2048/512. These are starting limits, not performance claims; adjust only from measured fixture/browser evidence without raising whole-scene ceilings. Rasterize each explicit hex footprint onto a shared world-aligned grid with deterministic half-open ownership at borders. Do not interpolate missing atlas cells. Use a bounded surface slab, not columns extending to world zero; cap vertical depth at four voxels. Anchor output near the chunk in all axes before Float32 conversion. Quantization must keep water, feature placement and terrain coherent; tests must cover elevated wet cells and signed-i32 atlas coordinates.

Use the unchanged synthetic fixture through its public decoded DTOs. Assert full halo changes affect the signature, context-only cells do not appear, filtered aprons remain deduplicated and hidden LOD cells stay absent. Prefabs must have distinguishable geometry: castle keep plus four towers and battlements; broken ruin walls; signpost crossbar; upright tapered waystone; lamp with post and lantern. Mesh each once per existing owned layer, not per instance. Keep castle geometry plus maximum matrix/color instance bytes within 65536 and all host buffers within 98304. Test all three profiles produce genuine voxel geometry on representative fixtures; universal fallback is failure.

- [ ] **4. Add RED production-runtime integration tests and wire the adapter.** Extend presentation input with optional readonly occluder cells defaulting to the original returned cells for direct callers. Runtime passes `value.chunk.coreCells` plus original apron cells while emitted `chunk` retains existing apron filtering. Store the bounded voxel plan on the presentation plan; replace terrain `cells.length * 648` with `max(voxelBytes, flatFallbackBytes)` and feature primitive bytes with `max(voxelPrefabBytes, primitiveBytes)`. Preserve all other costs. Do not allocate Three geometry during view planning. Include profile, mesher version, actual occupancy/material and full halo signature in reuse identity.

```ts
const terrainReservation = Math.max(voxelPlan.uploadBytes, cells.length * 648);
// Add unchanged water/routes/actors/etc and per-kind prefab reservations.
// Only flushUploads admits typed-array and Three geometry creation.
```

Name successful terrain `greater-realm-voxel-terrain:<chunkHandle>` and prefab geometries explicitly. Keep one terrain draw per chunk and current instancing for landmarks/castles. Preserve raycast/selection authority, own-castle highlighting, transforms and bounding volumes. Assert the real runtime-created scene contains indexed named voxel meshes and the castle remains one InstancedMesh. Assert actual attribute/index/instance bytes never exceed planned reserves.

- [ ] **5. Implement and test lifecycle and truthful fallback.** Catch only voxel preparation/construction failures at the graphics boundary. Dispose any partially allocated geometry/material before creating the existing flat/primitive replacement. Keep failures outside graphics visible. Add telemetry for voxel mode, resident voxel triangles/quads, current-frame upload bytes and fallback count/reasons; forward through the existing canvas. Test changed halo/revision, profile replacement, context loss/restoration, final and double disposal with exact disposal counts. Fault-inject the adapter through test mocks, not a new production authority hook. Verify nearest-first scheduling and total reduced-profile upload/draw limits remain unchanged.

- [ ] **6. Run covering source gates and inspect the actual browser component.** Run the two new suites plus all modified and listed unchanged integration/regression suites with pinned Node and `--maxWorkers=1`. Run pinned `node_modules/typescript/bin/tsc -p tsconfig.app.json --tsBuildInfoFile .git/voxel-runtime.tsbuildinfo`. Record RED/GREEN commands, counts, skips and exit statuses in the release-closure report. Commit only owned paths. Independently review the integrated source before acceptance.

After source review, use the existing Greater Realm/PTR QA route containing the production canvas host, not a new voxel demo. Capture high desktop, balanced mobile emulation and reduced frames with stepped terrain, distinct castle/landmarks, water and seams. Exercise fallback and repeated scene switching. Measure mesh preparation/emission time, frame interval distribution, draw calls, geometry bytes and repeated disposal trends. Label synthetic/emulated results honestly; actual authenticated owner journey and physical-device evidence remain separate release checks. Correct visible defects or unbounded work before calling this task complete.

## Preflight and acceptance accounting

Mesher -> adapter: immutable quad plan and exact96-byte quad framing. Adapter -> presentation plan: one bounded CPU plan, exact voxel/fallback reservations. Plan -> runtime: immutable topology signature plus emitted/context separation. Runtime -> host/component: existing ownership plus additive telemetry. Castle -> host reserve: measured geometry and matrices/colors, not the former cylinder estimate. These are coupled interfaces in one integrated review task; none conflicts with the spec.

Spec coverage: integration/components/data in steps1-4; quality/budgets in3-5; lifecycle/fallback in5; source/visual/G001 verification in6. No planned changes to authoritative movement or admission state. Source tests alone do not satisfy visual acceptance or the live release goal. Use the existing release-closure ledger/report workspace, and start implementation only after Task2b3's review gate.
