# Future Agent Roadmap

Future GPT-5.6, Fable-grade, or stronger agentic systems should expand Warpkeep by deepening systems without breaking the seed's rules.

## Good future agent tasks

- Generate original castle art and realm banners.
- Generate faction lore and regional histories.
- Create court advisors with consistent personalities.
- Generate daily kingdom reports from deterministic state snapshots.
- Generate battle reports after deterministic raid resolution.
- Generate seasonal chronicles.
- Create quests and world events that reducers validate.
- Help balance formulas with simulation tests.
- Write integration and browser tests.
- Simulate player economies and anti-griefing rules.
- Generate shareable Farcaster social cards.

## Hard boundary

AI must not be trusted with authoritative game state. AI should produce flavor, UI copy, lore, summaries, quests, recommendations, and simulations. Game actions must be validated by deterministic code and SpacetimeDB reducers.

## Recommended expansion sequence

1. Move browser-only SIWF verification behind a trusted backend-issued session with replay protection.
2. Build the SpacetimeDB module and generated TS bindings.
3. Add server-authoritative timers and queue completion.
4. Add map/nearby subscriptions.
5. Add alliances and diplomacy.
6. Design combat carefully before implementing raids.
7. Add seasonal rules and chronicles.
8. Add AI court reports from read-only state snapshots.
