# Warpkeep Alpha 0.3.7 — Genesis Resources & Gold Expeditions

**Status (18 July 2026): undeployed candidate. Alpha 0.3.6 remains the
verified public release.**

Alpha 0.3.7 prepares one deliberately small persistent loop: an admitted
founder can collect Food, Wood, and Stone from their authoritative terrain and
send one Hegemony supply wagon to an available Gold Mine. It does not authorize
a production SpacetimeDB publication, founder backfill, Gold-site seed, Pages
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

Food, Wood, and Stone terrain yield accrues in complete ten-minute quanta under
the compiled `genesis-resource-yield-v1` policy. The server transaction
timestamp and the founder's authoritative castle terrain are the only production
inputs. Terrain Gold is deliberately zero: it has no second issuance path.
`collect_resources_v1` accepts no arguments, so the browser cannot choose a
FID, castle, terrain, rate, balance, or timestamp. Concurrent or repeated calls
settle only completed quanta after the stored cursor; reaching a cap still
advances that cursor so discarded production cannot reappear later.

Community Marks remains governed by its existing separate private authority.
The resource procedure can present the caller's established Marks balance, but
does not copy it into a resource row or create conversion, credit, transfer,
spending, or reward behavior.

## Gold Mine wagon pilot

The pilot contains exactly 24 active Tier-I sites selected deterministically
from the existing 250 passable `resource-capable` anchors in Genesis 001. The
site list, placement algorithm, and SHA-256 digest are compiled and tested
against the actual 1,261-cell canonical map. It is not the separately proposed
10,000-cell expansion.

- `dispatch_gold_expedition_v1` accepts only a canonical site id and a bounded
  idempotency key. The server derives the admitted caller, founder terms,
  origin castle, canonical passable route, timing, rate, account capacity, and
  one-wagon limit; it atomically rejects an occupied site or a duplicate wagon.
- A completed gathering minute accrues one Gold. The gathering phase lasts 30
  days (43,200 whole Gold before the existing account cap). The owner may claim
  completed minutes through a no-input server reducer; no browser timer writes
  a balance, and the expiry schedule settles the exact unclaimed remainder.
- Arrival, gathering expiry, and return are separate one-shot schedules. Their
  reducer verifies the scheduler's internal principal and the persisted
  lifecycle state, so a player cannot invoke, replay, or accelerate a schedule
  to move a wagon, release a site, or credit Gold.
- A public occupancy row identifies a site, public origin castle, phase, and
  server-derived timestamps. It intentionally excludes FID, account, request,
  route, accrued Gold, and private expedition state. The private owner
  projection supplies only that owner's pending/credited amount and timeline.
- At gathering expiry the Mine becomes available while the wagon returns; the
  originating castle cannot dispatch another wagon until its return completes.

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
- Gold Mine records use the provenance-pinned transparent illustration, exact
  public occupancy state, an accessible selected-site target, and an explicit
  unavailable state when the public projection is malformed or absent. High,
  Balanced, and Compact Gold Mine and supply-wagon GLBs are integrity-pinned,
  shared through a bounded prefab cache, and fall back to a marker if WebGL or
  a model load is unavailable. Nearby wagons may animate locally from
  server-derived lifecycle points; animation never changes world state.

## Additive migration and rollout gate

The candidate appends the private resource, expedition, and idempotency tables;
the public Gold-site catalog and occupancy projection; and a deliberately
public-safe, non-subscribed lifecycle schedule projection. The schedule contains
only site/castle/timing/stage data already derivable from occupancy, never a
FID, request, private expedition ID, accrual cursor, or balance. Existing table
references and public wire shapes stay unchanged, and protocol 3 remains the
active compatibility boundary so Alpha 0.3.6 clients can ignore the additive
APIs.

A disposable protocol-3-to-v5 fixture and migration verifier are the release
proof for preserving deployed rows while adding the resource and Gold tables. A guarded,
idempotent Hermes operation can backfill existing founders only after checking
the complete founder graph and an exact operator-supplied count. The counts-only
`admin_get_alpha_status_v4` procedure reports aggregate resource coverage and
invariant violations without returning FIDs, identities, balances, profiles,
tokens, or logs.

The required production sequence is held pending explicit owner approval:

1. publish the reviewed additive module with deletion disabled;
2. run the guarded founder backfill with the exact verified founder count;
3. require zero missing, orphaned, or invalid resource accounts through the v4
   aggregate, verify the exact Gold-site catalog through the approved guarded
   operation, and perform bounded own-account reads;
4. deploy the exact reviewed Pages SHA; and
5. verify the live build identity and immutable resource paths without changing
   a balance.

The module publication and founder backfill are production changes. Neither may
be inferred from a green test run, a merged pull request, or a client deploy.

## Explicit non-features

This candidate does not add construction, building queues, upgrades, general
unit control, combat, scouting, alliances, chat, seasons, trading, resource
transfers, public inventories, wallet actions, Marks spending, airdrops,
rewards, or guaranteed financial value. The one bounded Gold expedition is not
general movement, a transferable asset, or a financial product.

## Release evidence

This is a source candidate, not a release claim. Its final local evidence is
attached to the draft review PR only after its Gold schema, generated bindings,
full test suite, asset/provenance checks, and ordinary/Pages builds run on the
same committed head. Hosted Verify and CodeQL must also pass before a merge is
considered.

Production module publication, founder resource setup, Gold-site seed, any
aggregate inspection, Pages deployment, tag, and GitHub Release are **not run**
by this candidate and require separate owner approval. A green local run or
draft PR does not authorize any of those actions.

Only a protected, verified, deployed commit may receive the annotated `v0.3.7`
tag and GitHub Release.
