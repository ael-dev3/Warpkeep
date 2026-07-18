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

## Undeployed candidate — Alpha 0.3.7 resource collection

The checked-in 0.3.7 candidate implements only the resource half of the next
vertical slice:

1. One private, caller-scoped Food, Wood, Stone, and Gold account belongs to
   each founded castle.
2. Complete ten-minute server-time quanta and authoritative terrain determine
   bounded yield; collection accepts no player-supplied authority inputs.
3. The browser presents only the caller's exact projection and applies no
   optimistic credits. Peer balances remain outside public subscriptions.
4. Community Marks remains separate, private, and unchanged.
5. Immutable icons, generated bindings, a disposable additive-migration
   fixture, guarded founder backfill, and counts-only v4 inspection prepare the
   release boundary.

This candidate is not live. Module publication, the production founder
backfill, aggregate verification, and exact Pages deployment remain gated by
review and explicit owner approval.

## Next release gate — verify and publish the bounded resource loop

1. Complete the release matrix against one exact reviewed candidate SHA.
2. Publish the additive module with deletion disabled only after approval.
3. Run the exact-count founder backfill only after separate owner approval.
4. Require zero missing, orphaned, or invalid resource accounts in the
   counts-only v4 inspection before deploying the matching Pages SHA.
5. After the candidate boundary is stable, split the v4 migration lifecycle
   proof and resource rollout security tests out of their large shared harnesses
   without changing their fail-closed public contracts.

## Next gameplay slice — construction queues

After the resource loop is independently verified and live, the next
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
