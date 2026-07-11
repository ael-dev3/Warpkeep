# Warpkeep

**Every FID has a castle.**

[Play the live build at warpkeep.com](https://warpkeep.com/)

Warpkeep is an open-source, Farcaster-native castle strategy game under active public development. The current build is a live, playable vertical slice: it establishes the world, verifies a Farcaster identity, and opens the first Hegemony realm experience while the persistent strategy systems are being built.

## Current build

The public build currently includes:

- A cinematic Three.js title screen with a gateway transition into the Hegemony menu.
- Standard web Sign In with Farcaster using the official relay, with QR-first desktop flow and deep-link-first mobile flow.
- Verified FID and profile presentation, plus an optional 30-day remembered-device convenience for this client-only milestone.
- A deterministic Hegemony Lowlands realm with 61 playable cells and 91 rendered cells, a fixed Frontier Keep, procedural terrain details, camera movement, and accessible fallback controls.
- Lowlands music, responsive desktop/mobile presentation, reduced-motion support, and WebGL/model-load fallbacks.
- A cinematic credits roll and honest development notices for menu systems that are not live yet.

The current realm is session-bound and client-only. A remembered device record is not a server session or proof of ownership.

## What is being built next

Warpkeep is not a finished release or a marketing demo. It is a live public game build being developed in the open. The current vertical slice focuses on presentation, identity, and the first realm; the core asynchronous strategy loop is next.

Not shipped yet:

- Trusted backend sessions and permanent keep ownership.
- A production SpacetimeDB module, subscriptions, and server-authoritative multiplayer state.
- Persistent resources, buildings, units, queues, combat, raids, alliances, and seasons.
- Token mechanics or financialized progression.
- AI-generated changes to authoritative game state.

The repository also contains a local mocked castle dashboard and deterministic reducer scaffold for development. Those systems are not exposed as public gameplay yet.

## Product direction

Warpkeep starts with a focused Hegemony-versus-Core campaign: one clear human faction, a persistent keep, deterministic progression, PvE pressure, public reports, and seasonal strategy. Farcaster identity and social context can become the map; SpacetimeDB will eventually own authoritative multiplayer state; AI can add lore and court flavor without deciding game outcomes.

Read the project direction and roadmap:

- [`docs/vision.md`](docs/vision.md)
- [`docs/design/warpkeep-direction.md`](docs/design/warpkeep-direction.md)
- [`docs/design/roadmap.md`](docs/design/roadmap.md)
- [`docs/design/hegemony-lowlands-terrain.md`](docs/design/hegemony-lowlands-terrain.md)
- [`docs/design/lowlands-audio.md`](docs/design/lowlands-audio.md)

## Local development

Requirements: Node.js and npm.

```bash
npm ci
npm run dev
```

Open the local Vite URL. The normal route opens the title screen; `#menu` opens the Hegemony menu directly for development and accessibility testing.

Run the verification suite:

```bash
npm test
npm run typecheck
npm run build
GITHUB_PAGES=true npm run build
npm audit --audit-level=high
```

For a real identity-flow check, choose **ENTER REALM** from the menu and approve the QR code or Farcaster deep link in a Farcaster client. Tests use injected clients and do not contact the live relay. Do not publish live QR data, channel tokens, proof material, console dumps, or HAR files.

## Architecture

- **Frontend:** Vite, React, TypeScript, and plain responsive CSS.
- **Rendering:** Direct Three.js title and realm surfaces with reduced-motion and fallback paths.
- **Identity:** Standard web Sign In with Farcaster in `src/farcaster/`.
- **Game foundations:** Deterministic models, map generation, and reducer-style logic in `src/game/`.
- **Multiplayer direction:** SpacetimeDB schema and reducer plan in `src/spacetime/` and [`docs/spacetime-db-plan.md`](docs/spacetime-db-plan.md).
- **AI boundary:** Read-only court-report interfaces in `src/ai/`; AI does not mutate authoritative state.

## Reference material

Design and provenance archives are kept separate from runtime code:

- [`docs/reference/castles/`](docs/reference/castles/)
- [`docs/reference/terrain/`](docs/reference/terrain/)
- [`docs/reference/menu/`](docs/reference/menu/)
- [`docs/reference/factions/`](docs/reference/factions/)
- [`ASSETS-LICENSE.md`](ASSETS-LICENSE.md)

## License

Warpkeep is licensed for maximum reuse freedom:

- Software code: Zero-Clause BSD (`0BSD`). See [`LICENSE`](LICENSE).
- Documentation, lore, manifests, and project-owned media/reference assets: CC0 1.0 Universal unless a file says otherwise. See [`LICENSE-CC0`](LICENSE-CC0) and [`ASSETS-LICENSE.md`](ASSETS-LICENSE.md).

These licenses allow broad copying, modification, redistribution, private use, commercial use, forks, mods, alternate clients, and community realms. They do not grant trademark rights or imply endorsement by the official Warpkeep project.
