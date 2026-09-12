# G002 gameplay root ABI expectation — 2026-09-07

The source-pin diagnostic at `19cf6fdedb5b0d69e439867337ccc8e84c3d8d12`
exposed a verifier expectation that predated the approved gameplay module.
The G002 index already registered initialize/get keep, dispatch/recall Worker,
start building, and scheduled gameplay execution. The verifier expected only
the lifecycle and atlas-import exports.

Updated only the verifier's literal complete-root expectation to include those
six exports and their six exact explicit names. Whole-root equality remains;
the scheduler spelling `run_gameplay_04_schedule_v_1` is preserved. No G002
module, admission rule, authentication code or database behavior changed.

## Verification

The existing positive root acceptance test failed before this correction with
`SEALED_LAUNCH_G002_ROOT_ABI_INVALID`. After correction, it passes and rejects
nine additional mutations: removal of each gameplay operation, wrong scheduler
spelling, altered canonical naming, and an additional bootstrap export. The
existing widened lifecycle export case remains rejected.

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/sealedLaunchVerifier.test.ts -t "rejects a widened G002 root ABI"
1 passed, 152 intentionally unselected; 592 ms; exit 0.

.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/gameplay04KeepModules.test.ts tests/gameplay04WorkersModules.test.ts tests/gameplay04ConstructionModules.test.ts
35 passed in 3 files; 1.18 s; exit 0.

.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -b
exit 0.
```

The module suites execute bundled implementation with controlled contexts and
include G002 closed-access rejection before storage for keep, Worker, scheduler
and construction calls. They are not live database zero-write evidence.
Independent bounded review approved the exact ABI expectation correction.

The Linux diagnostic using the generated source-pin verifier now advances to
`SEALED_LAUNCH_G002_ADMIN_AUTHORITY_INVALID`; preparation is still failing.
Inspection found another generated-pin family: 26 inline source/hash pairs in
the G002/PTR security checks (some source keys occur twice), separate from the
named source constants already supported by the helper. Ten of those pair
occurrences are stale in current local source. Next: derive this fixed inline
family mechanically with exact occurrence checks, not replace historical hashes
or disable the security checks. Complete refreeze and live deployment remain open.
