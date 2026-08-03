# Warpkeep roadmap

Warpkeep is building a persistent strategy world one playable loop at a time.
Dates and feature order may change as the Alpha is tested.

## Live now — Alpha 0.3.17

- Farcaster-gated entry to the persistent Genesis 001 realm
- 10,000 world cells and 100 permanent castle sites near the founding district
- a persistent coastline and twelve one-cell rivers through the Lowlands
- one durable castle for each founded player
- public castle, username, and portrait presentation, including gathering
  portraits at occupied resource sites
- private Food, Wood, and Stone terrain yield, plus server-owned Gold balances
- shared Gold Mine, Wheat Farm, Logging Camp, and Stone Quarry sites with one
  private, server-governed expedition per resource type
- denser biome-shaped forests, clustered outer groves, biome-driven grass, a
  natural ocean-to-fog horizon, and responsive mobile presentation
- unified, camera-neutral gathering records with authoritative time-left labels
  and automatic server-owned settlement
- separate private Community Marks accounting with no spending, transfer,
  conversion, redemption, or reward loop

The core strategy loop is not playable yet. The current Alpha is a working
world foundation and visual representation of what is being built.

## Now building

The next useful slice gives gathered resources a small, understandable purpose
inside each player's own castle:

1. enter a twelve-slot Inner Keep compound without leaving the Realm session;
2. spend stored resources on one of four server-priced economy buildings;
3. let one internal Builder complete construction while the player is away;
4. keep the completed level visible and use its matching resource discount;
5. test whether that loop is enjoyable before adding breadth.

This work is prepared behind an inactive component gate. A merge to protected
`main` triggers the existing verified Pages deployment of the compatible,
dormant client. It does not publish the schema, seed the catalog, backfill
Builders, authorize archive assets, activate construction, or make the loop
playable. Units and other map systems remain design work until they are
intentionally released.

The exact inactive V1 policy and release gates are documented in
[Inner Keep construction V1](inner-keep-construction.md).

## After the Inner Keep loop

- more construction choices and deliberately bounded queue options;
- unit training, scouting, travel, and map visibility;
- defenses, raids, and bounded combat;
- alliances, diplomacy, trading, chat, and seasons;
- community governance and world history where they improve the game.

## Product guardrails

- Do not describe a feature as playable before it is live.
- Keep identity, ownership, resources, timers, and outcomes server-owned.
- Keep private balances and administrative records out of public subscriptions.
- Use Farcaster for identity and social presentation, not pay-to-win power.
- Do not present Marks or Alpha participation as money, an airdrop, or a
  guaranteed reward.
- Prefer small, durable, enjoyable systems over a wide unfinished simulation.
