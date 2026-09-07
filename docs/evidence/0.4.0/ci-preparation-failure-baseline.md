# Preparation CI failure baseline — 2026-09-07

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
