# All-realm Binding Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive current-G001 zero-diff evidence, historical upgrade compatibility, and installable G002/PTR bindings from one captured preparation source.

**Architecture:** Add one fixed no-argument operation to the existing Linux runtime. Reuse its accepted lane workers and hardened independent snapshot, keeping one source identity through all executions and final cleanup. Do not compose the public operations, because they independently capture and clean their sources.

**Tech Stack:** Existing pinned Windows/WSL Linux Node22/Node24, SpacetimeDB2.6.1 and Vitest.

**Spec:** `docs/superpowers/specs/2026-09-05-warpkeep-local-release-preparation-design.md`

## Global Constraints

- Keep all `GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS` bytes unchanged, including root package/lock and the historical source/build helpers.
- G001 bindings are an exact zero-diff check, never a write target.
- G002 remains sealed and PTR remains owner-only.
- Local build code neither needs nor receives production credentials, FIDs, raw receipts or database contents.
- Capture one committed preparation source tree.
- Generate bindings with pinned CLI `--no-config --js-path` into separate private output trees.
- G001 is public zero-diff; G002 uses `--include-private`; PTR is public.
- Preserve unrelated dirty files and the existing Windows dependency junction. Do not install packages into it.

### Task 1: One-capture composed operation

**Files:**
- Modify: `scripts/local-binding-runtime.mjs` and `.d.mts` (public fixed API and CLI summary).
- Modify: `scripts/local-binding-runtime-core.mjs` and `.d.mts` (single-context routing, graphs, lane roots and result).
- Modify only if required for graph closure: `scripts/local-binding-native-ts-hooks.mjs`.
- Create: `tests/allRealmLocalBindingComposition.test.ts`.
- Modify as required: `tests/localBindingRuntimeParent.test.ts`, `tests/localBindingRuntime.test.ts`, `tests/localBindingRuntimeLifecycle.test.ts`, `tests/localBindingNativeTsHooks.test.ts`.

**Interfaces:**
- Produce `derivePreparedAllRealmLinuxBindings()` with zero arguments (explicit undefined rejects), CLI `--all-realms`.
- Core fixed wrapper: `deriveFixedAllRealmLocalBindingRuntime()`; mode is private `all-realms`, not a caller-selectable arbitrary profile.
- Public result exact keys: `profile`, `sourceCommit`, `sourceTree`, `genesis001`, `genesis002`, `ptr`.
- `profile` remains `warpkeep-spacetime-binding-final-preparation-linux-x64-v1`.
- `genesis001` exact keys: `current`, `compatibility`.
- `current` exact keys: `bundleSha256`, `dependencyClosureDigest`, `bindingFileCount`.
- `compatibility` exact keys: `baselineBundleSha256`, `frozenBundleSha256`, `baselineDescriptorSha256`, `frozenDescriptorSha256`, `checkedFrozenWriters`; retain existing exact six-writer tuple.
- `genesis002` and `ptr` use existing `PreparedLinuxRealmBindings` shape, copying byte arrays. No G001 binding bytes, raw bundles, paths or credentials in public result. CLI prints metadata/counts only, never binding bytes.
- Consume existing internal `executeFixedGenesis001CurrentBindingParentCycles`, `executeFixedGenesis001CompatibilityParent`, `executeFixedPairedLocalBindingParentCycles` with fixed per-lane graphs and disjoint private cycle directories. No second source capture.

- [ ] **Step 1: RED public contract.** Add and run the missing operation test before implementation:

```ts
import { expect, it } from 'vitest';
import * as runtime from '../scripts/local-binding-runtime.mjs';
it('exposes one fixed all-realm derivation', () => {
  expect(runtime.derivePreparedAllRealmLinuxBindings).toEqual(expect.any(Function));
});
```

Run `.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/allRealmLocalBindingComposition.test.ts`. Record actual missing-export failure.

- [ ] **Step 2: Reuse fixed snapshot and graphs.** Extend private mode predicates so all-realms attests both Node namespaces and both dependency caches. Select the current-G001 hardened independent snapshot before the first Git command. Derive current-G001, compatibility, G002 and PTR graphs from that same snapshot. Keep legacy modes unchanged. Reuse immutable per-lane context copies; never mutate a shared graph field between asynchronous executions.

```js
const allRealms = mode === 'all-realms';
// The existing needsGenesis001 predicate must also include allRealms.
// snapshotCommittedSource's final hardened-snapshot selector:
const useIndependentSnapshot = genesis001Current || allRealms;
```

- [ ] **Step 3: Execute all gates before success.** Run current-G001 first, then historical compatibility, then paired G002/PTR. Give current and compatibility separate owned lane roots so cycle-1 paths cannot collide; paired already owns G002/PTR roots. Inspect compatibility proof placement and preserve its actual existing worker/parent agreement: do not relocate only one end. Keep its process-group containment and proof cleanup after acceptance. Reuse all two-build/typecheck/generate comparisons; compatibility already performs its historical builds internally. Compare each returned commit/tree to the one captured source and re-attest source/toolchain before final success. Any lane error rejects the entire operation and retains diagnostics; no partial public result.

```js
if (lane.sourceCommit !== context.source.commit || lane.sourceTree !== context.source.tree) {
  fail('LOCAL_BINDING_RUNTIME_SOURCE_CHANGED');
}
```

- [ ] **Step 4: Test composition behavior, not only shape.** Use existing parent process fixtures/mocks to inspect real parent routing. Cover exact same source for every request, distinct lane/cycle paths, correct graphs and worker profiles, Node24 availability for compatibility, G001/PTR public generation and G002 private generation, current mismatch, compatibility rejection, G002/PTR failure, source drift, cleanup failure, absence of later lanes after early failure, and no G001 byte leakage. Preserve existing public operations and caller/host rejection tests. Assert result keys and deep-copy isolation:

```ts
expect(Object.keys(result).sort()).toEqual([
  'genesis001', 'genesis002', 'profile', 'ptr', 'sourceCommit', 'sourceTree',
]);
expect(Object.keys(result.genesis001).sort()).toEqual(['compatibility', 'current']);
expect(Object.keys(result.genesis001.current).sort()).toEqual([
  'bindingFileCount', 'bundleSha256', 'dependencyClosureDigest',
]);
```

- [ ] **Step 5: Covering GREEN and commit.** Run new composition tests plus the four affected suites listed above and `tests/genesis001CurrentBindingCheck.test.ts`. Run app TypeScript with `--noEmit --tsBuildInfoFile .git/tsbuildinfo/all-realm-binding-composition.app.tsbuildinfo`. Stage only exact task files and commit source before native execution; preserve existing dirt and protected paths.

- [ ] **Step 6: Actual composed native acceptance.** Execute once at committed source:

```powershell
& C:/Windows/System32/wsl.exe --distribution Ubuntu-24.04 --user snapmeter -- /usr/bin/env -i LANG=C.UTF-8 LC_ALL=C.UTF-8 /home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/scripts/local-binding-runtime.mjs --all-realms
```

Record actual source/tree, all metadata/counts, exit code and cleanup. Poll the same process handle through observation timeouts; never restart because a poll expires. On failure retain diagnostics and diagnose exact cause; do not substitute previous independent successes. No remote/provider operation or credentials are needed.

- [ ] **Step 7: Report and review.** Write full RED/GREEN commands/results, native evidence, exact changed paths and all 34 protected-path comparison into task report; commit report separately. The deliverable is the composed real binding operation, not four-operation-bundle generation, refreeze, frontend integration or live deployment. Those remain required successor work.

## Self-review

This task implements the spec's missing single-capture realm composition using already accepted workers. Public G001 metadata-only and installable G002/PTR shapes are distinct. Existing historical compatibility includes frozen builds, so an additional standalone frozen compilation would duplicate that gate without adding necessary evidence. Four operation bundles and final atomic installation remain separate reviewable tasks, not removed release requirements. No source-generation writes or provider authorization changes are part of this task.
