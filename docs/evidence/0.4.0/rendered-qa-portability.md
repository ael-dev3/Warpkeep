# Rendered QA portability checkpoint

## Scope

The rendered WebGL observer lane now has a platform-specific browser boundary:

- macOS keeps the reviewed Google Chrome application and `codesign` attestation.
- Windows uses the fixed installed Chrome executable, stable regular-file
  identity, disposable profile environment, and `taskkill` process-tree teardown.
- Linux uses fixed reviewed Chrome candidates, with an explicit absolute
  `WARPKEEP_QA_CHROME` override for hosts whose package installs elsewhere.

The hash-pinned castle LOD fixture is also portable. Windows uses the attested
system `tar.exe` for archive listing and extraction, while atomic cache writes
retain regular-file and symlink protections. POSIX ownership and permission
checks remain unchanged on macOS and Linux; Windows uses its native ACL model.

## Evidence

Verified on the synchronized Windows checkout:

- `npm run assets:fetch:castle:source-0.3.4` downloaded and verified the exact
  10,672,929-byte archive with SHA-256
  `c029a636ee0a791ca54072d5f32fcf68263677951fd59c338dfe242264335d5f`.
- The extracted GLB matched its recorded size and digest.
- `npm test -- tests/renderedWebglBrowserProbe.test.ts
  tests/systemUnzip.test.ts tests/writePinnedCacheFile.test.ts --maxWorkers=1`
  passed 54 tests; six POSIX-only permission or symlink cases are skipped on
  Windows because the host cannot create those fixtures.
- `npm run typecheck`, `npm run verify:visual-foundation`, `npm run build`, and
  `npm run qa:inner-keep` passed.

The full `npm run qa:rendered-webgl` matrix now reaches the real local Realm
fixture on Windows. It still fails closed on a Windows Chrome runtime exception
in the `desktop-high` case. This checkpoint therefore proves portability and
the asset boundary, but it does not claim rendered-release acceptance. Rerun
the matrix on the supported Linux runner and retain the exact failure category
if it reproduces.
