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
  most one instanced bird draw, one points draw, and one compact Rabbit draw in
  High or Balanced, and adds none in Reduced or reduced motion.
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

This work contains original Warpkeep-native code. The public
[TUMBLE meadow](https://grass-world-meadow.netlify.app/) was used only as a
visual reference for camera-local density, coherent motion, reflective water,
and ambient wildlife. No TUMBLE source, shader, artwork, preset, or binary was
copied into the repository, decompiled, or made a dependency.

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
disable optional moving ambience. The compact Rabbit also fails closed on a
missing, changed, oversized, or structurally incompatible model. No subsystem
owns a second animation frame loop or interval. A failed optional material,
asset, or ecology layer leaves terrain, water topology, forest placement,
Workers, interaction, and the Realm intact.

## Implemented presentation contract

- `realmLivingEnvironment.ts` is the single renderer-neutral wind and gust
  definition. Grass and forest inject the same bounded world-space field into
  their existing standard materials.
- Grass keeps its established instance pools and draw counts. High/Balanced
  patches carry twelve/nine blades, denser meadow and Lowlands candidate fields,
  brighter green authored palettes, and a faint chlorophyll fill so distant
  blades remain green. Its lighting normal follows its bounded bend, sun-side
  transmission remains restrained, and an unrolled quality-specific uniform
  array accepts at most eight/four local disturbances.
- Water keeps the canonical welded geometry, analytic picking, fog treatment,
  and three active draws. Four/two unrolled ripple slots contribute an
  analytic Gaussian-ring height and derivative; deeper blue-grey body colour,
  restrained Fresnel reflection, directional currents, and bounded foam make
  it read as water without breaking the rivers' physical edge weld.
- Canonical forest batches and the immediate procedural fallback carry two
  normalized `Uint8` attributes: root-anchored wind weight and local phase.
  They retain one draw. Reduced and reduced-motion install no moving shader.
- Ambient ecology uses one tiny two-triangle-per-instance bird mesh and one
  points draw shared by motes and transient material particles. It owns no
  timer, animation frame, ray target, identifier, network request, or database
  state, and is absent in Reduced/reduced-motion and Realm overview.
- Lowlands Rabbits use the exact 14,808-byte, 146-triangle compact static model
  from the reviewed public Warpkeep-Assets release. Ten/six deterministic
  camera-local instances share one non-pickable draw and transform-only hop;
  the same-origin loader verifies byte length, SHA-256, mesh, vertex, and
  triangle counts before presentation. No Rabbit transform is game state.
- Worker wakes read only the owning Worker layer's sanitized current pose
  after its normal interpolation update. The per-material pool is fixed,
  newest-first, and independently capped. Replacement of an oldest live slot
  is reported as an aggregate eviction; a genuine failed insert is reported
  separately as a drop. Neither report contains identities or positions.

## Final verification

The completed branch passed `npm run check`: 272 Vitest files and 2,982 tests,
TypeScript, licensing, all runtime-asset and provenance checks, tracked-file
size policy, production build, production exclusions, and the Farcaster Mini
App contract. Focused shader tests also compile against the pinned Three.js
shader chunks and assert static fallback on marker drift.

The same fixed-size in-app WebGL pass used for the baseline reported no grass,
water, forest, or Rabbit fallback. High presented 2,789 grass patches / 100,404
grass triangles / 3 grass draws plus 10 Rabbits; Balanced desktop and portrait
presented 1,243 / 33,561 / 2 plus 6 Rabbits. Existing water and forest topology
and draw counts remain unchanged.

The canonical `npm run qa:rendered-webgl` command was also re-run and failed
before page launch because the reviewed host Google Chrome executable was
unavailable to its fail-closed attestation. The host browser installation was
not modified; this is reported separately from the successful isolated in-app
WebGL evidence above.

| Case | Existing grass / water / forest draws | New draws / triangles | Living slots | Ambient cap |
| --- | ---: | ---: | ---: | ---: |
| High 1920×1080 | 3 / 3 / 1 | 3 / 1,484 | grass 8, water 4 | 30 Hz |
| Balanced 1280×720 | 2 / 3 / 1 | 3 / 888 | grass 4, water 2 | 22 Hz |
| Balanced tablet 1024×768 | 2 / 3 / 1 | 3 / 888 | grass 4, water 2 | 22 Hz |
| Balanced portrait 390×844 | 2 / 3 / 1 | 3 / 888 | grass 4, water 2 | 22 Hz |
| Balanced short landscape 667×375 | 2 / 3 / 1 | 3 / 888 | grass 4, water 2 | 22 Hz |
| Reduced 1280×720 | 1 / 3 / 1 | 0 / 0 | grass 0, water 0 | idle |

High and Balanced canonical forest wind attributes use 763,710 and 454,054
bytes respectively (two normalized bytes per merged vertex). The active
Balanced Worker fixture held exactly four grass disturbances and 48 transient
particles, replacing oldest fixed slots during sustained motion without a
genuine drop. Its Rabbit model passed the runtime loader with one draw, 876
triangles, and no fallback; High used 1,460 Rabbit triangles. Reduced held zero
moving ecology, zero Rabbit fetches, zero ripple/disturbance slots, zero new
draws, and no ambient scheduler demand.
