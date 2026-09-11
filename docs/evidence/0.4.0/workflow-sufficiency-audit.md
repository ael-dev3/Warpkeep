# 0.4 workflow sufficiency audit

Updated 2026-09-11 (Europe/Budapest) against source-bound implementation head
`cea2907191cd13c041e71533a2b62cf6641b4ad1` on
`codex/prepared-keep-bindings-fix`; the Linux lane implementation is the
preceding commit and the native preparation evidence cited below remains bound
to the earlier implementation checkpoint.

## Verdict

The workflow is sufficient for disciplined 0.4 development, local verification,
candidate preparation and protected preflight. It is not sufficient for shipping
the game. The release checklist remains the authority: every R01–R18 gate needs
fresh evidence bound to the final reviewed and deployed source.

## What is working

- Windows, GitHub and native WSL are synchronized at the exact clean head.
- The local foundation passes typecheck, build, visual-foundation checks and the
  focused gameplay/recovery suites recorded in the release evidence.
- The rendered WebGL observer now has a reviewed macOS/Windows/Linux boundary;
  the Windows archive/cache path uses the attested system `tar.exe`.
- The dedicated Linux runner is installed and can run the sealed preflight and
  activation-evidence lanes. G001 policy observation is parsed and fails closed
  when runner or provider authority is missing.
- Native release preparation and independent checking passed for the earlier
  functional source checkpoint, with closure and public-boundary verification.
- The protected CI shape is explicit: `verify`, `auth-bridge`,
  `spacetimedb-module`, `analyze` and `CodeQL` are required contexts.

## What is not yet sufficient

- The earlier docs-follow-up Verify runs were superseded when later commits
  advanced the branch. The last recorded protected snapshot had
  `auth-bridge`, `native-contract` and `release-recovery` passing; each later
  documentation-only head requires its own terminal current-head read. R14
  cannot be green until the latest `verify`, `spacetimedb-module`, `analyze`
  and `CodeQL` contexts reach terminal success and the signed-history
  requirement is reconciled.
- Protected `main` requires signed commits. The prepared branch history is
  unsigned, so GitHub reports the pull request as merge-blocked even when the
  code and checks are green.
- The full Windows rendered matrix still fails closed on a Chrome runtime
  exception. Linux is the release authority for retained rendered evidence.
- Fresh native preparation and independent checking pass for the earlier
  source-bound implementation, with a converged candidate, closure and public
  boundary recorded in the execution handoff. The new workflow head still needs
  its own native preparation; neither evidence set grants deployment
  authorization or completes the release freeze.
- The production workflow has no authenticated provider receipts for Cloudflare,
  SpacetimeDB deployment, recovery readback, G002 import/publication or PTR
  owner provisioning. Those operations intentionally remain fail-closed or
  `unsupported`.
- No fresh owner journey, physical-device performance measurement, G001
  production baseline/preservation proof, G002 denial proof or final live
  release verification is recorded.
- The prepared notification caller now has a dedicated Linux x64 workflow,
  runner entrypoint and pinned pnpm authority manifest. It is source-verified
  and included in the protected closure, but no authenticated production run
  or recovery readback has been completed. B0 and Pages private lanes still
  target the legacy Darwin/ARM64 workflow and immutable
  `/private/var/db/warpkeep/...` paths, so the no-Mac end-to-end delivery
  requirement remains open.
- Dependabot currently reports nine alerts on the default branch (three high,
  six moderate); this is a maintenance risk to resolve before a production
  freeze.

## Required order from here

1. Read the terminal current-head protected checks and reconcile the review/
   signed-history requirement.
2. Run fresh native preparation/check from the exact reviewed source, then retain
   the resulting family and closure evidence.
3. Dispatch the new Linux prepared notification/recovery workflow against the
   exact protected source, capture authenticated deployment/readback evidence,
   then port B0 and Pages private callers without weakening identity,
   ownership or executable checks; retain the Darwin lane only as an explicitly
   separate legacy profile.
4. Complete authenticated recovery deployment and readback before any live
   mutation; capture the G001 baseline and prove G002 remains sealed.
5. Complete the actual owner PTR journey, lifecycle/isolation checks and fixed
   device/performance measurements.
6. Re-run the full rendered matrix on the release authority, then deploy Pages,
   Cloudflare and SpacetimeDB from the same reviewed source.
7. Perform live G001 preservation, G002 denial and owner-journey verification,
   and only then mark R01–R18 complete and produce the Desktop handoff.

Until those records exist, the honest state is **development-ready and
release-preparation-ready, not ship-ready**.
