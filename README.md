# Warpkeep

**Every FID has a castle.**

Warpkeep is an open-source Farcaster-native strategy game where each player can claim a keep, build a realm, and participate in seasonal conflicts.

**Live demo:** https://ael-dev3.github.io/Warpkeep/

Current public prototype: the live demo opens on a pure Three.js **WARPKEEP** title screen built around custom continuous architectural letterforms, a slowly rotating five-arm galaxy, and an accessible eye-like gravitational gateway. Activating the galactic core now pulls the scene through a violet warp passage into a live Hegemony main menu. That menu uses a repaired clean 1080p castle-and-sunset film, the project-provided “Sunset Hegemony” score, antique-gold semantic HTML controls, keyboard/touch navigation, a static reduced-motion treatment, and a clean return path to the title. `ENTER REALM` now opens an early deterministic Hegemony Lowlands terrain foundation: one continuous 19-cell pointy-top region generated from a stable seed with shared-edge geometry, procedural surface variation, hover/selection, and a WebGL fallback. It is not a game loop yet; keeps, resources, units, combat, persistence, Farcaster auth, and SpacetimeDB remain future work.

Warpkeep is a Farcaster-native asynchronous strategy game seed where every Farcaster FID maps to a persistent castle profile. It is inspired by old-school asynchronous strategy loops like building, training, scouting, raiding, alliances, and seasonal realm politics, but it is designed as an original Farcaster-native game foundation.

<p align="center">
  <img src="public/images/warpkeep-cover.png" alt="Warpkeep cover art" width="720" />
</p>

<p align="center">
  <em>Build, expand, warp, and conquer across a fantasy realm of shifting keeps and distant wars.</em>
</p>

Warpkeep aims for the feel of a grand fantasy 4X strategy game: vast realms, distant battles, player-built keeps, alliances, conquest, and magical warping across the map.

Current status: **initial seed / scaffold with title-to-menu presentation and an early deterministic realm-terrain prototype**. The repo still contains a local mocked castle dashboard and deterministic state scaffold for development, but that dashboard is not exposed by the public menu. SpacetimeDB, gameplay, persistence, and real Farcaster auth are planned, not complete.

## Current direction

Warpkeep is an open-source Farcaster-native strategy game where each player can claim a keep, build a realm, and participate in seasonal conflicts. The first direction is a small Hegemony-versus-Core campaign focused on castle progression, PvE battles, public reports, and social strategy. Long-term, Warpkeep is intended to support Ousters as a second human faction, community realms, forkable rules, and player-driven Farcaster-native stories.

Long-term, Warpkeep may explore distinct faction economies: a regulated Hegemony economy using official faction currency rails such as Hypersnap `$SNAP`, and an Ouster economy based on player-to-player trade and social trust. This is experimental/post-MVP and not part of the initial playable scope.

Read more:

- [`docs/design/warpkeep-direction.md`](docs/design/warpkeep-direction.md)
- [`docs/design/hegemony-lowlands-terrain.md`](docs/design/hegemony-lowlands-terrain.md)
- [`docs/design/roadmap.md`](docs/design/roadmap.md)

## Official faction art

<p align="center">
  <img src="public/images/factions/hegemony/logo-wordmark.png" alt="Official Hegemony faction logo wordmark" width="420" />
</p>

<p align="center">
  <img src="public/images/factions/hegemony/logo-ui.png" alt="Official Hegemony in-game UI faction logo" width="260" />
</p>

The Hegemony wordmark is the official high-resolution faction logo for public docs and faction identity surfaces. The textless version is the official in-game UI logo for compact badges, cards, and small interface use.

See [`docs/reference/factions/hegemony/`](docs/reference/factions/hegemony/) for asset metadata.

## Concept

A Farcaster-native strategy game where your FID becomes a kingdom.

The current public experience:

1. A cinematic **WARPKEEP** title screen establishes the cosmic world.
2. Click/tap the central gateway, or press Enter/Space, to enter the Hegemony menu through a gateway-centered transition.
3. **Enter Realm** opens the early deterministic Hegemony Lowlands prototype: a seamless-data 19-cell pointy-top terrain foundation with basic camera, hover, selection, and an accessible WebGL fallback.
4. Continue, Settings, Credits, and Exit retain their honest development notices.
5. Return to Menu, Escape, and browser Back preserve the title/menu history path without a page reload.
6. The local mocked castle dashboard remains a future-development scaffold and is not a playable public destination.

## Local development

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

## Architecture overview

- Vite + React + TypeScript frontend.
- Deterministic game logic in `src/game/systems/gameLoop.ts`.
- Renderer-independent axial terrain generation in `src/game/map/` with a direct Three.js realm surface in `src/components/realm/`.
- Models in `src/game/models/types.ts`.
- Mock Farcaster identity in `src/farcaster/farcasterAuth.ts`.
- Mock nearby castles in `src/game/mockData/mockCastle.ts`.
- SpacetimeDB schema/reducer direction in `src/spacetime/schemaDraft.ts` and `docs/spacetime-db-plan.md`.
- AI court report interface in `src/ai/courtReport.ts`.

## Design Principles

1. Every FID has a castle.
2. Deterministic mechanics first, AI flavor second.
3. Server-authoritative multiplayer state.
4. Desktop-first strategic experience.
5. Farcaster-native identity and social graph.
6. No fragile on-chain execution.
7. No pay-to-win foundation.
8. Small seed now, expandable world later.

## What is implemented now

- Current Three.js title-screen experiment with unified custom brutalist glyph outlines, refined load-bearing W and K silhouettes, deeply extruded premium ivory concrete, optical wordmark spacing, pointer-responsive physical lighting, and a large slowly rotating and gradually growing five-arm galaxy. Its integrated eye-lens gateway layers sharp reflective violet ribbons, filamentary energy, GPU residue, local galaxy/star distortion, adaptive quality, reduced-motion handling, a lightweight matching fallback, and controlled activation choreography.
- Reducer-driven title → menu → title flow with a gateway-origin warp veil, Three.js camera pull, five-second entry hint, global Enter/Space shortcuts, history/hash support, focus restoration, and a short reduced-motion path.
- Hegemony main-menu prototype with live HTML/CSS typography and commands over a responsive clean 1080p no-audio castle film, color-matched poster fallback, one stable crossfading audio director, a measured OST loop overlap, unique anchored notices, and keyboard/touch behavior.
- Public menu destinations are presentation-only; they do not expose gameplay or the local mocked dashboard.
- Local development scaffold includes a castle dashboard with player identity, buildings, resources, queues, nearby castles, court report, and activity log.
- Deterministic resource collection, upgrade queue, training queue, and scouting report functions.
- Vitest tests for the core game loop.
- Product and architecture docs for Farcaster, SpacetimeDB, game design, and future agents.

## What is intentionally not implemented yet

- Real Farcaster auth.
- Real SpacetimeDB module or hosted multiplayer backend.
- Combat or raid resolution.
- Token mechanics.
- Production art pipeline.
- AI-generated state changes.

## Design references

- Official faction logos and metadata are archived under `docs/reference/factions/`.
- Castle reference art is archived under `docs/reference/castles/` for future visual direction.
- The Hegemony main-menu source archive and runtime-media provenance are recorded under [`docs/reference/menu/2026-07-10/`](docs/reference/menu/2026-07-10/).

## SpacetimeDB direction

SpacetimeDB should become the authoritative multiplayer/game-state backend for players, FIDs, castles, resources, buildings, queues, units, scouting, raids, alliances, seasons, world events, diplomacy, and activity logs.

Read `docs/spacetime-db-plan.md` before implementing multiplayer.

## Farcaster direction

Farcaster Sign In should become the primary identity path. Each FID gets one castle. Handles are display names only. Farcaster social graph and casts can later power nearby castles, alliances, invitations, diplomacy, public battle reports, recruitment posts, and season recaps.

Read `docs/farcaster-integration.md` before implementing auth.

## Future roadmap

- Replace placeholder auth with Sign In With Farcaster.
- Implement SpacetimeDB module tables and reducers.
- Add generated TypeScript client bindings.
- Move timers and resource calculations server-side.
- Add alliance and diplomacy systems.
- Design combat before implementing raids.
- Add seasons and reset mechanics.
- Add AI court reports, battle reports, lore, and shareable Farcaster cards as read-only flavor layers.

## Viewing the prototype

Run `npm run dev` and open the local Vite URL. The normal route opens the title; `#menu` opens the media-resilient menu directly for development and accessibility testing.

## License

Warpkeep is licensed for maximum reuse freedom:

- Software code: Zero-Clause BSD (`0BSD`). See [`LICENSE`](LICENSE).
- Documentation, lore, manifests, and project-owned media/reference assets: CC0 1.0 Universal unless a file says otherwise. See [`LICENSE-CC0`](LICENSE-CC0) and [`ASSETS-LICENSE.md`](ASSETS-LICENSE.md).

These licenses allow broad copying, modification, redistribution, private use, commercial use, forks, mods, alternate clients, and community realms. They do not grant trademark rights or imply endorsement by the official Warpkeep project.
