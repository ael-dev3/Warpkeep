# Warpcastle

**Every FID has a castle.**

Warpcastle is a Farcaster-native asynchronous strategy game seed where every Farcaster FID maps to a persistent castle profile. It is inspired by old-school asynchronous strategy loops like building, training, scouting, raiding, alliances, and seasonal realm politics, but it is designed as an original Farcaster-native game foundation.

Current status: **initial seed / scaffold**. The UI works locally with mocked Farcaster identity and local deterministic state. SpacetimeDB and real Farcaster auth are planned, not complete.

## Concept

A Farcaster-native strategy game where your FID becomes a kingdom.

The first experience:

1. Landing page introduces Warpcastle.
2. User signs in with Farcaster, currently a placeholder button.
3. User sees their own castle dashboard.
4. The FID maps to a deterministic castle profile.
5. The player can collect resources, start upgrades, train scouts, and scout nearby mocked castles.

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

- Landing page with tagline and loop explanation.
- Placeholder Farcaster sign-in flow.
- Castle dashboard with player identity, buildings, resources, queues, nearby castles, court report, and activity log.
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

## Screenshots

No screenshots are committed yet. Run `npm run dev` and open the local Vite URL to view the current seed UI.
