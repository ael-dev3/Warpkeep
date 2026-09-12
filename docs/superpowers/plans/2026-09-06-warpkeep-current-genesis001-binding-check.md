# Current Genesis 001 Binding Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that public bindings generated twice from the captured current root module exactly match the frontend bindings in that same committed source, without changing either input.

**Architecture:** Extend the existing fixed Linux preparation runtime with a separately named current-root builder and check-only operation. Reuse the current workspace dependency installer, committed materialization, bounded artifact handoff and binding reader. Historical baseline/frozen compatibility remains a separate accepted gate, not the source for this comparison.

**Tech Stack:** Windows/WSL Ubuntu-24.04, pinned Linux Node 22.22.3, SpacetimeDB 2.6.1, existing workspace TypeScript/esbuild and Vitest.

**Spec:** `docs/superpowers/specs/2026-09-05-warpkeep-local-release-preparation-design.md`

## Global Constraints

- Keep all `GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS` bytes unchanged, including root package/lock and the historical source/build helpers.
- G001 bindings are an exact zero-diff check, never a write target.
- G002 remains sealed and PTR remains owner-only.
- Local build code neither needs nor receives production credentials, FIDs, raw receipts or database contents.
- Capture one committed preparation source tree.
- Generate bindings with pinned CLI `--no-config --js-path` into separate private output trees.
- G001 is public zero-diff; G002 uses `--include-private`; PTR is public.
- Reuse the strict binding-tree reader and exact byte/path comparisons. Any mismatch fails.
- Preserve unrelated dirty files and the existing Windows dependency junction. Do not install packages into it.

### Task 1: Fixed current-root build and public binding check

**Files:**
- Create: `scripts/genesis001-current-binding-linux-locked-source-build.ts`
- Modify: `scripts/ptr-binding-locked-source-build-core.ts`
- Modify: `scripts/local-binding-runtime-core.mjs` and `.d.mts`
- Modify: `scripts/local-binding-runtime-worker.mjs` and `.d.mts`
- Modify: `scripts/local-binding-runtime.mjs` and `.d.mts`
- Modify: `scripts/local-binding-native-ts-hooks.mjs` only where required to close the fixed source graph
- Modify: `scripts/local-binding-runtime-worker-result.mjs` and `.d.mts` only where required for the distinct result profile
- Create: `tests/genesis001CurrentBindingCheck.test.ts`
- Modify: `tests/localBindingRuntime.test.ts`, `tests/localBindingRuntimeParent.test.ts`, `tests/localBindingRuntimeLifecycle.test.ts`, `tests/localBindingNativeTsHooks.test.ts`
- Do not edit `src/spacetime/module_bindings/`, `spacetimedb/`, protected projection files, or generated deployment outputs.

**Interfaces:**
- Consume the common installer through a fixed private profile; do not export an arbitrary profile factory.
- Produce `withGenesis001CurrentLinuxLockedSourceBuild<T>(input)` with exact keys `repositoryRoot`, `moduleSourceCommit`, `dependencyCacheRoot`, `materializationParent`, `operation`. Preserve existing callback/result shapes: callback receives `materializedRoot`, `dependencyClosureDigest`, `moduleTreeId`; result contains `result`, `dependencyClosureDigest`, `moduleTreeId`.
- Current-root profile: `moduleRoot: 'spacetimedb'`, manifest `spacetimedb/package.json`, lock `spacetimedb/pnpm-lock.yaml`, workspace `spacetimedb/pnpm-workspace.yaml`, generated prefix `spacetimedb/node_modules/`, bundle `spacetimedb/dist/bundle.js`, state child `genesis001-current-locked-source-builds-v1`, domain `warpkeep-genesis001-current-linux-x64-dependency-closure-v1`.
- Use `materializeCommit` and the existing current workspace package edges/importer graph used by the G002 profile. No historical commit override and no frozen-materializer substitution.
- Produce public `derivePreparedGenesis001CurrentLinuxBindingCheck()` with zero arguments, CLI `--genesis001-current-check`. Explicit `undefined` or any caller options reject.
- Internal worker/result profiles: `warpkeep-local-binding-genesis001-current-worker-v1` and `warpkeep-local-binding-genesis001-current-worker-result-v1`.
- Public result exact keys: `profile`, `sourceCommit`, `sourceTree`, `bundleSha256`, `dependencyClosureDigest`, `bindingFileCount`. Profile stays `warpkeep-spacetime-binding-final-preparation-linux-x64-v1`; count is derived positive integer, not hardcoded. No binding bytes, paths, credentials or success receipt in the public result.

- [ ] **Step 1: Reproduce the absent public operation with a focused test.**

```ts
import { expect, it } from 'vitest';
import * as runtime from '../scripts/local-binding-runtime.mjs';
it('exposes the fixed current G001 check', () => {
  expect(runtime.derivePreparedGenesis001CurrentLinuxBindingCheck).toEqual(expect.any(Function));
});
```

Run `.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/genesis001CurrentBindingCheck.test.ts`; record the actual missing-export failure before adding implementation.

- [ ] **Step 2: Add the separately named builder and its profile tests.**

Reuse the fixed installer and named wrapper export pattern, including error identity and exact-key validation. Verify root-module authority uses the captured commit, complete current workspace lock/importers, installed Linux optional dependency graph, owned private source and independent provenance. Test wrong/missing/widened keys, historical/current profile substitution, source/lock/namespace mutation, and no root-lock fallback. Do not create a second package installer.

```ts
export {
  PtrBindingLockedSourceBuildError as Genesis001CurrentBindingLockedSourceBuildError,
  withGenesis001CurrentLinuxLockedSourceBuild,
} from './ptr-binding-locked-source-build-core';
```

- [ ] **Step 3: Route the fixed worker and source graph.**

Extend fixed profile selection/request/result validation and graph fallback dispatch together. Current-root compilation uses Node22 (not historical Node24), root `spacetimedb/tsconfig.json`, and the installed fixed dependency closure. Generate the root-module bundle through the actual pinned CLI build in the existing private output scheme. Preserve existing lanes and return declarations, including the previously deferred compatibility return-union mismatch where this declaration is touched. Add actual worker-branch tests for selected builder, compiler, module root, failed command, invalid namespace and absence of handoff/result on failure.

- [ ] **Step 4: Compare two generated cycles against committed frontend authority.**

Use the existing captured `context.source` for both cycles and the expected prefix `src/spacetime/module_bindings/`. Capture expected blob paths and bytes from the exact captured commit with the already attested Git and scrubbed environment; do not mistake a mutable worktree directory for committed authority. Bound file count, individual bytes, total bytes and command output consistently with `readSpacetimeBindingTree`; reject noncanonical paths, links, case collisions and non-TS members. Compare generated path sets and raw bytes without CRLF normalization. Re-attest expected source membership/bytes around generation; source mutation fails even when both generated outputs agree.

Call the existing two-cycle reproducibility assertion before the expected-vs-generated check. Both cycles independently typecheck/build/generate, public only: `generate --lang typescript --yes --no-config --js-path <private handoff> --out-dir <private output>` with no `--include-private`. No overwrite, fallback to historical diagnostic bindings, or mismatch acceptance.

```ts
// Required observable assertions in real parent orchestration tests:
expect(generationArgs).not.toContain('--include-private');
expect(generationArgs).toContain('--js-path');
expect(generationArgs).toContain('--no-config');
expect(result.bindingFileCount).toBe(expectedEntries.length);
expect(Object.keys(result).sort()).toEqual([
  'bindingFileCount', 'bundleSha256', 'dependencyClosureDigest',
  'profile', 'sourceCommit', 'sourceTree',
].sort());
```

Test added/missing file, single-byte and newline-only difference, reordered equivalent entries, two-cycle nondeterminism, changed captured expected blob, cross-lane result, source identity mismatch, and no public success after any failure. A mismatch must return a bounded redacted failure code and preserve private diagnostics; it must not change frontend files to make the check green.

- [ ] **Step 5: Wire public entrypoint, CLI and covering verification.**

Keep every existing CLI mode and no-argument API unchanged. Add wrong-host/caller injection tests for the new operation. Verify exact result schema excludes paths and generated bytes. Run focused new tests plus affected source-builder/runtime/parent/lifecycle/native-hook suites and app TypeScript checking with task-owned `.git` build-info path. Do not rerun unrelated production publisher suites on an unsupported Windows host.

- [ ] **Step 6: Commit exact source changes, then run the real fixed native check.**

```powershell
& C:/Windows/System32/wsl.exe --distribution Ubuntu-24.04 --user snapmeter -- /usr/bin/env -i LANG=C.UTF-8 LC_ALL=C.UTF-8 /home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/scripts/local-binding-runtime.mjs --genesis001-current-check
```

Record source commit/tree, command, exit code, metadata and cleanup outcome. If actual current bindings differ, stop claiming acceptance, preserve the fixed check and provide bounded exact relative-path/digest evidence privately to the controller; do not modify protected inputs or widen comparison. Diagnose the mismatch before deciding the next source-integration action. Native success plus independent review is required to accept this gate.

- [ ] **Step 7: Report and review.**

Append the full task report under the plan's SDD workspace, including actual RED/GREEN, covering commands/output, native result, source authority, protected projection comparison, changed files and limitations. Commit report separately after native execution. This task does not replace historical compatibility, all-realm one-capture composition, four-bundle preparation, durable refreeze, live preservation or deployment.

## Self-review

This plan covers only the missing current-source public binding gate from the approved preparation design. The common current workspace installer and strict reader are reused; historical source remains distinct. No protected source writes, production mutations, admissions changes or package-junction installation are required. Interfaces above are defined in this task; success is a real comparison, never generated-output replacement.
