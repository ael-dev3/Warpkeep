# Fixed Linux operation bundle runtime implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build and actually load all four operation bundles from one committed source identity using the fixed offline Linux toolchain.

**Architecture:** A zero-argument Windows/WSL entry binds the existing hardened snapshot boundary and launches bounded credential-free Linux workers. Each lane is built twice in separate owned materializations with the shared engine, verified esbuild packages and contained YAML. Actual load children verify exports and factory rejection before a complete family can be returned.

**Tech Stack:** Node22.22.3 ESM/native TS hooks, esbuild0.28.1, existing bounded file/process readers, WSL Ubuntu-24.04, Vitest.

**Spec:** docs/superpowers/specs/2026-09-05-warpkeep-local-release-preparation-design.md, especially Four-operation bundle execution refinement.

## Global Constraints

- Keep all `GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS` bytes unchanged.
- G001 bindings are an exact zero-diff check, never a write target.
- G002 remains sealed and PTR remains owner-only.
- Local build code neither needs nor receives production credentials, FIDs, raw receipts or database contents.
- Package acquisition is an explicit bounded bootstrap operation; ordinary derivation remains offline.
- Do not install into or modify the Windows node_modules junction.
- No caller executor, attestation callback, source directory, package directory or load hook is accepted by the public wrapper.
- No generated repository artifact installation, provider mutation, or claim of live activation in this task. Final transaction and deployment remain required.

### Task 1: Execute and verify the complete fixed Linux bundle family

**Files:**
- Create: `scripts/local-operation-bundle-runtime.mjs` and `.d.mts` — public zero-argument wrapper/CLI metadata.
- Create: `scripts/local-operation-bundle-runtime-core.mjs` and `.d.mts` — fixed host, source capture, eight worker cycles, final comparisons, private lifecycle.
- Create: `scripts/local-operation-bundle-worker.mjs` — bounded private request, attested loader, compiler invocation and handoff.
- Create: `scripts/local-operation-bundle-packages.ts` — pure fixed package selection and owned extraction/namespace validation; no public authority injection.
- Create: `scripts/local-operation-bundle-load.mjs` — actual bounded artifact loading and fixed export/factory assertions.
- Modify: `scripts/local-binding-runtime-core.mjs` and `.d.mts` — narrowly named internal fixed operation-snapshot/source-graph entrypoints reusing existing private algorithms, preserving existing binding profiles.
- Modify: `scripts/local-binding-native-ts-hooks.mjs` — add only the fixed package-helper synthetic entry `warpkeep:operation-bundle-packages`; preserve existing entries and YAML semantics.
- Create: `tests/localOperationBundleRuntime.test.ts`, `tests/localOperationBundlePackages.test.ts`.
- Test: existing local binding runtime source-boundary and process suites; locate direct consumers of changed functions before editing.

**Interfaces and fixed data:**
- Public `derivePreparedLinuxOperationBundles(...arguments_)` rejects any argument including undefined. Linux result is frozen `{profile:'warpkeep-spacetime-binding-final-preparation-linux-x64-v1',sourceCommit,sourceTree,bundles}`. `bundles` has exactly activation/g001/g002/ptr in that order, each containing the existing engine artifact shape (including copied bytes and manifest), plus verified Linux load metadata. CLI prints only profile/source identity and per-lane byte/count/digest metadata, never bundle bytes or private paths.
- The in-process API is Linux-only and rejects other platforms. Windows CLI delegates to the exact WSL command and returns bounded metadata only; it does not promise to transport raw family bytes into Windows. The final transaction runs in Linux and consumes the Linux API. Each member's exact load field is `{profile:'warpkeep-linux-operation-bundle-load-v1',byteDigest,exportNames,factoryFailureCode}`; parent supplies it only after validated child execution.
- Keep `buildSealedRealmOperationBundle({lane,sourceRoot,build})` from the accepted shared engine unchanged unless an evidenced defect requires a recorded amendment. No second copy of lane rules, transformations, manifest hashing or payload validator.
- Internal `captureFixedOperationBundleSource({repositoryRoot,operationRoot,environment,gitIdentity})` in existing core always uses its hardened independent snapshot, never legacy linked-worktree fallback. Choose a fixed operation control inventory internally; no caller-selected control list/exported generic authority factory. Include all new runtime modules, existing imported control dependencies and root lock. Existing binding callers retain their existing control inventory and behavior.
- Internal `deriveOperationBundlePackageSourceGraph(root)` fixes entry to `scripts/local-operation-bundle-packages.ts` and reuses existing bounded static graph walker. Support this exact entry in the existing Windows-to-pinned-Linux graph path; do not admit arbitrary graph entry selection. Existing native TS hooks consume that graph and already verified YAML.
- Fixed host, binaries, owners, private roots and Git identity are those in the spec and existing local runtime: Ubuntu-24.04/snapmeter(uid1000), Linux x64, Node22.22.3, `/home/snapmeter/.warpkeep/release-preparation-v1/{toolchain,cache,runs}`. Reuse the exact existing Node/Git pins, no ambient executable or executable override. Host wrapper accepts no environment/tool selector.
- Compiler archives are the two fixed esbuild0.28.1 SRI/URL coordinates from the accepted `bootstrap-operation-bundle-cache.mjs`, under `cache/operation-bundles`; do not import bootstrap to initiate networking. Validate the captured root-lock entries against the same constants before archive parsing. No fallback download or install script.
- Parse verified archives using the two existing pure validators exposed under the historical `greaterRealmImmutableArtifactTestSeams` name, as the existing locked-source builder does. Do not use fixture/process/authority seams or change the protected parser. The package helper's complete source graph and YAML must be verified before its import.
- Authenticated esbuild archive members are exactly seven regular files: bin/esbuild9350, install.js11773, lib/main.js97214, package.json3980, LICENSE.md1069, README.md175, lib/main.d.ts23392. Companion members exactly bin/esbuild11407472, package.json372, README.md141. Read archive bytes with bounds/SHA512/inode checks, then derive per-file hashes from authenticated bodies. These observed lengths are regression expectations, not substitutes for archive SRI or namespace hashes.
- Each worker creates its own actual contained `node_modules/esbuild`, `node_modules/@esbuild/linux-x64`, and `node_modules/yaml` namespace. No external links/junctions, no install.js execution, no optional platform widening. Verify exact membership/content/modes/owners/no links before import and after build. Use private0700 directories, non-executable package files0400 and fixed binaries0500. Reuse bounded readers and descriptor-based writes; reject collisions, special files, path escapes and unexpected members.
- Mode clarification:0400/0500 applies to newly materialized compiler packages. YAML retains its existing authenticated manifest modes0644/0755 required by the native hook; verify full copied bytes/membership/owner before and after use. Do not widen the hook's accepted mode policy. Add the new synthetic entry explicitly instead of relying on its legacy PTR fallback.
- esbuild main.js resolves its companion and starts a native `--service=0.28.1 --ping` child. Launch the worker in the existing bounded process-group mechanism, with clean environment excluding all caller NODE_OPTIONS/NODE_PATH/ESBUILD_BINARY_PATH/ESBUILD_WORKER_THREADS and credentials. Use actual contained module resolution, stop the esbuild service, and require descendant termination before success/cleanup.
- Capture source once, then create eight independent non-hardlinked materializations bound to captured commit/tree (two per fixed lane). Use the hardened Git boundary before any Git command and reattest source/control bytes. Do not let the second build read first-build filesystem output or the engine module's own checkout. Source member graph/digests must bind the committed materialization; dependencies bind the authenticated package namespace. Reject changed source at final reattestation.
- Private worker request: fixed schema/profile, nonce, captured source identity, exact lane, source materialization and handoff under one owned operation root. FD3 bounded1MiB, exact keys/path relations; result JSON bounded64KiB; artifact handoff bounded4MiB per lane. Reuse existing bounded request/process patterns without accepting caller success records. Each build timeout5minutes, each load30seconds, output cap4MiB, process termination5seconds. Clean failure retains diagnostics, returns no family, preserves primary plus cleanup errors.
- Actual load child imports the emitted artifact with pinned Node from a separate private directory, checks exact sorted exports from the engine's fixed metadata, and awaits the fixed factory with empty input expecting the existing failure code. Matching a caller-authored loaded flag is forbidden. Parent verifies nonce, digest and exact response shape; timeouts/wrong exports/unexpected success/errors fail closed.
- Compare both builds' complete bytes, source-closure digest, manifest entries, exports and fixed artifact metadata for each lane. Copy verified output bytes before cleanup, return only once all four lanes and final source/tool/package checks pass. Any earlier failure stops later lanes and yields no partial success.

- [ ] **Step 1: Write focused failing tests for real boundaries.** Add public argument/platform/preload/override rejection, exact fixed compiler selection and corrupt/missing archive rejection with zero network, extra/symlink/package mutation rejection, distinct eight source roots, two-build byte/manifest mismatch, changed captured source, wrong load exports/factory success/digest/nonce, load timeout/descendant survival, early-lane stop, and primary+cleanup error preservation. Internal fixtures exercise production orchestration; no production seam exposes caller-selected authority. Add real temp-directory namespace tests, not only mocked stat results.

```ts
await expect(derivePreparedLinuxOperationBundles(undefined)).rejects.toBeInstanceOf(Error);
expect(new Set(observedSourceRoots).size).toBe(8);
expect(observedLanes).toEqual(['activation','activation','g001','g001','g002','g002','ptr','ptr']);
expect(first.bytes).toEqual(second.bytes);
expect(first.graphManifest).toEqual(second.graphManifest);
```

- [ ] **Step 2: Run intended missing-module RED.**

```powershell
& '.git/ci-node-22.22.3/node.exe' 'node_modules/vitest/vitest.mjs' run tests/localOperationBundleRuntime.test.ts tests/localOperationBundlePackages.test.ts
```

Record the actual missing implementation failure; broad rejection tests must not pass on ERR_MODULE_NOT_FOUND. Tighten public codes and side-effect assertions before implementation.

- [ ] **Step 3: Implement the fixed package and snapshot adapters.** Reuse existing algorithms through narrowly named internal wrappers, not verbatim copies of the hardened Git/materialization/transport machinery. Verify imported code before evaluation; no ambient package loader. If the existing parser/loader cannot support authenticated compiler packages without expanding authority, report the exact interface conflict before modifying protected code.

```js
const source = captureFixedOperationBundleSource(fixedContext);
const graph = deriveOperationBundlePackageSourceGraph(source.root);
// Worker receives validated graph and fixed namespace, not public callbacks.
```

- [ ] **Step 4: Implement the real eight-build and four-load path.** Bound workers and children; compare and copy all output before cleanup. Share engine rules and existing process containment. Ensure Windows host launches fixed WSL and Linux public function performs real work, not a profile-only shim. Metadata-only CLI and in-process family bytes must correspond to the same verified operation.

```js
const artifact = await buildSealedRealmOperationBundle({lane,sourceRoot:materializedRoot,build:verifiedCompiler.build});
// Stop compiler service, reattest namespace, then hand off verified bytes.
```

- [ ] **Step 5: Run covering tests and types, commit exact task files.** Include existing source-boundary/process tests affected by core changes, both accepted bundle suites, and new runtime/package tests. Report exact tested source identity and commands. Keep protected34roots unchanged and check raw working bytes against HEAD.

Existing affected test files: `tests/localBindingRuntime.test.ts`, `tests/localBindingRuntimeParent.test.ts`, `tests/localBindingRuntimeLifecycle.test.ts`, `tests/allRealmLocalBindingComposition.test.ts`. Include the native-hook test file located by its direct import when amending the synthetic entry. Select focused tests while iterating and run covering files once for final tested source.

```powershell
& '.git/ci-node-22.22.3/node.exe' 'node_modules/typescript/bin/tsc' --project tsconfig.app.json --noEmit --tsBuildInfoFile .git/tsbuildinfo/local-operation-bundle-runtime.app.tsbuildinfo
```

- [ ] **Step 6: Exercise committed public runtime natively.** Use fixed env-i WSL command below; capture source commit/tree, per-lane counts/digests/sizes, two independent-build comparisons, actual load results and cleanup evidence. A failed run is a defect to diagnose, not permission to change expected hashes blindly. No provider or generated repository installation.

```powershell
& 'C:/Windows/System32/wsl.exe' --distribution Ubuntu-24.04 --user snapmeter -- /usr/bin/env -i LANG=C.UTF-8 LC_ALL=C.UTF-8 /home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/scripts/local-operation-bundle-runtime.mjs
```

## Self-review and remaining scope

One task owns package/worker/core/public interfaces, avoiding parallel edits across their security boundary. Real native execution is part of task acceptance; mock-only success is insufficient. Root lock and protected historical source are inputs, not edits. The result is the complete verified bundle family for the later final transaction; generated declarations/manifest/consumer pins, atomic refreeze, authenticated deployment and live verification remain required under the full goal.
