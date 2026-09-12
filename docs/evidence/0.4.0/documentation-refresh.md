# Project and GitHub foundation refresh

Date: 2026-09-08, Europe/Budapest.
Source inspected: `781e51e364d1e5a7319ca2364744c8730e83b0d6`, plus the explicit
documentation, issue-template, and community-test overlay accompanying this record.

## Outcome

Refreshed the player-facing README, product direction, roadmap, architecture,
repository map, current development handoff, contribution/agent workflow, public
issue intake, source synchronization, and cross-repository ownership. Current user
goals take precedence over old planning restrictions. Live G001, sealed G002,
isolated owner PTR, implemented 0.4, and unverified acceptance are distinguished.

The asset archive retains its published manifests, source terms and history.
Water and editor repositories are described as planning/placeholder work, with
current implementation ownership in the game. Ael's profile and repository
descriptions use concrete product purposes without arbitrary inventory statistics.
Public metadata publication and protected main integration are separate from this
development source record; inspect their actual GitHub refs for current status.

## Verification and review

- Independent reviews checked product/visual accuracy, backend/caller ownership,
  infrastructure facts, public links, and outgoing source/privacy boundaries.
  Local Markdown targets resolved. Review corrected the already-fixed
  busy-Builder message status, the exact synthetic keep route, and source paths.
- Initial Windows run against committed `781e51e`: 33 passed, four failed. The
  community test assumed POSIX path separators; use `node:path.basename` while
  retaining all expected names and assertions. License fixtures encountered
  unsupported newline filenames, symlink permissions, and a timeout on Windows.
- After that path fix and the README/template overlay, Windows project-links,
  community-intake, and keep-controller lifecycle suites passed: 12 tests.
- Independent native Ubuntu/WSL checkout, Node `22.22.3`, npm `10.9.8`, dedicated
  dependency tree/cache, official runtime checksum verified: clean committed-base
  license verifier passed. With the recorded documentation/template/test overlay,
  `projectLinks`, `communityIntake`, and `licensePolicy` passed all 32 tests. The
  unchanged newline/symlink cases and default timeout passed on Linux.
- Ten focused outgoing suites passed all 199 tests: G001 sealed-launch adoption;
  G002 operators and publisher; PTR CLI and publisher; production activation
  records; recovery policy; keep scene host; gameplay controller and lifecycle.
- Gitleaks `8.30.1` with the repository configuration found no leaks in the exact
  previously unpublished `c42f6e6..781e51e` range. That checkpoint was pushed
  without force to the development branch, fetched, and verified equal to GitHub.
  Each subsequent documentation checkpoint requires its own outgoing scan and
  remote verification under the development sync procedure.

## Limits

These are documentation, source-review, and component verification results.
They do not establish a full-tree/CI pass, performance, physical-phone quality,
owner gameplay, recovery readiness, production deployment, or release completion.
No admissions, player state, deployment controls, or license terms changed.

Local raw diagnostic logs, overlay hashes, and reproduction scripts remain in the
session's `work/linux-verification/` and Windows verification logs. Only sanitized
findings belong in public Git. The [execution handoff](../../agent-notes/0.4.0/execution-handoff.md)
and [release checklist](../../operations/0.4.0-release-checklist.md) identify the
remaining game and delivery work.
