# Warpkeep roadmap

## Current public release — Alpha 0.3.6

Warpkeep is a Pages-only, admission-gated Genesis 001 preview. Players can view
and navigate the shared Lowlands, inspect founded castles, and use the compact
realm presentation. Alpha 0.3.6 improves castle and landscape-base readability,
terrain support, direct foundation identity rails, map input and overview,
hardware-aware graphics selection, and the compact player portrait. It leaves
shared-world authority unchanged.

Public admission, resources, upgrades, units, combat, alliances, chat, seasons,
wallet actions, and Marks crediting or spending are not live.

## Undeployed candidate — Alpha 0.3.11 resources, world capacity, Gold/Food/Wood expeditions, and forests

The checked-in 0.3.11 candidate carries the bounded resource authority prepared
in 0.3.7, expands persistent map capacity, and adds a deliberately bounded
resource-node expedition layer:

1. One private, caller-scoped Food, Wood, Stone, and Gold account belongs to
   each founded castle.
2. Complete ten-minute server-time quanta and authoritative terrain determine
   bounded Food, Wood, and Stone yield; collection accepts no player-supplied
   authority inputs.
3. A reviewable 24-site Tier-I Gold Mine pilot uses only passable,
   resource-capable Genesis anchors from the 10,000-cell candidate. One server-authorized wagon per
   castle follows a server-derived route, gathers one Gold per completed minute
   for 30 days, then returns; passive terrain Gold is zero.
4. Public subscriptions expose a site and its occupied timeline only. Private
   caller projections hold expedition ownership, idempotency, accrual, and
   balances, so a peer cannot see or manipulate another player's Gold.
5. The browser presents only the caller's exact projection and applies no
   optimistic credits. Peer balances remain outside public subscriptions.
6. Community Marks remains separate, private, and unchanged.
7. Immutable icons, reviewed Gold Mine/Wheat Farm/Logging Camp/wagon LOD
   families, generated bindings, a disposable additive-migration fixture,
   guarded founder backfill, and aggregate resource-and-node inspection prepare
   the release boundary.
8. Genesis 001 expands from its exact 1,261-cell generation-two predecessor to
   exactly 10,000 persistent cells while preserving every existing cell, all
   100 permanent castle slots, and all founder state.
9. Two thousand cells are classified as resource-capable placement anchors. A
   separate digest-pinned policy selects 24 Gold Mines; capacity metadata alone
   neither creates a node nor adds a yield source.
10. A public, server-seeded visual forest layout uses integrity-pinned tree LOD
    assets to make the preserved Genesis founding Lowlands feel natural. All
    players receive the same fixed instances; graphics quality changes only
    LOD. It does not rewrite canonical terrain, passability, resource economics,
    Gold placement, ownership, or gameplay state. Semantic biome changes and
    any outer-world forest layout remain separate owner-approved migration and
    balance decisions.
11. A separate 96-site Tier-I Wheat Farm loop selects only passable Lowland and
    Meadow resource-capable anchors after Gold, forest, castle, and protected
    corridor clearance. One Food wagon and one Gold wagon may coexist per
    castle; Food earns one completed server minute for at most 30 days while a
    server-held passive-Food reservation preserves the final award.
12. A separate 96-site Tier-I Logging Camp loop selects only passable Forest
    resource-capable anchors after Gold, Food, forest, castle, and protected
    corridor clearance. One Wood, Food, and Gold wagon may coexist per castle;
    Wood earns one completed server minute for at most 30 days. The server
    reserves raw passive Food and Wood together through their fixed deadlines,
    preserving both awards across reads, collections, delayed lifecycle work,
    and concurrent Gold settlement.

This candidate is not live. Module publication, the production founder
backfill, world expansion, Gold-site, forest-layout, Food-site, and Wood-site
setup, aggregate verification, and exact Pages deployment remain separate gates
requiring review and explicit owner approval.

## Next release gate — verify and publish the bounded candidate

1. Complete the release matrix against one exact reviewed candidate SHA.
2. Publish the additive module with deletion disabled only after approval.
3. Run the exact-count founder backfill only after separate owner approval.
4. Expand the exact generation-two world with the guarded one-time operator
   only after a fresh read-only checkpoint and separate owner approval.
5. Require the exact 10,000-cell generation-three aggregate, Gold/Food/Wood
   placement digests, forest-layout row and catalog digests, exactly 210 forest
   instances, and zero missing, orphaned, or invalid resource-account,
   Gold-site, Food-site, Wood-site, and paired Food/Wood-reservation invariants
   before deploying the matching Pages SHA.
6. After the candidate boundary is stable, split the additive migration
   lifecycle proof and resource rollout security tests out of their large shared harnesses
   without changing their fail-closed public contracts.

## Next gameplay slice — construction queues

After the Gold/Food/Wood resource loops are independently verified and live, the next
intentional vertical slice may add construction:

1. Define reviewed costs and accept bounded construction intents.
2. Resolve queues and resource deductions atomically on the server.
3. Preserve castle ownership and queue state across reloads and multiple
   clients.
4. Expose only the building projection needed by the browser; resource
   inventories remain caller-private.
5. Keep private admission, audit, attribution, receipts, and accounting outside
   browser subscriptions and diagnostics.

## Later slices

1. Unit training, scouting, map visibility, and public activity reports.
2. Deterministic travel, defenses, raids, and bounded combat resolution.
3. Alliances, diplomacy, season rules, and community governance.
4. Read-only lore, reports, and quests derived from authoritative snapshots.

## Product guardrails

- Do not claim a feature is playable before it is live and authoritative.
- Keep browser state temporary and server authority deterministic.
- Do not use Farcaster social data as identity proof, hidden combat authority,
  or pay-to-win input.
- Do not present Marks as money, a transferable asset, or a promised reward.
- Do not publish source media with unresolved rights merely to shrink the
  repository.
