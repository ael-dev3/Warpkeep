# Warpkeep

**[Warpkeep](https://warpkeep.com/) is an open-source software project building a persistent strategy world where a Farcaster identity becomes a permanent castle.**

Genesis 001 is an invite-only Lowlands realm. Its 10,000 cells, coast, rivers,
roads, forests, resource sites, and 100 castle foundations are shared by
every player. A founder's keep stays in the same place between visits, carrying
a public name and portrait while ownership and private resources remain
server-controlled.

Alpha 0.3.13 gives the Lowlands a more natural shape. Twelve persistent rivers
cross clustered forests and grasslands before reaching an ocean that can be
explored up to the fog. Founders can follow and select the separate supply
wagon sent to each resource site, but this is still the beginning:
construction, armies, combat, trade, and the wider strategy loop are not
playable yet.

Warpkeep is currently developed in the open by one person and shaped by
community feedback. It is an experiment, not a financial product: Alpha
participation earns no airdrop, guaranteed reward, or promised financial
return. Community Marks are separate in-game accounting with no live spending,
transfer, or cash-value loop.

## What is live

- A persistent 10,000-cell world with a coastline, twelve rivers, and 100
  permanent castle sites.
- Farcaster sign-in, invite-only founding, and one durable keep per player.
- Public castle names and portraits with private ownership records.
- Private Food, Wood, Stone, and Gold accounts; terrain yield and expedition
  settlement remain controlled by the server.
- Shared Gold Mines, Wheat Farms, Logging Camps, and Stone Quarries, each with
  a selectable independent wagon expedition.
- A shared forest, clustered outer groves, biome-driven grass, responsive WebGL
  rendering, and coast-to-fog navigation across desktop and mobile layouts.

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
