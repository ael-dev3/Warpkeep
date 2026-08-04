# Inner Keep population runtime selection

This record pins the exact citizens, mounts, infantry, ranged units, and
cavalry authorized for Warpkeep's official Inner Keep presentation. It does
not turn ambient motion into game state and does not grant a new public license
for the model files.

## What is selected

- Eight citizens, including the mounted Emberfoot Courier and Shellback Shrine
  Tender.
- Four infantry units and four ranged units for foot patrols.
- Four mounted cavalry units for the garrison patrol.
- One rigged Balanced model and one static Compact fallback per actor.
- 40 content-addressed GLBs, 8,705,628 bytes across both profiles.
- Selection digest
  `79237fbe85a4db7a0592eb0c27cc00f8e72e85e58be867bec4dd35992f0b87f7`.

The full machine-readable allowlist is [`manifest.json`](manifest.json).

## Source coordinates

The selected files come from two public Warpkeep-Assets releases dated
2026-08-03:

- [`hegemony-citizens-keep-services-2026-08-03`](https://github.com/ael-dev3/Warpkeep-Assets/releases/tag/hegemony-citizens-keep-services-2026-08-03)
- [`hegemony-unit-corps-2026-08-03`](https://github.com/ael-dev3/Warpkeep-Assets/releases/tag/hegemony-unit-corps-2026-08-03)

The manifest pins all four release archives, both trusted release manifests,
their repository commits, every source runtime manifest, and every selected
GLB by exact bytes and SHA-256.

## Authorization and license boundary

On 2026-08-04, Ael instructed Warpkeep to use these characters, mounts, and
army units in the official Inner Keep runtime, including animated civic
routines and patrols. That instruction authorizes only the exact selected
files in the public `ael-dev3/Warpkeep` repository and official
`warpkeep.com` client.

The source releases provide public archive distribution but no separate
blanket open-content license for these models. The selection therefore remains
`LicenseRef-Warpkeep-Provenance-Required`. The authorization does not relicense
the releases, grant unrelated redistribution or derivative rights, authorize
substitutions, or approve activation, merge, or deployment.

## Runtime boundary

The browser loads only installed, local, content-addressed files. Ordinary
builds never fetch GitHub releases or read the archive cache. Balanced models
provide deterministic Idle, Walk, and civic Greet/Work animation where
attested. Compact models are static fallbacks for reduced quality or reduced
motion.

All inhabitants are presentation-only. Their path sampling is deterministic
and closed-form. No ambient actor accepts player coordinates, writes server
state, impersonates a player or Worker, emits chat, determines collision, or
grants combat, resource, reward, identity, or ownership authority.

## Reproduce and verify locally

With the exact four release archives already present in the ignored local
asset cache:

```sh
npm run assets:audit:inner-keep-population
npm run prepare:inner-keep-population-assets
npm run verify:inner-keep-population-assets
```

The audit verifies the release manifests and archives without installing.
Installation extracts only the 40 allowlisted GLBs. Repository and production
verification reject missing, unexpected, changed, symlinked, malformed, or
non-content-addressed outputs.
