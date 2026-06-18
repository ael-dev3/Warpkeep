# Game Design Seed

## Core loop

Build → Train → Scout → Raid → Ally → Rule.

The current seed implements only the safe first slice:

- collect resources
- start building upgrades
- train units
- scout nearby castles
- read activity and court flavor

Raids, defense, alliances, seasons, diplomacy, and world events are documented as future systems.

## Resources

The first resources are off-chain game resources:

- Grain: produced by Farm, spent on construction and units.
- Stone: produced by Quarry, spent on buildings.
- Iron: recovered through early watchtower/military logistics until Mine exists.
- Influence: produced slowly from Keep authority and later Farcaster activity.

No token price or real-money dependency exists in this seed.

## Buildings

- Keep: seat of the realm, queue capacity, unlocks.
- Farm: grain production.
- Quarry: stone production.
- Barracks: unit training.
- Watchtower: scouting and future defense.

## Units

- Scout: discovers nearby castles and future raid intel.
- Guard: defensive baseline.
- Raider: future offensive unit, present as a placeholder stack only.

## Combat future direction

Combat should not be added as a quick random formula. A future combat design should define:

- attacker and defender unit roles
- travel timers
- watchtower and wall effects
- scouting accuracy
- casualty formulas
- raid loot caps
- protection for new castles
- season reset rules
- anti-griefing constraints

All combat resolution must be deterministic and server-authoritative.
