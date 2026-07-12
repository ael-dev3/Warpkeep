# Warpkeep

**Every FID has a castle.**

[warpkeep.com](https://warpkeep.com/)

Warpkeep is an open-source, Farcaster-native castle strategy game being built in public. The live build is a playable vertical slice: the presentation, identity flow, first realm, and technical foundations are public while the full strategy loop is developed.

## Current public build

- A cinematic Three.js title screen and gateway transition into the Hegemony menu.
- Standard website Sign In with Farcaster, with QR-first desktop and deep-link-first mobile presentation.
- A deterministic Hegemony Lowlands presentation with 61 playable cells, 91 rendered cells, a Frontier Keep, procedural terrain, camera movement, and accessible fallback controls.
- Lowlands music, reduced-motion support, responsive layouts, and WebGL/model-load fallbacks.
- A cinematic Credits roll and honest notices for systems outside the current alpha slice.
- Release-channel and exact-build information in the menu for reproducible public builds.

The shared-realm authority is live behind an intentionally empty admission list. A remembered device record is not proof of permanent ownership, and no real player or castle exists until the Hegemony explicitly admits a FID.

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

## Alpha activation status

The canonical Pages domain and `https://auth.warpkeep.com` are live over HTTPS. OIDC discovery and public-only JWKS, exact browser CORS, distributed rolling-window rate control, and the private direct Maincloud auth-epoch procedure path are active. The module trusts that exact issuer and was published non-destructively.

Maincloud contains exactly 61 canonical world cells, zero allowlist rows, zero enabled FIDs, zero players, and zero castles. No real FID was admitted. The reviewed Alpha 0.2 build and its fail-closed empty-admission behavior are deployed at the canonical domain.

For each verified proof exchange, the Worker mints a short-lived private Hermes OIDC JWT and calls the documented SpacetimeDB HTTP procedure `POST /v1/database/:database/call/admin_get_fid_auth_epoch`; no separate public resolver service is used. The release policy is in [versioning](docs/releases/versioning.md); the operator and rollback sequence is in the [alpha activation runbook](docs/operations/alpha-activation.md).

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

The bridge has discovery, public-only JWKS, durable replay protection,
distributed per-client rate control, strict CORS/body limits, and a server-only
admin endpoint. Its internal auth-epoch lookup is a private Worker-to-SpacetimeDB
HTTP procedure call, never a browser endpoint; lookup failure produces a safe
`503 authorization_unavailable` rather than a client-side fallback.

- **Client:** React, TypeScript, Vite, and Three.js.
- **Identity:** Farcaster SIWF with a guarded Cloudflare Worker OIDC bridge.
- **Authority:** SpacetimeDB module and generated TypeScript bindings, with fail-closed admission controls.
- **World:** deterministic Genesis 001 terrain and a versioned backend protocol boundary.
- **Delivery:** GitHub Pages with `warpkeep.com` as the canonical product domain.

The application is designed so the public title and menu remain safe and useful even when authentication or backend activation is unavailable.

## Contributing

Focused contributions, provenance records, security fixes, and thoughtful product feedback are welcome. Start with [`CONTRIBUTING.md`](CONTRIBUTING.md).
