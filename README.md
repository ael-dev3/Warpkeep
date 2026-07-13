# Warpkeep

## [Play at warpkeep.com](https://warpkeep.com/)

**Every FID has a castle.** Warpkeep is an open-source, Farcaster-native strategy world where identity anchors a keep and SpacetimeDB owns the shared state.

Alpha 0.3.1 is live. The first Hegemony keep stands in a deterministic 61-cell Lowlands realm, and the frontier grows one day at a time. The public build includes the real 3D stone title, an intentional Alpha Terms gate, browser-bound Sign In with Farcaster, rotating HttpOnly sessions, the admission-gated shared realm foundation, responsive WebGL presentation, accessible fallbacks, music, and credits.

The admission list remains intentionally empty. The site is a real product surface and technical foundation, not a claim that resources, upgrades, units, combat, alliances, chat, or seasons are playable yet.

## Current foundation

- Standard website SIWF with an independently verifying Cloudflare Worker and short-lived OIDC handoff.
- Server-authoritative SpacetimeDB module with private admission/auth-epoch controls and public world/player/castle boundaries.
- 61 playable Lowlands cells plus a 30-cell visual apron, one detailed owner keep, and lightweight peer markers.
- Cinematic, balanced, and performance profiles shared by the title and realm; normal modern phones default to balanced.
- Exact build identity, fail-closed configuration, reduced-motion behavior, keyboard/touch controls, and non-WebGL/model fallbacks.
- Apache-2.0 software and CC-BY-4.0 project-owned creative work from v0.3.0 onward, with historical and external terms preserved.

The canonical player domain is [warpkeep.com](https://warpkeep.com/). Source/master assets and immutable bundles live in [Warpkeep-Assets](https://github.com/ael-dev3/Warpkeep-Assets); the game repository contains only runtime media and lightweight provenance records.

## Development

Requirements: Node.js 22. Backend verification additionally uses pnpm 11.7.0, Wrangler 4.110.0, and SpacetimeDB CLI/module 2.6.1.

```sh
npm ci
npm run dev
```

Primary checks:

```sh
npm run verify:licenses
npm run verify:runtime-assets
npm run verify:file-sizes
npm test
npm run typecheck
npm run build
GITHUB_PAGES=true DEPLOY_BASE=/ npm run build
npm audit
```

Asset reconstruction is explicit and never part of an ordinary build:

```sh
npm run assets:fetch
npm run prepare:title-models
WARPKEEP_KEEP_SOURCE=/authorized/offline/source.glb npm run prepare:hegemony-keep
```

The keep source is not publicly mirrored while redistribution authority remains unresolved. Preparation fails closed unless an authorized exact offline copy is supplied.

## Documentation

- [Alpha 0.3.1 release notes](docs/releases/alpha-0.3.1.md) and [Alpha 0.3.0 history](docs/releases/alpha-0.3.0.md)
- [Product direction](docs/design/warpkeep-direction.md) and [roadmap](docs/design/roadmap.md)
- [Technical architecture](docs/technical-architecture.md)
- [Farcaster/OIDC boundary](docs/farcaster-integration.md)
- [Hegemony Lowlands renderer](docs/design/hegemony-lowlands-terrain.md)
- [Engineering lessons](docs/devlog/2026-07-alpha-0.2-auth-and-release-lessons.md)
- [Reconstruction and disaster recovery](docs/operations/reconstruction/README.md)
- [Versioning and release policy](docs/releases/versioning.md)
- [Asset licensing and provenance](ASSETS-LICENSE.md)

## Contributing and security

Focused contributions, provenance improvements, security fixes, and thoughtful product feedback are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). Never place signing keys, admin secrets, SIWF proofs, bearer tokens, private RPC credentials, or deployment credentials in browser variables, commits, issues, logs, screenshots, or example files.
