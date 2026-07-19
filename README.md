# Warpkeep

**[Warpkeep](https://warpkeep.com/) is an open-source persistent strategy world where a Farcaster identity becomes a permanent castle.**

Genesis 001 is an invite-only Lowlands realm. Its 10,000 cells, roads, forests,
resource sites, and 100 castle foundations are shared by every player. A
founder's keep stays in the same place between visits, carrying a public name
and portrait while ownership and private resources remain server-controlled.

![Development preview of Genesis 001 showing founded keeps, procedural grass, and an open castle record.](docs/reference/screenshots/2026-07-18-procedural-grass-wind-preview/warpkeep-procedural-grass-preview-eb156adea5befbd7.png)

*Development preview from the procedural grass and wind draft; the screenshot is a visual reference and may not represent the exact current live build.*

Alpha 0.3.11 introduces the first visible gathering choice: founders can send
separate wagons to Gold Mines, Wheat Farms, and Logging Camps. Stone still
comes only from a keep's terrain yield; Quarry art is visual groundwork.
Construction, armies, combat, trade, and the wider strategy loop are not
playable yet.

Warpkeep is currently developed by one person with community feedback. It is
an experiment, not a financial product: Alpha participation earns no airdrop,
guaranteed reward, or promised financial return. Community Marks are separate
in-game accounting with no live spending, transfer, or cash-value loop.

## What is live

- A persistent 10,000-cell world with 100 permanent castle sites.
- Farcaster sign-in, invite-only founding, and one durable keep per player.
- Public castle names and portraits with private ownership records.
- Private Food, Wood, and Stone terrain yield, plus expedition-earned Gold.
- Server-governed Gold, Food, and Wood expeditions on shared map sites.
- A shared forest, procedural grass, responsive WebGL rendering, and accessible
  fallback navigation.

The browser presents the realm. SpacetimeDB decides admission, ownership,
balances, routes, timers, and expedition outcomes.

## Run locally

Prerequisites: Git, Node.js 22, and npm 10.

```sh
git clone https://github.com/ael-dev3/Warpkeep.git
cd Warpkeep
npm ci
npm run dev
```

The local app does not grant shared Alpha access. Before contributing, run the
checks in [CONTRIBUTING.md](CONTRIBUTING.md) and read the
[asset provenance rules](ASSETS-LICENSE.md); protected source packages are not
part of a normal build.

## Architecture

- React, TypeScript, Vite, Three.js, and responsive CSS power the client.
- A Cloudflare Worker verifies Farcaster sign-in and issues least-privilege,
  short-lived credentials.
- SpacetimeDB owns the persistent world and private player state.
- GitHub Actions verifies the client, auth bridge, database module, generated
  bindings, migrations, dependencies, licenses, and asset contracts.

Start with the [technical architecture](docs/technical-architecture.md),
[roadmap](docs/design/roadmap.md), and [documentation guide](docs/README.md).

## Community and project links

- [Play Warpkeep](https://warpkeep.com/)
- [Warpkeep channel on Farcaster](https://farcaster.xyz/~/channel/warpkeep)
- [Realm Council issue forms](https://github.com/ael-dev3/Warpkeep/issues/new/choose)
- [Visual asset archive](https://github.com/ael-dev3/Warpkeep-Assets)
- [Contributing guide](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Release history](CHANGELOG.md)
- [Security reporting](SECURITY.md)

## License

Warpkeep software is Apache-2.0. Authorized project-owned creative work follows
the recorded CC-BY terms; some GameReady runtime assets have narrower reuse
permissions. Read [LICENSING.md](LICENSING.md) and
[ASSETS-LICENSE.md](ASSETS-LICENSE.md) before reusing media.
