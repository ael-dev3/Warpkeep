# Warpkeep 0.4 integrated voxel renderer

## Owner requirement and delivery

The expanded owner goal explicitly requires a reusable voxel subsystem in an
actual playable 0.4 scene. It is not optional research or a detached demo.
Implement it in the existing owner-admitted PTR Greater Realm path while local
release engineering proceeds. Genesis 002 remains sealed and its admission
policy undecided; this work neither admits players nor changes that policy.
The legacy Genesis 001 renderer and all server/game-state behavior stay intact.

Use Three.js rather than introduce a native Vulkan executable or replace the
browser application. A from-scratch host/engine rewrite adds unnecessary risk;
colored individual cube meshes do not meet the reusable surface-mesher goal.

## Existing integration and replacement

The production route is WarpkeepExperience -> RealmMapScreen's Greater Realm
host -> GreaterRealmWorldScene -> createGreaterRealmWorldCanvasHost ->
createGreaterRealmSceneRuntime. Verified PTR authority selects that route.
Genesis 001 retains CanonicalRealmMapScreen -> createRealmScene.

Replace the Greater Realm runtime's flat terrain mesh, primitive static
landmark geometry, and the canvas host's simple public-castle geometry. Retain
the current stream, selection, nearest-first scheduling, water, dynamic actors,
camera, public access/interaction inputs and resource ownership. This is one
integrated rendering subsystem, not a second scene manager.

## Components and data

1. `src/components/realm/voxelSurfaceMesh.ts`: a renderer-neutral bounded sparse
   integer occupancy representation and deterministic face-culling/greedy
   mesher. Merge only coplanar faces of identical material/shading. Return
   indexed typed-array mesh data, occupied/exposed/merged counts and exact byte
   size. No Three objects per voxel. Validate finite safe integer coordinates,
   duplicates, material range and caps before unbounded growth; output indices
   must stay within vertices. Separate emitting occupancy from occluder-only
   context. Occluders can suppress faces but never create visible geometry.
2. `src/components/realm/greaterRealmVoxelPresentation.ts`: fixed quality
   profiles, atlas-to-occupancy mapping, deterministic material palette,
   landmark/castle voxel templates and the small Three BufferGeometry adapter.
   Produce one vertex-colored terrain mesh per chunk, one instanced geometry
   per landmark kind, and one instanced public-castle geometry. Each prefab
   has a distinct silhouette; the castle has a keep, towers and battlements.

Only returned validated public atlas cells supply coordinates, elevation,
biome/geology, water/shore cues and feature variants. No inferred hidden cells,
private topology, new network calls, reducers, browser storage or persistence.
Navigation and picking continue to consume their existing authoritative inputs,
never voxel occupancy. Water remains on the existing hydrological surface.

Use stable world-grid alignment and chunk-local vertex coordinates to avoid
large-coordinate precision loss. Explicitly distinguish emitted core/assigned
apron cells from all returned occlusion context. The existing two-pass apron
deduplication remains; changing a halo must invalidate affected mesh signatures.
LOD omissions remain empty, not interpolated into undisclosed terrain.

## Budgets and lifecycle

Reuse High/Balanced/Reduced view policy and all existing total draw, instance,
visible/resident chunk and upload ceilings. Detailed profiles use finer voxel
sampling and prefabs; reduced remains a genuinely meshed coarse silhouette.
Do not raise whole-scene limits to accommodate the feature.

Bound occupancy construction itself, then count output before allocating typed
arrays or GPU geometry. Sparse preflight metadata is allowed but is bounded;
"no allocation" must not falsely describe a growing JavaScript Map. Exact
positions/normals/colors/indices bytes, prefab geometry and instance buffers
replace the obsolete flat-terrain estimate. The upload gate reserves the
larger of voxel and fallback costs. Actual bytes must not exceed the reserved
amount. Numeric per-profile sampling/caps are chosen in the implementation
plan from existing chunk sizes and these ceilings, then checked by tests and
browser measurements rather than assumed from screenshots.

Generate geometry only when the existing upload scheduler admits a chunk.
Retain bounding volumes for frustum culling. Include meshing version, quality,
occupancy/material and halo topology in cache signatures. Do not add global
GPU caches: existing per-host/per-chunk ownership handles replacement,
context loss/restoration, profile/identity changes and idempotent disposal.

If bounded voxel preparation or geometry construction fails, use the existing
flat terrain/primitive prefab for that chunk/layer within its reserved budget.
Dispose partially created resources first. Expose truthful fallback reason and
counts, voxel triangle/face/upload totals and mode through existing telemetry.
Do not swallow unrelated authentication, transport or game-state errors as
graphics fallback. Existing WebGL-unavailable UI remains usable.

## Verification and acceptance

Unit tests prove six exposed faces for one voxel, shared-face removal and
merging, material-boundary preservation, deterministic shuffled input, coordinate
and cap rejection, occluder-only non-emission, byte accounting and index bounds.
Atlas tests prove explicit-cell-only mapping, apron/LOD seams, stable topology
signatures and budget admission at all qualities. Lifecycle tests prove exact
disposal on replacement/context churn/double cleanup, bounded fallback and
unchanged selection/access behavior.

Integration must show actual PTR snapshots reaching named voxel geometry in the
existing host; a standalone test renderer is insufficient. Preserve G001 legacy
strategy and Genesis 002 sealed-choice tests. Do not modify legacy terrain,
game/map source, admission policies, transport contracts or backend schemas.

After source tests, inspect the actual component in browser at desktop/high and
mobile/balanced and reduced settings. Capture stepped terrain, recognizable
castle/landmark silhouettes, water alignment, adjacent chunk seams and fallback.
Measure mesh time, frame pacing, geometry memory, draw calls and repeated-scene
cleanup. Distinguish emulation/synthetic QA from a real owner-authenticated
playtest and physical-phone evidence. Fix material visual/performance defects;
passing geometry tests alone is not visual acceptance or live release proof.

## Sequence

The current local binding runtime task remains the sole active implementation
task. Its independent review precedes the voxel implementation task. The voxel
task includes mesher, atlas/prefab adapter, actual host/runtime wiring, budgets,
telemetry, fallback and tests together; none is a disconnected completion.
Final source carry, release verification/deployment and Desktop delivery remain
part of the expanded goal after these components work.
