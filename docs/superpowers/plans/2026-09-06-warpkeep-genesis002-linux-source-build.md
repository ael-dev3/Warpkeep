# Genesis 002 Linux locked source build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan with independent review.

**Goal:** Provide the real fixed Linux G002 dependency materializer needed by local final binding generation.

**Architecture:** Extend the existing nonfrozen locked-source implementation with a private immutable G002 source profile and a fixed public wrapper. Reuse archive installation, contained links, descriptor identity checks and cleanup; validate the real workspace lock instead of substituting PTR's lock. This task produces a synchronous source-build capability, not installed bindings or a release.

**Tech Stack:** TypeScript, pinned SpacetimeDB2.6.1, Linux x64, Vitest, existing safe native writer.

**Spec:** `docs/superpowers/specs/2026-09-05-warpkeep-local-release-preparation-design.md`.

## Global Constraints

- Keep all GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS bytes unchanged, including root package/lock and historical source/build helpers. No G001 binding writes.
- G002 remains sealed and PTR owner-only. No credentials, deployment, database changes or admission changes.
- Preserve existing PTR Darwin/Linux API, errors, closure domains and validation behavior.
- No arbitrary public profile/platform selection, injected authority or root-lock fallback. No generated bindings, bundle or final pin writes in this task.
- Linux source preparation is a component of the full local generation/refreeze pipeline; G001 zero-diff, bundle derivation, final transaction and live release remain successor work.

### Task 1: Fixed G002 workspace-lock materializer

**Files:**
- Modify `scripts/ptr-binding-locked-source-build-core.ts`: share the installation lifecycle through private immutable source coordinates, retain fixed PTR exports, add the fixed G002 implementation.
- Create `scripts/genesis002-binding-linux-locked-source-build.ts`: only the fixed wrapper and named types/error surface.
- Create `tests/genesis002BindingLinuxLockedSourceBuild.test.ts`: workspace-lock and lifecycle regressions.
- Create `tests/genesis002BindingLinuxLockedSourceBuildNative.test.ts`: real Linux native writer/materialization evidence, explicitly skipped on unsupported hosts.
- Create `tests/fixtures/genesis002LockedSourceBuildFixture.ts`: fixture-owned source/archive setup, sharing existing low-level fixture utilities where useful.
- Modify existing PTR fixture/tests only when necessary for shared test utility extraction; do not dilute existing assertions.

**Interfaces:**

```typescript
export type Genesis002SourceBuildInput<T> = Readonly<{
  repositoryRoot: string;
  moduleSourceCommit: string;
  dependencyCacheRoot: string;
  materializationParent: string;
  operation: (context: Readonly<{
    materializedRoot: string;
    dependencyClosureDigest: string;
    moduleTreeId: string;
  }>) => T;
}>;
export type Genesis002SourceBuildResult<T> = Readonly<{
  result: T;
  dependencyClosureDigest: string;
  moduleTreeId: string;
}>;
export function withGenesis002LinuxLockedSourceBuild<T>(
  input: Genesis002SourceBuildInput<T>,
): Genesis002SourceBuildResult<T>;
```

Require explicit canonical private materializationParent for G002: no production-admin default path. Public inputs accept exactly these five keys. The callback is the synchronous build consumer, never a source of platform/toolchain authority. Preserve thenable rejection and retained-failure semantics.

Export existing PtrBindingLockedSourceBuildError as Genesis002BindingLockedSourceBuildError from the fixed wrapper; preserve existing internal error codes for shared validation in this task, with documented alias identity. No new caller-controlled error/profile factory. The actual workspace closure differs from PTR: get-tsconfig4.14.0 and prettier3.9.5 (PTR4.14.3/3.9.6). Define a distinct private immutable exact G002 graph; do not substitute the PTR graph or modify either lock. Other selected Linux edges follow the checked-in workspace snapshots, including exclusion of Darwin-only fsevents. Validate workspace YAML's exact packages ['.','genesis002','migration-fixtures/*'] and allowBuilds {esbuild:true}, without executing package hooks.

G002 coordinates are fixed: module `spacetimedb/genesis002`, manifest at that module's package.json, lock `spacetimedb/pnpm-lock.yaml`, workspace file `spacetimedb/pnpm-workspace.yaml`; private child `genesis002-locked-source-builds-v1`; permitted generated paths only module node_modules and dist/bundle.js. Do not install into the frozen workspace root. Reattest all consumed source authority before/after the callback; preserve primary and cleanup failures. Bind manifest, actual workspace lock, workspace bytes, selected dependency graph and installed snapshot into distinct domain `warpkeep-genesis002-workspace-linux-x64-dependency-closure-v1`; retain exact old PTR digest bytes.

Validate lock version9 and exact settings/importers. Importers are `.`, `genesis002`, `migration-fixtures/production-v1`, `migration-fixtures/current-candidate-inspection`, and `migration-fixtures/additive-v2-schema` through `additive-v17-schema`. Root/G002 dependencies are spacetimedb2.6.1 and dev dependencies esbuild0.25.12,tsx4.20.6,typescript5.6.3. Fixture importers have spacetimedb2.6.1 and typescript5.6.3 only. Reject extra/missing/version/alias/dependency fields, invalid selected optional metadata and wrong platform. Select actual Linux-x64 closure from the workspace lock; preserve SRI, archive bounds and complete installed manifest checks. Do not hardcode a package count without deriving it from the checked-in lock first.

- [ ] **Step 1: Add RED contract/lifecycle tests before implementation.** Fixture exposes `input`, expected independently computed closure and materialization snapshot. Test the real wrapper absent initially, then exact operation success, return/result provenance and cleanup. Example assertion shape:

```typescript
const before = fixture.sourceSnapshot();
const result = withGenesis002LinuxLockedSourceBuild({
  ...fixture.input,
  operation: ({ materializedRoot }) => fixture.assertInstalledG002(materializedRoot),
});
expect(result.dependencyClosureDigest).toBe(fixture.expectedClosureDigest());
expect(fixture.sourceSnapshot()).toEqual(before);
```

Fixture methods above must independently inspect the actual installed package/link bytes and graph, not call the production digest implementation. Test both PTR wrappers unchanged. Distinct cases: root/G002/fixture importer drift; missing/extra importer; wrong archive bytes; incompatible/widened native metadata; source/workspace/lock mutation; internal link escape; unexpected generated file; dependency mutation; callback throw/thenable; cleanup failure retaining original cause; unknown input keys and omitted parent rejected before materialization. Native test must use real writer and actual committed temporary fixture source, not mocked OS/modes/git/writer.

- [ ] **Step 2: Run RED then implement fixed profile and wrapper.**

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/genesis002BindingLinuxLockedSourceBuild.test.ts --maxWorkers=1
```

- [ ] **Step 3: Run covering G002 and existing PTR suites, app typecheck, and actual Linux native test.** Record exact commands and complete results, separating Windows fixture evidence from Linux native evidence. Use existing pinned Linux runtime/cache in a disposable unprivileged directory; no production-private mounts or credentials. Do not install dependencies into the root node_modules junction.

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/genesis002BindingLinuxLockedSourceBuild.test.ts tests/ptrBindingLinuxLockedSourceBuild.test.ts tests/ptrBindingLockedSourceBuild.test.ts --maxWorkers=1
& .git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -p tsconfig.app.json --tsBuildInfoFile .git/genesis002-linux-source.tsbuildinfo
```

- [ ] **Step 4: Self-review, commit only task files, report tests/limits.** Preserve unrelated working-tree changes. No broad staging. Report any source-profile/API design mismatch before inventing a fallback. Real generation integration remains explicitly downstream; this materializer must nonetheless execute its real native lifecycle successfully.
