# 0.4 owner journey evidence

Recorded 2026-09-09 from the Windows development checkout. This record is an
evidence boundary, not a claim that the live owner journey is complete.

## 2026-09-29 Windows candidate full-stack rerun

Exact candidate `4e3d7cd30fd094183c5511ca569ef2cecf9d09fe` passed
`scripts/qa-observer/local-fullstack-browser-probe.mjs` on the attested
Windows Node 22.23.2 runtime and SpacetimeDB CLI 2.6.1. The disposable in-memory
database and isolated Chrome run covered six responsive menu profiles, the
exact-current server Terms continuity skip, City Mill construction/completion,
discounted Lumber Camp construction with one Builder, hard-reload persistence,
fresh-browser Worker re-entry, delayed and failing private reads, timeout and
visibility seams, the canonical local realm fixture, four resource
dispatch/return paths, recalls, automatic settlement, and released-node reuse.
The probe completed successfully and removed its temporary database, CLI
attestation, and browser profiles.

This remains synthetic integration evidence. The current Terms fixture caused
one continuity subcase to be skipped; the run does not establish real identity,
the owner's atlas-route timing, production persistence, a physical-phone result,
or live PTR acceptance. The checked-in sealed-launch verifier at this source
still reports `pagesDeploymentApproved: false`, package `0.3.43`, no G001/G002/
PTR database identities, and PTR presentation disabled.

## What is covered

- `tests/fullstackLocalQaSecurity.test.ts`: 49/49 tests passed after the
  browser-runtime adapter and Windows path normalization were applied.
- `npm run typecheck -- --pretty false`: passed.
- `npm run verify:visual-foundation`: 3/3 tests passed.
- `npm run qa:inner-keep`: 18/18 synthetic Inner Keep browser cases passed on
  Windows after the platform-aware Chrome adapter was wired into the standard
  probe. This covers construction, completion, fallback, reduced motion and
  responsive presentation without a Mac runner or SpacetimeDB. It remains
  renderer evidence, not owner/device/performance acceptance.
- `npm run qa:fullstack:local`: reached the disposable runtime and failed
  closed at `cli-attestation` before any database, browser, owner, or player
  state was created. At the time of this run, the repository's pinned
  SpacetimeDB attestation had reviewed binaries for `darwin-arm64` and
  `linux-x64`, but no Windows binary record. The manifest has since gained
  `win32-x64` CLI and standalone digests; this historical failure is not a
  current Windows-platform conclusion.
- The Windows synthetic Keep04 browser lane then captured run
  `windows-run-q9Jo7j`: 36 bounded cases, 36 exact server-policy document
  guards, a valid installed Chrome identity, and verified owned-process cleanup.
  Desktop and 390px portrait outputs were spot-checked, including empty and
  completed-keep states. This is rendered evidence of the current page, not
  owner/device acceptance: the checkout had unrelated substantive changes, so
  the report correctly marks `stableSource: false`, and sustained performance
  was not measured.

The first rerun failed because Vite watched the disposable Chrome profile's
locked SQLite files and Windows raised `EBUSY`. `vite.config.ts` now excludes
the generated `.cache` profile surface from the source watcher; the exact
policy response and this regression are covered by
`tests/keep04DocumentPolicy.test.ts`. Generated capture output is ignored by
the repository and remains available locally for review.

The local browser lane now has a platform boundary for both supported browser
hosts. macOS continues to use the signed Chrome application contract. Windows
uses the fixed Chrome installation path, an isolated profile, offline resolver
flags, numeric loopback CDP checks, and a bounded process-tree teardown. This
removes the browser host mismatch without weakening the database attestation.

## 2026-09-28 Windows candidate full-stack rerun

Candidate `12f7ba60` passed `npm run qa:fullstack:local` on the attested Windows
toolchain. The current 0.4 client enters directly on the main menu, so the
probe now checks six desktop/mobile menu profiles instead of waiting for the
retired title gateway. It continued through synthetic sign-in and Terms, Inner
Keep City Mill start/completion and reload persistence, Lumber Camp start,
fresh-browser Worker reconnect/private-read recovery, four resource dispatches,
recall, settlement and return. This is disposable local synthetic evidence;
it does not establish real identity-provider behavior, physical-device comfort,
live backend state, or owner/PTR acceptance. See the
[execution handoff](../../agent-notes/0.4.0/execution-handoff.md) for the exact
candidate and release gates.

## 2026-09-27 WSL rerun

On main `786c0b2`, the disposable full-stack probe used pinned Node 22.22.3,
SpacetimeDB CLI 2.6.1, and installed Chrome stable 154 in WSL `WarpkeepRunner`.
`WARPKEEP_QA_CHROME=/opt/google/chrome/google-chrome` selected the regular-file
executable rather than a package symlink. The probe reached the Chrome title
gateway, then failed closed in `desktop-keyboard` after repeated WSLg OpenGL
`GPU stall due` driver warnings. No owner/browser journey pass or application
failure can be inferred. The current candidate source still needs a clean
disposable browser pass and live owner/PTR acceptance.

## What remains unverified

The following require an owner-approved PTR environment and are intentionally
not inferred from synthetic checks:

- the real owner authentication and admission route;
- dispatch, return, placement, construction, and the improved next return on
  the actual atlas;
- the ten-minute first-building and improved-return target;
- live-device mobile rendering and integrated performance acceptance.

The release checklist keeps R02 and R07 open until those owner-run artifacts are
captured. No owner token, FID, private profile, or production credential was
written to this repository or this record.
