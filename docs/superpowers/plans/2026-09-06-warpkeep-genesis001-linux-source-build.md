# Genesis 001 frozen Linux source build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for implementation and independent review. Do not start until the paired Linux binding task's review is resolved.

**Goal:** Supply an authenticated, frozen G001 source/dependency materialization for the local compiler without modifying historical source or installing generated bindings.

**Architecture:** Add one fixed Linux wrapper and one internal frozen-source adapter to the existing locked-source lifecycle. Reuse the safe dependency installer; preserve existing PTR and G002 wrappers. The adapter reconstructs the fixed historical source and applies only the existing pinned materializer's deterministic admission freeze, then verifies its exact source inventory before and after the callback.

**Tech Stack:** Existing TypeScript source-build core, descriptor-bounded filesystem helpers, fixed Git, pinned Linux npm archives; actual native installer verification under WSL.

**Spec:** `docs/superpowers/specs/2026-09-05-warpkeep-local-release-preparation-design.md`.

## Global Constraints

- Keep all `GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS` bytes unchanged, including root package/lock and the historical source/build helpers. G001 bindings are an exact zero-diff check, never a write target.
- G002 remains sealed and PTR remains owner-only. Local build code neither needs nor receives production credentials, FIDs, raw receipts or database contents.
- The shared implementation exports no arbitrary profile factory or injection seam. All private profile data is immutable and selected by the fixed wrappers.
- Keep bounded descriptor reads, archive/SRI checks, real contained package links, source reattestation, thenable rejection, exact output allowance, retained failures and primary/cleanup error preservation. Root lock fallback stays absent.
- This task provides the source/dependency builder, not compiler or binding completion. Fixed Node24 bootstrap, two real compiled G001 builds/public zero-diff generation, four bundles and final refreeze remain required successor tasks.

### Task 1: Fixed historical Linux wrapper and frozen materialization adapter

**Files:**
- Create `scripts/genesis001-binding-linux-locked-source-build.ts`: narrow named wrapper/type/error exports.
- Create `scripts/genesis001-binding-frozen-source.mjs` and `.d.mts`: internal fixed historical source construction, bounded descriptor inventory, identity verification and success cleanup.
- Modify `scripts/ptr-binding-locked-source-build-core.ts`: private fixed G001 profile and adapter selection; reuse installer and verification lifecycle, no copied second installer.
- Create `tests/genesis001LinuxLockedSourceBuild.test.ts` and `tests/genesis001BindingFrozenSource.test.ts`; reuse existing locked-source test archive fixtures without changing their authority semantics.

**Interfaces:**

```typescript
export interface Genesis001SourceBuildInput<T> {
  readonly repositoryRoot: string;
  readonly dependencyCacheRoot: string;
  readonly materializationParent: string;
  readonly operation: (source: Readonly<{
    materializedRoot: string;
    dependencyClosureDigest: string;
    moduleTreeId: string;
  }>) => T;
}
export interface Genesis001SourceBuildResult<T> {
  readonly result: T;
  readonly dependencyClosureDigest: string;
  readonly moduleTreeId: string;
}
export function withGenesis001LinuxLockedSourceBuild<T>(
  input: Genesis001SourceBuildInput<T>,
): Genesis001SourceBuildResult<T>;
```

Exactly four input keys; reject unknown keys, missing materialization parent, caller commit/profile/platform/commands before materialization. Preserve the shared error constructor using a named G001 alias, as the existing G002 wrapper does. The historical commit is internal, never an input. `moduleTreeId` is the authenticated historical Git tree; it does not claim the post-freeze bytes are an unchanged Git tree. Bind the exact frozen byte inventory separately within source verification and the G001 closure digest.

Fixed source commit `2ae51984e1fa6ce5b0028c1a250359fed79d819b`, tree `90deebb5faf4129282f5c35999244f540001b27d`. Use `materializeGenesis001Frozen` from the unchanged `scripts/genesis001-frozen-materializer.mjs`, requiring its blob `c50182e99ed2e2fab1ca994c905818d383782cfc` and SHA256 `a85df9f4c76f26ecd171e0ab7d1fcc03b928eb9b3331df188598628b10e58a93` before execution. Read it only from the authenticated repository source, not an ambient loader or caller substitute. Historical dependency blobs, in manifest/lock/workspace order, are `faf7214653f1248a3f9231fd6a13dda130821014`, `649efdebd25528f593aff612ca8aef6f761d1e94`, `a640febaa07fad295f2de4b4416b7a22910eb2e6`.

Use distinct closure domain `warpkeep-genesis001-frozen-linux-x64-dependency-closure-v1` and private child `genesis001-locked-source-builds-v1`. Module root is `spacetimedb`; dependency output is only `spacetimedb/node_modules`, compiler output only `spacetimedb/dist/bundle.js`. No root node_modules or arbitrary prefix allowance. Manifest/lock/workspace live under historical `spacetimedb/`. Validate the historical workspace root plus migration-fixtures pattern and exactly15 importers (root, production-v1, additive-v2 through additive-v14), not the current G002 workspace. Fixed Linux graph has15 packages; exact package records/snapshots agree with the existing G002 Linux graph, but source authority and closure domain remain G001-specific. Independently verify any reused cached archive against the historical lock.

The adapter creates a fresh private owned destination, authenticates the historical objects and materializer, reconstructs frozen source, and records all regular source paths, bytes/digests, descriptor identities and directory identities. Reject symlinks, reparses/escapes, duplicate/noncanonical paths, unexpected entries, and source mutation. Reuse existing bounds unless an actual bounded source observation requires a documented change. Verify before dependency installation, before callback, after callback, and after removal of owned bundle/dependencies. No filesystem snapshot taken after untrusted callback may become the new expected authority. The freeze transform must be independently tied to the pinned materializer plus historical bytes, not accepted solely because it emitted metadata constants. On failure retain owned materialization as existing lifecycle does; never recursively clean an unverified replaced namespace. On success use identity-bound cleanup and preserve primary/cleanup errors.

- [ ] **Step 1: Write RED interface and native-fixture tests.** Include this boundary in the complete existing-style fixture:

```typescript
expect(() => withGenesis001LinuxLockedSourceBuild({
  ...validInput,
  moduleSourceCommit: '0'.repeat(40),
} as never)).toThrow();
expect(operation).not.toHaveBeenCalled();
```

Add concrete cases for wrong historical object/tree/dependency blob/materializer bytes, missing freeze guard or policy output, extra source file, source content/inode/symlink replacement before/after callback, lock/importer/platform/SRI mismatch, archive/dependency mutation, async callback, bundle escape, retained failure, cleanup error and deterministic identical closure across two fresh materializations. Positive callback must inspect real installed package bytes; mock-only installer success is insufficient.

- [ ] **Step 2: Implement the fixed adapter and profile through the shared lifecycle.** Keep exported existing APIs/types and their exact profiles unchanged. Do not modify any frozen file to obtain new imports or helpers. Any necessary internal seam is fixed implementation selection, never caller dependency injection.

The existing shared lifecycle unconditionally calls `validateGenesis002Workspace` for a workspace-bearing profile. Its exact package list includes `genesis002` and therefore cannot validate the historical G001 workspace. Select the workspace validator through private immutable profile semantics: G001 requires exactly `['.', 'migration-fixtures/*']`, G002 retains exactly `['.', 'genesis002', 'migration-fixtures/*']`; both retain exact `allowBuilds: { esbuild: true }` and reject unknown keys. Test cross-substitution in both directions, rather than broadening either accepted list.

- [ ] **Step 3: Run covering tests and typecheck.**

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/genesis001LinuxLockedSourceBuild.test.ts tests/genesis001BindingFrozenSource.test.ts tests/genesis002BindingLinuxLockedSourceBuild.test.ts tests/ptrBindingLinuxLockedSourceBuild.test.ts tests/ptrBindingLockedSourceBuild.test.ts --maxWorkers=1
& .git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -p tsconfig.app.json --tsBuildInfoFile .git/genesis001-linux-source.tsbuildinfo
```

The named existing regression files were confirmed with `rg --files tests`; the last suite preserves the Darwin core regression coverage. Report exact commands and terminal results, including platform skips.

- [ ] **Step 4: Commit scoped changes and run actual WSL source/dependency verification.** Use a clean exact-commit clone, pinned preparation Node22 for the source helper only, fixed existing Linux runtime, and real historical-SRI-verified archives. Two independent frozen materializations must return identical closure/source bytes and clean success roots. This is not G001 compiler evidence: compilation still requires Node24. Do not install checked-in bindings or touch production state.

- [ ] **Step 5: Report and independent review.** Record commit/tree, exact source and closure evidence, all tests/commands, retained failures and remaining compiler/binding/runtime work. Verify all34 frozen projection paths remain byte-identical across this task's commit range. No claim of prepared or live release.
