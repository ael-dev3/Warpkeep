# Greater Realm activation-client presentation handoff

Status: **deferred; not live presentation**

The inert and pre-generation source must continue to identify itself as Alpha
`0.3.43` and must not state that the Greater Realm is live. An earlier
minor-version presentation draft and its player-facing claims were rejected
and deliberately forward-reverted. The reviewed live-world target is Alpha
`0.3.44`: a Greater Realm foundation update inside the existing `0.3.x` line,
not a claim that Warpkeep has reached a complete gameplay loop.

## Exact deferred file set

The activation-client change must review and reconstruct exactly these 14
presentation paths for `0.3.44`; it must not replay the rejected presentation
draft:

1. `CHANGELOG.md`
2. `index.html`
3. `package-lock.json`
4. `package.json`
5. `public/.well-known/farcaster.json`
6. `README.md`
7. `scripts/farcaster-miniapp-contract.mjs`
8. `src/components/menu/latestPatchNotes.ts`
9. `tests/buildInfo.test.ts`
10. `tests/deploymentBase.test.ts`
11. `tests/farcasterMiniAppContract.test.ts`
12. `tests/latestPatchNotes.test.ts`
13. `tests/menuFarcasterAuthIntegration.test.tsx`
14. `tests/menuMainMenu.test.tsx`

The separately verified retained pending-owner report is published in the same
C4 source as release evidence, but it is not presentation copy and is not one
of these 14 paths.

Do not blindly cherry-pick the old commit. Reconcile its Changelog hunks with
all later truthful Unreleased entries, replace the bounded package and metadata
identity described below, then review every patch note, screenshot reference,
and test expectation against the exact `0.3.44` release state. The rejected
minor-version marketing title and every stale draft version literal must remain
absent. Live-Greater-Realm notice, Tier-I castle-allocation description, and
notification-gated admission description must remain absent until each claim
is supported by current evidence.

## A-layer release-identity boundary

The source-closure transition permits only five release-identity slots to vary:
the top-level `package.json` version, the top-level and root-package
`package-lock.json` versions, `FARCASTER_MINI_APP_CONFIG.description` in
`scripts/farcaster-miniapp-contract.mjs`, and `miniapp.description` in
`public/.well-known/farcaster.json`. C0 through C3 require all three version
slots to be exactly `0.3.43` and both descriptions to retain the current
Genesis 001 wording. C4 activation-client and every later reviewed phase
require all three versions to be exactly `0.3.44` and both descriptions to be
exactly:

> Explore a six-region world foundation. The core gameplay loop remains incomplete; invite-only Alpha.

Every other byte of these A-layer members remains pinned. In particular, subtitle, tagline,
Open Graph text, screenshot URLs, image contracts, and arbitrary Mini App text
are not release-identity substitution slots. Existing `0.3.43` strings inside
immutable screenshot filenames record the captured artifact and are not the
package version. Changing those references requires separately reviewed image
assets and closure bytes; a version transition cannot relabel them. Partial,
mismatched, duplicate, decoy, or out-of-phase substitutions must fail closed.
The source-closure manifest records these members with the explicit
`reviewed-release-transition-projection-sha256-v1` digest profile, rather than
mislabeling their canonical projection digests as raw file SHA-256. The Pages
workflow uses the distinct composed release-transition-plus-bootstrap-pin
profile because both exact projections apply to that path.

The `0.3.44` release notes must call this a world-foundation update and state
plainly that the core gameplay loop remains unfinished. They must not imply
that construction, units, combat, alliances, Realm Chat, or any other dormant
system is available. A larger, livelier map is meaningful progress, but it is
not by itself a completed game loop or a semantic-versioning minor milestone.

The Unreleased Changelog descriptions of bounded ambient boats and the
fail-closed notification implementation intentionally remain in pre-generation
source: they describe dormant reviewed code and explicitly disclaim live
activation. Do not duplicate or remove those truthful engineering notes when
preparing the activation-client release entry.

## Reapplication gate

Reapplication belongs only in the reviewed activation-client source after all
of the following are true and bound to the same release:

- the protected production module is active v17 and its private active evidence
  and public postflight are accepted;
- the client and server presentation gates are intentionally enabled by their
  separately reviewed activation change;
- existing-player relocation, new Tier-I founding, Workers, and all four
  gathering paths have passed the production canaries;
- Tier-II and Tier-III player access remains closed; and
- any admission-notification wording reflects the actually approved bridge,
  Pages, Hermes, receipt, and exactly-once admission phase at deployment time.

If any condition is not yet true, retain Alpha `0.3.43` presentation. Do not
publish the `0.3.44` identity early or revive the rejected presentation. This
handoff grants no import, activation, deployment, notification, or admission
authority by itself.
