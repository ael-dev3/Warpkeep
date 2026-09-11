# 0.4 workflow sufficiency audit

Updated 2026-09-11 (Europe/Budapest) against published head
`4ce970ff43be176c3f4e0e9a6c9d3b22f19b6f83` on
`codex/prepared-keep-bindings-fix`.

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

- The current-head Verify and CodeQL runs for `4ce970ff` are still pending or in
  progress; R14 cannot be green until their terminal results are read.
- Protected `main` requires signed commits. The prepared branch history is
  unsigned, so GitHub reports the pull request as merge-blocked even when the
  code and checks are green.
- The full Windows rendered matrix still fails closed on a Chrome runtime
  exception. Linux is the release authority for retained rendered evidence.
- Fresh native preparation and independent checking now pass from the exact
  published head `867c70d7`, with a converged candidate, closure and public
  boundary. This closes the local R13 preparation gap; it does not itself grant
  deployment authorization or complete the release freeze.
- The production workflow has no authenticated provider receipts for Cloudflare,
  SpacetimeDB deployment, recovery readback, G002 import/publication or PTR
  owner provisioning. Those operations intentionally remain fail-closed or
  `unsupported`.
- No fresh owner journey, physical-device performance measurement, G001
  production baseline/preservation proof, G002 denial proof or final live
  release verification is recorded.
- Legacy durable Pages and notification workflows still target macOS/ARM64;
  therefore the no-Mac end-to-end delivery requirement is not met even though
  the local rendered QA tooling is portable.
- Dependabot currently reports nine alerts on the default branch (three high,
  six moderate); this is a maintenance risk to resolve before a production
  freeze.

## Required order from here

1. Read the terminal current-head protected checks and reconcile the review/
   signed-history requirement.
2. Run fresh native preparation/check from the exact reviewed source, then retain
   the resulting family and closure evidence.
3. Complete authenticated recovery deployment and readback before any live
   mutation; capture the G001 baseline and prove G002 remains sealed.
4. Complete the actual owner PTR journey, lifecycle/isolation checks and fixed
   device/performance measurements.
5. Re-run the full rendered matrix on the release authority, then deploy Pages,
   Cloudflare and SpacetimeDB from the same reviewed source.
6. Perform live G001 preservation, G002 denial and owner-journey verification,
   and only then mark R01–R18 complete and produce the Desktop handoff.

Until those records exist, the honest state is **development-ready and
release-preparation-ready, not ship-ready**.
