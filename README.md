# Warpkeep

## [Play at warpkeep.com](https://warpkeep.com/)

**Every FID has a castle.** Warpkeep is an open-source, Farcaster-native strategy world where identity anchors a keep and SpacetimeDB owns the shared state.

Alpha 0.3.5 is the checked-in Pages-only candidate. It becomes the verified
public release only after protected-main deployment and exact-build
verification. Genesis 001 spans 1,261 deterministic Lowlands cells and 100
permanent castle slots ordered outward from a close-knit founding district. The
candidate includes the real 3D stone title, an intentional
Alpha Terms gate, browser-bound Sign In with Farcaster, rotating HttpOnly
sessions, protocol-3 shared-realm state, responsive WebGL presentation,
one exact canonical readiness boundary, real instanced Hegemony keeps for every
visible founder, a safe-area-aware HUD and camera, accessible fallbacks, bounded
public castle presentation with foundation-bound usernames and a responsive
Farcaster castle record, Marks balance UI, music, and credits.

Production remains deliberately admission-gated. Deliberately admitted
founders now occupy the shared frontier, but public admission is not open and
every further admission or production-state mutation requires explicit owner
scope and verification. The site is a real product surface and technical
foundation, not a claim that resources, upgrades, units, combat, alliances,
chat, or seasons are playable yet.

Alpha 0.3.5 replaces the Alpha 0.3.4 castle LOD binaries with the exact
owner-approved GameReady High, Balanced, and Compact family. High accepts a
modest close-detail cost; Balanced and Compact reduce transfer and geometry,
and Compact retains its intentionally shorter authored proportions. This is a
geometry and encoding refresh, not a claim that the models themselves are
brighter. Direct usernames now remain on slim, deterministic rails at the
castle foundation instead of receiving individual displacement or leader
lines. Selection opens a responsive castle record built only from sanitized
public Farcaster and existing Realm fields, a safe portrait fallback, and one
same-origin background-cleaned decorative asset with exact provenance. The
patch retains one exact Genesis 001 snapshot, shared instancing, uniform
footprint normalization, safe-area-aware UI and camera composition, and bounded
public profile presentation. It preserves the authentication, protocol, Terms,
admission, world, castle, wallet, and Marks authority boundaries. The protected
Pages workflow and exact build stamp remain the source of truth for the public
deployment coordinate.

## Alpha 0.3.5 foundation

- Standard website SIWF with an independently verifying Cloudflare Worker and short-lived OIDC handoff.
- Server-authoritative SpacetimeDB module with private admission/auth-epoch controls and public world/player/castle boundaries.
- 1,261 authoritative Lowlands cells, 100 close-outward permanent castle slots, and shared real-castle LOD rendering for founded keeps.
- Foundation-bound public username rails and a responsive selected-castle record using only sanitized Farcaster presentation and existing public Realm fields.
- Cinematic, balanced, and performance profiles shared by the title and realm; normal modern phones default to balanced.
- Exact build identity, fail-closed configuration, reduced-motion behavior, keyboard/touch controls, and non-WebGL/model fallbacks.
- Apache-2.0 software and CC-BY-4.0 project-owned creative work from v0.3.0 onward, with historical and external terms preserved.

Alpha 0.3.3 replaced peer markers with real instanced keeps, and Alpha 0.3.4
followed with the first optimized Hegemony Main Castle family and tighter
Realm QA. See the [Alpha 0.3.5 release notes](docs/releases/alpha-0.3.5.md) for
the current asset tradeoffs, identity presentation, validation scope, authority
boundary, and honest residual limits.

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
WARPKEEP_MARK_SOURCE=/authorized/offline/hegemony-mark.png npm run prepare:hegemony-mark
```

The active GameReady castle LODs are verified integration outputs from three
exact owner-supplied inputs, not outputs of the superseded Alpha 0.3.4
public-source preparation recipe. Balanced and Compact receive only a bounded,
deterministic correction to their atlas-size metadata; geometry and embedded
images remain unchanged. Recover the outputs from an exact trusted Warpkeep
commit and run `npm run verify:runtime-assets`; do not overwrite them with the
historical derivative family. The 16 July 2026 owner authorization covers this
exact project-internal integration and metadata correction. It is not a
separate public open licence, broader derivative grant, general redistribution
grant, or trademark grant. See the [castle provenance index](docs/reference/castles/).
The same index records the exact background-cleaned decorative WebP used only
inside the castle record; its project-internal authorization does not establish
a public open-content licence or broader derivative/redistribution rights.

## Documentation

- [Alpha 0.3.5 release notes](docs/releases/alpha-0.3.5.md), [Alpha 0.3.4 history](docs/releases/alpha-0.3.4.md), [Alpha 0.3.3 history](docs/releases/alpha-0.3.3.md), [Alpha 0.3.2 history](docs/releases/alpha-0.3.2.md), [Alpha 0.3.1 history](docs/releases/alpha-0.3.1.md), and [Alpha 0.3.0 history](docs/releases/alpha-0.3.0.md)
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
