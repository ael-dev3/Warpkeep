# Greater Realm final integration and rollout design

Status: approved for staged development and verification

Source baseline: `origin/main` at `0ca019b797fcfbf56f0f8598900d80d85e0ea037`

## Outcome

Ship the Greater Realm as the live Warpkeep world without weakening its
fail-closed release boundaries. The finished release has six accessible Tier-I
regions, 600 replay-safe randomly ordered castle slots, 12,000 active resource
nodes, four workers per castle, visible living-world presentation, sealed
Tier-II/Tier-III content, no open pull requests, truthful public documentation,
and every pending eligible player notified and admitted exactly once.

## Starting state

- All completed pull requests through #217 are already in `main`.
- An earlier reviewed snapshot of #193 is in `main` through merge commit
  `8d74c71713529e473efba0098d048b1c25b73899`. The still-open draft #193 has
  continued beyond that snapshot and must be integrated only after its separate
  worker declares the head ready.
- The current #193 head is not an ancestor of `main`. A wholesale merge result
  would conflict with or regress newer release, security, renderer, notification,
  and documentation work. Its final novel changes must be adapted onto the then
  current protected `main` while preserving the pull request number.
- Greater Realm import, activation, client presentation, server presentation,
  notification delivery, and downstream release approvals are all compiled
  closed. This is correct until their named release phases.
- Behind those gates, `main` already implements roads, tracks, carriageways,
  rivers, streams, bridges, fords, animated water, moving ambient river boats,
  NPCs, wildlife, landmarks, castles, public resource markers, worker dispatch,
  and worker recall.

## Product authority

### World and access

- The public active world contains exactly the six Tier-I regions
  `T1_LOWLANDS`, `T1_FROSTMERE`, `T1_SUNSCAR`, `T1_MIREFEN`,
  `T1_STONEWAKE`, and `T1_EMBERWOOD`.
- Tier II and Tier III remain private, sealed, non-passable, non-foundable,
  non-gatherable, and absent from the public current-world projection.
- Public movement, founding, resource-location, and worker authorities reject
  any slot, cell, region, or route whose tier is not exactly `1`.

### Castle reassignment

- Finalization performs one server-authoritative Fisher-Yates shuffle with
  private runtime entropy. The resulting global `allocationRank` values and
  topology digest are persisted before any founder is assigned.
- “Random” means unpredictable before finalization and stable afterward. It
  does not mean calling `Math.random` during admission, accepting coordinates
  from a player, or rerolling on retry.
- Admission always chooses an unclaimed slot in a least-populated Tier-I region
  and uses persisted `allocationRank` to break ties. Region counts may differ
  by at most one while capacity remains, and end at exactly 100 per region.
- Existing founders are canonicalized by numeric castle ID before relocation;
  new founders receive the next canonical claim. Replays return the same claim.

### Workers and resources

- Capacity is exactly 600 castles and 2,400 workers, four workers per castle.
- The active atlas contains exactly 12,000 resource nodes: 500 nodes per
  resource kind in each of six Tier-I regions. This provides five nodes per
  capacity worker for each castle and retains single-kind concurrency margin.
- Gold, food, wood, and stone preserve the existing assignment, occupation,
  schedule, completion, recall, and idempotency receipt paths.
- Public resource results expose bounded location capacity only; private node
  identity never crosses the client boundary.

### Living-world presentation

- Returned public fields are the only source of routes, water, crossings,
  actors, landmarks, castles, resource affordances, and passability.
- High-profile ceilings remain 64 NPCs, 96 wildlife actors, and 24 boats in the
  selected view; balanced and reduced profiles retain their reviewed lower
  ceilings. Presentation must remain within draw, instance, upload, and frame
  budgets.
- Water and ambient boats animate only when motion is allowed, the document is
  visible, and WebGL context is valid. Reduced motion freezes rather than
  removes authoritative presentation.
- Presentation meshes never grant movement, ownership, resource, or admission
  authority.

## Integration architecture

### Phase A — pre-#193 readiness

1. Verify the exact `main` baseline and GitHub branch/CI state.
2. Run the server capacity, relocation, Tier-I, resource, and worker suites.
3. Run the client presentation, runtime-animation, bridge, resource, and worker
   control suites.
4. Run release-gate, secret scanning, license, public-boundary, type, and build
   checks in a trusted checkout. Sandbox-only process-identity tests are not
   waived; they must be green in protected CI even if a local sandbox denies
   `/bin/ps`.
5. Preserve a content-addressed preflight evidence report. Do not open a new
   feature gap when existing behavior and tests already satisfy this spec.

### Phase B — PR #193 last

1. Wait until #193 is non-draft or its separate worker explicitly reports the
   final head ready. Capture that immutable head SHA.
2. Check out the actual #193 head and merge the then current protected `main`
   into it. Do not force-push over work still in progress.
3. Resolve conflicts by preserving newer `main` security, disturbance,
   release, notification, and operational authority, then port the final novel
   water-first generation, terrain, grass, wildflower, and capability changes.
4. The generator version may only advance beyond the current `.18` authority
   when code, design, security docs, package evidence, and tests all name the
   same new value. It may never regress to `.17`.
5. Run focused suites after each conflict family, then the complete protected
   verification workflow. Merge #193 only after required checks are green and
   the GitHub merge state is clean.
6. Confirm the GitHub open-PR census is empty before production mutation.

### Phase C — protected production succession

Release phases remain separate protected-main successors because every phase
binds receipts emitted by its predecessor:

1. C0: owner-private candidate generation, comparison, selection, immutable
   artifact packaging, and provenance review.
2. C1: inert v17 schema append with both mutation gates closed.
3. C2: import-only publication, bounded import, independent verification, and
   ready-state evidence.
4. C3: activation handoff and relocation through `prepare`, `begin-drain`,
   `freeze`, `plan`, `canary`, and `commit`; run the production player canary
   before presentation.
5. C4: Pages notification generation zero with world presentation still closed.
6. C5: durable Pages-rooted, Hermes-inert successor.
7. C6: durable Hermes notification successor, still on the inert world client.
8. C7: activation-client successor, version `0.3.44`, atomically enabling both
   presentation gates only after the durable C6 root and player-canary receipt.

Every write uses only the exact row in
`docs/operations/greater-realm-production-launch-envelope.sh.txt`. Intentional
npm refusal aliases, direct `tsx` entrypoints, mutable worktrees, or manually
edited receipts are never fallbacks. An ambiguous write or deploy stops that
lane for reconciliation; it is not retried.

## Documentation and player admission

- README and CHANGELOG remain truthful about the closed world before C7. Their
  live-world update is part of the reviewed 14-path activation-client change,
  never an optimistic pre-release edit.
- After C7 postflight, run the bounded private pending-request census. It is
  advisory only; each founder is processed sequentially through a fresh dry-run
  plan and confirmed request-CAS operation.
- Notification acceptance precedes admission. Logical notification identity is
  `warpkeep-access-approved-v2-r<requestedAtMicros>` and remains unchanged on
  retry or the single reviewed recovery path.
- A sent receipt wins permanently. `queued`, `delivery-exhausted`,
  `not-subscribed`, changed request time, changed release root, exhausted
  capacity, or changed admission state leaves that player unmutated and enters
  explicit reconciliation.
- Completion requires a second private census showing zero eligible pending
  rows, production population verification, and notification diagnostics for
  every consumed plan. Private FIDs and receipts never enter Git or logs.

## Stop conditions

Stop the active release lane without guessing when any of these occurs:

- #193 is still changing, draft, conflicted, or has a failing required check;
- branch protection, protected-main identity, or the exact Verify run cannot be
  authenticated;
- selected artifacts, module source, schema, topology, counts, or digests drift;
- a publication, reducer, Pages deployment, notification, or admission outcome
  is ambiguous;
- the current world is not exactly active v17 at C3, the durable notification
  root is absent at C6, or the player canary is not exact at C7;
- Tier II/III becomes public or passable, a private node identity leaks, or any
  secret/receipt permission check fails.

## Acceptance evidence

The rollout is complete only when all of the following are simultaneously true:

- GitHub reports zero open pull requests and protected `main` includes the final
  adapted #193 head;
- full protected CI, build, migration rehearsals, release gates, secret scan,
  and final code/security review are green;
- production verifies active v17, six Tier-I regions, 600 slots, 12,000 active
  nodes, the exact founder count, correct four-worker rosters, and preserved
  resource journeys;
- the live client shows the Greater Realm and its living-world presentation,
  while Tier II/III remain inaccessible;
- README and CHANGELOG describe the live `0.3.44` release;
- the bounded pending census has zero eligible rows after sequential processing,
  with one logical notification receipt and one admission outcome per consumed
  request cycle.
