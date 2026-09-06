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
