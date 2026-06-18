# Technical Architecture

## Stack

- Frontend: Vite, React, TypeScript.
- Styling: plain CSS with desktop-first responsive layouts.
- Tests: Vitest for deterministic game logic.
- Auth: Farcaster Sign In placeholder in `src/farcaster`.
- Game logic: pure TypeScript reducers in `src/game/systems`.
- Multiplayer direction: SpacetimeDB schema/reducer draft in `src/spacetime` and `docs/spacetime-db-plan.md`.
- AI direction: typed flavor interface in `src/ai`.

## Folder map

```txt
/src
  /ai              future AI flavor interfaces
  /components      React UI panels
  /farcaster       Farcaster identity placeholder
  /game
    /constants     resource/unit/building constants
    /mockData      mocked nearby castles and seed player
    /models        TypeScript state model
    /systems       deterministic reducers and game loop functions
  /spacetime       schema and reducer name scaffold
  /styles          global visual system
/tests             game logic tests
/docs              product and architecture docs
```

## State rule

Frontend state is temporary. SpacetimeDB should become the authoritative source for multiplayer/game state. The frontend should send intents such as `start_building_upgrade` or `scout_castle`; it should not decide final resource totals or timer completion in production.

## Determinism rule

Game correctness must stay in deterministic code. AI-generated content may summarize, decorate, or recommend, but it must not mutate authoritative state directly.
