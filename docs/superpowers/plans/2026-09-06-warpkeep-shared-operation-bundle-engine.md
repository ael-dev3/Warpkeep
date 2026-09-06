# Shared operation bundle engine implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Extract the existing four-lane bundle rules into a root-explicit internal engine, preserving the legacy wrapper and enabling the fixed Linux runner.

**Architecture:** The internal engine receives a build function and one source root from trusted wrappers, never from an operator-facing API. It owns existing lane rules, transforms, graph hashing and artifact validation. The legacy wrapper retains authority validation, load checking, family publication and cleanup.

**Tech Stack:** Node ESM, esbuild 0.28.1, Vitest, TypeScript declarations.

**Spec:** docs/superpowers/specs/2026-09-05-warpkeep-local-release-preparation-design.md, especially Four-operation bundle execution refinement.

## Global Constraints

- Keep all `GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS` bytes unchanged.
- G001 bindings are an exact zero-diff check, never a write target.
- G002 remains sealed and PTR remains owner-only.
- Local build code neither needs nor receives production credentials, FIDs, raw receipts or database contents.
- No generated artifact installation, provider call, dependency installation or node_modules junction mutation in this task.
- Preserve existing Darwin public signatures, error codes, provenance and artifact bytes. Linux runtime/bootstrap and final transaction remain required successor tasks, not completion claims here.

### Task 1: Extract and exercise the root-explicit internal engine

**Files:**
- Create: `scripts/sealed-realms-production-bundle-engine.mjs`
- Create: `scripts/sealed-realms-production-bundle-engine.d.mts`
- Modify: `scripts/build-sealed-realms-production-bundles.mjs`
- Test: `tests/sealedRealmsProductionBundles.test.ts`
- Create: `tests/sealedRealmsProductionBundleEngine.test.ts`

**Interfaces:**
- Consumes existing fixed esbuild build options and four lane specs from `build-sealed-realms-production-bundles.mjs`.
- Produces internal `buildSealedRealmOperationBundle({ lane, sourceRoot, build })` returning the existing artifact shape: lane, basename, bytes, byteDigest, sourceClosureDigest, graphManifest, exportNames, factoryExport, factoryFailureCode.
- `lane` is exactly activation/g001/g002/ptr; `sourceRoot` is absolute; `build` is the wrapper-bound compiler function. This is an internal module interface, not exported through the public wrapper or CLI.
- Move/re-export `SealedRealmsProductionBundlesError` from one definition so existing instanceof checks and public imports retain identity.

- [ ] **Step 1: Capture baseline and write regression tests.** Read existing bundle tests and use their real four-lane fixture conventions. Capture pre-extraction artifact byte hashes/manifests from the existing implementation at BASE; keep this as local test evidence, not generated repository output. Add tests that import the internal engine while rejecting resolution of bare third-party packages, proving engine import does not load esbuild. Add source-root tests using two disposable copies of the same committed fixture; move or mutate the second root and require manifests/transform reads to follow that root, never the engine module directory.

```ts
const first = await buildSealedRealmOperationBundle({ lane: 'activation', sourceRoot: rootA, build });
const second = await buildSealedRealmOperationBundle({ lane: 'activation', sourceRoot: rootB, build });
expect(second.bytes).toEqual(first.bytes);
expect(second.graphManifest).toEqual(first.graphManifest);
expect(second.sourceClosureDigest).toBe(first.sourceClosureDigest);
```

Here rootA/rootB must be independently created fixture directories and build must be the existing test compiler, not a precomputed successful result. Include a changed input test proving a rootB input change affects its manifest or triggers a fixed source rule. Reject invalid lane/relative root before compiler invocation. Reuse established fixture setup rather than duplicating the repository.

- [ ] **Step 2: Run the new test and record the intended failure.**

```powershell
& '.git/ci-node-22.22.3/node.exe' 'node_modules/vitest/vitest.mjs' run 'tests/sealedRealmsProductionBundleEngine.test.ts'
```

Expected initial failure: missing internal module/function. Do not count unrelated infrastructure failures as RED evidence.

- [ ] **Step 3: Extract without changing build rules.** Move LANE_SPECS, path transforms, fixedTransformPlugin, graphManifest, payload validation and buildLane to the internal module. Replace each REPOSITORY_ROOT use with the explicitly supplied sourceRoot; preserve exact transforms, counts, options, hash domain, manifest sorting and validation. Keep fixed four-lane selection and do not accept arbitrary entries or outputs. The engine has only node: imports and performs no import-time filesystem work. Validate the root and lane before calling the compiler.

```js
async function buildLane(lane) {
  return buildSealedRealmOperationBundle({ lane, sourceRoot: REPOSITORY_ROOT, build: esbuild });
}
```

Use this delegation in the legacy wrapper. Keep its two-build comparison, authority/loadHook validation, privateState publication, output shape and zeroization unchanged. Do not yet add a public Linux function backed by an incomplete executor.

- [ ] **Step 4: Verify output and error compatibility.** Run both bundle test files and app types. Compare final real baseline artifact bytes/manifests against the pre-extraction capture on the same source inputs; explain any difference instead of updating expected hashes blindly. Prove a sourceRoot different from the engine repository works and no ambient root read remains. Check the exact 34 protected paths for unchanged committed and working bytes.

```powershell
& '.git/ci-node-22.22.3/node.exe' 'node_modules/vitest/vitest.mjs' run 'tests/sealedRealmsProductionBundles.test.ts' 'tests/sealedRealmsProductionBundleEngine.test.ts'
& '.git/ci-node-22.22.3/node.exe' 'node_modules/typescript/bin/tsc' --project tsconfig.app.json --noEmit --tsBuildInfoFile .git/tsbuildinfo/shared-operation-bundle-engine.app.tsbuildinfo
```

- [ ] **Step 5: Commit exact task files and report.** Commit only the four listed source/test files plus declaration; do not sweep unrelated dirt. Report BASE/source HEAD, baseline/final comparison, exact commands/results, protected-path comparison and limitations. This extraction alone is not native Linux execution or a release artifact family.

## Self-review

This task implements shared rule extraction and root-explicit reads only. Fixed Linux bootstrap, eight independent materializations, real bounded load children, bundle/declaration family output and final transaction are explicitly outstanding. Public legacy interfaces do not change; internal dependency injection is not production authority. One task owns engine and wrapper changes, so no cross-task file conflict exists.
