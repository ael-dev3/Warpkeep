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

On 2026-09-28, `npm run qa:rendered-webgl` passed its complete local Windows
browser matrix on the current candidate: 15 rendered cases, shader fallback,
Worker lifecycle, six locomotion checks, occupancy stress, 25 journeys, the
loopback LOD boundary, LOD fidelity and High/Balanced/Reduced metrics. One
initial Android Chrome-emulation attempt reported
`log-error-network-unclassified`; the two mobile touch cases then passed in
isolation and the full matrix passed on rerun. Keep the first warning in the
record, but treat it as non-reproducing runner noise rather than a waived case.
This is local rendered evidence, not physical-device or PTR acceptance.

The existing local cache contains the exact source archive at 10,672,929 bytes
with SHA-256
`c029a636ee0a791ca54072d5f32fcf68263677951fd59c338dfe242264335d5f`. The
release is attached to private `Warpkeep-Assets`; consequently the generic
unauthenticated fetch helper can return 404 on a fresh checkout. Use the
authenticated recovery command in the
[QA observatory](../../operations/qa-observatory.md) and verify the digest
before probing. Do not copy the archive into the repository or Desktop.
