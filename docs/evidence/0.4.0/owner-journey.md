# 0.4 owner journey evidence

Recorded 2026-09-09 from the Windows development checkout. This record is an
evidence boundary, not a claim that the live owner journey is complete.

## What is covered

- `tests/fullstackLocalQaSecurity.test.ts`: 49/49 tests passed after the
  browser-runtime adapter and Windows path normalization were applied.
- `npm run typecheck -- --pretty false`: passed.
- `npm run verify:visual-foundation`: 3/3 tests passed.
- `npm run qa:fullstack:local`: reached the disposable runtime and failed
  closed at `cli-attestation` before any database, browser, owner, or player
  state was created. The repository's pinned SpacetimeDB attestation currently
  has reviewed binaries for `darwin-arm64` and `linux-x64`, but no Windows
  binary record.

The local browser lane now has a platform boundary for both supported browser
hosts. macOS continues to use the signed Chrome application contract. Windows
uses the fixed Chrome installation path, an isolated profile, offline resolver
flags, numeric loopback CDP checks, and a bounded process-tree teardown. This
removes the browser host mismatch without weakening the database attestation.

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
