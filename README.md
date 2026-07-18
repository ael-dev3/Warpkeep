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
2. add private server-derived resources, deterministic collection, and a
   bounded visible expedition loop;
3. add authoritative construction queues; then
4. expand into scouting, travel, conflict, and alliances only when their rules
   can be authoritative, recoverable, and understandable in the game.

The verified public alpha focuses on admission-gated founding, exploration,
castle inspection, and the visual language of the Hegemony Lowlands. The
undeployed 0.3.9 source candidate adds private Food, Wood, Stone, and Gold
accounts, deterministic terrain collection, a 10,000-cell world with 2,000
resource-capable anchors, and a bounded 24-site Gold Mine wagon expedition. Construction,
upgrades, units, combat, alliances, chat, seasons, resource transfers, Marks
spending, and rewards are not playable systems today. Alpha participation
offers no financial return, airdrop, or promise of future value.

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

The checked-in package is Alpha 0.3.9, an **undeployed candidate**. It retains
the pending private Food, Wood, Stone, and Gold authority and expands the
deterministic Genesis world definition to exactly 10,000 persistent cells. The
existing 1,261 cells and all 100 close-outward founder slots remain exact, while
8,739 outer cells add placement space. It also stages a 24-site Genesis Gold
Mine pilot where a server-authorized wagon gathers one Gold per completed minute
for 30 days. Gold-site occupancy is public, while ownership, routes, requests,
accrual, and balances remain private and server-controlled. Community Marks
remains separate with no conversion or spending path. A public, server-seeded
layout gives every player the same 210 decorative trees, groves, and clearings;
graphics quality changes only the selected model LOD. Forests do not change
terrain, movement, resources, or ownership. Production publication,
owner-approved world, resource, Gold-site, and forest-layout setup, aggregate
verification, and exact Pages deployment remain explicitly approval-gated. See the
[candidate release notes](docs/releases/alpha-0.3.9.md).

## Architecture

The client is built with React, TypeScript, Vite, and Three.js. Farcaster sign-in
uses a browser-bound SIWF flow through a least-privilege Cloudflare identity
bridge; SpacetimeDB owns the shared Realm records. WebGL is an enhancement, not
an authority boundary: the product retains keyboard, touch, reduced-motion, and
non-WebGL paths.

Live Genesis 001 currently retains 1,261 authoritative cells. The 0.3.9
candidate defines exactly 10,000 persistent cells: a complete radius-57 hex
disc plus 81 cells arranged as six balanced, contiguous side-centred arcs on
ring 58. It preserves the 100 permanent founder slots and their close founding
district. Production admission remains deliberately closed except for
explicitly approved founders.

In the 0.3.9 candidate, each resource account and expedition remain private to
the authenticated caller. Peer balances never enter the public Realm
subscription; public Gold-site occupancy exposes only the site, phase, timeline,
and originating castle. The browser cannot supply the FID, castle, terrain,
route, rate, balance, or clock used for settlement. Invalid or unavailable
resource authority withholds the Realm instead of falling back to browser state.

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
