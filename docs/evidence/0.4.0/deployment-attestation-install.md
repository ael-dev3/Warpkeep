# Deployment attestation installation checkpoint — 2026-09-07

Implementation commits: `30d7908` and `e208996`.

The existing attestation derivation/readback module now exports
`installWarpkeepDeploymentAttestation`. It validates the build contents and
identity data before mutation, exclusively creates the attestation without
overwriting an existing file, fsyncs the output and directories, and verifies
the actual installed artifact through a fresh content scan.

Installation requires Linux/WSL. A held, identity-checked dist directory
descriptor and a no-follow well-known directory descriptor anchor writes
through `/proc/self/fd`. The Windows implementation deliberately refuses
installation; derivation/readback remain available. Failed installations are
not silently removed because their paths may have been replaced; use disposable
build candidates and inspect failures.

The fresh local Linux clone at
`/tmp/warpkeep-attestation-install.logAv0lN/repo`, source `e208996`, ran:

```text
node node_modules/vitest/vitest.mjs run tests/deploymentAttestation.test.ts --maxWorkers=1
31 passed, 1 skipped (Windows-only refusal test)
```

This includes real file installation/readback, duplicate refusal, preserved
Farcaster metadata, changed-content rejection, and a directory substitution
test that proves the outside target stays empty. Synthetic identity values in
these tests are not release authority. Ordinary local Linux dependencies were
used, not a production toolchain attestation. Targeted strict TypeScript passed.

The first Windows run had 26 passing tests, five platform skips, and one
failure from the default ten-second cleanup hook deleting the real 20,000-file
boundary fixture. Cleanup now has a bounded 60-second allowance; no archive
limit or assertion was relaxed.
The corrected Windows rerun passed: 27 tests passed, five Linux-only skips,
18.85 seconds. It includes the explicit native-install refusal check.

Remaining: source-authenticated CLI composition, protected `deploy-recovery`
workflow, exact artifact upload/issue/claim/deploy/postflight integration. The
CLI remains explicitly unavailable; this API does not authenticate its caller's
identity fields, approve source, or authorize deployment. No final release
artifact or production deployment was created by this checkpoint.

## Committed-source reader checkpoint

`985b526` adds `readRecoveryAttestationSource(repositoryRoot)`. It derives
candidate commit/tree and core/closure coordinates from local Git and the fixed
schema-2 binding path, checks the single preparation parent/tree, exact three-file
activation delta, regular blob modes, current file bytes, clean tracked source,
and exact package/lock version-only transformation. It rejects index flags that
can hide dirty files and does not inherit caller Git configuration environment.

Seven real temporary-Git-repository tests passed in Linux. Together with the
installer suite, the run at `985b526` passed 38 tests with one Windows-only skip.
The earlier five-test version also passed on Windows. These fixtures contain
synthetic bindings, not live receipts. This reader checks local consistency;
it does **not** verify protected GitHub main, receipt authenticity, or the
contents represented by the closure digest. It is not yet connected to the
installer CLI and must not be substituted for those release authority checks.
