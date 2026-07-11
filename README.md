# Warpkeep — Alpha 0.2.0

**Every FID has a castle — once the Hegemony admits it.**

[Canonical player domain](https://warpkeep.com/) · [Legacy Pages presentation](https://ael-dev3.github.io/Warpkeep/) · [Farcaster access contact](https://farcaster.xyz/0xael.eth) · [Closed-alpha PR](https://github.com/ael-dev3/Warpkeep/pull/11)

Warpkeep is an open-source, Farcaster-native castle strategy game under active public development. The public presentation contains the cinematic gateway, Hegemony menu, Lowlands realm, soundtrack, and Credits; its shared realm is implemented behind a deliberately closed admission boundary.

## Current public build

- A cinematic Three.js title screen and gateway transition into the Hegemony menu.
- Standard website Sign In with Farcaster, with QR-first desktop and deep-link-first mobile presentation.
- A deterministic Hegemony Lowlands presentation with 61 playable cells, 91 rendered cells, a Frontier Keep, procedural terrain, camera movement, and accessible fallback controls.
- Lowlands music, reduced-motion support, responsive layouts, and WebGL/model-load fallbacks.
- A cinematic Credits roll and honest notices for systems that are not live yet.

The public realm remains presentation-only until the closed-alpha backend has passed every activation gate. A remembered device record is not a server session or proof of permanent ownership.

## Closed-alpha architecture

```text
Farcaster SIWF approval
  -> Warpkeep auth bridge independently verifies the proof
  -> ES256 OIDC JWT (sub = farcaster:<fid>)
  -> SpacetimeDB connection with .withToken(jwt)
  -> Maincloud validates issuer discovery/JWKS
  -> Warpkeep module validates claims, auth epoch, and private allowed_fid
  -> admitted users receive one player, one castle, and shared Lowlands state
```

Anonymous title and menu visitors never open a SpacetimeDB connection or receive an anonymous database identity. The module has private `allowed_fid`/`admin_audit` tables, public 61-tile/player/castle projections, and browser bindings that exclude private tables.

The initial real whitelist must remain empty. A valid but unadmitted identity sees:

> This Farcaster identity is not yet admitted to the Hegemony frontier.

The panel displays the active FID and provides **REQUEST ACCESS**, **CHECK AGAIN**, and **SIGN OUT**. The request action is the semantic, privacy-preserving [@0xael.eth Farcaster link](https://farcaster.xyz/0xael.eth). Check Again reuses the existing valid session and never creates a new QR/deep link.

## Alpha activation status

The repository uses the fail-closed issuer `https://auth.warpkeep.invalid` until a real public OIDC bridge, resolver, and Maincloud module are verified. The GitHub Pages domain is verified and public DNS resolvers now see the correct apex and `www` records, but the GitHub Pages HTTPS certificate, Cloudflare Worker credentials, and public issuer are still pending. No bridge, module publish, allowlist row, player, or castle has been created by this branch.

The known Maincloud development database is `warpkeep-89e4u` at `https://maincloud.spacetimedb.com`. It must be inspected before every mutation and never cleared or seeded with a real FID during activation.

Before activation, deploy a stable HTTPS bridge whose discovery and JWKS endpoints are public, configure a trusted auth-epoch resolver, replace the module placeholder with that exact issuer, publish non-destructively, seed only the world tiles, and verify the empty-whitelist denial path. The release policy is in [versioning](docs/releases/versioning.md); the operator sequence is in the [alpha activation runbook](docs/operations/alpha-activation.md).

## Local development

Requirements: Node.js and npm.

```bash
npm ci
npm run dev
```

The normal route opens the title screen; `#menu` opens the Hegemony menu directly for development and accessibility checks. Run the full verification suite with:

```bash
npm test
npm run typecheck
npm run build
GITHUB_PAGES=true npm run build
GITHUB_PAGES=true DEPLOY_BASE=/ npm run build
npm audit --audit-level=high
```

The default local experience remains title/menu-safe. A production bridge is never inferred from a browser identity; local HTTP is allowed only for an explicitly configured localhost development bridge.

### Browser-safe configuration

Copy `.env.example` to an untracked local `.env` only when working with a real or local bridge. These are public build values, never secrets:

```dotenv
VITE_WARPKEEP_SHARED_ALPHA_ENABLED=false
VITE_SPACETIMEDB_URI=https://maincloud.spacetimedb.com
VITE_SPACETIMEDB_DATABASE=warpkeep-89e4u
VITE_WARPKEEP_AUTH_BRIDGE_URL=https://auth.example.com
VITE_WARPKEEP_OIDC_ISSUER=https://auth.example.com
VITE_WARPKEEP_OIDC_AUDIENCE=warpkeep-spacetimedb
```

The kill switch is `false` by default. Never put signing keys, RPC URLs, admin secrets, resolver credentials, or admin JWTs in a `VITE_` variable.

## Module, bridge, and operations

The SpacetimeDB TypeScript module is pinned to `2.6.1`; committed bindings are generated by CLI `2.6.1`, not hand-authored. Useful local commands are:

```sh
npm run stdb:version
npm run stdb:build
npm run stdb:generate
npm run stdb:verify-bindings
npm run stdb:inspect-alpha
```

Hermes requests a short-lived admin JWT only at runtime. Mutations require `--confirm`; do not run `allow-fid` for an owner, QA account, or real user during activation.

The bridge has discovery, public-only JWKS, durable replay protection, strict CORS/body limits, and a server-only admin endpoint. Its resolver is never a browser endpoint; resolver failure produces a safe `503 authorization_unavailable` rather than a client-side fallback.

For architecture and activation boundaries, see:

- [Farcaster integration](docs/farcaster-integration.md)
- [SpacetimeDB plan](docs/spacetime-db-plan.md)
- [Architecture](docs/technical-architecture.md)
- [Roadmap](docs/design/roadmap.md)
- [Alpha 0.2.0 release notes](docs/releases/alpha-0.2.0.md)
- [Project direction](docs/design/warpkeep-direction.md)

## License

Code is [0BSD](LICENSE). Documentation, lore, manifests, and project-owned reference assets are CC0 unless noted otherwise; see [LICENSE-CC0](LICENSE-CC0) and [ASSETS-LICENSE.md](ASSETS-LICENSE.md).
