# Controlled lifecycle process identity — 2026-09-07

Base: `08e3f7bf9423c817507f3969207aa5be66630f5a`.

Hosted Verify run `34066214945` failed 17 lifecycle tests at the locked-source
helper's ownership validation. The fixture already supplied UID-1000 file
metadata, but its process UID remained the ambient runner account. The helper
correctly rejected that mismatch before reaching the behaviors being tested.

A disposable Linux copy reproduced exactly 17 failures and 26 passes by setting
the copied test process's ambient `getuid()` to 1001. The first failure reached
`canonicalDirectory` in `ptr-binding-locked-source-build-core.ts:679` with
`PTR_LOCKED_SOURCE_BUILD_INPUT_INVALID`, matching the hosted failure.

The controlled lifecycle now supplies matching process identity before each
test and restores it afterward. Wrong file owners 999 and 1001 still reject
before compiler commands. Production checks and native-owner tests are unchanged.
This is simulated identity for component tests, not authenticated runtime proof.

Verification:

```text
wsl -d Ubuntu-24.04 -- /tmp/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/.superpowers/binding-parent-linux-check.mjs --lifecycle --ambient-owner
Before: 17 failed, 26 passed.
After: 43 passed; exit 0, 1.76 seconds.

.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/localBindingRuntimeLifecycle.test.ts
Windows: 43 passed; exit 0, 10.24 seconds.

.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -b
exit 0
```

The ignored diagnostic runner copies current source into a disposable Linux
directory and injects the ambient UID only in that copied test. Independent
bounded review approved the fix. A fresh hosted CI result is still required;
this does not resolve other failing suites or establish full release readiness.
