# Warpkeep Direction Notes

## One-line vision

Warpkeep is a Farcaster-native strategy game where each player's Farcaster identity can become a keep, realm, or castle inside a persistent social world.

The game should feel like a blend of:

- asynchronous kingdom management,
- lightweight 4X strategy,
- Farcaster-native social identity,
- public reputation,
- seasonal campaigns,
- AI/faction conflict,
- open-source moddability,
- and player-driven social stories.

It should not start as a full Civilization clone, a full Rise of Kingdoms clone, or a giant MMO. The first version should be small, legible, and playable.

## Core thesis

The strongest idea is not "browser Civ."

The stronger thesis is:

> Farcaster itself can be the map.

A player's FID, social graph, channels, casts, alliances, reputation, and public activity can become the foundation for a kingdom game.

Instead of starting with a huge world map, Warpkeep should start with:

- one player identity,
- one keep,
- simple resource generation,
- buildings,
- units,
- scouting,
- AI enemies,
- public reports,
- and seasonal progression.

The game should be playable even when only a small number of people are active.

## Product identity

Warpkeep should feel like a Farcaster-native kingdom layer.

A player opens the game and should immediately understand:

- their FID can have a keep,
- their keep can grow over time,
- their actions create public history,
- their faction matters,
- the world has seasonal pressure,
- and their reputation can become part of the game.

The first version should produce simple but satisfying moments:

- claim a keep,
- upgrade a building,
- train units,
- fight the Core,
- get a report,
- improve seasonal rank,
- share progress on Farcaster.

The game should prioritize social legibility over simulation size.

## Design inspiration

Warpkeep can borrow useful patterns from classic 4X games, mobile strategy games, and sci-fi/fantasy faction fiction, but it should not copy any source literally.

Useful inspirations:

- Civilization-style empire loops: explore, grow, produce, research, fight, expand.
- Rise of Kingdoms-style pacing: timers, asynchronous actions, alliances, seasons, events.
- Farcaster-native social apps: public identity, social graph, casts, mini apps, channel culture.
- Hyperion-inspired faction themes: hegemony, outer human cultures, machine intelligence, network civilization.
- Broader sci-fi/fantasy strategy themes: order versus frontier autonomy versus artificial intelligence.

The implementation target should begin closer to a "Civ 1 skeleton" than a "Civ 4 simulation."

Start with the smallest complete loop:

> resources -> buildings -> units -> scouting/combat -> progression -> public report

Add complexity only after the basic loop is fun.

## Why not start with a full 4X map

A traditional 4X map creates a large implementation burden:

- map generation,
- pathfinding,
- fog of war,
- borders,
- city placement,
- terrain yields,
- diplomacy,
- combat,
- AI,
- turns,
- balance,
- and long-session expectations.

Warpkeep should not begin there.

The more distinctive starting point is:

> Farcaster identity as geography.

Early "nearby" entities can be based on:

- social graph,
- mutual follows,
- channel membership,
- casts,
- faction membership,
- recent activity,
- seasonal matchmaking,
- or Core event targeting.

A physical map can come later. The first "map" can be social.

## Initial faction direction

The first public version should probably start with one playable human faction and one AI enemy faction.

Recommended Season 1 structure:

Playable faction:

- Hegemony of Man, or simply The Hegemony

Initial enemy:

- The Core

The Hegemony represents order, legitimacy, hierarchy, coordinated defense, and a safer player experience.

The Core represents machine intelligence, hostile infrastructure, automated pressure, AI enemies, world events, and PvE conflict.

This lets the first version focus on PvE instead of complicated player-versus-player politics.

## Why start with Hegemony versus Core

Starting with only Hegemony versus Core avoids early over-scoping.

It allows the game to launch with:

- one player onboarding path,
- one clear enemy,
- one main faction identity,
- simple balance,
- no same-faction griefing,
- and no need for a large player base before the game feels alive.

The Core gives players something to fight even when the population is small.

This is important because a social strategy game must feel alive with:

- 1 player,
- 10 players,
- 100 players,
- and more.

PvE pressure can carry the early game until enough humans exist for deeper faction politics.

## Future second human faction: Ousters

A later playable human faction should be the Ousters.

The Ousters should stay closer to the Hyperion-inspired reference point than a generic renamed frontier faction. The faction name "Ousters" and the core outer-human faction feel are intentionally part of the current thematic direction.

Faction identity:

- outer human culture,
- frontier autonomy,
- adaptation,
- self-governance,
- suspicion of centralized authority,
- stronger tolerance for risk,
- looser social order,
- more emergent politics.

The Ousters should feel like a real alternative to the Hegemony, not merely a "rebels" skin.

They are not anti-human. They are a different human answer to the same network civilization problem.

The Hegemony says:

> order protects humanity.

The Ousters say:

> freedom and adaptation preserve humanity.

Warpkeep should keep the Ousters close enough to the intended reference point to preserve their faction identity, while still developing the faction into original Warpkeep worldbuilding over time.

## Possible faction contrast

The Hegemony:

- order,
- safety,
- hierarchy,
- no same-faction attacks,
- stronger shared defense,
- predictable rules,
- lower social risk,
- legitimacy and central coordination,
- official infrastructure,
- regulated economy.

The Ousters:

- freedom,
- adaptation,
- frontier autonomy,
- internal conflict possible,
- social accountability,
- public reputation consequences,
- stronger scouting or raiding,
- higher variance,
- more emergent politics,
- informal markets,
- player-to-player trust.

The Core:

- AI faction,
- PvE enemy,
- event generator,
- oracle-like system,
- neutral/hostile machine pressure,
- anti-snowball balancing tool,
- source of quests, incursions, and world events,
- possible source of scarcity and disruption.

## Same-faction conflict concept

A possible future mechanic:

Hegemony players cannot attack other Hegemony players. This is not merely a rule; it expresses the faction fantasy. The Hegemony provides order and internal security.

Ousters may be allowed to attack members of their own faction, but those actions should be visible and socially meaningful.

This creates an unwritten social contract:

- Ousters have freedom,
- betrayal is possible,
- aggression is visible,
- reputation matters,
- and the faction can collectively punish bad actors.

This mechanic should not be added too early. It is promising, but it requires enough active players to matter and enough safeguards to prevent griefing.

If implemented, Ouster same-faction attacks should have:

- clear logs,
- public reports,
- reputation effects,
- possible exile/ouster mechanics,
- cooldowns or limits,
- faction-level retaliation tools,
- and strong anti-abuse rules.

The important distinction:

> Hegemony order is enforced by system rules.
>
> Ouster order is enforced by social consequences.

That distinction should become one of the game's clearest faction choices.

## Public reputation as gameplay

Because Warpkeep is Farcaster-native, reputation should matter.

A raid, defense, betrayal, alliance, rescue, or victory can become a public social event.

Potential public outputs:

- battle reports,
- scouting reports,
- season summaries,
- alliance announcements,
- Core incursion alerts,
- faction leaderboards,
- heroic defense records,
- betrayal/exile records,
- Ouster retaliation records,
- Hegemony defense campaigns,
- faction propaganda,
- seasonal recaps.

These should be shareable as Farcaster-native objects or mini-app views.

The goal is not just to simulate combat. The goal is to create stories people want to share.

## Open-source direction

Warpkeep should be built publicly and fully open source.

The repo should be welcoming to Farcaster builders who want to:

- fork the game,
- add modules,
- create factions,
- build alternate clients,
- run alternate seasons,
- create bots,
- improve UI,
- add lore,
- build analytics,
- or experiment with different rules.

However, the project still needs a clear distinction between official canon and community forks.

Recommended structure:

- **Warpkeep Core:** open-source engine, rules, database schema, client, and documentation.
- **Official Season:** the project maintainer's canonical campaign.
- **Community Realms:** forks, alternate deployments, mods, experiments, and faction variants.

Anyone should be able to fork the code, but the official deployment should remain clearly identifiable.

## License notes

Current licensing policy from v0.3.0:

- Software code: Apache License 2.0.
- New or modified confirmed project-owned docs, lore, manifests, and creative media: CC BY 4.0.
- Historical 0BSD/CC0 grants and external or unresolved terms remain valid; see [`LICENSING.md`](../../LICENSING.md) and [`ASSETS-LICENSE.md`](../../ASSETS-LICENSE.md).
- Project name, official marks, and canonical deployment identity: not granted as endorsement or trademark rights.

The goal remains broad reuse: forks, mods, alternate clients, community realms, commercial experiments, and remixing should be straightforward while attribution and third-party terms are respected.

The only retained boundary is user clarity. Community forks should not imply they are the canonical Warpkeep deployment unless explicitly authorized.

## MVP scope

The first playable version should be brutally small.

Recommended MVP:

- Farcaster/FID-based player identity.
- Create or claim a keep.
- Basic resource generation.
- A few building upgrades.
- A few unit types.
- Training queues.
- Core enemy targets.
- PvE attacks against Core nodes.
- Basic defense or Core counter-pressure.
- Activity log.
- Public battle/scouting reports.
- Simple leaderboard.
- Season 1 framing.

Avoid in MVP:

- full world map,
- complex pathfinding,
- multiple human factions,
- unrestricted PvP,
- deep tech trees,
- large alliance warfare,
- full economy simulation,
- player-to-player trading,
- and monetization-first design.

The MVP should answer:

> Is it fun to open Warpkeep, see your keep, make a meaningful choice, and get a story or status update worth sharing?

## Suggested first season

Working title:

> Hegemony Genesis Season

Premise:

Players join the Hegemony, claim their keep, build up their realm, and fight back against Core incursions.

Core loop:

1. Claim keep.
2. Generate resources.
3. Upgrade buildings.
4. Train units.
5. Attack Core nodes.
6. Receive battle reports.
7. Climb seasonal contribution rankings.
8. Share progress on Farcaster.

The first season should create a clean identity:

> Join the Hegemony. Build your keep. Defend humanity from the Core.

## Suggested later season

Working title:

> Ouster Contact Season

Premise:

The Ousters appear as a second human faction after the Hegemony/Core loop is already playable.

The season should introduce:

- faction choice,
- Ouster keeps,
- Ouster scouting bonuses,
- Ouster autonomy mechanics,
- public faction conflict,
- limited PvP,
- and possibly Ouster same-faction aggression with social consequences.

Do not introduce the Ousters until the game has enough active players and enough systems to make the faction choice meaningful.

## Data model direction

The backend should remain authoritative. Clients should not be trusted with game-critical calculations.

Useful early entities:

- players
- keeps
- factions
- resources
- buildings
- building_queues
- units
- training_queues
- core_nodes
- attacks
- battle_reports
- activity_log
- seasons
- leaderboard_entries

Possible later entities:

- alliances
- diplomacy
- scouting_reports
- reputation_events
- exiles
- outposts
- land_parcels
- research
- faction_laws
- community_realms
- modules
- ouster_conflict_logs
- hegemony_campaigns
- faction_markets
- player_trade_offers
- trade_logs
- resource_sink_rules

## Technical principles

Keep the simulation deterministic where possible.

Use server-side validation for:

- resource production,
- timers,
- combat resolution,
- building upgrades,
- unit training,
- rewards,
- season scoring,
- trade limits,
- and economy caps.

The client should be a good interface, not the source of truth.

Prefer simple, testable rules over complex hidden formulas.

Every mechanic should be easy to inspect in the public repo.

## Balance principles

Early balance should favor clarity over depth.

Good first resources:

- food
- wood
- stone
- iron
- influence or command

Good first buildings:

- Keep
- Farm
- Quarry
- Barracks
- Watchtower
- Workshop

Good first units:

- Scout
- Guard
- Raider
- Siege unit or Engineer

Good first PvE targets:

- Core Probe
- Core Relay
- Core Bastion
- Core Citadel

Combat should initially be simple enough to explain in a few lines.

Avoid complicated rock-paper-scissors until the core loop is proven.

Balance the game around strategic clarity, earned progression, and rules that remain fair without external value inputs.

## Long-term strategy layer

After the MVP works, add depth gradually:

### Phase 1

- Hegemony versus Core PvE.
- Basic keeps and upgrades.
- Public reports.
- Leaderboards.

### Phase 2

- Scouting.
- More Core events.
- Better battle reports.
- First alliance-like coordination.

### Phase 3

- Ousters as second human faction.
- Social reputation.
- Controlled PvP.
- Faction contrast.
- Public faction conflict.

### Phase 4

- Seasons with different rules.
- Community realms.
- Modding hooks.
- More advanced strategy systems.
- Ouster self-governance mechanics.

### Phase 5

- Deeper 4X mechanics:
  - research/doctrines,
  - land parcels,
  - outposts,
  - faction laws,
  - diplomacy,
  - alliance wars,
  - special seasonal objectives.

## Important product warning

Do not try to build a full Civ/RoK-style MMO immediately.

That is too large for the first version and will likely bury the strongest idea.

The strongest idea is not the size of the map. It is the connection between:

- Farcaster identity,
- a personal keep,
- public social gameplay,
- and faction mythology.

Keep the first version small enough to finish. Strategy, social play, and the world itself must remain the hook.

## Community contribution model

The repo should invite contributions without requiring contributors to understand a giant game design document.

Add contributor-friendly docs:

- how to run locally,
- how the game loop works,
- how to add a building,
- how to add a unit,
- how to add a Core enemy type,
- how to add a season rule,
- how to add a faction later,
- how to write tests for a mechanic,
- how to propose an experimental module.

Prefer modular data-driven definitions where possible.

Example:

> Buildings, unit stats, Core nodes, and season settings should be easy to modify without rewriting the whole app.

Later trade systems should remain optional, server-authoritative modules rather than becoming coupled to the core MVP.

## AI and generated content

AI-generated flavor can be useful, but it should not control game-critical state.

Good uses:

- court reports,
- battle narration,
- seasonal summaries,
- faction propaganda,
- lore snippets,
- onboarding flavor.

Bad uses:

- deciding who won a battle,
- awarding resources without deterministic rules,
- changing balances unpredictably,
- inventing hidden state,
- generating trade outcomes without validation.

The game should be deterministic first, flavorful second.

## Public lore direction

The lore should feel like sci-fi/fantasy social strategy with a clear Farcaster-native identity.

Useful themes:

- centralized order,
- frontier autonomy,
- machine intelligence,
- public reputation,
- alliances,
- betrayal,
- seasons,
- keeps,
- casts,
- network civilization,
- social graph as geography,
- official markets versus informal economies.

The current faction direction intentionally includes Hyperion-inspired language and themes, especially:

- Hegemony of Man,
- Ousters,
- Core-like machine intelligence.

However, Warpkeep should still become its own game world over time.

Avoid importing too many exact names, places, objects, or plot structures from any single existing IP.

A small amount of homage or community-native reference is acceptable. The goal is to develop a distinct Farcaster-native strategy setting.

## Naming guidance

Current project name:

> Warpkeep

The name works because:

- "Warp" suggests network travel, space-time, portals, protocol magic, and sci-fi.
- "Keep" suggests castles, realms, defense, and medieval strategy.

The name supports the intended blend:

> sci-fi network civilization + fantasy castle strategy.

Use consistent capitalization:

> Warpkeep

Avoid alternating between Warp Keep, WarpKeep, and Warpkeep unless there is a specific branding decision.

Faction naming direction:

- Hegemony of Man or The Hegemony for the initial playable faction.
- The Core for the AI faction.
- Ousters for the later second human faction.

## Success criteria

A successful early Warpkeep is not one with hundreds of mechanics.

A successful early Warpkeep is one where a player can say:

- I claimed my keep.
- I upgraded something.
- I trained units.
- I fought the Core.
- I got a cool report.
- My FID has visible game history.
- I want to check back later.
- I might share this on Farcaster.

If that loop works, the project can expand.

A successful later Warpkeep is one where players can also say:

- I chose a faction because its philosophy fit my play style.
- Hegemony felt ordered and safe.
- Ousters felt free and risky.
- The Core created pressure.
- Player reputation mattered.
- The economy felt faction-specific.
- The public stories were worth following.
