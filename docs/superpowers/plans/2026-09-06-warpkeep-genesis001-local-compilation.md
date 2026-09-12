# Genesis 001 Local Compilation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compile the authenticated historical-plus-freeze G001 source twice with the installed fixed Linux Node24 toolchain and derive reproducible private diagnostic bindings through the existing local runtime.

**Architecture:** Extend the existing fixed-lane parent/worker protocol with one named G001 lane. Keep the preparation worker on Node22 and separately attest the Node24 compiler child. Reuse the accepted G001 source builder without widening its four-key input. This component produces real compilation evidence; it does not claim frontend zero-diff or live compatibility.

**Tech Stack:** Windows/Ubuntu-24.04 WSL, Node22.22.3 worker, Node24.19.0 compiler, SpacetimeDB CLI2.6.1, existing locked TypeScript5.6.3 and SDK2.6.1.

**Spec:** docs/superpowers/specs/2026-09-05-warpkeep-local-release-preparation-design.md

## Global Constraints

- Keep all `GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS` bytes unchanged, including root package/lock and the historical source/build helpers.
- G001 bindings are an exact zero-diff check, never a write target. Existing G001 players and its latest 0.3 behavior remain intact; new admissions remain closed.
- G002 remains sealed and PTR remains owner-only. Local build code neither needs nor receives production credentials, FIDs, raw receipts or database contents.
- No ambient PATH, launcher, preload, home configuration, caller command or executable override is authority.
- Preserve existing PTR/default and paired G002/PTR public APIs and CLI semantics.
- Never delete a good installed runtime or use the retained policy-denied replacement clone.
- Build from one captured committed preparation source; include every transitive executing helper in source attestation.
- Real G001 ABI preservation, current-source/frontend zero-diff, all-realm single-capture integration, four bundles/refreeze, deployment and Desktop delivery remain required successor work. Do not label this component a completed release or compatibility proof.

## Binding-target ruling

Committed `verify-spacetime-bindings.mjs` compares current `spacetimedb/` generation to `src/spacetime/module_bindings/**`. The historical-plus-freeze materializer has a different source coordinate and no committed exact generated TypeScript target. Preserve both checks: current-source/frontend exact zero-diff and frozen backend baseline-descriptor/exact-policy-procedure delta. In this task frozen generated bindings are private diagnostics, compared between independent builds only, never installed over the frontend. The next compatibility task must consume actual compiled descriptors and retain the existing baseline digest `cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03` and legacy surface invariants.

### Task 1: Fixed G001 compiler lane and real two-build derivation

**Files:**
- Modify: `scripts/local-binding-runtime.mjs`, `.d.mts`, `scripts/local-binding-runtime-core.mjs`, `.d.mts`.
- Modify: `scripts/local-binding-runtime-worker.mjs`, `.d.mts`, `scripts/local-binding-runtime-worker-result.mjs`, `scripts/local-binding-native-ts-hooks.mjs` where fixed entry/profile mappings require it.
- Create only if needed for focused compiler authority: `scripts/local-binding-genesis001-compiler.mjs`, `.d.mts`; include both executing dependencies in the existing source closure.
- Test: `tests/genesis001LocalCompilation.test.ts`, `tests/localBindingRuntime.test.ts`, `tests/localBindingRuntimeParent.test.ts`, `tests/localBindingRuntimeLifecycle.test.ts`, `tests/localBindingPairedRuntime.test.ts`, `tests/localBindingNativeTsHooks.test.ts`.

**Interfaces:**
- Consume `withGenesis001LinuxLockedSourceBuild({repositoryRoot, dependencyCacheRoot, materializationParent, operation})`; callback receives `{materializedRoot, dependencyClosureDigest, moduleTreeId}`. Never pass `moduleSourceCommit` to this wrapper.
- G001 fixed module path `spacetimedb`, state child `genesis001-locked-source-builds-v1`, graph entry `scripts/genesis001-binding-linux-locked-source-build.ts`, synthetic entry `warpkeep:genesis001-binding-entry`.
- Worker profile `warpkeep-local-binding-genesis001-worker-v1`; result profile `warpkeep-local-binding-genesis001-worker-result-v1`.
- Produce no-argument `derivePreparedGenesis001LinuxCompilation()` with existing parent profile, sourceCommit/sourceTree, bundleSha256, dependencyClosureDigest, and `diagnosticBindings: readonly {path: string; bytes: Uint8Array}[]`. Diagnostic paths are relative generated paths, not frontend install paths. Return defensive byte copies. Add exact CLI `--genesis001`; it prints only profile/source coordinates/bundle and closure digests/diagnosticBindingCount.
- Fixed compiler `/home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v24.19.0-linux-x64/bin/node`, size125989464, SHA256 `bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12`, uid1000, mode0500, version v24.19.0. Parent/worker remain fixed Node22.22.3.
- Cache uses the accepted G001 source builder's already verified Linux closure; inspect its fixed cache mapping rather than inventing a second installation or falling back to root dependencies.

- [ ] **Step 1: Add failing protocol/API tests.** Follow current runtime mock boundaries. Include:

```ts
await expect(derivePreparedGenesis001LinuxCompilation(undefined as never))
  .rejects.toMatchObject({ code: 'LOCAL_BINDING_RUNTIME_ARGUMENTS_INVALID' });
```

Assert named G001 worker profile resolves only its fixed graph/module/state child; cross-profile results reject; original paired/default outputs are unchanged; the source builder receives exactly four keys. Assert public diagnostics cannot alias internal byte buffers. Assert Node22 cannot satisfy Node24 identity and wrong hash/owner/mode/namespace or post-child identity changes reject before consuming output.

- [ ] **Step 2: Run the new focused tests and record actual RED.** Use `.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/genesis001LocalCompilation.test.ts --maxWorkers=1`. Do not count unavailable WSL as the intended implementation failure.

- [ ] **Step 3: Implement the named lane across graph/request/worker/result/parent.** Preserve fixed old request shapes; derive compiler identity from the fixed G001 profile, not caller-selected paths. Add separate before/after compiler namespace and executable binding. Use the existing owned CLI snapshot and contained build-output checks. In the G001 callback invoke:

```js
command(fixedNode24, [join(moduleRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
  '--noEmit', '--project', join(moduleRoot, 'tsconfig.json')], moduleRoot, 10 * 60_000);
command(request.cliPath, ['build', '--module-path', 'spacetimedb'],
  context.materializedRoot, 10 * 60_000);
```

The G001 command environment must be freshly reconstructed, with fixed Node24 bin as the sole Node-discovery PATH and private existing operation HOME/TMP paths. No inherited caller environment or shell launch. Retain current output/deadline bounds. Prove selected Node24 execution/discovery through code plus actual native command evidence; do not mistake worker Node22 for compiler Node24. Do not alter historical package/tsconfig/source to silence compiler failures; report concrete failures for a scoped ruling.

- [ ] **Step 4: Integrate two private cycles.** Reuse `executeCycle` and `assertReproducibleLocalBindingCycles`; require identical complete bundle bytes, closure digest and every diagnostic binding path/byte. Generate using pinned CLI `generate --lang typescript --yes --no-config --js-path <handoff> --out-dir <owned-output>` without `--include-private`. Keep bounded verified handoff copying before source cleanup, source/tree identity, primary/cleanup error preservation and retained failed operations. No checked-in generated paths are written. Test first/second bundle and binding mutations reject.

- [ ] **Step 5: Run covering GREEN and TypeScript checks.** Run the new suite plus existing runtime/worker/result/paired suites covering amended mappings; name exact paths, commands and complete summaries in report. Run `tsc -p tsconfig.app.json --tsBuildInfoFile .git/genesis001-local-compilation.tsbuildinfo`. Preserve unrelated working edits and the root dependency junction; no package installs there.

- [ ] **Step 6: Commit scoped source/tests, then run actual native derivation.** Execute from this committed checkout using:

```powershell
& 'C:\Windows\System32\wsl.exe' --distribution Ubuntu-24.04 --user snapmeter -- /usr/bin/env -i LANG=C.UTF-8 LC_ALL=C.UTF-8 /home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/scripts/local-binding-runtime.mjs --genesis001
```

Require both real compile/generate cycles to complete and compare; report commit/tree, command, exit/stdout/stderr, compiler identity, bundle/closure digests and diagnostic count. A compile error is incomplete work, not successful installation evidence. Record retained failure roots without credentials; do not delete denied or unrelated paths. Do not rerun already accepted paired native generation unless modified behavior requires it.

- [ ] **Step 7: Self-review and hand off.** Exact scoped `git diff --check`, verify no protected projection or frontend binding changes in task diff, append report with RED/GREEN/native evidence and unresolved compatibility successors, and return commit/status/test summary. Independent task review follows before integration acceptance.
