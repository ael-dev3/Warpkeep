# Layered Water and Atmosphere

This renderer-only layer builds on the immutable Genesis Water v1 rows and the
active ocean-and-river revision. It does not add tables, regenerate topology,
change passability, or publish Water state.

## Phase

`realm_environment_v1.updated_at` is now retained in the already-persisted
public projection. `realmWaterPhase.ts` uses that server boundary, the
environment epoch, and a synchronized server-time estimate when one is
available. Monotonic local time advances only between samples. Reduced motion
uses a deterministic frozen phase. A tab resume clamps the scheduler delta and
never fast-forwards a shader by the hidden-tab duration.

## Geometry

- Ocean and legacy lake rows share one deterministic world-space vertex map.
  High uses three subdivisions per canonical hex, Balanced two, and Reduced
  one. The geometry keeps a triangle-to-cell-key table for selection.
- The twelve canonical river paths become joined ribbons. Each cell contributes
  one centerline point, a flow-aligned bank pair, bounded width in the
  `0.50–0.72` range, and deterministic source/mouth caps. Terrain contact is
  sampled only for presentation clearance; the underlying terrain and route
  authority remain unchanged.
- Full-fog cells are still rendered as a bounded coarse buffer, but the shader
  replaces all Water lighting with the exact fog color when the canonical fog
  factor reaches `1`. A single opaque vertical curtain closes the outer ring.

## Material

The Three.js r185 `MeshStandardMaterial` path remains authoritative. The
vertex shader displaces ocean swell and river flow from world-space functions,
then derives analytic normals from the same function. The fragment path layers
depth absorption, restrained Fresnel, sun glitter, shore/crest/river foam, and
fog replacement. A stable cache key and explicit shader markers make contract
drift fail closed through the existing Water-unavailable scene path.

## Budgets

| Quality | Water triangles | Water draws | Wave components | Cadence |
| --- | ---: | ---: | ---: | ---: |
| High | 220,000 | 5 | 8 | 30 fps |
| Balanced | 105,000 | 5 | 5 | 22 fps |
| Reduced | 35,000 | 4 | 0 | static |

The ambience scheduler remains the only RAF owner. Hidden tabs, disposed
scenes, reduced motion, and static Water stop work. No per-frame geometry
rebuild, per-vertex CPU wave loop, reflection target, or per-cell draw exists.

## Selection and fallback

The Water layer maps raycast triangle indices back to exact canonical cell keys,
rejects full-fog hits, and owns a pointer-inert selected-cell outline. This
mapping is independent of subdivision quality and subscription row order. If
geometry or shader construction fails, the existing scene keeps terrain,
controls, and the static fallback path; no gameplay authority is revoked.
