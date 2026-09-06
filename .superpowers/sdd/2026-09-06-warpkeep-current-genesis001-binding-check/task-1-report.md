# Task 1 report: current G001 binding verification

Date: 2026-09-06

Base: `ab8394a857cb4d84cdbbb55bc0e891ab7bc1e279`

Implementation HEAD: `b0a9846feeca8900637316fb7973e6ff204c81c1`

This report covers only the fixed current-source G001 binding gate. It does not claim completion of the all-realm bundle integration, durable refreeze, live preservation, deployment, or the Warpkeep 0.4 release.

## Outcome

The fixed native current-G001 check succeeded from the exact committed source at implementation HEAD. Two independent build/generate cycles produced byte-identical bundles and bindings, and all 180 generated TypeScript binding files matched the committed `src/spacetime/module_bindings/` authority by exact sorted path set and raw bytes.

Public result:

```json
{"profile":"warpkeep-spacetime-binding-final-preparation-linux-x64-v1","sourceCommit":"b0a9846feeca8900637316fb7973e6ff204c81c1","sourceTree":"355395c94a196aca93914bb98c9809123443fe23","bundleSha256":"7811ce8485cb101e9bd864ca801ade3823353389832921554c757a847d8cf48a","dependencyClosureDigest":"fcc9b32282ff947da96738a15735aa809919f9229e2861d9a53cb0c98acb6e62","bindingFileCount":180}
```

The result has exactly the six required public keys. It exposes no binding paths, bytes, private filesystem path, credentials, or success receipt.

## TDD evidence

### Initial public-operation RED

Command:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/genesis001CurrentBindingCheck.test.ts
```

Observed RED: one test failed because `derivePreparedGenesis001CurrentLinuxBindingCheck` was `undefined` instead of a function.

### Builder RED

The next focused run failed during collection with:

```text
Cannot find module '../scripts/genesis001-current-binding-linux-locked-source-build'
```

This preceded creation of the named current-root wrapper and private installer profile.

### Parent/parser/worker REDs

Focused parent orchestration tests initially produced ten failures because `executeFixedGenesis001CurrentBindingParentCycles` did not exist. Committed-tree parser tests then produced four failures because `parseGenesis001CurrentCommittedBindingListing` did not exist. Current worker lifecycle tests produced four fail-closed results with `LOCAL_BINDING_WORKER_REQUEST_INVALID` before the current worker/result profile routing was implemented.

### Independent-snapshot amendment RED

After the first two native failures exposed the existing repository Git-config incompatibility, two focused tests were added before implementation.

Command:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/localBindingRuntime.test.ts
```

Observed RED:

```text
Test Files  1 failed (1)
Tests       2 failed | 34 passed | 4 skipped (40)
TypeError: Cannot read properties of undefined (reading 'initializeGenesis001CurrentIndependentSnapshot')
```

The tests cover the exact local-only clone plan and fail closed on clone failure, captured source identity mismatch, and independent Git-context rejection.

### GREEN verification

Focused amendment GREEN:

```text
Test Files  1 passed (1)
Tests       36 passed | 4 skipped (40)
```

Final affected-suite command at implementation HEAD:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/genesis001CurrentBindingCheck.test.ts tests/genesis001LinuxLockedSourceBuild.test.ts tests/genesis002BindingLinuxLockedSourceBuild.test.ts tests/ptrBindingLinuxLockedSourceBuild.test.ts tests/localBindingRuntime.test.ts tests/localBindingRuntimeParent.test.ts tests/localBindingRuntimeLifecycle.test.ts tests/localBindingNativeTsHooks.test.ts
```

Result:

```text
Test Files  8 passed (8)
Tests       200 passed | 4 skipped (204)
```

App TypeScript command:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit --tsBuildInfoFile .git/tsbuildinfo/genesis001-current-binding-check.app.tsbuildinfo
```

Result: exit 0 with no output.

Exact task-path `git diff --check` was also exit 0 before each source commit.

The previously deferred worker return-declaration mismatch was carried where the declaration was touched: the worker return is a union including the compatibility result, and existing lifecycle call sites explicitly narrow that union.

## Implementation

Commit `a5670ee7ddb9eff5c5cf7cf6cebc464dff68f550` (`feat: verify current genesis001 bindings`) added the fixed current-root profile and public gate.

Its exact files are:

- `scripts/genesis001-current-binding-linux-locked-source-build.ts`
- `scripts/local-binding-native-ts-hooks.mjs`
- `scripts/local-binding-runtime-core.d.mts`
- `scripts/local-binding-runtime-core.mjs`
- `scripts/local-binding-runtime-worker-result.d.mts`
- `scripts/local-binding-runtime-worker-result.mjs`
- `scripts/local-binding-runtime-worker.d.mts`
- `scripts/local-binding-runtime-worker.mjs`
- `scripts/local-binding-runtime.d.mts`
- `scripts/local-binding-runtime.mjs`
- `scripts/ptr-binding-locked-source-build-core.ts`
- `tests/genesis001CurrentBindingCheck.test.ts`
- `tests/localBindingNativeTsHooks.test.ts`
- `tests/localBindingRuntime.test.ts`
- `tests/localBindingRuntimeLifecycle.test.ts`
- `tests/localBindingRuntimeParent.test.ts`

The private installer profile is Linux/x64, root module `spacetimedb`, uses `spacetimedb/package.json`, `spacetimedb/pnpm-lock.yaml`, `spacetimedb/pnpm-workspace.yaml`, the complete current G002 workspace importer/package graph, state child `genesis001-current-locked-source-builds-v1`, and domain `warpkeep-genesis001-current-linux-x64-dependency-closure-v1`. It uses `materializeCommit`, the captured current commit, and no historical override or frozen-materializer substitution.

The worker uses the distinct current request/result profiles, Node 22, root `spacetimedb/tsconfig.json`, fixed installed dependency closure, pinned CLI build, and operation-owned private output. Both parent cycles independently typecheck, build, and generate with `--lang typescript --yes --no-config --js-path <private handoff> --out-dir <private output>` and without `--include-private`.

Committed expected bindings are read from the captured commit through the already attested `/usr/bin/git` and scrubbed environment. Listing and blob reads reject links, noncanonical paths, case collisions, non-TypeScript members, excessive count/size, and any source identity change. Reproducibility is asserted before exact expected/generated comparison. A mismatch preserves a private bounded path/size/SHA-256 diagnostic and returns only `LOCAL_BINDING_RUNTIME_CURRENT_BINDINGS_MISMATCH`; it never overwrites the protected frontend tree.

Commit `b0a9846feeca8900637316fb7973e6ff204c81c1` (`fix: isolate current binding source snapshot`) amended only the current-G001 capture path. It uses the fixed attested Git and scrubbed environment to run:

```text
clone --local --no-hardlinks --no-checkout --no-tags -- <existing repository> <private operation/source>
```

The disposable clone removes only its automatically created `remote.origin.tagOpt`, sets `remote.origin.url` to `https://github.com/ael-dev3/Warpkeep.git` as local configuration only, and detaches at the already captured commit. It performs no fetch, push, network, credential copy, or protected-main attestation. It rejects alternates, shallow state, grafts, info attributes, worktree config, unexpected config names, noncanonical Git directories, wrong modes/owners/links, wrong origin/fetch configuration, and any observed HEAD/tree mismatch. Existing lanes retain linked-worktree behavior and cleanup; current G001 removes only its private operation root on success and retains it on failure.

## Native evidence and diagnosis

All native attempts used exactly:

```powershell
& C:/Windows/System32/wsl.exe --distribution Ubuntu-24.04 --user snapmeter -- /usr/bin/env -i LANG=C.UTF-8 LC_ALL=C.UTF-8 /home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/scripts/local-binding-runtime.mjs --genesis001-current-check
```

### First fail-closed attempt

At source `a5670ee7ddb9eff5c5cf7cf6cebc464dff68f550`, tree `880a222505ec939652f786d3844d33648cc175cd`, the command exited 1 with public code `LOCAL_BINDING_RUNTIME_PROCESS_FAILED`.

The retained private run `/home/snapmeter/.warpkeep/release-preparation-v1/runs/binding-02dccbcca1c84c529ee269725518b050` showed no handoff and an empty current state child. A bounded diagnostic reinvocation exposed nested `GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID` at `attestContextFile`: `.git/config` and `.git/info/exclude` were regular uid/gid 1000:1000, nlink 1, but mode 0744 instead of the accepted 0600/0644.

With controller authorization, only those two exact resolved, regular, non-symlink repository metadata files were normalized from 0744 to 0644. No recursive permission change was made. Ownership and bytes remained unchanged:

```text
.git/config       SHA-256 5a73cb70f5814f77d401968232c8a1fbb112e05d1c85817777f856b15fb394b9
.git/info/exclude SHA-256 6671fe83b7a07c8932ee89164d1f2793b2318058eb8b98dc5c06ee0a5a3b0ec1
```

Both hashes were identical before and after normalization; final modes were 0644 and owner remained 1000:1000.

### Second fail-closed attempt

The second attempt at the same source/tree exited 1 with `LOCAL_BINDING_RUNTIME_PROCESS_FAILED`. The retained private run is `/home/snapmeter/.warpkeep/release-preparation-v1/runs/binding-94d1e00580714caea7f43cb8bcfbdfc4`.

The nested cause remained `GREATER_REALM_PRODUCTION_GIT_CONTEXT_INVALID`, now at the local config-name policy. The existing repository has `core.symlinks` and disabled-push `remote.upstream.url`, `remote.upstream.fetch`, and `remote.upstream.pushurl`, which are outside the production materializer's allowlist. Their values were not printed or changed. The validator was not relaxed and the repository settings were preserved. This led to the independently initialized current-only snapshot in `b0a9846`.

### Successful committed native attempt

The run at implementation HEAD completed with exit 0 and the exact public JSON in the Outcome section. The successful command ran in process session 12517 and took approximately 190 seconds. Success also proves cleanup completed: the runtime preserves cleanup errors as failures, the current independent clone is never registered as a linked worktree, and no successful-operation private path escaped in the public result.

## Source and projection authority

- Captured source commit: `b0a9846feeca8900637316fb7973e6ff204c81c1`
- Captured source tree: `355395c94a196aca93914bb98c9809123443fe23`
- Committed `src/spacetime/module_bindings` subtree object: `6740727249fc4b0b16a21ef0475251b7ccd80183`
- Committed binding files: 180
- Committed binding bytes: 281725
- Generated bundle SHA-256: `7811ce8485cb101e9bd864ca801ade3823353389832921554c757a847d8cf48a`
- Dependency closure SHA-256: `fcc9b32282ff947da96738a15735aa809919f9229e2861d9a53cb0c98acb6e62`
- Exact task-commit diff under `src/spacetime/module_bindings/` and `spacetimedb/` from base through implementation HEAD: zero paths

The shared worktree contains broad pre-existing unrelated modifications, including protected source and frontend bindings. They were neither staged nor changed by this task. The native check intentionally used the exact captured committed authority rather than mutable worktree bytes.

## Safety and limitations

- Root `node_modules` remained the existing Windows dependency junction; no install or dependency mutation was run there.
- No protected frontend binding, `spacetimedb`, projection, deployment, provider, production, credential, or Mac operation was performed.
- Existing historical compatibility evidence and profiles were not relabeled or replaced.
- The two failed operation roots above remain private retained diagnostic evidence. Other pre-existing retained runs/worktrees were not modified.
- Only the focused and affected source-builder/runtime/parent/lifecycle/native-hook suites were run. Unrelated publisher/production suites were intentionally not repeated on Windows.
- Downstream all-realm bundle integration and independent controller review remain separate work.
