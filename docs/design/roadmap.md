# Warpkeep roadmap

## Current release — Alpha 0.3.4

Warpkeep is a Pages-only, admission-gated Genesis 001 preview. Players can view
and navigate the shared Lowlands, inspect founded castles, and use the compact
realm presentation. The release leaves shared-world authority unchanged.

Public admission, resources, upgrades, units, combat, alliances, chat, seasons,
wallet actions, and Marks crediting or spending are not live.

## Next gameplay slice — resources and construction queues

The next intentional vertical slice should introduce one small persistent loop:

1. Derive resource production from authoritative terrain and server time.
2. Accept bounded construction intents and resolve queues on the server.
3. Preserve castle ownership and queue state across reloads and multiple
   clients.
4. Expose only the public resource and building projection needed by the
   browser.
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
- Do not use Farcaster social data as identity proof, hidden combat authority, or
  pay-to-win input.
- Do not present Marks as money, a transferable asset, or a promised reward.
- Do not publish source media with unresolved rights merely to shrink the
  repository.
