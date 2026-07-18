# Hegemony Social Contract and Alpha 0.3.10 candidate

**Status:** draft implementation plan. This work is a dependent draft, not a
release authorization, deployment instruction, or production-data operation.

## Stack and release coordinates

- Proposed branch: `agent/hegemony-social-contract`.
- Intended base: `agent/alpha-0.3.7-lush-forest-biomes` (draft PR #52 at
  `ac8ec75329e567480dfb5634caa5525cbf0f0cbf`). That branch itself depends on
  draft PR #51; neither predecessor is changed, merged, or operated by this
  work.
- Recorded remote `main` is
  `3ca99d2d263453fbb112a7a21fa1bfde294e186b` (Alpha 0.3.8). The stack must be
  reconciled with `main` after its predecessors are ready; this plan does not
  authorize that reconciliation.
- The proposed product line is **Alpha 0.3.10 candidate**. Backend wire
  protocol remains `3`; no authentication-contract, realm-seed, schema, table,
  generated-binding, or reducer-wire version changes are part of the work.

## Purpose and player-facing boundary

The addition introduces a separately public, versioned **Hegemony Social
Contract** at `/social-contract/`. It is incorporated into the Alpha entry
agreement alongside the Alpha Terms. The entry dialog remains deliberately
short: it has one unchecked checkbox, links in the order **Alpha Terms**,
**Hegemony Social Contract**, then **Privacy Notice**, and uses the precise
agreement text:

> I have read and agree to the Alpha Terms and Hegemony Social Contract.

The Privacy Notice remains linked for notice; the checkbox is not an assertion
of blanket privacy consent. There is no second checkbox, lore wall, tracking
state, or persisted browser acceptance state.

The currently playable setting remains **Hegemony-only**, invite/allowlist and
admission gated. `Ousters` and `Core` are only provisional future-setting
concepts: they are not playable, not in active implementation, and not a
promise of a future feature, faction, reward, or access right.

## Versioned agreement authority

The current bundle is identified by
`2026-07-18-hegemony-entry-agreement-v1`; its incorporated Social Contract is
identified by `2026-07-18-hegemony-social-contract-v1`. The browser and module
share the bundle identifier. The deployed compatibility name
`WARPKEEP_ALPHA_TERMS_VERSION` continues to name that complete bundle, rather
than changing public reducer or payload naming.

The canonical visible `<main>` text of the Terms and Social Contract is
SHA-256-bound in the browser policy:

- Alpha Terms: `0c2fab74ee3eaf0f453503decb9eaafb65bb7ae226f99742b65797e89e3ab864`
- Hegemony Social Contract:
  `c6cd22628622aceaba25dd4f9cc5f609873f86a0e7d458c0e4bdf54c9b012571`

These values are recorded only after static-page rendering/review. Any wording
change requires an intentional document/version/hash review rather than silently
changing what the same identifier means.

`accept_alpha_terms_v1` remains the sole acknowledgement wire and retains
`{ termsVersion, accepted }`. On a truthful, authenticated acknowledgement it
records only private immutable FID, exact bundle/Terms version, and acceptance
time evidence. It stores no checkbox state, privacy consent, SIWF proof, token,
cookie, wallet, chat, or social-graph data.

Entry and gameplay require the **exact current bundle**. An older immutable
row never satisfies a current entry gate. The retained `2026-07-14` historical
record is enumerated only so an already-public Community Marks projection can
remain visible; it is not renewed consent, a gameplay entitlement, or a way to
enter under the current agreement. Existing rows are never rewritten or
deleted.

## Content and governance boundaries

The standalone document must be plain, original high-fantasy project copy. It
describes the Hegemony's civic expectations, voluntary participation, limited
future-setting concepts, fair process, and an appeal/review path without
inventing game mechanics. It must distinguish universal safety rules (for
example, credible threats, targeted harassment, doxxing, fraud, or unlawful
conduct) from viewpoint or factional disagreement; peaceful dissent and
criticism are not prohibited merely for being dissent.

No expansion is authorized for factions, faction switching, chat, direct
messages, AI/NPC interaction, moderation systems or tooling, reporting queues,
premium tiers, rewards, airdrops, Marks conversion/spending, wallets, payments,
governance mechanics, or gameplay loops. The contract is not a claim of formal
legal clearance, legal advice, or a completed regulatory/privacy review.

## Public documents and privacy

The Terms, Social Contract, and Privacy Notice use the shared static legal
shell, local CSS, a strict no-script CSP, and no remote executable or media
assets or forms. The three entry-dialog links open in new tabs with
`noopener noreferrer`; the static document navigation remains ordinary local
navigation. Canonical and base-path-safe links are verified for both root and
subpath Pages builds.

The Privacy Notice is updated narrowly to explain the single entry-agreement
checkbox and the private immutable evidence described above. It must not invent
collection of IP addresses, moderation data, chat content, wallets, payments,
or future faction state. The existing project-authored legal and privacy copy
remains subject to formal review before any broader activation.

## Rollout and verification plan

1. Review public document wording, normalized-text hashes, link order, CSP,
   focus/keyboard behavior, narrow mobile layout, and no-script/no-remote-asset
   guarantees.
2. Prove browser and module use the same exact current bundle ID; prove the
   existing `accept_alpha_terms_v1` reducer/payload remains unchanged.
3. Prove an old version fails the current entry/gameplay gate, while explicitly
   listed historical evidence can preserve only an already-public Marks
   projection. Prove multiple immutable rows per FID are counted accurately by
   operator tooling rather than treated as corruption.
4. Run static/legal, dialog, admission, module, migration, type, build, and
   rendered-browser checks. Use disposable/local fixtures only.
5. Treat client/server version skew as fail-closed: an old client cannot submit
   the new exact version and a new client cannot rely on an old row. Release a
   matching client and module only through a separately approved production
   process; `ALPHA_TERMS_REQUIRED` is the expected safe denial during skew.

Nothing in this plan authorizes module publication, Pages deployment, public
release, tag creation, live operator commands, founder backfill, or mutation of
any existing pull request.

## Outstanding review and residual risks

- Formal legal and privacy review is still required before a release or any
  broadened participant use.
- Preliminary naming/originality review is unresolved. `Hegemony`, `Ousters`,
  and `Core` require separate clearance; `Ousters` and `Core` remain explicitly
  provisional in public copy until then.
- The dependent #51/#52 stack needs a clean restack and fresh comparison with
  current `main` before this candidate can be considered for merge.
- A later agreement revision must add its prior bundle to the explicit
  historical-evidence list only when preservation of an already-public Marks
  projection has been reviewed. It must never weaken the exact-current
  entry/gameplay check.
