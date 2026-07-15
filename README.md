# Warpkeep

## [Play at warpkeep.com](https://warpkeep.com/)

**Every FID has a castle.** Warpkeep is an open-source, Farcaster-native strategy world where identity anchors a keep and SpacetimeDB owns the shared state.

Alpha 0.3.4 is the current Pages-only release. Genesis 001 spans 1,261 deterministic Lowlands cells
and 100 permanent castle slots ordered outward from a close-knit founding
district. The public build includes the real 3D stone title, an intentional
Alpha Terms gate, browser-bound Sign In with Farcaster, rotating HttpOnly
sessions, protocol-3 shared-realm state, responsive WebGL presentation,
one exact canonical readiness boundary, real instanced Hegemony keeps for every
visible founder, a safe-area-aware HUD and camera, accessible fallbacks, bounded
public castle presentation, Marks balance UI, music, and credits.

Production remains deliberately admission-gated. Deliberately admitted
founders now occupy the shared frontier, but public admission is not open and
every further admission or production-state mutation requires explicit owner
scope and verification. The site is a real product surface and technical
foundation, not a claim that resources, upgrades, units, combat, alliances,
chat, or seasons are playable yet.

Alpha 0.3.4 replaces the earlier Frontier Keep derivatives with the optimized
high, balanced, and compact Hegemony Main Castle GLBs. It admits only one exact,
complete Genesis 001 snapshot; renders every visible founded castle with a
shared real Hegemony GLB LOD; separates hover, selection, inspection, camera,
and keyboard-focus state; and introduces a compact safe-area-aware HUD,
inspector, navigator, and camera composition. Its public profile presentation
is bounded and sanitized, with neutral nonnumeric fallbacks. The patch preserves
the Alpha 0.3.2 authentication, protocol, admission, world, castle, wallet,
and Marks authority boundaries. The protected Pages workflow and exact build
stamp remain the source of truth for the public deployment coordinate.

## Alpha 0.3.4 foundation

- Standard website SIWF with an independently verifying Cloudflare Worker and short-lived OIDC handoff.
- Server-authoritative SpacetimeDB module with private admission/auth-epoch controls and public world/player/castle boundaries.
- 1,261 authoritative Lowlands cells, 100 close-outward permanent castle slots, and shared real-castle LOD rendering for founded keeps.
- Cinematic, balanced, and performance profiles shared by the title and realm; normal modern phones default to balanced.
- Exact build identity, fail-closed configuration, reduced-motion behavior, keyboard/touch controls, and non-WebGL/model fallbacks.
- Apache-2.0 software and CC-BY-4.0 project-owned creative work from v0.3.0 onward, with historical and external terms preserved.

Alpha 0.3.3 replaced the peer-marker presentation with real
instanced keeps, removed the standalone 61-cell browser fallback, and kept the
illustrated fallback bound to the same canonical 1,261-cell snapshot. See the
[Alpha 0.3.4 release notes](docs/releases/alpha-0.3.4.md) for its validation
scope, release boundary, and honest residual limits.

The canonical player domain is [warpkeep.com](https://warpkeep.com/), and the
main community home is the [Warpkeep channel on Farcaster](https://farcaster.xyz/~/channel/warpkeep).
Durable public bug reports and realm wishes can be submitted through the
[Realm Council issue forms](https://github.com/ael-dev3/Warpkeep/issues/new/choose);
security-sensitive reports must follow [SECURITY.md](SECURITY.md) instead.
Source/master assets and immutable bundles live in [Warpkeep-Assets](https://github.com/ael-dev3/Warpkeep-Assets);
the game repository contains only runtime media and lightweight provenance
records.

Marks are experimental, non-transferable, non-redeemable game-accounting units
with no cash value. The versioned v1 policy defines a 1:1 six-decimal
micro-unit conversion for eligible finalized ordinary SNAP burns on Ethereum
mainnet, but production credit application, Marks spending, and the scheduler
remain unavailable. The browser never connects or scans wallets, requests a
wallet signature or approval, submits a transaction, or receives private
wallet/event records. See the [versioned Marks policy](docs/gameplay/marks-policy-v1.md).

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
npm run assets:fetch:castle
npm run tools:fetch:gltfpack
npm run prepare:hegemony-castle
WARPKEEP_MARK_SOURCE=/authorized/offline/hegemony-mark.png npm run prepare:hegemony-mark
```

The Main Castle preparation pipeline verifies the public-release archive, exact
source member, checksum-pinned `gltfpack` tool, and derived outputs before it
writes runtime files. On 2026-07-15 the project owner authorized
project-internal runtime integration and deterministic derivative preparation;
this is not a separate public open license, redistribution grant, or trademark
grant. See the [dated castle provenance record](docs/reference/castles/2026-07-15-hegemony-main-castle/).

## Documentation

- [Alpha 0.3.3 release notes](docs/releases/alpha-0.3.3.md), [Alpha 0.3.2 history](docs/releases/alpha-0.3.2.md), [Alpha 0.3.1 history](docs/releases/alpha-0.3.1.md), and [Alpha 0.3.0 history](docs/releases/alpha-0.3.0.md)
- [Marks policy v1](docs/gameplay/marks-policy-v1.md)
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
