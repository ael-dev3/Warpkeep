# Warpkeep

**Every FID has a castle.**

[warpkeep.com](https://warpkeep.com/)

Warpkeep is an open-source, Farcaster-native castle strategy game being built in public. The live build is a playable vertical slice: the presentation, identity flow, first realm, and technical foundations are public while the full strategy loop is developed.

## Current public build

- Cinematic title gateway, Hegemony menu, scene-aware music, and Credits roll.
- Standard web Sign In with Farcaster flow with QR and mobile deep-link support.
- Hegemony Lowlands realm presentation with the deterministic Genesis 001 world, 61 gameplay cells, a 30-cell visual apron, camera controls, hover/selection states, and the Frontier Keep landmark.
- Release-channel and exact-build information in the menu for reproducible public builds.
- A guarded shared-alpha path for Farcaster admission, OIDC, and SpacetimeDB authority. It remains fail-closed until its remote production checks are complete.

## Not yet shipped

The current public build does not yet include the complete multiplayer strategy loop: persistent public ownership, resources, upgrades, units, combat, alliances, chat, seasons, or a fully activated shared alpha.

Warpkeep is intentionally being built in public rather than presented as a finished release. The live site is the product surface; this repository is the working source and technical record behind it.

## Product direction

Warpkeep is designed as a persistent, asynchronous fantasy strategy game where Farcaster identity anchors a player-owned keep. The experience is moving from a strong atmospheric realm foundation toward authoritative shared state, meaningful choices, and long-lived player history.

- [Product vision](docs/vision.md)
- [Game design](docs/game-design.md)
- [Warpkeep direction](docs/design/warpkeep-direction.md)
- [Roadmap](docs/design/roadmap.md)
- [Hegemony Lowlands terrain](docs/design/hegemony-lowlands-terrain.md)
- [Farcaster integration](docs/farcaster-integration.md)
- [SpacetimeDB architecture](docs/spacetime-db-plan.md)
- [Technical architecture](docs/technical-architecture.md)
- [Alpha activation runbook](docs/operations/alpha-activation.md)
- [Versioning](docs/releases/versioning.md)

## Local development

Requirements: Node.js 22 or newer. The auth bridge and SpacetimeDB module use pnpm 11.7.0 when their isolated checks are required.

```sh
npm ci
npm run dev
```

Useful verification commands:

```sh
npm run verify:licenses
npm test
npm run typecheck
npm run build
GITHUB_PAGES=true npm run build
GITHUB_PAGES=true DEPLOY_BASE=/ npm run build
npm audit
```

For the backend projects:

```sh
pnpm --dir services/auth-bridge install --frozen-lockfile
pnpm --dir services/auth-bridge run check

pnpm --dir spacetimedb install --frozen-lockfile
pnpm --dir spacetimedb run verify
npm run stdb:verify-bindings
```

Never put signing keys, admin secrets, Farcaster proofs, bearer tokens, or private deployment credentials in browser variables, example files, commits, or issue reports.

## Architecture

- **Client:** React, TypeScript, Vite, and Three.js.
- **Identity:** Farcaster SIWF with a guarded Cloudflare Worker OIDC bridge.
- **Authority:** SpacetimeDB module and generated TypeScript bindings, with fail-closed admission controls.
- **World:** deterministic Genesis 001 terrain and a versioned backend protocol boundary.
- **Delivery:** GitHub Pages with `warpkeep.com` as the canonical product domain.

The application is designed so the public title and menu remain safe and useful even when authentication or backend activation is unavailable.

## Contributing

Focused contributions, provenance records, security fixes, and thoughtful product feedback are welcome. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md).
