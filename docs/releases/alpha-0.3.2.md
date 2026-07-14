# Warpkeep Alpha 0.3.2 candidate

Alpha 0.3.2 is the Genesis 001 founding candidate. It expands the deterministic
Hegemony realm, introduces trusted public castle presentation and private
server-owned Mark accounting, and makes first admission create a nearby level-one
castle atomically.

This document describes the source candidate. Alpha 0.3.1 remains the live
production release until the additive schema, seed, operator inputs, admission,
frontend, and production verification gates are each explicitly approved.
Before production founding, the exact post-founding counts/invariant verifier
must be independently reviewed, then run with the private plan's expected count
immediately after every separately approved founding action before rollout
proceeds. No local test, candidate build, or earlier schema-publication approval
substitutes for that bounded production gate.

## Candidate scope

- Genesis 001 grows from the exact original 61 radius-four rows to 1,261
  radius-20 rows, preserving every deployed row and seed field.
- One hundred immutable castle slots support a 100-player capacity. The first
  three founding slots sit in one close district at axial coordinates `(0,0)`,
  `(2,-1)`, and `(-1,2)`.
- Static terrain metadata separates passability from future resource/Core
  capability. Deterministic budgets and full-map connectivity are drift-pinned.
- Admission/founding reducers remain server-authoritative, preserve a player's
  castle across disable/re-enable, and reuse the same castle on later logins.
- Trusted Farcaster presentation is sanitized before it reaches public realm
  state. Wallet associations remain private.
- Marks use a private authoritative ledger and optional public aggregates.
  Eligible finalized ordinary SNAP token burns on Ethereum mainnet convert 1:1 by
  six-decimal micro-unit under the versioned
  [`snap-current-linked-wallet-1to1-v1`](../gameplay/marks-policy-v1.md) policy.
- The browser does not connect or scan wallets, request signatures or approvals,
  submit transactions, or receive wallet addresses and burn receipts.
- The exact Hegemony Mark release asset is verified and transformed into local
  32/64/128/256 px PNG and lossless WebP derivatives; GitHub Releases is not a
  runtime CDN.
- The additive protocol-3 schema contains the deployed seven-table prefix plus
  twelve appended tables: four public realm projections and eight private
  authority, accounting, scan-lifecycle, and Terms-evidence tables. Generated
  browser bindings expose only the eight total public tables and omit every
  private-table accessor.
- Terms acceptance is an exact-version, authenticated server transition. Its
  immutable evidence remains private. Cancellation invalidates the browser
  continuation so a late reducer acknowledgment cannot begin a public realm
  subscription; evidence already committed by the server is not erased.
- Wallet attribution uses private immutable snapshot generations. Scanner work
  is bounded into transactional pending/finalized batches with frozen inputs,
  cursor compare-and-swap, receipt deduplication, two-provider reconciliation,
  and per-burn-block implementation reattestation. Production apply remains
  deliberately unavailable.
- The 1,261-cell renderer uses radius-aware geometry budgets, indexed terrain
  lookups, instanced peer markers, bounded labels, paged navigation, and explicit
  passability metadata. Scenic blockers are never presented as selectable or
  playable cells.
- A read-only founded-state verifier accepts only a canonical expected count from
  1 through 100 and requires exact pre-login admission, claim, castle, profile,
  Mark-account, and occupied-tile counts with every protocol-3 invariant at zero.
  It neither accepts nor reports FIDs. Exact identities and nearest-slot prefix
  remain private-plan and reducer-evidence checks rather than aggregate output.

## Candidate validation

The local candidate passed 752 browser/shared tests and 84 SpacetimeDB module
tests, root and module typechecks, production builds, exact generated-binding
privacy checks, legal/runtime-asset validation, dependency and secret scans,
and a disposable additive migration rehearsal from both empty and populated
protocol-2 fixtures. The migration artifact SHA-256 was
`ea9a5327a367423957053f404936d41b7e4d98206b9e6d5c6c9f95f475701435`.

These local results are evidence for the source candidate only. They are not a
claim that protocol 3, Genesis 001 expansion, founding, Marks, or Alpha 0.3.2 is
live in production.

## Release boundary

The implementation and tests do not authorize a production mutation. Publishing
the additive SpacetimeDB schema, seeding 1,200 outer rows and sidecars, applying
profile/wallet snapshots, crediting burns, admitting FIDs, deploying the
frontend, merging, tagging, and releasing each remain gated actions. A rollout
must first obtain separate approval to disable and attest both production public
auth and frontend realm entry, then keep both disabled through schema, seed, and
staged verification. Re-enabling either switch is another separately approved,
attested deployment. Scheduler installation remains unperformed and is gated on
a successful reviewed manual dry run with private inputs. Any drift, privacy
leak, provider disagreement, unexpected schema shape, or invariant mismatch
stops the rollout.
