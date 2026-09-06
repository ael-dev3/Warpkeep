# Task 1 report — real local Genesis 001 upgrade proof

## Status

Complete on base `043007d5405f5f980e3ca2a3c24b2bad64a00e4b`. The fixed no-argument operation builds an authenticated historical Genesis 001 baseline twice, builds the frozen Genesis 001 source twice, proves both lanes reproducible and non-substitutable, publishes the baseline and frozen bundle into the same fresh loopback-only SpacetimeDB instance, verifies ABI and policy, invokes all six frozen writers under source-supported local admin authorization, proves each exact freeze guard plus unchanged authenticated state, contains the server process group, and returns only bounded frozen metadata.

No production endpoint, database, identity, credential, receipt, or operation was used. The only credentials were disposable ES256 keys generated inside the owner-private local operation root.

## Implementation

### Historical baseline authority

- Added the separately named `createGenesis001BaselineSourceMaterialization` beside the frozen materializer. It reuses `materializeGenesis001HistoricalBaseline` and the same authenticated historical materializer bytes; it does not edit or reconstruct historical helpers.
- The baseline metadata is exactly `{ baseline, baselineAbiSha256, extractedFileCount }`; no freeze nonce is accepted or emitted.
- Authenticated source authority remains commit `2ae51984e1fa6ce5b0028c1a250359fed79d819b`, tree `90deebb5faf4129282f5c35999244f540001b27d`, baseline ABI SHA-256 `cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03`, 207 inventory entries and 172 extracted files.
- An independent canonical inventory was derived from a real authenticated extraction using domain `warpkeep-genesis001-baseline-source-inventory-v1`: `99772bf087a8bacd8414e762a88174d19a93a8afa3fae5904ce77cc93e7921be`. It is intentionally different from the frozen inventory.
- Added the fixed baseline build profile and named `withGenesis001BaselineLinuxLockedSourceBuild` wrapper. The public wrapper keeps the existing exact four-key input and exposes no arbitrary profile factory. Its provenance domain is `warpkeep-genesis001-baseline-linux-x64-dependency-closure-v1`; it uses the existing fixed historical dependency coordinates and `cache/genesis002` verification.

### Fixed runtime operation

- Added `derivePreparedGenesis001LinuxCompatibility()` with no arguments. Passing explicit `undefined`, options, or any caller authority is rejected. CLI selection is exactly `--genesis001-compatibility`.
- Added distinct fixed compatibility request/result profiles and strict exact-key result decoding. Public output is limited to `profile`, `sourceCommit`, `sourceTree`, the two bundle hashes, the two descriptor hashes, and the exact six writer names. It contains no paths, descriptors, response bodies, credentials, or receipts.
- Extended the sealed source-graph capture, child fallback dispatch, native TypeScript hook, worker declaration and worker-result parser for this single operation. The graph includes the pure Genesis 001 publisher core and excludes `genesis001-frozen-publisher-runtime.ts` and broad production publishing code.
- The worker captures preparation source once. It runs baseline twice and frozen twice in independent private materializations, pinned-Node24 typechecks and builds each, preserves each verified bundle before builder cleanup, compares full bytes/hash/dependency closure/module-tree identity within each lane, and rejects cross-lane bundle or dependency-closure equality.

### Real local upgrade proof

- Starts only the installed, attested CLI/standalone companion on an allocated `127.0.0.1` port with a private HOME/TMP/config/data root, a fixed fresh database, manual redirects, and `--in-memory`.
- Publishes baseline then frozen to the same database using `--delete-data=never --no-config`; descriptors are bounded, fatal-UTF8 JSON decoded, checked against the canonical baseline digest, and compared through `assertGenesis001BaselineDescriptor` and `assertFrozenDescriptorPreservesBaseline`.
- Calls `genesis_001_access_policy_v1` and checks all seven wire fields against the fixed policy constants, including baseline commit and freeze nonce; HTTP success alone is insufficient.
- Calls exactly `admin_allow_fid`, `admin_admit_founder_v1`, `admin_disable_fid`, `admin_bump_auth_epoch`, `access_request_submit_v1`, and `admin_reset_access_request_v1` using the existing local proof argument shapes.
- For each writer, captures authenticated status/request/policy state before and after and requires canonical equality. SpacetimeDB 2.6.1 returns HTTP 530 with generic text for module exceptions, so exact source-supported reason evidence is correlated from the dedicated owned server's bounded output: the proof records a byte cursor immediately before the call, fatal-UTF8 decodes only newly emitted bytes, and requires one contiguous writer-specific record of the form `reducer|procedure "<exact name>" runtime error: Uncaught Error: <exact frozen reason>`. Stale, unrelated, wrong-kind, missing, split, truncated, oversized, non-UTF8, redirect, successful writer, wrong reason, or changed-state evidence fails.
- Network response reads stream only through configured byte limits. Command output, server output, startup, HTTP, each child command, and total runtime are bounded. Child execution uses fixed argument arrays and a constructed environment.
- The detached server process group is terminated and checked on every outcome. Success metadata is formed only after all checks and successful containment. Success cleanup removes the proof root; failures preserve owner-private artifacts and never print keys/tokens.

## TDD evidence

Initial required RED:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/genesis001LocalUpgradeProof.test.ts
```

Exit `1`: 1 failed; `derivePreparedGenesis001LinuxCompatibility` was `undefined` instead of the required function.

Transport-boundary RED after the first real native guard response:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/genesis001LocalUpgradeProof.test.ts
```

Exit `1`: 1 failed; `decodeGenesis001ProcedureResponse is not a function`. After implementing the exact helper, the same command passed 6 tests with 1 VM-gated skip.

Streaming-bound RED:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/genesis001LocalUpgradeProof.test.ts
```

Exit `1`: 1 failed; `readGenesis001BoundedResponseBody is not a function`. After implementing bounded streaming reads, the same command passed 7 tests with 1 VM-gated skip.

Server-log correlation RED:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/genesis001LocalUpgradeProof.test.ts
```

Exit `1`: 2 failed; the old response-only assertion rejected the real generic HTTP 530 body and incorrectly allowed split/unrelated reason text. After requiring newly emitted contiguous kind/name/reason evidence, the same command passed 7 tests with 1 VM-gated skip. A later RED distinguished the real `procedure "access_request_submit_v1"` record from reducer records; the corrected per-writer-kind test passed with the same count.

Focused final GREEN before the final native run:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/genesis001LocalUpgradeProof.test.ts
```

Exit `0`: 1 file passed; 7 tests passed, 1 VM-gated skip.

## Covering verification

Final cross-platform source-builder, compilation, runtime, parent/lifecycle and native-hook command:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/genesis001LocalUpgradeProof.test.ts tests/genesis001BindingFrozenSource.test.ts tests/localBindingRuntime.test.ts tests/localBindingRuntimeParent.test.ts tests/localBindingRuntimeLifecycle.test.ts tests/localBindingNativeTsHooks.test.ts tests/genesis001LocalCompilation.test.ts tests/genesis001LinuxLockedSourceBuild.test.ts
```

Exit `0`: 8 files passed; 103 tests passed, 9 environment-gated skips (112 total).

Focused existing pure descriptor/policy contract command:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/genesis001FrozenPublisher.test.ts -t "accepts only the exact historical|requires exact build provenance|requires the exact source-bound policy|compares every legacy ABI|requires exact baseline counts|scrubs credentials"
```

Exit `0`: 1 file passed; 6 selected tests passed, 18 unselected tests skipped. These cover canonical baseline digest/counts, table/reducer/procedure/RLS compatibility, exact policy shape, nested ABI references, and credential/environment scrubbing.

Final TypeScript check:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -p tsconfig.app.json --tsBuildInfoFile .git/genesis001-local-upgrade-proof.tsbuildinfo
```

Exit `0`, no diagnostics.

Final whitespace review:

```powershell
git diff --check 043007d5405f5f980e3ca2a3c24b2bad64a00e4b..HEAD -- scripts tests
```

Exit `0`, no diagnostics.

## Native evidence

Exact acceptance command:

```powershell
& C:/Windows/System32/wsl.exe --distribution Ubuntu-24.04 --user snapmeter -- /usr/bin/env -i LANG=C.UTF-8 LC_ALL=C.UTF-8 /home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/scripts/local-binding-runtime.mjs --genesis001-compatibility
```

Final-implementation exit `0` result:

```json
{"profile":"warpkeep-spacetime-binding-final-preparation-linux-x64-v1","sourceCommit":"af286c19648038f14a4da215c85d83fab30216cc","sourceTree":"5818a9eb36c7663c4f0534cee506ab741fa4a958","baselineBundleSha256":"179103343455b16a02cbb55205e867c6d4590cf7e9bb614c611d91f15e215801","frozenBundleSha256":"a2d7f204ed591aadb98696225d68332ee573519187e0989e68f528da8064cd49","baselineDescriptorSha256":"cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03","frozenDescriptorSha256":"cf3cbfff9087c04bd9de553410adb49100c40dbdecebc59e265f83cb904dd04d","checkedFrozenWriters":["admin_allow_fid","admin_admit_founder_v1","admin_disable_fid","admin_bump_auth_epoch","access_request_submit_v1","admin_reset_access_request_v1"]}
```

The two baseline builds were byte-identical, the two frozen builds were byte-identical, and baseline/frozen were distinct. The baseline descriptor matched the frozen canonical ABI authority exactly. All six writer checks completed before the result was emitted. No owned `spacetimedb-cli`, `spacetimedb-standalone`, or `local-binding-runtime` process remained afterward, and the successful operation root was removed.

### Diagnosed native failures retained privately

All listed directories are mode `0700`, owner `snapmeter`; they contain no production credentials:

- `/home/snapmeter/.warpkeep/release-preparation-v1/runs/binding-41b7e357247148d4bca4afa93cd08c00`: first run, `LOCAL_BINDING_RUNTIME_SOURCE_GRAPH_INVALID`; the sealed child fallback omitted the new compatibility entry. Fixed in `ade9a02`.
- `/home/snapmeter/.warpkeep/release-preparation-v1/runs/binding-69f9fec23c364494928f215020ecfa69`: baseline/frozen published and the first writer reached `GENESIS_001_ADMISSION_STATE_MUTATIONS_DISABLED`; the response decoder incorrectly required JSON for the legitimate error response. Fixed in `4e02eb5`.
- `/home/snapmeter/.warpkeep/release-preparation-v1/runs/binding-cfc3d59237974b2d97257bd935693120`: reproduced exact transport behavior: the guarded writer returned HTTP 530 with `The instance encountered a fatal error.` while the dedicated server log contained `reducer "admin_allow_fid" runtime error: Uncaught Error: GENESIS_001_ADMISSION_STATE_MUTATIONS_DISABLED`. This established the bounded server-log correlation contract; fixed in `6ccac66`.
- `/home/snapmeter/.warpkeep/release-preparation-v1/runs/binding-331514d9adc74f38832d45dd70934cb8`: exact guards completed for four reducers and reached `procedure "access_request_submit_v1" runtime error: Uncaught Error: GENESIS_001_ACCESS_REQUEST_SUBMISSIONS_DISABLED`; the assertion had assumed every writer was logged as a reducer. Fixed in `72babf4`.

Each failure exited only with a bounded redacted error code, emitted no success JSON, terminated its owned server group, and retained its private artifacts for review.

## Changed files

- `scripts/genesis001-baseline-binding-linux-locked-source-build.ts`
- `scripts/genesis001-binding-frozen-source.mjs`
- `scripts/genesis001-binding-frozen-source.d.mts`
- `scripts/genesis001-local-upgrade-proof.mjs`
- `scripts/genesis001-local-upgrade-proof.d.mts`
- `scripts/local-binding-native-ts-hooks.mjs`
- `scripts/local-binding-runtime-core.mjs`
- `scripts/local-binding-runtime-core.d.mts`
- `scripts/local-binding-runtime-worker-result.mjs`
- `scripts/local-binding-runtime-worker.mjs`
- `scripts/local-binding-runtime-worker.d.mts`
- `scripts/local-binding-runtime.mjs`
- `scripts/local-binding-runtime.d.mts`
- `scripts/ptr-binding-locked-source-build-core.ts`
- `tests/genesis001BindingFrozenSource.test.ts`
- `tests/genesis001LocalUpgradeProof.test.ts`
- `tests/localBindingRuntime.test.ts`
- `.superpowers/sdd/2026-09-06-warpkeep-genesis001-local-upgrade-proof/task-1-report.md`

## Commits

- `b7cf654` — `feat: prove Genesis 001 local upgrade compatibility`
- `ade9a02` — `fix: route compatibility source graph fallback`
- `4e02eb5` — `fix: decode frozen guard error responses`
- `6ccac66` — `fix: attest frozen guards from local server`
- `72babf4` — `fix: correlate frozen writer log evidence`
- `af286c1` — `chore: trim local proof imports`

The report itself is committed separately after native verification so the native source authority remains the exact implementation commit above.

## Concerns and environment notes

- The complete `genesis001FrozenPublisher.test.ts` and `genesis001FrozenPublisherRuntime.test.ts` production-publisher suites are POSIX-only and are not valid as a whole in this Windows Vitest host. An exploratory run produced 31 environment failures from Windows path canonicalization/ownership semantics, unavailable `/bin/sh`, and unprivileged symlink creation. The six portable pure contract tests were selected and passed; the actual pinned Linux native proof exercised the relevant ownership, mode, process-group and executable checks.
- A WSL Vitest attempt was also unavailable because the preserved Windows dependency junction does not contain the Linux `@rolldown/binding-linux-x64-gnu` optional package. Per task constraints, the dependency junction was preserved and no reinstall was attempted. This did not affect the actual native proof, which uses the pinned Linux runtimes and completed successfully.
- Failure roots intentionally remain for controller review and include disposable local private keys. They are protected by owner-private parent directories and were not printed. They may be removed by the controller after review.
- The broad pre-existing dirty worktree and dependency junction were preserved. Only the exact files above were staged and committed.
