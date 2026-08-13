# Realm surface relief and analytic waves

Warpkeep's realm surface renderer keeps canonical terrain heights, authored hex topology, picking, and shoreline welds as the only geometry authority. The presentation pass adds two renderer-local cues without changing realm state.

## Terrain relief

The overview camera and canonical world sun are close to view-aligned, so broad slopes can appear flatter than their geometry. High and Balanced quality therefore apply a bounded terrain-only oblique relief term from existing geometric normals and the existing hollow cue.

The term:

- multiplies terrain luminance rather than replacing categorical vertex hue;
- adds no light, texture, geometry, draw call, or per-frame mutation;
- is capped to `0.89..1.08` luminance;
- is disabled on Reduced quality;
- keeps the ordinary `MeshStandardMaterial` fallback if the pinned shader contract changes.

## Water waves

High and Balanced ocean water retain the existing analytic WebGL component ceilings, but components are separated into broad swell, crossing swell, and detail bands. A shared analytic evaluation returns height, gradient, and compression so displacement, normals, and crest presentation stay coherent without finite-difference resampling.

The pass:

- remains deterministic and uses the canonical water phase clock;
- preserves `8 / 5 / 0` ocean wave-component ceilings for High, Balanced, and Reduced;
- preserves river edge welding and applies no physical river displacement;
- adds no FFT, compute pass, texture, dense plane, global water geometry, or WebGPU dependency;
- keeps reduced-motion water static;
- uses compression only as a bounded ocean crest/foam cue.

## Technique provenance

The implementation was authored independently for Warpkeep's Three.js/WebGL renderer after studying general rendering principles from:

- Forge3D at `f5db54f95d202681f95dad649162d18efdae8987` (MIT or Apache-2.0): color-preserving macro relief and quality-tiered terrain shading.
- Poseidon at `caddf773c7e2b7c9b00ad232d21cca4f364d5272` (no license file found during review): scale-separated wave bands and coherent derivatives only. No Poseidon source, shader, asset, dependency, FFT architecture, or WebGPU runtime was copied.
