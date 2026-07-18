# Warpkeep

[warpkeep.com](https://warpkeep.com/) is a Farcaster-connected, persistent
strategy world. Each admitted founder is represented by one durable keep in a
shared frontier; identity gives a place in the world, while the server remains
the authority for the world itself.

## Direction

Warpkeep is being built as a legible, social strategy game rather than a
collection of disconnected screens. The near-term path is deliberate:

1. establish a trustworthy shared world, clear castle presence, and strong map
   interaction;
2. add server-derived resources and deterministic construction queues; then
3. expand into scouting, travel, conflict, and alliances only when their rules
   can be authoritative, recoverable, and understandable in the game.

The present alpha focuses on admission-gated founding, exploration, castle
inspection, and the visual language of the Hegemony Lowlands. Resources,
upgrades, units, combat, alliances, chat, seasons, Marks spending, transfers,
and rewards are not playable systems today. Alpha participation offers no
financial return, airdrop, or promise of future value.

## Product principles

- **Identity has a home.** A Farcaster FID is the identity coordinate; handles,
  portraits, and other profile data are display metadata.
- **The browser presents; the server decides.** Admission, castle ownership,
  shared-world state, and future game actions never become browser authority.
- **Presentation serves play.** The Realm aims for readable, sunlit keeps,
  grounded terrain, dependable map controls, accessible fallbacks, and clear
  player identity without inventing unavailable mechanics.
- **Expansion stays deliberate.** Every new system needs explicit rules,
  deterministic tests, operational recovery, and an honest release boundary.

## Current status

Alpha 0.3.6 is the verified public Pages release. Its in-menu build stamp
identifies the exact protected-main commit deployed to players. Detailed
release truth lives in the [changelog](CHANGELOG.md),
[release notes](docs/releases/), and exact-version in-game patch chronicle—not
in this overview.

## Architecture

The client is built with React, TypeScript, Vite, and Three.js. Farcaster sign-in
uses a browser-bound SIWF flow through a least-privilege Cloudflare identity
bridge; SpacetimeDB owns the shared Realm records. WebGL is an enhancement, not
an authority boundary: the product retains keyboard, touch, reduced-motion, and
non-WebGL paths.

Genesis 001 is a deterministic Lowlands world with 1,261 authoritative cells
and 100 permanent founder slots. Production admission remains deliberately
closed except for explicitly approved founders.

## Run locally

Node.js 22 is required.

```sh
npm ci
npm run dev
```

Useful checks:

```sh
npm test
npm run typecheck
npm run verify:licenses
npm run verify:runtime-assets
npm run build
DEPLOY_BASE=/ npm run build
```

Asset reconstruction is explicit and is not part of a normal build. See
[reconstruction and recovery](docs/operations/reconstruction/README.md) and
[asset provenance](ASSETS-LICENSE.md) before working with protected source
packages.

## Documentation

- [Game direction](docs/design/warpkeep-direction.md) and [roadmap](docs/design/roadmap.md)
- [Technical architecture](docs/technical-architecture.md) and [Farcaster/OIDC boundary](docs/farcaster-integration.md)
- [Lowlands renderer](docs/design/hegemony-lowlands-terrain.md)
- [Release notes](docs/releases/) and [versioning policy](docs/releases/versioning.md)
- [Contributing](CONTRIBUTING.md), [security policy](SECURITY.md), and [asset provenance](ASSETS-LICENSE.md)

## Community and reporting

Join the [Warpkeep channel on Farcaster](https://farcaster.xyz/~/channel/warpkeep)
for discussion. Use the [Realm Council issue forms](https://github.com/ael-dev3/Warpkeep/issues/new/choose)
for durable bug reports and game feedback. Report security-sensitive issues
through [SECURITY.md](SECURITY.md), not public issues.

## Source and provenance

Warpkeep software is Apache-2.0. Project-owned creative work follows the
repository's recorded CC-BY terms where authorized. Some GameReady runtime
assets have narrower recorded provenance and use permissions; they are not
granted a general open-content or derivative license. See [ASSETS-LICENSE.md](ASSETS-LICENSE.md),
[LICENSING.md](LICENSING.md), and the relevant provenance records before reuse.
