# Warpkeep

> A place in the network becomes a place in the world.

[Warpkeep](https://warpkeep.com/) is a persistent Farcaster strategy realm. An
admitted founder receives one durable castle in Genesis 001: a shared frontier
where identity has a home, the world remembers, and every keep belongs to a
verified Farcaster identity in the network.

Alpha 0.3.8 is live and admission-gated. It is an early foundation, not a
finished MMO or a financial product.

## Enter Genesis 001

Genesis 001 contains 10,000 persistent cells. Its first 100 permanent castle
sites remain gathered around a close founding district, so new founders join a
neighbourhood rather than disappearing at the edge of an empty map.

Today, admitted players can:

- enter with a verified Farcaster identity;
- visit their persistent keep and explore the surrounding Lowlands;
- inspect nearby founders through their public username, portrait, and castle;
- collect Food, Wood, Stone, and Gold produced privately by their keep's terrain;
- return later to the same authoritative world state.

Community Marks also exist as separate private game accounting. They begin at
zero and currently have no spending, conversion, transfer, or reward loop.

## What lies beyond the frontier

The wider map gives the Realm room to grow, but that room is intentionally
quiet. Resource nodes, construction, upgrades, units, combat, alliances,
trading, chat, seasons, and rewards are not playable today. Their presence in
design notes or groundwork is not a promise that they will ship unchanged.

Alpha participation does not earn an airdrop, financial return, guaranteed
reward, or guaranteed future value. Warpkeep is an experimental project built
by one person, and its world, rules, and direction will evolve.

## Principles

- **Identity has a home.** Farcaster FID is the durable identity coordinate;
  handles and portraits are bounded presentation metadata.
- **The browser presents; the world decides.** Admission, ownership,
  resources, and persistent state remain server-authoritative.
- **A readable world comes before a crowded interface.** Keeps, names,
  terrain, and map movement should stay clear across mouse, touch, keyboard,
  reduced-motion, and non-WebGL paths.
- **New systems must be honest.** A feature is not described as playable until
  its rules, recovery path, and release boundary are real.

## Under the battlements

The client uses React, TypeScript, Vite, and Three.js. Farcaster sign-in passes
through a browser-bound, least-privilege identity bridge, while SpacetimeDB
owns the persistent Realm and private player state. WebGL is presentation, not
an authority boundary.

More detail lives in the [technical architecture](docs/technical-architecture.md),
[Farcaster integration](docs/farcaster-integration.md), and
[game direction](docs/design/warpkeep-direction.md).

## Run locally

Node.js 22 is required.

```sh
npm ci
npm run dev
```

Before contributing, run the checks appropriate to your change:

```sh
npm test
npm run typecheck
npm run verify:licenses
npm run verify:runtime-assets
npm run build
```

Asset reconstruction is explicit and is not part of a normal build. Read
[asset provenance](ASSETS-LICENSE.md) and
[reconstruction and recovery](docs/operations/reconstruction/README.md) before
working with protected source packages.

## Join the Realm

- Play at [warpkeep.com](https://warpkeep.com/)
- Join the [Warpkeep channel on Farcaster](https://farcaster.xyz/~/channel/warpkeep)
- Share bugs and ideas through the [Realm Council issue forms](https://github.com/ael-dev3/Warpkeep/issues/new/choose)
- Read the [Alpha 0.3.8 release notes](docs/releases/alpha-0.3.8.md)
- See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change

Report security-sensitive issues privately through [SECURITY.md](SECURITY.md),
not a public issue.

## License and provenance

Warpkeep software is Apache-2.0. Project-owned creative work follows the
repository's recorded CC-BY terms where authorized. Some GameReady runtime
assets have narrower recorded provenance and use permissions; they are not
granted a general open-content or derivative license. See
[ASSETS-LICENSE.md](ASSETS-LICENSE.md) and [LICENSING.md](LICENSING.md) before
reuse.
