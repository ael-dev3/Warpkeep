# Warpkeep Alpha 0.3.7 — Genesis Resource Authority

**Status (18 July 2026): undeployed candidate. Alpha 0.3.6 remains the
verified public release.**

Alpha 0.3.7 prepares one deliberately small persistent loop: an admitted
founder can see and collect their own Food, Wood, Stone, and Gold. It does not
authorize a production SpacetimeDB publication, founder backfill, Pages
deployment, tag, or GitHub Release.

## Private resource authority

- SpacetimeDB owns one private `resource_account_v1` row per founded castle.
  It starts at zero Food, Wood, Stone, and Gold and caps each balance at
  1,000,000 whole units.
- The authenticated caller may read only their own stored and pending balances.
  The established six-table public Realm subscription is unchanged; other
  founders' inventories, account rows, and FIDs are not added to public
  resource presentation.
- Resource access requires current admission, player bootstrap, exact castle
  ownership, current Alpha Terms acceptance, and a consistent private
  resource-and-Marks graph. Missing or contradictory state fails closed before
  Realm presentation.
- The browser decodes an exact versioned bigint projection and rejects unknown
  fields, unsafe numbers, mismatched FIDs, invalid policy values, impossible
  totals, or regressing observations. It never predicts or optimistically
  applies an authoritative credit.

## Deterministic collection

Terrain yield accrues in complete ten-minute quanta under the compiled
`genesis-resource-yield-v1` policy. The server transaction timestamp and the
founder's authoritative castle terrain are the only production inputs.
`collect_resources_v1` accepts no arguments, so the browser cannot choose a
FID, castle, terrain, rate, balance, or timestamp. Concurrent or repeated calls
settle only completed quanta after the stored cursor; reaching a cap still
advances that cursor so discarded production cannot reappear later.

Community Marks remains governed by its existing separate private authority.
The resource procedure can present the caller's established Marks balance, but
does not copy it into a resource row or create conversion, credit, transfer,
spending, or reward behavior.

## Realm presentation

Food, Wood, Stone, and Gold use compact immutable runtime icon paths with exact
length and hash verification. They are bounded derivatives of the recorded
reference masters; the source masters stay outside `public/` and therefore
outside the Pages artifact. Icons and browser counters do not create authority.

- The player's portrait is the only persistent control in the upper-left
  corner. It opens the Realm menu for My Keep, Explore, Settings, Main Menu,
  and Collect only when the server reports pending production.
- A transparent upper-right rail presents Food, Wood, Stone, Gold, and Marks in
  a fixed order. Every visible value comes from the authenticated private
  projection; the browser does not fabricate a friendly zero while authority
  is unavailable.
- Selection details remain available to assistive technology without restoring
  the former full-size identity, keep, coordinate, level, or Marks block.
- Castle records use transparent, overhanging castle art with player and
  observer layouts scoped independently. Player-map labels reserve only the
  actual portrait and resource footprints, preserving useful camera space on
  phones and short landscape screens.

## Additive migration and rollout gate

The candidate appends the private resource table and new versioned operations
after the deployed schema. Existing table references and wire shapes stay
unchanged, and protocol 3 remains the active compatibility boundary so Alpha
0.3.6 clients can ignore the additive APIs.

A disposable protocol-3 fixture and migration verifier are the release proof
for preserving deployed rows while adding the resource table. A guarded,
idempotent Hermes operation can backfill existing founders only after checking
the complete founder graph and an exact operator-supplied count. The counts-only
`admin_get_alpha_status_v4` procedure reports aggregate resource coverage and
invariant violations without returning FIDs, identities, balances, profiles,
tokens, or logs.

The required production sequence is held pending explicit owner approval:

1. publish the reviewed additive module with deletion disabled;
2. run the guarded founder backfill with the exact verified founder count;
3. require zero missing, orphaned, or invalid resource accounts through the v4
   aggregate and perform one bounded own-account read;
4. deploy the exact reviewed Pages SHA; and
5. verify the live build identity and immutable resource paths without changing
   a balance.

The module publication and founder backfill are production changes. Neither may
be inferred from a green test run, a merged pull request, or a client deploy.

## Explicit non-features

This candidate does not add construction, building queues, upgrades, units,
combat, scouting, alliances, chat, seasons, trading, resource transfers, public
inventories, wallet actions, Marks spending, airdrops, rewards, or guaranteed
financial value.

## Release evidence

The complete local matrix passed for the final local review tree. Hosted checks
remain required on the committed review head.

- Root unit tests: **1,444/1,444 across 141 files**; TypeScript passed.
- Production builds: **ordinary, Pages, and canonical-root variants passed**;
  each rejected local QA/observer material from the output.
- Runtime/provenance assets: **33 runtime assets and 4 reference masters**;
  tracked file sizes and the Apache-2.0/CC-BY-4.0 licence policy passed.
- Root dependency audit: **0 known vulnerabilities**; **190 registry
  signatures** and **61 attestations** verified.
- Rendered browser QA: **14 WebGL cases, 25 journey checks, and all three
  hash-pinned castle LOD comparisons passed** on loopback.
- Auth bridge: **175/175 tests**, TypeScript, dependency audit, and Wrangler
  dry-run compilation passed; no deployment ran.
- SpacetimeDB: **121/121 tests**, module build, generated public bindings, and
  private-table exclusion passed. The disposable protocol-v3-to-v4 migration
  proof preserved every existing row/ref, exercised one real production
  quantum through the exact module artifact, and passed with SHA-256
  `0567aafa5b809b53615fdad29d0190de5903893a8464c224a1a9d8a92fc5bbfb`.
- Hosted Verify and CodeQL: **PENDING — both must pass on the committed PR head
  before merge**
- Production module publication, founder backfill, v4 aggregate, and Pages
  deploy: **NOT RUN — OWNER APPROVAL REQUIRED**
- Bounded read-only pre-deploy verification: the public canonical/root redirect
  checks passed, then the candidate stopped at the undeployed bridge CORS
  contract. Exact-build verification therefore remains a post-rollout gate; no
  production state changed.

Only a protected, verified, deployed commit may receive the annotated `v0.3.7`
tag and GitHub Release.
