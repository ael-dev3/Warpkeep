# Warpkeep Alpha 0.3.0

Alpha 0.3.0 turns the activated Alpha 0.2 foundation into a coherent, reproducible living-world release. The public surface remains deliberately admission-gated, but the presentation, identity boundary, world renderer, asset pipeline, and disaster-recovery record now agree on one shippable state.

## Player-facing release

- The title screen now renders the supplied high or compact WARPKEEP stone assembly with its original proportions. A lightweight procedural title remains available while loading, on integrity/load failure, and without WebGL.
- **SETTINGS** is functional. Auto generally chooses Cinematic on strong desktop/tablet hardware, Balanced on normal phones, and Performance only for constrained capability. The player may override it at any time.
- The realm has High, Balanced, and Reduced tiers. Balanced is the normal-phone default and preserves towers, rooflines, doors, banners, silhouette, and 2K material maps in a 2,064,100-byte GLB.
- Fog begins farther from the camera. Warm sunlight, a cool sky fill, restrained exposure, contact grounding, and bounded dynamic shadows reveal the keep without flattening the Lowlands atmosphere.
- **CONTINUE** is gone. Warpkeep is a persistent shared world, not a local campaign slot.
- Credits are geometrically centered through a full-viewport track, remain scrollable with reduced motion, and credit the CC-BY-4.0 stone-title assembly.

## Shared-world boundary

The Farcaster → Worker OIDC → SpacetimeDB path remains fail closed. The canonical world contains 61 server-owned cells, while admission, player, and castle state remain empty until an operator deliberately admits a FID. Anonymous title/menu visitors create no SIWF request or database connection; selecting **ENTER REALM** is the only sign-in trigger.

This release does not claim the complete strategy loop. Resources, building queues, units, combat, alliances, chat, seasons, and public admission remain future slices.

## Licensing and assets

The software boundary is Apache-2.0 and new or modified confirmed project-owned creative work is CC-BY-4.0 from v0.3.0. Historical v0.2.0 0BSD/CC0 grants remain preserved, and externally governed or unresolved files keep their original status.

The source and optimized title packages are public immutable attachments in [Warpkeep-Assets release `title-stone-letters-2026-07-12`](https://github.com/ael-dev3/Warpkeep-Assets/releases/tag/title-stone-letters-2026-07-12). The verified assembly bundle is 5,994,957 bytes with SHA-256 `492af33d4b0ff5ab80f2e726b68c2f8d497cd75bbcc036f57f2388e0b4089177`.

Reference-only keep, menu-film, and source-audio binaries were removed from the active tree. They were not uploaded publicly because redistribution authority is unresolved; runtime derivatives retain their existing provenance status.

## Verification contract

The release gate requires:

- full frozen installs and all root/Worker/module tests;
- TypeScript and three production build variants;
- license-cutover ancestry verification;
- exact runtime asset hashes, GLB validation, and a tracked-file size policy;
- dependency audits and signature verification;
- generated SpacetimeDB binding parity and real CLI/module verification;
- exact-head GitHub Pages deployment followed by public health, security, and protected aggregate checks;
- desktop, tablet, phone, reduced-motion, focus, and model-fallback browser acceptance.

The annotated `v0.3.0` tag and GitHub Release are created only after the deployed canonical build reports the final main commit exactly.
