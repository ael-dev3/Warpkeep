# Agent Notes

## Summary of changes

This pass created the initial Warpcastle seed repository:

- Vite + React + TypeScript app scaffold.
- Landing page and castle dashboard UI.
- Deterministic game models and reducers.
- Mock Farcaster identity and nearby FID castles.
- AI court report placeholder interface.
- SpacetimeDB schema/reducer scaffold.
- Vitest coverage for the starter game loop.
- Product, architecture, Farcaster, SpacetimeDB, and future-agent docs.

## Current project status

Warpcastle is an initial playable scaffold, not a production game. It communicates the core direction: every FID has a castle, local state is temporary, SpacetimeDB should become authoritative, and AI should add flavor without mutating game state.

## Known limitations

- Farcaster auth is a placeholder.
- SpacetimeDB is documented/scaffolded but not installed or integrated.
- State resets on refresh.
- Building/training queues are started but not wired to live timer completion in the UI.
- Combat, raids, alliances, seasons, and diplomacy are not implemented.
- Visuals are original CSS placeholders, not final art.

## Next recommended tasks

1. Add real Sign In With Farcaster and persist FID identity.
2. Create the real SpacetimeDB module from `docs/spacetime-db-plan.md`.
3. Replace local React state with a repository abstraction that can switch from mocks to SpacetimeDB subscriptions.
4. Add queue completion UI and server-authoritative timer tests.
5. Add more tests for costs, queue limits, invalid actions, and completion reducers.
6. Design combat in a doc before adding raids.
7. Add browser smoke tests once routes stabilize.

## Warnings for future agents

- Do not turn Warpcastle into a DeFi dashboard or on-chain execution bot.
- Do not implement token mechanics in the core loop yet.
- Do not let AI mutate authoritative state.
- Do not add random combat formulas without a proper design doc and tests.
- Do not treat handles as stable identity. FID is the stable key.
- Keep game logic deterministic and covered by tests.

## Where SpacetimeDB should be integrated next

Start with `docs/spacetime-db-plan.md` and `src/spacetime/schemaDraft.ts`. The first real module should implement Player, Castle, ResourceState, Building, ConstructionQueue, UnitStack, TrainingQueue, ActivityLog, and the reducers for collect/resources/upgrades/training/scouting.

## Where Farcaster auth should be integrated next

Start with `src/farcaster/farcasterAuth.ts`. Replace `placeholderFarcasterSession` with a Sign In With Farcaster flow and pass the authenticated FID into `createCastleForFid` or the SpacetimeDB player bootstrap reducer.

## Most important files to read first

1. `README.md`
2. `docs/vision.md`
3. `docs/spacetime-db-plan.md`
4. `src/game/models/types.ts`
5. `src/game/systems/gameLoop.ts`
6. `src/farcaster/farcasterAuth.ts`
7. `src/ai/courtReport.ts`
