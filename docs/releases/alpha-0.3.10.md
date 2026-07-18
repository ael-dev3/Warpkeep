# Warpkeep Alpha 0.3.10 — Hegemony Social Contract candidate

**Status:** draft candidate only. This document does not announce a public
release, deployment, module publication, tag, or production-data action.

## Summary

Alpha 0.3.10 is the proposed legal-and-entry-agreement successor to the
stacked 0.3.9 source candidate. It adds a separately public Hegemony Social
Contract and binds it with the Alpha Terms as one versioned entry agreement.
The verified public `main` release remains Alpha 0.3.8; this draft has no
effect on a player until all separate review, stack, release, and deployment
gates are completed.

The current playable scope remains a Hegemony-only, allowlist/admission-gated
alpha. `Ousters` and `Core` are provisional future-setting concepts, not
playable factions, active feature work, promises, or entitlement paths.

## Entry agreement

- The public documents are the Alpha Terms, Hegemony Social Contract, and
  Privacy Notice, linked in that order from one concise entry dialog.
- One unchecked checkbox says: “I have read and agree to the Alpha Terms and
  Hegemony Social Contract.” It does not claim a blanket Privacy Notice
  acceptance.
- The current entry-agreement bundle is
  `2026-07-18-hegemony-entry-agreement-v1`; the incorporated Social Contract is
  `2026-07-18-hegemony-social-contract-v1`.
- The reviewed normalized visible-text hashes are
  `0c2fab74ee3eaf0f453503decb9eaafb65bb7ae226f99742b65797e89e3ab864` for the
  Alpha Terms and
  `c6cd22628622aceaba25dd4f9cc5f609873f86a0e7d458c0e4bdf54c9b012571` for the
  Hegemony Social Contract.
- The established reducer/input name `accept_alpha_terms_v1` and payload
  `{ termsVersion, accepted }` remain unchanged for wire compatibility.
- A successful authenticated acknowledgement adds only immutable private FID,
  exact bundle/version, and timestamp evidence. It never records browser
  checkbox state, a privacy-consent assertion, proof material, tokens, cookies,
  wallets, chat, or a social graph.

Current entry and gameplay require the exact current bundle. Historical
acceptance evidence is immutable and can preserve an already-public Community
Marks projection only under its explicit policy; it cannot establish current
entry or gameplay eligibility.

## Compatibility and non-goals

Backend protocol remains `3`. This candidate adds no table, schema migration,
generated binding, authentication-contract, reducer wire, faction mechanic,
chat, direct-message, AI/NPC, moderation-tooling, wallet, payment, premium,
reward, Marks conversion, or Marks spending change.

The public legal pages remain static, script-free documents with strict CSP,
local styling, and no remote assets or forms. Their visible main text is
version/hash-bound before a candidate can advance.

## Required release gates

1. Resolve the #51/#52 dependency stack and compare the rebased candidate with
   the current protected `main` release line.
2. Complete legal, privacy, and naming/originality review. No clearance is
   claimed here; `Ousters` and `Core` remain provisional pending that review.
3. Verify exact browser/module agreement IDs, text hashes, static-page security,
   dialog accessibility, current-version rejection of old evidence, and
   historical Marks-projection preservation.
4. Release matching client and module versions only through separately approved
   operations. Version skew must fail closed with the existing
   `ALPHA_TERMS_REQUIRED` path rather than accepting stale consent.
5. Complete the normal protected-branch release matrix, exact-build review, and
   post-deployment verification before an annotated `v0.3.10` tag or public
   release is considered.

Source completion, a green local test run, a merge, or this note itself grants
none of those approvals.
