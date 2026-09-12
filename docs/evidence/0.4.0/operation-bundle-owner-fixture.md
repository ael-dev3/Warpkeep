# Operation bundle ownership fixture — 2026-09-07

CI run 34081082873 rejected the clean-source expectation in `localOperationBundleRuntime.test.ts`. The test created files as the ambient runner user, while the real materialized-source reader requires UID 1000 on non-Windows platforms. Windows passed all 18 tests. The CI failure is consistent with an ownership mismatch, but the downloaded failure log did not independently report the runner UID.

The test now checks the actual fixture owner: Windows or UID 1000 expects acceptance; any other Linux owner expects rejection even when bytes/hash match. Every host still checks rejection after mutation. No production reader, fixed UID, source digest or release pin changed.

To retain direct positive Linux evidence independently of the hosted runner user, `tests/fixtures/operation-materialized-owner-check.mjs` runs the actual core verifier against disposable real files. Executed through the existing pinned WSL Node 22.22.3 runtime on Ubuntu 24.04, it returned `{"platform":"linux","uid":1000,"acceptedOwner":true,"mutationRejected":true}` and exited zero. This proves acceptance plus changed-byte rejection on the required local owner profile; it is not a complete bundle build or release freeze.

The same fixture ran in an unprivileged user namespace via `/usr/bin/unshare --user --map-user=1001 --map-group=1001` with the same pinned Node. It returned `{"platform":"linux","uid":1001,"acceptedOwner":false}` and exited zero, directly confirming rejection of an otherwise valid file owned by UID 1001. This changed only the disposable process namespace, not host accounts or production ownership.

The WSL Vitest attempt could not start because the Windows dependency tree has no Linux Rolldown native binding. No dependency tree was changed; the dependency-free fixture supplied the Linux checks instead. The Windows suite passed 18 tests and root TypeScript exited zero. CI must independently rerun before its failure is called resolved.

Separate inspected failure: `sealedLaunchActivationGenerator.test.ts` still stops with `SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE` from the retired callback authority path. That refusal remains intact. Completing the authenticated Task 6E/recovery integration, not restoring arbitrary callback authority, is required.
