# SpacetimeDB Plan

SpacetimeDB is a strong fit for Warpcastle because the game needs server-authoritative multiplayer state, real-time subscriptions, deterministic reducers, and low-friction client updates for many small asynchronous timers.

## State that should be server-authoritative

SpacetimeDB should eventually own:

- players
- FIDs
- castles
- buildings
- resources
- construction queues
- unit queues
- armies
- scouting reports
- raids
- alliances
- seasons
- world events
- chat and diplomacy events
- activity logs

The web client should treat SpacetimeDB as the source of truth. The current local state is a seed scaffold only.

## Entity draft

```txt
Player(id, fid, handle, created_at, last_seen_at)
Castle(id, player_id, name, level, region, x, y, created_at)
ResourceState(castle_id, grain, stone, iron, influence, updated_at)
Building(id, castle_id, building_type, level)
ConstructionQueue(id, castle_id, building_type, target_level, started_at, completes_at)
UnitStack(id, castle_id, unit_type, quantity)
TrainingQueue(id, castle_id, unit_type, quantity, started_at, completes_at)
ActivityLog(id, castle_id, event_type, message, created_at)
ScoutReport(id, source_castle_id, target_castle_id, risk, summary, created_at)
Alliance(id, name, founder_player_id, created_at)
Season(id, name, starts_at, ends_at, ruleset_version)
WorldEvent(id, season_id, event_type, payload, starts_at, ends_at)
```

NearbyCastle and map positions can be derived from Castle coordinates, Farcaster graph affinity, or season region assignment.

## Reducers to validate actions

- `collect_resources`: calculates production from elapsed server time and building levels.
- `start_building_upgrade`: validates resource cost, queue capacity, target level, and prerequisites.
- `complete_building_upgrade`: completes only when server time reaches `completes_at`.
- `start_unit_training`: validates barracks, resource cost, unit unlock, and queue rules.
- `complete_unit_training`: creates or increments UnitStack only after `completes_at`.
- `scout_castle`: validates range, scout availability, cooldowns, and report visibility.
- `create_alliance`: validates influence cost, name policy, and season limits.
- `join_alliance`: validates invitation or open policy.
- `declare_raid`: validates travel time, army availability, target protection, and cooldowns.
- `resolve_raid`: deterministic combat and loot resolution.

## Real-time subscriptions

Clients should subscribe to:

- their own Player, Castle, ResourceState, Building, queues, UnitStack, ActivityLog
- nearby castles by region/range/social graph
- alliance events for joined alliances
- public season events
- specific scouting/raid reports relevant to the player

## Anti-cheat model

- Timers are calculated from server timestamps, never client clocks.
- Resource production is derived on the server from last collection/update time.
- Costs and prerequisites live in reducer code, not UI code.
- Clients submit intents; reducers accept or reject.
- Activity logs are reducer outputs, not client-authored proof.

## Seasons and resets

Seasons should be separate rows with a ruleset version. Castle progress can reset, partially carry over, or mint cosmetic chronicles depending on season policy. Keep permanent identity and social memories separate from seasonal military economy.

## AI safety boundary

AI may generate court flavor, lore, daily summaries, battle prose, and quest copy. AI must not directly update Player, Castle, ResourceState, Queue, Raid, or Alliance tables. If AI proposes a quest or event, deterministic reducers must validate and materialize it.

## Next implementation steps

1. Install SpacetimeDB CLI and choose Rust or C# module language.
2. Translate the entity draft into actual SpacetimeDB tables.
3. Port TypeScript reducer formulas into server reducers.
4. Generate TypeScript client bindings.
5. Replace local mock state with subscriptions and reducer calls behind a repository interface.
6. Add integration tests that compare TypeScript preview logic with server reducer outputs.
