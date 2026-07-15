# Warpkeep

[Play at warpkeep.com](https://warpkeep.com/) · [Farcaster channel](https://farcaster.xyz/~/channel/warpkeep) · [Latest release](https://github.com/ael-dev3/Warpkeep/releases/tag/v0.3.4) · [Report a bug](https://github.com/ael-dev3/Warpkeep/issues/new/choose) · [Security](SECURITY.md)

Warpkeep is an open-source, Farcaster-connected persistent-world alpha. Alpha
0.3.4 is an admission-gated Genesis 001 preview, not a complete strategy game.
Each admitted founder has a permanent castle in the shared Lowlands. SpacetimeDB
is authoritative for admission, world, player, and castle state; the browser is
only the presentation layer.

## Current alpha

- A model-only 3D title, menu, and responsive realm presentation.
- Shared Lowlands exploration, castle selection, inspection, and navigation.
- Hegemony castle models with device-appropriate visual quality levels.
- An admission-gated Farcaster identity-entry boundary and bounded public
  profile presentation.
- Read-only Marks-balance presentation. Marks are experimental,
  non-transferable accounting units with no cash value.

## Not yet playable

Resources, upgrades, construction, units, combat, alliances, chat, seasons,
wallet actions, Marks crediting or spending, and public admission are not
available. Participation does not promise rewards, airdrops, or financial gain.

## Release and project guide

Current release: [v0.3.4](https://github.com/ael-dev3/Warpkeep/releases/tag/v0.3.4)
at [089430e](https://github.com/ael-dev3/Warpkeep/commit/089430ecec83b72756104b33632673bdc6c2d8f1).
It is a Pages-only release: it does not publish a Worker or SpacetimeDB
module/schema, or alter admission, profiles, world data, castles, wallets, or
Marks.

- [Alpha 0.3.4 release notes](docs/releases/alpha-0.3.4.md)
- [Technical architecture](docs/technical-architecture.md)
- [Product direction and roadmap](docs/design/warpkeep-direction.md) and [next slice](docs/design/roadmap.md)
- [Farcaster integration boundary](docs/farcaster-integration.md)
- [Asset licensing and provenance](ASSETS-LICENSE.md)
- [Versioning and release policy](docs/releases/versioning.md)

## Development

Requires Node.js 22. Backend tooling is documented in its own package areas.

    npm ci
    npm run dev

Asset reconstruction is intentional and never part of an ordinary build. Runtime
media and lightweight provenance records are stored here; authorized source
bundles are maintained in [Warpkeep-Assets](https://github.com/ael-dev3/Warpkeep-Assets).

## Contributing and security

Focused contributions, provenance improvements, security fixes, and thoughtful
product feedback are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). Never put
signing keys, admin secrets, SIWF proofs, bearer tokens, private RPC credentials,
or deployment credentials in browser variables, commits, issues, logs,
screenshots, or example files.
