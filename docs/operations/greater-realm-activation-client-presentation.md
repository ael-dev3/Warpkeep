# Greater Realm activation-client presentation handoff

Status: **deferred; not live presentation**

The inert and pre-generation source must continue to identify itself as Alpha
`0.3.43` and must not state that the Greater Realm is live. Commit
`418a79ce3ace98716f473b54909887a8fe9b639e` prepared the Alpha `0.4.0`
presentation, but those player-facing bytes are deliberately forward-reverted
until the coordinated activation-client release.

## Exact deferred file set

The activation-client change must review and intentionally reapply the relevant
`418a79c` diff for exactly these 13 paths:

1. `CHANGELOG.md`
2. `index.html`
3. `package-lock.json`
4. `package.json`
5. `public/.well-known/farcaster.json`
6. `scripts/farcaster-miniapp-contract.mjs`
7. `src/components/menu/latestPatchNotes.ts`
8. `tests/buildInfo.test.ts`
9. `tests/deploymentBase.test.ts`
10. `tests/farcasterMiniAppContract.test.ts`
11. `tests/latestPatchNotes.test.ts`
12. `tests/menuFarcasterAuthIntegration.test.tsx`
13. `tests/menuMainMenu.test.tsx`

Do not blindly cherry-pick the old commit. Reconcile its Changelog hunks with
all later truthful Unreleased entries, then verify that every user-facing claim
matches the exact release state. In particular, `THE GREATER REALM OPENS`, the
`0.4.0` package identity, six-region metadata, live-Greater-Realm notice, Tier-I
castle-allocation description, and notification-gated admission description
must remain absent until each claim is supported by current evidence.

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

If any condition is not yet true, retain Alpha `0.3.43` presentation or revise
the proposed `0.4.0` wording so it cannot announce unavailable behavior. This
handoff grants no import, activation, deployment, notification, or admission
authority by itself.
