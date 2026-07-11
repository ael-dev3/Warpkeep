# Technical Architecture

## Stack

- Frontend: Vite, React, TypeScript.
- Styling: plain CSS with desktop-first responsive layouts.
- Tests: Vitest for deterministic game logic.
- Auth: standard web SIWF client, a trusted Farcaster-to-OIDC bridge, and a proof-free browser presentation state in `src/farcaster`.
- Game logic: pure TypeScript reducers in `src/game/systems`.
- Multiplayer alpha: generated SpacetimeDB client bindings in `src/spacetime`, a server module in `spacetimedb/`, and the private-FID admission design in `docs/spacetime-db-plan.md`.
- AI direction: typed flavor interface in `src/ai`.

## Folder map

```txt
/src
  /ai              future AI flavor interfaces
  /components      React UI panels
  /farcaster       SIWF request, verification, and ephemeral identity state
  /game
    /constants     resource/unit/building constants
    /mockData      mocked nearby castles and seed player
    /models        TypeScript state model
    /systems       deterministic reducers and game loop functions
  /spacetime       authenticated connection provider and generated bindings
  /styles          global visual system
/tests             game logic tests
/docs              product and architecture docs
```

## State rule

Frontend state is temporary. The closed-alpha SpacetimeDB module already owns admitted player/castle/world authority; future gameplay reducers will own resources and timers as well. The frontend sends intents and never decides final resource totals, keep ownership, or timer completion.

## Determinism rule

Game correctness must stay in deterministic code. AI-generated content may summarize, decorate, or recommend, but it must not mutate authoritative state directly.
