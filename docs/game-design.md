# Game design direction

## Planned core loop

Build → Train → Scout → Raid → Ally → Rule.

Alpha 0.3.0 provides the identity, world, keep, renderer, and server-authority foundation. Resources, construction, units, scouting, raids, alliances, and seasons below are planned systems, not current player-facing claims.

## Resources and buildings

- **Grain:** food economy and unit upkeep, primarily from Farms.
- **Stone:** construction and fortification, primarily from Quarries.
- **Iron:** military logistics and later Mines.
- **Influence:** slow realm authority and social coordination, never purchased identity.

The initial building vocabulary is Keep, Farm, Quarry, Barracks, and Watchtower. Server reducers must own costs, queue capacity, start/end times, completion, and cancellation semantics.

## Units and scouting

The first useful roles are Scout, Guard, and Raider. Scouting should create bounded, time-limited information; a social relationship must not become an authentication or combat advantage by itself.

## Combat requirements

Combat must not begin as an opaque random formula. Its design must specify deterministic travel, roles, defenses, scouting accuracy, casualties, loot caps, new-player protection, anti-griefing, reports, and season boundaries before implementation.

All actions are intents. SpacetimeDB validates identity, admission, ownership, costs, timers, and outcomes transactionally. AI may narrate the result only after authoritative resolution.
