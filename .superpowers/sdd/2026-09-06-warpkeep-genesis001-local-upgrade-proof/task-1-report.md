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

---

## Independent-review correction round 1/5 (I1-I5)

### Status and implementation

All five Important findings in `task-1-review.md` were addressed on top of `af286c19648038f14a4da215c85d83fab30216cc` (with the pre-existing report-only commit left intact).

- **I1, surviving containment:** the compatibility worker alone is now started as a POSIX process-group leader. The local standalone inherits that owned group instead of detaching into an unsupervised group. On timeout, output overflow, fd3 failure, spawn failure, abnormal worker exit, or a nominal worker exit with a live descendant, the surviving parent sends `SIGKILL` to the complete group, waits up to the bounded containment grace, verifies group absence, and only then settles. Ordinary PTR/G001-compilation/G002 workers keep their previous non-group invocation. The proof's normal path terminates and checks the standalone PID; the parent remains the final all-descendant authority if the worker is killed or a server descendant survives.
- **I2, exact fresh guard record:** the fresh byte cursor, fatal UTF-8 decoding, output bound, failed HTTP response and unchanged authenticated before/after state remain mandatory. A match now requires cardinality exactly one complete newline-terminated record. After stripping only SGR decoration, the record must be either the exact bare writer/kind/error/reason line or the exact pinned standalone envelope (ISO timestamp, `INFO`, `crates/core/src/host/v8/error.rs:<positive line>:`) followed by the exact payload. Truncation, payload suffix, arbitrary/malformed prefix or origin, duplicate records, stale-window text, wrong writer/kind/reason, split text, redirects, oversized/non-UTF8 bodies and successful plain text are rejected.
- **I3, bundle commitment:** the shared handoff write returns the installed file's bounded bytes, SHA-256 and full descriptor-safe identity. The worker passes those exact baseline/frozen records to the proof. Each publish re-attests byte length, hash, mode, uid, link count and inode identity immediately before CLI consumption and immediately after it. Same-path mutation, same-byte inode replacement, hard-link substitution, baseline mutation and frozen mutation all fail before evidence can be returned.
- **I4, actual orchestration coverage:** the lifecycle test now calls the real fixed compatibility worker branch and observes two independent baseline builds, two frozen builds and the proof handoff. Negative cases cover baseline and frozen nondeterminism, actual cross-lane substitution, both artifact lanes, link/namespace mutation, compilation-command failure and proof/startup failure. Parent tests call the actual compatibility parent authority, assert group containment is requested only for this lane, assert no generation/projection, and reject extra or cross-lane result evidence. The native process fixture covers timeout, abnormal exit and nominal success while a live descendant exists.
- **I5, one checked writer:** `writeCheckedLocalBindingHandoff` is the sole private copy/readback implementation used by both `preserveLocalBindingWorkerBundle` and `createLocalBindingWorkerResult`; their distinct public schemas remain intact.

The server-output-overflow path was also corrected to kill the inherited standalone PID rather than addressing a now-invalid negative PID after the containment redesign. Malformed artifact input now fails with the frozen input error rather than an incidental path exception.

### RED/GREEN evidence

I1 native descendant RED before the supervisor change:

```powershell
& C:/Windows/System32/wsl.exe --distribution Ubuntu-24.04 --user snapmeter -- /usr/bin/env -i LANG=C.UTF-8 LC_ALL=C.UTF-8 TMPDIR=/home/snapmeter/.warpkeep/release-preparation-v1/runs /home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/tests/fixtures/localBindingProcessGroupProof.mjs
```

Exit `1`: `{"code":"LOCAL_BINDING_RUNTIME_PROCESS_TIMEOUT","parentSurvives":false,"descendantSurvives":true}`. After the group supervisor change the same command exited `0` with both survival fields `false`. The two additional native outcomes also exited `0`:

```powershell
& C:/Windows/System32/wsl.exe --distribution Ubuntu-24.04 --user snapmeter -- /usr/bin/env -i LANG=C.UTF-8 LC_ALL=C.UTF-8 TMPDIR=/home/snapmeter/.warpkeep/release-preparation-v1/runs /home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/tests/fixtures/localBindingProcessGroupProof.mjs failure-descendant
& C:/Windows/System32/wsl.exe --distribution Ubuntu-24.04 --user snapmeter -- /usr/bin/env -i LANG=C.UTF-8 LC_ALL=C.UTF-8 TMPDIR=/home/snapmeter/.warpkeep/release-preparation-v1/runs /home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/tests/fixtures/localBindingProcessGroupProof.mjs success-descendant
```

Outputs were respectively `LOCAL_BINDING_RUNTIME_PROCESS_FAILED` and `LOCAL_BINDING_RUNTIME_PROCESS_CONTAINMENT_FAILED`, both with `parentSurvives:false` and `descendantSurvives:false`. The latter proves nominal child success is not accepted while a descendant survives.

I2 exactness RED:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/genesis001LocalUpgradeProof.test.ts -t "bounded fatal-UTF8"
```

Exit `1`: one failed because an arbitrary prefix followed by the expected token was accepted. Whole-line equality made this GREEN. The first committed native correction run then supplied a second genuine RED: after all four builds and the first writer it exited `1` with `LOCAL_BINDING_RUNTIME_PROCESS_FAILED` because the exact payload was inside the pinned ANSI structured envelope. The retained bounded log line identified the fixed `INFO crates/core/src/host/v8/error.rs:618:` origin; strict envelope parsing made the focused command exit `0` (one selected pass, ten skipped) while the arbitrary/malformed prefix, reason suffix, truncation, duplicate and stale cases continued to reject.

I3/I5 RED commands:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/genesis001LocalUpgradeProof.test.ts tests/localBindingRuntime.test.ts
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/localBindingRuntime.test.ts -t "returns the checked handoff identity"
```

The first exited `1` because `attestGenesis001LocalProofArtifact` did not exist. The selected handoff test exited `1` because the saved result lacked installed `byteLength`/identity. After the shared checked writer, pre/post-publish attestation and worker record plumbing, the focused pair passed 34 tests with 2 environment skips; the expanded final matrix is recorded below.

I4 exposed missing coverage rather than a separate latent implementation failure: the newly added real worker/parent success, nondeterminism and cross-lane tests were GREEN against the already implemented four-build branch. Artifact mutation was RED with I3 until the attester existed. Link/namespace mutation, both artifact lanes, build-command failure and proof failure now execute through the same real compatibility worker branch and reject without a worker result; strict parent negative cases reject before public evidence or generation.

### Final covering verification

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/genesis001LocalUpgradeProof.test.ts tests/genesis001BindingFrozenSource.test.ts tests/localBindingRuntime.test.ts tests/localBindingRuntimeParent.test.ts tests/localBindingRuntimeLifecycle.test.ts tests/localBindingNativeTsHooks.test.ts tests/genesis001LocalCompilation.test.ts tests/genesis001LinuxLockedSourceBuild.test.ts
```

Exit `0`: 8 files passed; 118 tests passed and 13 platform/VM-gated tests skipped (131 total).

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/genesis001FrozenPublisher.test.ts -t "accepts only the exact historical|requires exact build provenance|requires the exact source-bound policy|compares every legacy ABI|requires exact baseline counts|scrubs credentials"
```

Exit `0`: 6 selected tests passed; 18 unselected.

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc --noEmit --project tsconfig.app.json --tsBuildInfoFile .git/task-1-genesis001-fix.tsbuildinfo
git diff --check af286c19648038f14a4da215c85d83fab30216cc..9e7d3ff1bafca5a542d3e530d79467d595588750 -- scripts tests
```

Both exited `0` with no diagnostics. A final process readback returned `pgrep` exit `1` for `spacetimedb-standalone`, `spacetimedb-cli` and `local-binding-runtime.mjs` (no owned processes).

### Fixed native acceptance

Exact command at implementation commit `9e7d3ff1bafca5a542d3e530d79467d595588750`:

```powershell
& C:/Windows/System32/wsl.exe --distribution Ubuntu-24.04 --user snapmeter -- /usr/bin/env -i LANG=C.UTF-8 LC_ALL=C.UTF-8 /home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/scripts/local-binding-runtime.mjs --genesis001-compatibility
```

Exit `0`:

```json
{"profile":"warpkeep-spacetime-binding-final-preparation-linux-x64-v1","sourceCommit":"9e7d3ff1bafca5a542d3e530d79467d595588750","sourceTree":"decdb57581b3f27741eedd493f6d4193f80357c7","baselineBundleSha256":"179103343455b16a02cbb55205e867c6d4590cf7e9bb614c611d91f15e215801","frozenBundleSha256":"a2d7f204ed591aadb98696225d68332ee573519187e0989e68f528da8064cd49","baselineDescriptorSha256":"cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03","frozenDescriptorSha256":"cf3cbfff9087c04bd9de553410adb49100c40dbdecebc59e265f83cb904dd04d","checkedFrozenWriters":["admin_allow_fid","admin_admit_founder_v1","admin_disable_fid","admin_bump_auth_epoch","access_request_submit_v1","admin_reset_access_request_v1"]}
```

The preceding native attempt at `2f5fc8b` exited with the bounded redacted process code described above and retained `/home/snapmeter/.warpkeep/release-preparation-v1/runs/binding-2d15b6d2dd7c4b34a77eaaf9f77f1184`. Its owner-private root contains disposable proof credentials; only file metadata and the single relevant bounded guard-log record were inspected, never key/token contents. It emitted no success JSON and no worker/server remained.

### Correction-round changed files and commits

- `scripts/genesis001-local-upgrade-proof.d.mts`
- `scripts/genesis001-local-upgrade-proof.mjs`
- `scripts/local-binding-runtime-core.d.mts`
- `scripts/local-binding-runtime-core.mjs`
- `scripts/local-binding-runtime-process.d.mts`
- `scripts/local-binding-runtime-process.mjs`
- `scripts/local-binding-runtime-worker-result.d.mts`
- `scripts/local-binding-runtime-worker-result.mjs`
- `scripts/local-binding-runtime-worker.mjs`
- `tests/fixtures/localBindingProcessFixture.mjs`
- `tests/fixtures/localBindingProcessGroupProof.mjs`
- `tests/genesis001LocalUpgradeProof.test.ts`
- `tests/localBindingRuntime.test.ts`
- `tests/localBindingRuntimeLifecycle.test.ts`
- `tests/localBindingRuntimeParent.test.ts`
- `.superpowers/sdd/2026-09-06-warpkeep-genesis001-local-upgrade-proof/task-1-report.md`

Commits: `2f5fc8b` (`fix: harden genesis001 local proof evidence`) and `9e7d3ff` (`fix: parse structured genesis001 guard records`). This appendix is committed separately after native verification.

### Remaining concerns

- The Linux-only Vitest cases for direct proof startup/no-success and process-group semantics are skipped by the Windows runner. The process-group failure matrix was run directly and successfully under the pinned Linux Node as recorded above; the complete native compatibility proof exercised the real Linux startup/success/cleanup path. Direct Linux Vitest remains unavailable because the preserved Windows dependency junction lacks `@rolldown/binding-linux-x64-gnu`; per scope, no dependency reinstall was attempted.
- M1/M2 remain the controller-recorded deferred Minor findings. No whole production publisher suite rerun or dependency-junction mutation was performed.
- The native parser-diagnosis root remains intentionally retained and private for controller review. The broad unrelated dirty worktree and existing dependency junction were preserved.

---

## Independent-review correction round 2/5 (I4/N1/N2)

### Status and implementation

The three open Important findings in `task-1-fix-round-1-review.md` were corrected on top of implementation authority `9e7d3ff1bafca5a542d3e530d79467d595588750` (and its report-only successor `d9d0451`). The addressed I1/I2/I3/I5 behavior remains in place.

- **N1, independently bounded finalization:** `runLocalBindingBoundedProcess` now starts a separate five-second termination deadline as soon as timeout, output overflow, fd3 failure, spawn failure, or another stop condition occurs. It sends the owned PID/group kill, polls that PID/group independently of `close`, retries at the deadline, and settles even when the child never emits `close`. The original timeout/process/output/control error is preserved only after absence is verified; a still-live process/group or unexpected survivor is reported as `LOCAL_BINDING_RUNTIME_PROCESS_CONTAINMENT_FAILED` with the primary error retained as its cause. This applies to both compatibility process groups and ordinary helper callers.
- **N2, supervisor-owned cleanup boundary:** the worker proof no longer removes `operationRoot/proof` after checking only its direct server PID. It returns with private proof artifacts intact. Only the surviving parent, after the process-group helper has verified that all descendants are absent, re-verifies bootstrap source, parses and source-binds the strict result, re-attests executables, validates the fixed private proof directory, and removes that proof directory. Process containment failure and malformed/cross-lane result paths occur before cleanup and retain the evidence. Successful operation completion still removes the complete operation root through the existing outer success cleanup.
- **I4, actual compatibility negative coverage:** the real compatibility worker branch is now invoked with `extra`, wrong-owner, and wrong-mode compiler-namespace mutations. Each case fails with `LOCAL_BINDING_WORKER_COMPILER_INVALID`, emits no worker result, performs zero baseline/frozen builds, and never enters the proof handoff. Parent lifecycle coverage additionally verifies accepted-success cleanup and proof retention/no-result on containment failure and strict invalid-result cases.

### RED/GREEN evidence

N1 RED, after adding the failed-kill/non-closing-child test and before implementing independent termination settlement:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/localBindingRuntime.test.ts -t "independently bounds failed termination"
```

Exit `1`: the race returned `UNSETTLED` after 6,001 fake milliseconds instead of `LOCAL_BINDING_RUNTIME_PROCESS_CONTAINMENT_FAILED`. After the fix, the same command exited `0`: 2 selected tests passed and 30 were unselected, covering both `containProcessGroup=false` and `true`; each forced `EPERM` for kill, kept the PID alive, emitted no `close`, and retained the original `LOCAL_BINDING_RUNTIME_PROCESS_TIMEOUT` as the containment error's cause.

N2 RED, with the parent cleanup/retention boundary tests in place before moving cleanup out of the worker proof:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/localBindingRuntimeParent.test.ts -t "strict compatibility|retains private proof|compatibility parent result"
```

Exit `1`: the accepted-success case still found the controlled proof marker because there was not yet a post-supervisor cleanup. With the parent cleanup boundary implemented, the same command exited `0`: 4 selected tests passed and 16 were unselected. Accepted success removed the proof directory; containment failure produced no result and retained the marker; both extra-result and cross-lane-result failures produced no public result/generation and retained the marker.

I4 was a coverage gap rather than a newly exposed implementation defect. The actual compatibility namespace tests were GREEN when introduced:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/localBindingRuntimeLifecycle.test.ts -t "compatibility compiler namespace"
```

Exit `0`: 3 selected tests passed and 32 were unselected. All three executed the compatibility worker authority and asserted the exact failure, undefined result, zero compatibility builds, and absent proof input.

The four specifically required runtime/proof suites then passed together:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/genesis001LocalUpgradeProof.test.ts tests/localBindingRuntime.test.ts tests/localBindingRuntimeLifecycle.test.ts tests/localBindingRuntimeParent.test.ts
```

Exit `0`: 4 files passed; 92 tests passed and 6 platform/VM-gated tests skipped (98 total).

### Native descendant and retained-artifact evidence

The corrected process helper and fixture were executed under the pinned Linux Node for all three descendant outcomes:

```powershell
$wsl='C:/Windows/System32/wsl.exe'
$node='/home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node'
$fixture='/mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/tests/fixtures/localBindingProcessGroupProof.mjs'
foreach ($scenario in @('timeout-descendant','failure-descendant','success-descendant')) {
  & $wsl --distribution Ubuntu-24.04 --user snapmeter -- /usr/bin/env -i LANG=C.UTF-8 LC_ALL=C.UTF-8 TMPDIR=/home/snapmeter/.warpkeep/release-preparation-v1/runs $node $fixture $scenario
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

Exit `0`; exact outputs:

```json
{"code":"LOCAL_BINDING_RUNTIME_PROCESS_TIMEOUT","parentSurvives":false,"descendantSurvives":false,"retainedEvidence":true}
{"code":"LOCAL_BINDING_RUNTIME_PROCESS_FAILED","parentSurvives":false,"descendantSurvives":false,"retainedEvidence":true}
{"code":"LOCAL_BINDING_RUNTIME_PROCESS_CONTAINMENT_FAILED","parentSurvives":false,"descendantSurvives":false,"retainedEvidence":true}
```

The nominal parent exit with a live descendant is therefore never accepted as success, both PIDs are absent before settlement, and its proof marker survives through that containment decision. The real kernel cannot be safely induced to deny this owner a `SIGKILL`; failed-kill/non-closing behavior is covered deterministically for group and ordinary callers by the focused mocked-process test above, while the native matrix covers successful-kill process-group behavior.

### Covering verification

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/genesis001LocalUpgradeProof.test.ts tests/genesis001BindingFrozenSource.test.ts tests/localBindingRuntime.test.ts tests/localBindingRuntimeParent.test.ts tests/localBindingRuntimeLifecycle.test.ts tests/localBindingNativeTsHooks.test.ts tests/genesis001LocalCompilation.test.ts tests/genesis001LinuxLockedSourceBuild.test.ts
```

Exit `0`: 8 files passed; 124 tests passed and 13 platform/VM-gated tests skipped (137 total). This includes the shared checked-handoff callers, source builders, parent/runtime lifecycle, process fixtures, proof contracts, and native-hook surfaces affected by the correction.

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc --noEmit --project tsconfig.app.json --tsBuildInfoFile .git/task-1-genesis001-round2.tsbuildinfo
git diff --check -- scripts/local-binding-runtime-process.mjs scripts/genesis001-local-upgrade-proof.mjs scripts/local-binding-runtime-core.mjs tests/localBindingRuntime.test.ts tests/localBindingRuntimeParent.test.ts tests/localBindingRuntimeLifecycle.test.ts tests/fixtures/localBindingProcessFixture.mjs tests/fixtures/localBindingProcessGroupProof.mjs
```

Both exited `0` with no diagnostics.

### Fixed native acceptance

Exact command against implementation commit `e137f6eb7c0ea92037df6fc4a7b48974546acad0`:

```powershell
& C:/Windows/System32/wsl.exe --distribution Ubuntu-24.04 --user snapmeter -- /usr/bin/env -i LANG=C.UTF-8 LC_ALL=C.UTF-8 /home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/scripts/local-binding-runtime.mjs --genesis001-compatibility
```

Exit `0`:

```json
{"profile":"warpkeep-spacetime-binding-final-preparation-linux-x64-v1","sourceCommit":"e137f6eb7c0ea92037df6fc4a7b48974546acad0","sourceTree":"c90876be4a9d90d4e1378dc5119b47f5c76a2704","baselineBundleSha256":"179103343455b16a02cbb55205e867c6d4590cf7e9bb614c611d91f15e215801","frozenBundleSha256":"a2d7f204ed591aadb98696225d68332ee573519187e0989e68f528da8064cd49","baselineDescriptorSha256":"cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03","frozenDescriptorSha256":"cf3cbfff9087c04bd9de553410adb49100c40dbdecebc59e265f83cb904dd04d","checkedFrozenWriters":["admin_allow_fid","admin_admit_founder_v1","admin_disable_fid","admin_bump_auth_epoch","access_request_submit_v1","admin_reset_access_request_v1"]}
```

The baseline and frozen commitments remain canonical and distinct, all six guarded writers completed, and success was emitted only after the surviving parent accepted process-group absence and removed the proof artifacts. A post-run check returned `pgrep --full` exit `1` separately for `spacetimedb-standalone`, `spacetimedb-cli`, and `local-binding-runtime.mjs`; no owned process remained.

### Correction-round changed files and commits

- `scripts/genesis001-local-upgrade-proof.mjs`
- `scripts/local-binding-runtime-core.mjs`
- `scripts/local-binding-runtime-process.mjs`
- `tests/fixtures/localBindingProcessFixture.mjs`
- `tests/fixtures/localBindingProcessGroupProof.mjs`
- `tests/localBindingRuntime.test.ts`
- `tests/localBindingRuntimeLifecycle.test.ts`
- `tests/localBindingRuntimeParent.test.ts`
- `.superpowers/sdd/2026-09-06-warpkeep-genesis001-local-upgrade-proof/task-1-report.md`

Implementation commit: `e137f6e` (`fix: finalize genesis001 proof containment`). This appendix is committed separately after native verification.

### Remaining concerns

- The Linux-only Vitest startup/no-success case remains unsupported in this preserved Windows dependency junction because the Linux optional Rolldown binding is absent. It is not claimed as passed. The fixed native compatibility command does exercise real Linux proof startup and the complete success lifecycle; the direct pinned-Linux fixture exercises timeout, abnormal exit, nominal-exit-with-descendant rejection, retained evidence, and process absence. No junction reinstall was performed.
- M1/M2 remain the controller-recorded deferred Minor findings. No whole publisher-suite rerun or unrelated production work was performed.
- The earlier owner-private diagnostic roots remain intentionally retained for controller review. The broad unrelated dirty worktree and existing dependency junction were preserved; only the exact files named above were staged.
