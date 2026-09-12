# Task 1 report: one-capture all-realm binding composition

## Outcome

Implemented and committed one fixed no-argument all-realm Linux binding preparation operation. It captures one hardened independent committed source, derives four fixed source graphs from that capture, executes current G001, historical G001 compatibility, paired G002/PTR in sequence, reattests source and toolchain, and returns only the exact public result contract.

Source commit: `f597c4854a65d7da8ed962ffc98ceef90007e64f`

Changed source/test paths in that commit:

- `scripts/local-binding-runtime.mjs`
- `scripts/local-binding-runtime.d.mts`
- `scripts/local-binding-runtime-core.mjs`
- `scripts/local-binding-runtime-core.d.mts`
- `tests/allRealmLocalBindingComposition.test.ts`
- `tests/localBindingRuntimeParent.test.ts`
- `tests/localBindingRuntime.test.ts`

`scripts/local-binding-native-ts-hooks.mjs`, the lifecycle test, and the native-hooks test required no change because the four derived graphs already closed over the accepted hooks and worker entrypoints.

## Implementation

- Added `derivePreparedAllRealmLinuxBindings()` with zero accepted arguments. Explicit `undefined` rejects with `LOCAL_BINDING_RUNTIME_ARGUMENTS_INVALID` before core import.
- Added the private fixed core wrapper `deriveFixedAllRealmLocalBindingRuntime()` and private mode `all-realms`; callers cannot choose a profile or lane graph.
- Added CLI `--all-realms`. Its JSON summary includes metadata, binding counts and the six checked writer names only; it never serializes binding bytes, raw bundles, paths, credentials or G001 binding data.
- Extended fixed runtime predicates so all-realms attests Node22, Node24, PTR cache and Genesis002 cache namespaces.
- Selected the hardened independent snapshot with `useIndependentSnapshot = genesis001Current || allRealms` before source Git capture.
- Derived current-G001, compatibility, G002 and PTR graphs from the same captured source root.
- Added fixed composed parent execution in the required order: current G001, compatibility, then paired G002/PTR.
- Current and compatibility use immutable, disjoint lane contexts at `genesis001-current/` and `genesis001-compatibility/`; paired execution retains its disjoint `genesis002/` and `ptr/` roots. Every cycle materialization/handoff/generated path is unique.
- Preserved the existing compatibility proof agreement. The worker still places proof under the operation root derived from the snapshot repository root, process-group containment is still enabled, and the parent removes that proof only after accepting the strict compatibility result. Failures retain the operation root and diagnostics.
- Each lane identity is compared to the single captured commit/tree. Final success reattests bootstrap source, Node22/Node24, Git and the operation-owned CLI, then verifies captured Git `HEAD` and `HEAD^{tree}`.
- The core and public entrypoint independently project exact keys. G001 exposes metadata only. G002/PTR binding arrays and each `Uint8Array` are copied and frozen at both boundaries.

## TDD evidence

### Required RED

Command:

```powershell
& '.git/ci-node-22.22.3/node.exe' 'node_modules/vitest/vitest.mjs' run 'tests/allRealmLocalBindingComposition.test.ts'
```

Actual result: exit `1`; 1 test failed. The intended missing-export assertion was:

```text
AssertionError: expected undefined to deeply equal Any<Function>
Received: undefined
tests/allRealmLocalBindingComposition.test.ts:5:55
```

Subsequent RED cycles were observed before their implementations:

- Public projection test rejected the forwarding implementation because it returned the injected `privatePath` extra key.
- Core fixed-wrapper contract rejected because `deriveFixedAllRealmLocalBindingRuntime` was `undefined`.
- Parent composition suite rejected five tests because `executeFixedAllRealmLocalBindingParentCycles` was absent.
- CLI routing test rejected because `--all-realms` produced `LOCAL_BINDING_RUNTIME_ARGUMENTS_INVALID` rather than reaching fixed host validation.
- Source drift seam rejected because the composed source attester was absent.

### Covering GREEN

Command:

```powershell
& '.git/ci-node-22.22.3/node.exe' 'node_modules/vitest/vitest.mjs' run `
  'tests/allRealmLocalBindingComposition.test.ts' `
  'tests/localBindingRuntimeParent.test.ts' `
  'tests/localBindingRuntime.test.ts' `
  'tests/localBindingRuntimeLifecycle.test.ts' `
  'tests/localBindingNativeTsHooks.test.ts' `
  'tests/genesis001CurrentBindingCheck.test.ts'
```

Actual result: exit `0`; 6 test files passed; 138 tests passed and 4 Linux-only process tests were skipped on Windows. No test failed.

App TypeScript command:

```powershell
& '.git/ci-node-22.22.3/node.exe' 'node_modules/typescript/bin/tsc' `
  --project 'tsconfig.app.json' --noEmit `
  --tsBuildInfoFile '.git/tsbuildinfo/all-realm-binding-composition.app.tsbuildinfo'
```

Actual result: exit `0`, empty stdout/stderr.

Focused post-refactor confirmation: 2 test files passed, 39 tests passed, exit `0`.

Covered composition behavior includes exact public keys, defensive byte isolation, no G001 byte leakage, explicit-undefined rejection, CLI routing, exact same source on all seven worker requests, four correct fixed graphs, exact worker profiles/order, Node24 compatibility coverage through the existing lifecycle suite, public current-G001/PTR generation, private G002 generation, distinct lane/cycle paths, current mismatch, compatibility rejection, G002/PTR failures, source drift, cleanup error preservation, absence of later requests after an early failure, compatibility containment and proof cleanup.

## Native composed acceptance

Executed exactly once at committed source, using one uninterrupted process handle (unified exec session `92140`). Observation timeouts were polled on that same handle; the command was never restarted.

Command:

```powershell
& C:/Windows/System32/wsl.exe --distribution Ubuntu-24.04 --user snapmeter -- /usr/bin/env -i LANG=C.UTF-8 LC_ALL=C.UTF-8 /home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/scripts/local-binding-runtime.mjs --all-realms
```

Actual exit: `0`.

Captured identity:

- profile: `warpkeep-spacetime-binding-final-preparation-linux-x64-v1`
- source commit: `f597c4854a65d7da8ed962ffc98ceef90007e64f`
- source tree: `fd58cdf6914716efa52f63d62e0a13f845533c9c`
- local `HEAD` and `HEAD^{tree}` after acceptance matched those exact values.

Actual G001 current metadata:

- bundle SHA-256: `7811ce8485cb101e9bd864ca801ade3823353389832921554c757a847d8cf48a`
- dependency closure digest: `fcc9b32282ff947da96738a15735aa809919f9229e2861d9a53cb0c98acb6e62`
- binding file count: `180`

Actual G001 compatibility metadata:

- baseline bundle SHA-256: `179103343455b16a02cbb55205e867c6d4590cf7e9bb614c611d91f15e215801`
- frozen bundle SHA-256: `a2d7f204ed591aadb98696225d68332ee573519187e0989e68f528da8064cd49`
- baseline descriptor SHA-256: `cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03`
- frozen descriptor SHA-256: `cf3cbfff9087c04bd9de553410adb49100c40dbdecebc59e265f83cb904dd04d`
- checked frozen writers: `admin_allow_fid`, `admin_admit_founder_v1`, `admin_disable_fid`, `admin_bump_auth_epoch`, `access_request_submit_v1`, `admin_reset_access_request_v1`

Actual G002 metadata:

- bundle SHA-256: `0037a0979a460aea8607a36fccd649d4311046925faeb3d8186276ac0a6ccbd3`
- dependency closure digest: `3135e65b47acf95b174adcf10d9453955afabde9f122382a0166b0a9d5bc26d5`
- binding count: `50`

Actual PTR metadata:

- bundle SHA-256: `c5c2cc46d428e85c87352c341d1a5235a69336a960f566b0a91a484deba3ec4e`
- dependency closure digest: `acd9fe64d963d38715183a0451e6cc21b25abbfed5092c787d7e01842ab91901`
- binding count: `25`

Cleanup evidence: exit `0` occurs only after both the operation-owned CLI cleanup and recursive removal of the completed operation root. A post-run `ls -la --time-style=long-iso` showed the runs directory mtime advanced to `2026-09-06 11:16`, while every retained child root predates this run (latest retained child `2026-09-06 09:48`). Therefore this successful composed operation left no operation, lane, cycle, proof, generated or handoff root. Older retained diagnostic roots were preserved and not modified or deleted.

## Protected projection comparison

The comparison extracted the production constant, required exactly 34 roots, compared exact working file membership to `git ls-tree -r HEAD`, and compared every working file's Git blob hash to `HEAD:<path>`. Result: all 34 roots byte-identical to source `HEAD`.

```text
package.json (1)
package-lock.json (1)
spacetimedb/package.json (1)
spacetimedb/pnpm-lock.yaml (1)
spacetimedb/pnpm-workspace.yaml (1)
spacetimedb/tsconfig.json (1)
spacetimedb/src (110)
spacetimedb/scripts (1)
scripts/genesis001-frozen-materializer.mjs (1)
scripts/genesis001-frozen-materializer.d.mts (1)
scripts/genesis001-frozen-publisher-core.ts (1)
scripts/genesis001-frozen-publisher-runtime.ts (1)
scripts/genesis001-frozen-publisher.ts (1)
scripts/greater-realm-production-immutable-artifact.ts (1)
scripts/greater-realm-production-provenance.ts (1)
scripts/greater-realm-production-transport.ts (1)
scripts/production-admin-token-budget.mjs (1)
scripts/publish-spacetime-dev.mjs (1)
scripts/spacetime-cli-attestation.mjs (1)
scripts/hermes-admin.ts (1)
scripts/hermes-machine-output.ts (1)
scripts/founder-admission-authority.ts (1)
scripts/profiles/founder-admission-plan.ts (1)
scripts/access-requests/reset-plan.ts (1)
scripts/admission-notifications/recovery-plan.ts (1)
scripts/genesis001-census-privacy-safe-receipt.mjs (1)
scripts/genesis001-admission-monitor-suspension.ts (1)
scripts/greater-realm-legacy-production-seal.mjs (1)
scripts/greater-realm-production-publisher.ts (1)
scripts/greater-realm-production-publisher-core.ts (1)
scripts/greater-realm-production-import-operator.ts (1)
scripts/greater-realm-production-relocation-operator.ts (1)
scripts/greater-realm-downstream-release-policy.ts (1)
docs/operations/greater-realm-production-launch-envelope.sh.txt (1)
```

## Self-review and limitations

- Public G001 is metadata-only; neither current nor compatibility exposes generated bytes, raw bundles, filesystem paths or credentials.
- G002 alone uses `--include-private`; current G001 and PTR use public generation, while compatibility performs no binding generation.
- All seven worker requests are serial and share exactly one source commit/tree and root. No public operation is composed and no second snapshot is captured.
- Compatibility's pre-existing operation-root proof contract was intentionally preserved on both worker and parent sides; only its cycle/materialization root is lane-specific.
- All-realm uses immutable per-lane contexts and never mutates a shared graph field.
- A lane failure rejects before later lanes and keeps the incomplete operation root for diagnostics. Cleanup errors remain visible and are aggregated with any primary error.
- Existing legacy public operations and private modes remain unchanged except for freezing their already copied per-lane context objects.
- No dependency installation, provider operation, credentials, protected-path edit, source-generation write, refreeze, frontend integration or live deployment occurred.
- Four final operation bundles, atomic installation/refreeze, frontend integration and live deployment remain successor work; this task does not claim them complete.

## Fix round 1: composed cleanup-failure evidence

Review identified that the original tests exercised the cleanup error combiner and all-realm parent executor separately, but did not drive a cleanup failure after actual composed execution. Investigation found a real scoped defect: after a successful composition, a failure from `cliSource.cleanup()` was recorded, but the old `complete` branch still removed the operation root. The promise rejected, yet diagnostics were lost.

### Correction

Source fix commit: `910662b8708817a004ae808b17fa9c8cf7621685`

Changed paths:

- `scripts/local-binding-runtime-core.mjs`
- `scripts/local-binding-runtime-core.d.mts`
- `tests/localBindingRuntimeParent.test.ts`
- `tests/localBindingRuntimeLifecycle.test.ts`

The production outer runtime now uses one lifecycle settlement function. It records execution success or primary failure, attempts CLI cleanup, and removes a successful operation root only when either the mode is legacy or no CLI cleanup error occurred. For `all-realms`, a CLI cleanup failure rejects and retains the entire owned operation root. Legacy modes keep their prior cleanup semantics. A primary failure plus cleanup failure remains an `AggregateError` with the primary as `cause` and both errors preserved in order.

The lifecycle function is exposed only through `localBindingRuntimeTestSeams`. The fixed all-realm executor retains its one-argument declared/runtime interface. Mismatch injection uses an unexported symbol attached by a test-only seam, so no public operation or declared core API gains caller-selectable executors, profiles or graphs.

### RED evidence

Command:

```powershell
& '.git/ci-node-22.22.3/node.exe' 'node_modules/vitest/vitest.mjs' run `
  'tests/localBindingRuntimeParent.test.ts' `
  'tests/localBindingRuntimeLifecycle.test.ts'
```

Actual result before correction: exit `1`; 3 intended tests failed and 74 passed.

- The mismatch test resolved with a complete composed value instead of rejecting because the injected mismatched lane was not routed through the executor.
- The composed cleanup test failed because `runLocalBindingRuntimeLifecycle` did not exist.
- The lifecycle aggregation test received a `TypeError` for the same missing production lifecycle seam instead of the required `AggregateError`.

The internal-injection refinement was also observed RED: the focused mismatch test failed with `withAllRealmParentExecutors is not a function` before the unexported-symbol seam was added.

### GREEN evidence

Requested focused suites after the correction:

```text
Test Files  2 passed (2)
Tests       77 passed (77)
exit        0
```

Final affected suite command:

```powershell
& '.git/ci-node-22.22.3/node.exe' 'node_modules/vitest/vitest.mjs' run `
  'tests/allRealmLocalBindingComposition.test.ts' `
  'tests/localBindingRuntimeParent.test.ts' `
  'tests/localBindingRuntime.test.ts' `
  'tests/localBindingRuntimeLifecycle.test.ts' `
  'tests/localBindingNativeTsHooks.test.ts' `
  'tests/genesis001CurrentBindingCheck.test.ts'
```

Actual result: exit `0`; 6 test files passed; 140 tests passed and 4 Windows-inapplicable Linux process tests skipped; 0 failed.

App TypeScript command:

```powershell
& '.git/ci-node-22.22.3/node.exe' 'node_modules/typescript/bin/tsc' `
  --project 'tsconfig.app.json' --noEmit `
  --tsBuildInfoFile '.git/tsbuildinfo/all-realm-binding-composition-fix-1.app.tsbuildinfo'
```

Actual result: exit `0`, empty stdout/stderr.

The new parent integration test executes the real current-G001, compatibility and paired G002/PTR parent composition, creates a controlled diagnostic marker after composition, injects CLI cleanup failure through the production lifecycle function, and asserts:

- the lifecycle promise rejects as a one-error cleanup `AggregateError`;
- no lifecycle/public result resolves;
- the controlled diagnostics directory remains;
- all four actual lane roots remain.

The lifecycle suite separately injects primary plus CLI cleanup failure and asserts no resolution, ordered aggregation, primary `cause`, and retained diagnostics. The source-drift test now feeds a mismatched current-lane result through `executeFixedAllRealmLocalBindingParentCycles` and proves later compatibility/paired executors are never called.

Protected projection verification re-extracted all 34 production roots and compared exact working tree membership and Git blob identities with source `HEAD`: 34 roots checked, 0 failures. No protected path changed.

### Fresh native acceptance for fix source

The runtime source changed, so the composed native acceptance was rerun exactly once at the new committed source. It used unified exec session `35368`; every observation timeout polled that same handle and the process was never restarted.

Command:

```powershell
& C:/Windows/System32/wsl.exe --distribution Ubuntu-24.04 --user snapmeter -- /usr/bin/env -i LANG=C.UTF-8 LC_ALL=C.UTF-8 /home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/scripts/local-binding-runtime.mjs --all-realms
```

Actual exit: `0`.

- source commit: `910662b8708817a004ae808b17fa9c8cf7621685`
- source tree: `c92f92657fcacde583f1b8d26353f4b66fe37933`
- local `HEAD` and `HEAD^{tree}` matched those values after acceptance.
- G001 current: bundle `7811ce8485cb101e9bd864ca801ade3823353389832921554c757a847d8cf48a`, closure `fcc9b32282ff947da96738a15735aa809919f9229e2861d9a53cb0c98acb6e62`, 180 binding files.
- G001 compatibility: baseline bundle `179103343455b16a02cbb55205e867c6d4590cf7e9bb614c611d91f15e215801`, frozen bundle `a2d7f204ed591aadb98696225d68332ee573519187e0989e68f528da8064cd49`, baseline descriptor `cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03`, frozen descriptor `cf3cbfff9087c04bd9de553410adb49100c40dbdecebc59e265f83cb904dd04d`, exact six-writer tuple unchanged.
- G002: bundle `0037a0979a460aea8607a36fccd649d4311046925faeb3d8186276ac0a6ccbd3`, closure `3135e65b47acf95b174adcf10d9453955afabde9f122382a0166b0a9d5bc26d5`, 50 bindings.
- PTR: bundle `c5c2cc46d428e85c87352c341d1a5235a69336a960f566b0a91a484deba3ec4e`, closure `acd9fe64d963d38715183a0451e6cc21b25abbfed5092c787d7e01842ab91901`, 25 bindings.

Post-run cleanup evidence: the runs directory mtime advanced to `2026-09-06 11:45`, while every retained child predates this run (latest retained child `2026-09-06 09:48`). Thus the successful fix-source operation left no operation/lane/cycle/proof/generated/handoff root. Historical diagnostic roots were preserved without deletion or modification.

### Fix-round self-review

- Success behavior and emitted metadata remain byte-for-byte stable across the original and fix-source native acceptances.
- All-realm cleanup failure now retains diagnostics; successful all-realm cleanup still removes the owned operation root.
- Primary-plus-cleanup aggregation and no-partial-resolution behavior are covered.
- The mismatch attester is now tested in the composed executor rather than as an isolated helper.
- Test-only executor substitution is carried under an unexported symbol and absent from the declared fixed executor signature and public runtime API.
- Legacy modes, provider boundaries, credentials, dependency junction, protected projection and successor release scope remain unchanged.

## Fix round 2: preserve the first legacy cleanup diagnostic

Review found that the lifecycle refactor had changed one legacy edge case: after a
successful legacy operation, `cleanupCli()` and `cleanupSuccess()` are both still
attempted, but a failure from the second callback unconditionally replaced the
earlier CLI cleanup failure. The pre-refactor behavior retained the first cleanup
diagnostic.

### Correction

Source fix commit: `073875c462f942d36c1a929316410acaf720c660`

Source tree: `46254b2061c949209144366e6f82a4027426a00f`

Changed paths:

- `scripts/local-binding-runtime-core.mjs`
- `tests/localBindingRuntimeLifecycle.test.ts`

The legacy success-cleanup catch now uses `cleanupError ??= error`. This preserves
the CLI cleanup error when both cleanup callbacks fail, while still recording the
operation-root cleanup error when it is the only cleanup failure. The regression
test also asserts that legacy `cleanupSuccess()` is attempted exactly once, so the
fix does not weaken the prior cleanup behavior.

### RED evidence

Command:

```powershell
npm exec -- vitest --run tests/localBindingRuntimeLifecycle.test.ts `
  -t "preserves the first legacy cleanup failure when operation-root cleanup also fails"
```

Actual result before correction: exit `1`; 1 test failed and 40 tests were
skipped by the name filter. The received `AggregateError.errors` contained
`CONTROLLED_LEGACY_OPERATION_ROOT_CLEANUP`; the expected first diagnostic was
`CONTROLLED_LEGACY_CLI_CLEANUP`.

### GREEN evidence

The same focused command after the correction exited `0`: 1 test passed and 40
tests were skipped by the name filter.

Required suites:

```powershell
& '.git/ci-node-22.22.3/node.exe' 'node_modules/vitest/vitest.mjs' run `
  'tests/localBindingRuntimeParent.test.ts' `
  'tests/localBindingRuntimeLifecycle.test.ts'
```

Actual result: exit `0`; 2 test files passed and 78 tests passed.

App TypeScript:

```powershell
& '.git/ci-node-22.22.3/node.exe' 'node_modules/typescript/bin/tsc' `
  --project 'tsconfig.app.json' --noEmit `
  --tsBuildInfoFile '.git/tsbuildinfo/all-realm-binding-composition-fix-2.app.tsbuildinfo'
```

Actual result: exit `0`, empty stdout/stderr.

Protected projection verification re-imported the exact
`GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS` constant, required all 34 roots,
compared each root's exact filesystem membership with `git ls-tree -r HEAD`, and
compared every file's working blob with `HEAD:<path>`. Actual result:
`PROTECTED_ROOTS=34 FAILURES=0`. No protected path changed.

### Native evidence disposition

No native acceptance was repeated for this fix. The correction changes only the
legacy branch where `retainDiagnosticsOnCleanupFailure` is false and both cleanup
callbacks fail. All-realms passes true and skips `cleanupSuccess()` after a CLI
cleanup failure, so the changed nullish assignment is not reached in that case.
The successful all-realms native session `35368` at source
`910662b8708817a004ae808b17fa9c8cf7621685` therefore remains the applicable
composed-runtime evidence, as authorized for this exact restoration.

### Fix-round self-review

- The first cleanup error is again preserved for legacy modes.
- Legacy operation-root cleanup is still attempted after a successful operation,
  even when CLI cleanup fails.
- A lone operation-root cleanup failure is still reported because nullish
  assignment fills an otherwise empty cleanup slot.
- Primary-error aggregation and all-realms diagnostic retention paths are
  unchanged.
- No public interface, lane composition, provider boundary, credential handling,
  dependency junction, protected path or generated binding changed.
