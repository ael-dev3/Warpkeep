# 0.4 workflow sufficiency audit

Updated 2026-09-12 (Europe/Budapest). The release-path audit read published head
`2ffdcc96ea3474908d2158ee817b4a384b274523` on
`codex/prepared-keep-bindings-fix`; concurrent working-tree changes are not
covered by that checkpoint. The latest recorded native preparation/check input
is `03cb8b8fc2c0c59bcb58c4303b2082dead6325d9`. Later gameplay and workflow
changes require fresh preparation before release. For historical source/test
head `95945bea`, Verify run `34665737857` completed successfully across Linux,
SpacetimeDB, release-recovery, auth-bridge, native-contract and aggregate
verification; CodeQL `34665737866` is also successful. The Pages
private launcher and workflow use the retained Linux x64 runner profile, and
the closure verifier derives toolchain pins per workflow profile. Native
preparation/check evidence covers the recorded source input.

## Verdict

The workflow is sufficient for disciplined 0.4 development, local verification,
candidate preparation and protected preflight. It is not sufficient for shipping
the game. The release checklist remains the authority: every R01–R18 gate needs
fresh evidence bound to the final reviewed and deployed source.

## What is working

- Windows, GitHub and native WSL have a documented synchronization procedure;
  verify their actual commit and worktree state at each publication checkpoint.
- The local foundation passes typecheck, build, visual-foundation checks and the
  focused gameplay/recovery suites recorded in the release evidence.
- The rendered WebGL observer now has a reviewed macOS/Windows/Linux boundary;
  the Windows archive/cache path uses the attested system `tar.exe`.
- The dedicated Linux runner is installed and can run the sealed preflight and
  activation-evidence lanes. G001 policy observation is parsed and fails closed
  when runner or provider authority is missing.
- Native release preparation and independent checking passed for recorded input
  `03cb8b8f`, with converged candidate, closure and public-boundary verification.
  That historical candidate does not attest later source edits.
- The protected CI shape is explicit: `verify`, `auth-bridge`,
  `spacetimedb-module`, `analyze` and `CodeQL` are required contexts.

## What is not yet sufficient

- The protected Verify and CodeQL runs attached to the current pull request head
  are the R14 authority; read both at terminal state before marking CI green.
  R14 also requires normal protected merge eligibility.
- Protected `main` requires signatures, linear history and strict required
  checks; the repository permits squash merges only. The API audit found PR #228
  `MERGEABLE`, `BLOCKED`, zero commits behind main, and Linux/SpacetimeDB checks
  still running. Current main is a verified GitHub-authored single-parent squash.
  These observations do not establish missing local signing keys as an
  independent blocker. Recheck eligibility after terminal CI without changing
  protections or rewriting development history merely to satisfy an assumption.
- Final-source rendered and physical-device evidence remains required after
  runtime changes. Earlier synthetic Windows passes retain their recorded scope.
- The recorded native candidate has `finalReleasePrepared: false`. It proves
  candidate convergence and source integrity for its input; it does not grant
  deployment authorization or complete the release freeze.
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
  completed. The Linux lane selects its own workflow identity and real Linux
  executables; it replaces the historical Darwin prepared caller. B0 is an
  existing predecessor, not another migration to execute. Preserve and
  authenticate its retained evidence; do not rerun B0. The public bridge
  attestation still reports reviewed B0 source `308f901d` and enabled
  notification delivery. Fresh private and Cloudflare source/configuration
  attestation remains required.
- The Linux prepared and sealed workflows are absent from inspected protected
  main `9eb98e78`. The notification environment has existing provider/admin and
  owner secret slots, but this is not proof that their values are valid. The
  public immutable PTR database identity is absent from repository/environment
  variables and secret inventories. The working-tree Linux caller now consumes
  the canonical repository variable, preserving secrets for private credentials.
  Follow the sealed-launch Phase 1 target binding before prepared deployment;
  never substitute the G001 database.
- Deployment/binding, import and owner attesters in the sealed workflow entries
  still use unavailable adapters. The production workflow explicitly rejects
  unsupported realm operations. These integration gaps, populated private
  authority and provider readback remain the no-Mac delivery work.
- Recheck default-branch dependency alerts before a production freeze; a patched
  development lockfile does not establish default-branch resolution.

## Required order from here

1. Read terminal checks for the actual published head and reconcile normal
   protected squash eligibility. Preparation-source promotion and live activation
   are separate outcomes; do not alter branch protections to promote source.
2. Put the reviewed Linux workflows on protected main, verify its own required
   CI and installed generated family, then dispatch the existing read-only
   `preflight` operation to establish the genuine runner/source/private-root path.
3. Resolve the actual isolated PTR identity and re-attest the existing B0
   predecessor. Complete the Linux prepared bridge, authenticated recovery
   deployment/readback and missing sealed-provider producers. Capture the G001
   baseline and preserve the sealed G002 state before player-state mutations.
4. Complete the actual owner PTR journey, lifecycle/isolation checks and fixed
   device/performance measurements.
5. Re-run the full rendered matrix on the release authority, then deploy Pages,
   Cloudflare and SpacetimeDB from the same reviewed source.
6. Perform live G001 preservation, G002 denial and owner-journey verification,
   and only then mark R01–R18 complete and produce the workspace handoff at
   `artifacts/delivery/0.4.0/`. Follow the
   [output and retention rules](../../engineering/development-workflow.md#output-locations-and-retention);
   do not create new Desktop output.

Until those records exist, the honest state is **development-ready and
release-preparation-ready, not ship-ready**.
