# Living Realm V1

## Scope and baseline

Living Realm V1 is a browser-presentation upgrade for Genesis 001. It adds a
coherent wind contract, bounded local surface disturbance, subtle forest
motion, analytic water ripples, and tiny camera-local ambient ecology. None of
those effects is game state: SpacetimeDB remains authoritative for world
membership, Workers, routes, resources, ownership, schedules, and outcomes.

Implementation began from `0999e07b6aa36bb96613731e2837d096ae5a10ed` on the
`agent/living-realm-visual-ecology` branch. The audited toolchain was Node
22.23.1, npm 10.9.8, and Three.js 0.185.1. The unchanged baseline passed
`npm run check`: 266 Vitest files and 2,961 tests, TypeScript, licensing,
runtime-asset provenance, tracked-file size policy, production build,
production exclusions, and the Farcaster Mini App contract.

The canonical rendered-browser command failed before page launch because the
host Chrome bundle did not satisfy its single-link, clean-bundle attestation.
The Chrome installation was not modified. Deterministic loopback-only baseline
captures were instead recorded with the isolated in-app browser; the standard
command remains a required final check and any continued host failure will be
reported rather than hidden.

| Case | Grass instances / triangles / draws | Water triangles / draws | Canonical forest triangles / draws | Ambient cap |
| --- | ---: | ---: | ---: | ---: |
| High 1920×1080 | 2,167 / 58,509 / 3 | 21,198 / 3 | 136,418 / 1 | 30 Hz |
| Balanced 1280×720 | 837 / 17,577 / 2 | 21,198 / 3 | 76,334 / 1 | 22 Hz |
| Balanced tablet 1024×768 | 837 / 17,577 / 2 | 21,198 / 3 | 76,334 / 1 | 22 Hz |
| Balanced portrait 390×844 | 837 / 17,577 / 2 | 21,198 / 3 | 76,334 / 1 | 22 Hz |
| Balanced short landscape 667×375 | 837 / 17,577 / 2 | 21,198 / 3 | 76,334 / 1 | 22 Hz |
| Reduced 1280×720 | 156 / 2,340 / 1 | 21,198 / 3 | 30,139 / 1 | idle |

The baseline images and aggregate datasets are local QA artifacts rather than
runtime or repository assets. They contain only the synthetic 100-castle
fixture and no production identity, account, balance, token, route, or private
state.

## Adaptation decisions

Warpkeep uses the visual lesson of a landscape responding coherently, not the
implementation scale of a close first-person meadow:

- The existing `RealmAmbientScheduler` remains the only ambient clock. Its
  frame cap is the maximum needed by active subsystems, never their sum.
- Grass, water, and forest reuse their existing draws. Living Realm may add at
  most one instanced bird draw and one points draw in High or Balanced, and
  adds neither in Reduced or reduced motion.
- Worker wakes sample the owning renderer's sanitized current poses after its
  ordinary update. Resource wagons do not yet expose an equivalent clean pose
  API, so this version does not duplicate their interpolation or inspect DOM
  transforms; wagon wakes are a later owner-layer follow-up.
- Disturbances live in a fixed-capacity renderer-only pool with preallocated
  snapshots. They never create database rows, affect picking, alter routes, or
  scan the 10,000-cell world.
- Forest wind uses compact normalized byte attributes where geometry ownership
  permits and a root-anchored local-height fallback for leased instanced
  primitives. Material failure keeps the existing static forest.
- Ambient life is deterministic, camera-local, non-pickable, and visually
  subordinate to units, labels, routes, resources, selection, and hover.

This work contains original Warpkeep-native code. No TUMBLE source, bundle,
shader, artwork, preset, or binary was downloaded, inspected, copied,
decompiled, or made a dependency.

## Explicitly rejected techniques

A production 4096×4096 water solver is rejected for this scope. It would add
large floating-point targets, extra render passes, continuous simulation work,
and mobile memory pressure while bypassing Warpkeep's canonical welded water
geometry. Water response instead uses compile-time-bounded analytic ripple
slots in the existing materials.

Gameplay depth of field and a post-processing chain are also rejected. They
would blur labels, routes, resources, selection, and touch-readable strategy
surfaces. The fixed canonical sun, generated environment map, ACES output, and
existing fog remain the lighting and depth contract.

## Fail-closed and lifecycle contract

Reduced quality, reduced motion, strategic overview, hidden documents,
inactive presentation, context loss, shader-contract drift, and disposal all
disable optional moving ambience. No subsystem owns a second animation frame
loop or interval. A failed optional material or ecology layer leaves terrain,
water topology, forest placement, Workers, interaction, and the Realm intact.
