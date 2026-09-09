# Verdant Citadel renderer evidence

## Scope and source

This record covers the CI-reviewed implementation checkpoint
`43cac019888aefb83fcd3901446fc5af99d39036`; the current branch also carries the
documentation and inspiration-guard follow-up. It records the 0.4 renderer
foundation and its intentional recovery paths. It does not claim a physical
phone result, authenticated owner play, or a final performance gate.

The active Keep04 owners are:

- `src/components/keep04/Keep04SceneHost.tsx` owns WebGL setup, quality/DPR
  limits, frame cadence, visibility suspension, context recovery, pointer/pinch
  input and renderer disposal.
- `src/components/keep04/createKeep04Scene.ts` owns the bounded scene graph,
  authored building reconciliation, pick targets, telemetry and disposal.
- `src/components/keep04/keep04VoxelDressing.ts` and
  `src/components/realm/voxelSurfaceMesh.ts` own decorative voxel preparation;
  decorative occupancy never becomes gameplay authority.
- `src/greater-realm/greaterRealmWaterSurface.ts` owns the single-pass water
  surface used by the 0.4 Greater Realm runtime.
- `src/components/keep04/Keep04Screen.css` and `Keep04Schematic.tsx` own the
  mobile-safe presentation and usable non-WebGL placement route.

## Verified foundation

The local source and focused suites establish these properties:

1. High, balanced and reduced profiles cap device pixel ratio, frame cadence,
   shadow work and scene detail. The established Keep04 targets are 180/300k,
   120/180k and 80/90k draws/triangles respectively; the stricter emergency
   ceilings remain failure handling, not acceptance budgets.
2. The host renders at most one active Keep04 canvas. Hidden pages cancel the
   pending frame, foreground resumes reconciliation, and disposal releases the
   scene, bundle, renderer, listeners and recovery hooks.
3. WebGL context loss retires the active scene into the schematic fallback and
   restores a fresh scene from the retained canvas listener. The recovered view
   retains the selected building and returns to one active canvas; unmount leaves
   no Keep04 canvas or root.
4. Missing-model and voxel-preparation faults fall back to authored schematic
   and procedural silhouettes. WebGL-unavailable mode starts with zero canvases
   while the schematic and command panels remain usable.
5. The actual scene uses the same authored placement and building state as the
   panels. Selection, legal/blocked draft outlines, site inspection, pan, zoom,
   keyboard placement and touch-sized controls are presentation routes over the
   existing authoritative placement policy.
6. The narrow layout keeps safe-area insets, 44px controls, two-column resource
   balances, a sticky decision header and one document scroll. Reduced motion
   removes animation and throttle-only frames without disabling feedback.

The relevant local checks include `tests/Keep04SceneHost.test.tsx`,
`tests/keep04Buildings.test.ts`, `tests/visualFoundationContract.test.ts`, the
Keep04 placement/presentation suites and the source-bound
`npm run verify:visual-foundation` check. The current visual contract also maps
the full handoff reference library to bounded implementation decisions and
review states.

## Rendered observations

The retained Windows/Chrome QA record covered empty, mature, legal-placement,
blocked-placement, construction, completed and schematic-fallback states at
desktop and 390px portrait profiles. A later balanced browser pass selected all
six completed building families, inspected their sites and checked portrait and
short-landscape framing. The portrait canvas now uses the available panel width;
the toolbar stays padded and the fallback geometry is unchanged.

The context-cycle fixture observed WebGL → fallback → WebGL with the selected
site retained, one recovered canvas and zero canvases after unmount. The
missing-model fixture rendered its procedural mill fallback and kept inspection
available. These are browser-emulated synthetic fixtures on Windows; they are
not physical-device or authenticated-owner evidence.

## Acceptance boundary

R05 is source and local-renderer evidence only at this checkpoint. Final
acceptance still requires the source-bound desktop/mobile captures, measured
cold-load and frame-percentile workloads, repeated world/keep and
context-loss cycles, physical-device readability/performance, and integrated
owner journey. The performance contract remains authoritative; unsupported heap
or device measurements stay missing rather than being inferred from an attractive
capture.
