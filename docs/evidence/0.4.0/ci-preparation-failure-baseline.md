# Preparation and CI evidence

## September 8: Python bytecode contaminated the exact checkout

At `5f06cb80c906ac0535fc32c80b415e8e85964b56`, the
[Linux job](https://github.com/ael-dev3/Warpkeep/actions/runs/34207699954/job/102001022993)
passed its main and serial test stages, then failed the checked-in sealed-launch
verifier with `SEALED_LAUNCH_CHECKOUT_INVALID`. CodeQL and the module,
native-contract, auth-bridge and release-recovery jobs passed at that source.

A fresh Linux checkout with matching locked dependencies reproduced the
post-suite rejection. The YAML generator boundary test imported the repository's
Python generator and left an untracked bytecode file under `scripts/__pycache__/`.
HEAD, tracked-file flags, tracked diffs and ignored protected-source probes passed;
the untracked-file probe identified the residue. The original reproduction was
retained without cleanup, and the verifier was not weakened.

The corrected boundary test imports an exact copied generator fixture with Python
`-B` and checks that its source-directory inventory is unchanged. Against base
`5aa6fdb7c8e9bd49e27c70df8c3eb64025c2e5ca`, the new regression failed without
`-B`; the corrected suite passed all four tests. Exact post-test probes found no
untracked or ignored protected files and no changes beyond the intended test edit.
This verifies the producing invocation; full CI at the integrated correction still
requires fresh readback.

The diagnostic main suite also encountered a separate ten-second timeout in the
terminal-generation live-receipt case. It passed unchanged when selected alone.
That supports load-sensitive timing, not an assertion correction or a timeout
fix. The source and timeout were left unchanged.

## September 8: materialize the update protocol's locked hash dependency

Native preparation of `5aa6fdb7c8e9bd49e27c70df8c3eb64025c2e5ca` stopped before
generated-family derivation. A focused build exposed the underlying G002 error:
`@noble/hashes/sha3` could not be resolved. Root test dependencies supplied it,
but the isolated operation-bundle materializer supplied only its compiler and
YAML packages. No candidate outputs from that failed preparation were integrated.

The materializer now includes the root-locked Noble package. Its complete file
inventory was derived from the integrity-verified archive and independently
compared with that archive. Package extraction retains exact membership, byte
hashes, owner/mode/link checks and post-compilation re-attestation. Bundle and
assembler graph verification accept only the pinned ESM files used by Keccak.
Recovery retains its separate compiler, YAML and archive-parser package set.

Isolated native fixtures copy tracked source without existing dependencies or
build outputs. G002 and PTR each produced identical bytes across two builds;
the real bundle loader accepted each from a package-free directory and observed
the expected unavailable-factory input rejection. The recovery bundle also built
reproducibly. Negative cases cover substituted lock records, missing/duplicate
archive members, same-length corruption, graph-byte mutation and post-use package
mutation. The known Keccak empty-input vector passed. This establishes the
dependency/build correction, not production update authority or a prepared release.

Focused package/cache/engine and runtime integration suites passed, as did app,
configuration and focused strict TypeScript checks. The Windows preflight run
passed six cases and skipped its 25 privileged native cases; it is not evidence
that those skipped cases ran. Independent review confirmed the archive inventory,
graph restrictions and the exact manifest addition to preflight attestation.

Full source-bound preparation, independent rebuilding and candidate verification
must run again after integrating the reviewed correction. Generated manifests
remain owned by that pipeline.

## Historical baseline — September 7

Authenticated GitHub CLI inspection of [Verify run 34107302925](https://github.com/ael-dev3/Warpkeep/actions/runs/34107302925)
at source `c801ec536e9a3b4685b798198d8319291cf98b36` found a completed failure,
not a stalled runner. The Linux suite finished in 1,461.25 seconds:
5 files failed, 565 passed, 1 skipped; 62 tests failed, 8,516 passed,
74 skipped. The activation-generator file failed during suite collection.
The database-module, auth-bridge, recovery, and native-contract jobs passed.
The aggregate Verify job correctly rejected its unsuccessful predecessor.

## Required follow-up against the assembled candidate

These are existing release requirements, not additions to the goal. Historical
results below do not establish the result of a newer source or generated candidate.

| Failing file | Observed failure | Required resolution/evidence |
| --- | --- | --- |
| `tests/authBridgeNotificationB0Closure.test.ts` | Derived and recorded closure namespaces differ; two cases fail. | Run against the complete mechanically derived candidate; exact namespace and count assertions must pass. |
| `tests/greaterRealmReleaseGateDeployBoundary.test.ts` | Recorded 997-member set differs from 1,027-member comparison set. | Derive the consumer with the full family; retain the exact deployment-boundary membership checks. |
| `tests/ptrPreparedDeployClosure.test.ts` | Derived 1,077-member set differs from recorded 1,027-member set. | Verify actual PTR dependencies are included by the generated inventory, not by weakening set equality. |
| `tests/sealedLaunchVerifier.test.ts` | Current source pins reject G001 current-state and G002 authority before many targeted mutation assertions are reached. | Execute the existing positive and mutation tests against the newly derived source-pin family; matching closure hashes alone do not prove these checks pass. |
| `tests/sealedLaunchActivationGenerator.test.ts` | Collection throws `SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE`. | Implement and verify the real Task 6E generator capability and reconciliation path. Pin derivation cannot repair an absent implementation. |

Reproduction of the historical evidence:

```powershell
gh run view 34107302925 --repo ael-dev3/Warpkeep --json jobs
gh run view 34107302925 --repo ael-dev3/Warpkeep --log-failed
```

Use the five named suites as a focused diagnostic on the complete disposable
candidate before the full mandatory suite. Do not change tests to expect success
from placeholders, type hashes by hand, or treat this historical run as evidence
for current source. Final release acceptance still requires all applicable CI,
gameplay, device, preservation, deployment, and recovery gates.

At inspection, current source `fd9bb480cd8b8f2fc0bf4b632ca4bff34059d2f4`
matched the development branch on GitHub. Its Verify run `34111350875` was
still in progress: auth-bridge, recovery, and native-contract passed; Linux
tests and database verification were running. CodeQL run `34111351315`
passed. These observations are snapshots, not a claim that current Verify passed.

## Source-pin candidate diagnostic

An independent Linux clone of `fd9bb480cd8b8f2fc0bf4b632ca4bff34059d2f4`
was prepared solely for diagnosis, separate from the running compiled-family
probe. `derivePreparedSourcePins({ repositoryRoot: process.cwd() })` generated
its two fixed outputs, the activation generator and sealed-launch verifier.
Only those generated files were mechanically installed in that disposable
checkout; this was not a native release transaction or final freeze. Ordinary
Linux test dependencies were used, not production toolchain attestation.

Running the unchanged `tests/sealedLaunchVerifier.test.ts` there produced
152 passes and one failure. The remaining test explicitly expected the old
G001 current-state pin mismatch from otherwise valid checked-in sources. The
generated verifier instead accepted those sources. This identifies an obsolete
transitional assertion, not a reason to retain stale pins.

The test now deliberately appends a source change to the G001 current-state
input and still requires the exact current-state rejection. The existing
positive acceptance and other mutation tests remain unchanged. With that one
test overlaid on the diagnostic candidate, all 153 tests passed (5.47 seconds),
including native Git history/index-flag checks. Targeted strict TypeScript
checking and `git diff --check` also passed.

```text
node node_modules/vitest/vitest.mjs run tests/sealedLaunchVerifier.test.ts --maxWorkers=1
```

This proves the source-pin derivation resolves that suite against the described
candidate. It does not make the unrefrozen development checkout fully green,
complete the activation generator capability, or establish live authority.
The regenerated production files remain confined to the diagnostic checkout.

## Current-source CI checkpoint — 2026-09-07 16:15 UTC

[Verify run 34140355528](https://github.com/ael-dev3/Warpkeep/actions/runs/34140355528)
tests source `2f8c9fd4da081bfa886d412522a03752264fab46`. Its completed Linux
job `101800722504` reports **6 failed files, 581 passed, 1 skipped** in
1,421.20 seconds. The five suites in the table above still fail. The sixth is
`preparedClosureCompilerLifecycle.test.ts`: its simultaneous import/disposal
failure fixture threw on an earlier valid graph root before reaching the
intended invalid import.

Local commit `16232f6` targets the disposal injection at the invalid-import
file and asserts that exactly one injected disposal failure occurred. It does
not change production validation. All 12 lifecycle tests pass on Windows and
in the isolated Linux dependency-repair checkout; root typecheck also passes.
This fix is not part of the CI source above and needs the next CI run.

The predecessor run `34139910959` also had a 10-second timeout in
`greaterRealmProductionPublisher.test.ts` for post-gate SIGKILL ambiguity.
That file is not among the failures in `34140355528`; recurrence is unproven.
No timeout or publish-safety assertion was relaxed.

The auth-bridge, native-contract and release-recovery jobs passed in the
current run. SpacetimeDB verification was still running when inspected;
this is not an aggregate CI pass. Retrieve the completed Linux evidence with:

```powershell
gh api repos/ael-dev3/Warpkeep/actions/jobs/101800722504/logs
```

Next-action boundary: the five existing failure families still need complete
candidate derivation and authenticated activation-generator integration.
Repeated CI retries alone cannot resolve them. Keep their assertions intact;
do not install a final freeze before gameplay and operating sources are ready.
