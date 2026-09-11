# 0.4 workflow sufficiency audit

Updated 2026-09-11 (Europe/Budapest) against synchronized head
`7d920b9f57ec450071632fdc3f0b560f7526811a` on
`codex/prepared-keep-bindings-fix`. The Pages private launcher and workflow now
use the retained Linux x64 runner profile, and the closure verifier derives
toolchain pins per workflow profile. Fresh native preparation/check evidence
covers this head.

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
- Native release preparation and independent checking pass for the final
  synchronized head, with converged candidate, closure and public-boundary
  verification recorded in the local operations evidence.
- The protected CI shape is explicit: `verify`, `auth-bridge`,
  `spacetimedb-module`, `analyze` and `CodeQL` are required contexts.

## What is not yet sufficient

- The protected Verify and CodeQL runs attached to the current pull request head
  are the R14 authority; read both at terminal state before marking CI green.
  R14 also requires signed-history and protection reconciliation.
- Protected `main` requires signed commits. The prepared branch history is
  unsigned, so GitHub reports the pull request as merge-blocked even when the
  code and checks are green.
- The full Windows rendered matrix still fails closed on a Chrome runtime
  exception. Linux is the release authority for retained rendered evidence.
- Fresh native preparation and independent checking now pass for the final
  synchronized head, with `finalReleasePrepared: false`. This proves candidate
  convergence and source integrity; it does not grant deployment authorization
  or complete the release freeze.
- The production workflow has no authenticated provider receipts for Cloudflare,
  SpacetimeDB deployment, recovery readback, G002 import/publication or PTR
  owner provisioning. Those operations intentionally remain fail-closed or
  `unsupported`.
- No fresh owner journey, physical-device performance measurement, G001
  production baseline/preservation proof, G002 denial proof or final live
  release verification is recorded.
- The prepared notification caller has a dedicated Linux x64 workflow, runner
  entrypoint and pinned pnpm authority manifest. Pages private delivery now
  targets Linux x64 and its generic toolchain pin resolves to the Linux
  manifest. No authenticated production run or recovery readback has been
  completed. B0 and the legacy prepared caller still target Darwin/ARM64 and
  immutable `/private/var/db/warpkeep/...` paths, so the no-Mac end-to-end
  delivery requirement remains open.
- Dependabot currently reports nine alerts on the default branch (three high,
  six moderate); this is a maintenance risk to resolve before a production
  freeze.

## Required order from here

1. Read the terminal current-head protected checks and reconcile the review/
   signed-history requirement.
2. Dispatch the Linux prepared notification/recovery workflow and the migrated
   Pages private lane against the exact protected source, capture authenticated
   deployment/readback evidence, then port B0 and the legacy prepared caller
   without weakening identity, ownership or executable checks; retain Darwin
   only as an explicitly separate legacy profile.
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
