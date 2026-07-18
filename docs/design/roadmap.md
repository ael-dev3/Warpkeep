# Warpkeep roadmap

## Current public release — Alpha 0.3.8

Warpkeep is a Pages-only, admission-gated Genesis 001 preview. Players can view
and navigate the shared Lowlands, inspect founded castles, and use the compact
realm presentation. Alpha 0.3.8 is the recorded protected-`main` public line;
it leaves the shared-world authority boundary unchanged.

Public admission, resources, upgrades, units, combat, alliances, chat, seasons,
wallet actions, and Marks crediting or spending are not live.

## Stacked draft candidate — Alpha 0.3.10 Hegemony entry agreement

The next proposed documentation-and-entry slice is a dependent draft on the
0.3.9 source stack. It makes the Alpha Terms and a separately public Hegemony
Social Contract one exact, versioned entry agreement. The dialog retains one
unchecked checkbox and links to the Terms, Social Contract, and Privacy Notice
in that order. Privacy remains notice, not a blanket checkbox consent.

The server keeps the established protocol-3 `accept_alpha_terms_v1` wire and
records only immutable private FID/version/time evidence. The exact current
bundle is required for entry and gameplay. Explicitly enumerated historical
evidence may preserve an already-public Community Marks projection, but it can
never satisfy the new entry requirement or create a gameplay entitlement.

This is not a faction feature. The current alpha remains Hegemony-only and
allowlist/admission gated. `Ousters` and `Core` are provisional future-setting
names only, pending separate naming/originality review; they are not playable,
in active implementation, or promised. Chat, direct messages, AI/NPC systems,
moderation tooling, premium access, rewards, Marks conversion/spending, and
other gameplay work remain out of scope.

Advancement requires the #51/#52 source stack to be reconciled with current
`main`, formal legal/privacy and naming review, exact document-hash and
accessibility checks, current-versus-historical acceptance tests, and a
separately approved matching client/module rollout. No draft merge or local
test run authorizes publication, deployment, or a production mutation.

## Undeployed candidate — Alpha 0.3.9 resources, world capacity, Gold expeditions, and forests

The checked-in 0.3.9 candidate carries the bounded resource authority prepared
in 0.3.7, expands persistent map capacity, and adds a deliberately bounded
Gold Mine expedition loop:

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
7. Immutable icons, reviewed Gold Mine/wagon LOD families, generated bindings,
   a disposable additive-migration fixture, guarded founder backfill, and
   aggregate resource-and-Gold-site inspection prepare the release boundary.
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

This candidate is not live. Module publication, the production founder
backfill, world expansion, Gold-site and forest-layout setup, aggregate
verification, and exact Pages deployment remain separate gates requiring
review and explicit owner approval.

## Next release gate — verify and publish the bounded candidate

1. Complete the release matrix against one exact reviewed candidate SHA.
2. Publish the additive module with deletion disabled only after approval.
3. Run the exact-count founder backfill only after separate owner approval.
4. Expand the exact generation-two world with the guarded one-time operator
   only after a fresh read-only checkpoint and separate owner approval.
5. Require the exact 10,000-cell generation-three aggregate, Gold placement
   digest, forest-layout row and catalog digests, exactly 210 forest instances,
   and zero missing, orphaned, or invalid resource-account and Gold-site
   invariants before deploying the matching Pages SHA.
6. After the candidate boundary is stable, split the additive migration
   lifecycle proof and resource rollout security tests out of their large shared harnesses
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
