# Warpkeep Alpha 0.3.7 — Genesis Resource Authority

**Status (18 July 2026): undeployed candidate. Alpha 0.3.6 remains the
verified public release.**

Alpha 0.3.7 prepares one deliberately small persistent loop: an admitted
founder can see and collect their own Food, Wood, Stone, and Gold. It does not
authorize a production SpacetimeDB publication, founder backfill, Pages
deployment, tag, or GitHub Release.

## Private resource authority

- SpacetimeDB owns one private `resource_account_v1` row per founded castle.
  It starts at Food 200, Wood 150, Stone 100, and Gold 25 and caps each balance
  at 1,000,000 whole units.
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

## Presentation assets

Food, Wood, Stone, and Gold use compact immutable runtime icon paths with exact
length and hash verification. They are bounded derivatives of the recorded
reference masters; the source masters stay outside `public/` and therefore
outside the Pages artifact. Icons and browser counters do not create authority.

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

## Release evidence — pending

No verification count is claimed before the final reviewed candidate SHA runs
the release matrix. Replace each placeholder with exact evidence only after it
exists:

- Root unit tests: **PENDING — exact count and SHA**
- Typecheck and production builds: **PENDING — ordinary, Pages, canonical root**
- Runtime assets, file sizes, licence policy, dependency and signature audits:
  **PENDING**
- Rendered WebGL and player-journey matrix: **PENDING — exact case counts**
- Auth bridge tests and dry-run compilation: **PENDING — exact counts**
- SpacetimeDB tests, module build, generated bindings, and additive migration:
  **PENDING — exact counts and fixture result**
- Hosted Verify and CodeQL: **PENDING — reviewed head SHA**
- Production module publication, founder backfill, v4 aggregate, Pages deploy,
  and exact-build verification: **NOT RUN — OWNER APPROVAL REQUIRED**

Only a protected, verified, deployed commit may receive the annotated `v0.3.7`
tag and GitHub Release.
