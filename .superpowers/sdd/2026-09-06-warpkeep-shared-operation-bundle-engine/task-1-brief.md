### Task 1: Extract and exercise the root-explicit internal engine

**Baseline amendment:** At BASE936c469 the real esbuild0.28.1 graphs no longer match the historical counts. Before extraction, correct only the four exact graph counts to activation14, g00112, g002131, ptr131 in a separate prerequisite commit. Preserve exact equality checks, source transforms and all other rules. Record complete normalized metafile path lists and their delta from count-setting commit3799797 in the report. Add regression coverage for those exact current graphs; do not use a runtime-derived expected count or widen accepted counts. Run baseline tests again and capture real output at that corrected commit before extraction. If another independent baseline defect appears, report it rather than silently modifying rules. This amendment supersedes count preservation only; artifact comparison is against the corrected baseline, never falsely against failing original BASE.

**Files:**

**Dependency-path amendment:** Set the fixed esbuild option `preserveSymlinks: true` for the shared engine and corrected legacy baseline. Bounded probe proves G002/PTR counts remain131 and output bytes unchanged, while72 YAML paths become `node_modules/yaml/dist/...` instead of external junction targets. Retain graph path rejection, exact counts and byte hashing. This normalizes compiler path identity; it does not prove canonical containment or authorize arbitrary symlink targets. The fixed Linux wrapper must independently attest its real contained dependency namespace. Regression tests must cover the fixed option and normalized graph output; preserve the existing junction without installing or modifying dependencies.

**Fixed Git literal addition:** Extend the exact transform table for `scripts/genesis001-binding-frozen-source.mjs` with `/usr/bin/git`1, `/dev/null`2, `core.hooksPath=/dev/null`1, `core.attributesFile=/dev/null`1, `core.excludesFile=/dev/null`1, matching the existing provenance transform convention. Preserve evaluated strings, exact occurrence rejection and unchanged artifact validation. This completes the reported literal inventory of that newly included helper; inspect all its emitted literals in one bounded pass rather than repeatedly running the full suite per literal. No arbitrary-source/general escaping is authorized.

**Second baseline amendment:** Probe corrected the initial lane attribution: activation builds; G001 fails on fixed tool-path literals in newly included `genesis001-admission-monitor-current-state.mjs`; G002/PTR fail on embedded child-program `process.argv` text in `genesis001-binding-frozen-source.mjs`. Extend only the existing exact-source transform table for the former module: `/usr/bin/git`1, `/bin/launchctl`1, `/usr/bin/plutil`1, `/dev/null`2, `/usr/bin/false`1, `/usr/bin:/bin`1. For the latter, preserve the child bootstrap program's exact evaluated bytes using an exact-match transform of its two argv-bearing string expressions into runtime string construction. Do not globally replace argv or change the materializer source, executable, arguments or semantics. Require source-shape/count mismatch rejection and a test comparing evaluated child-program bytes before/after transformation. These are fixed packaging transforms, not authorization or path-validation bypasses: keep the artifact validator unchanged. Include both corrections in the reviewed prerequisite before capturing the successful baseline. If exact child-program equivalence cannot be established, stop for a different design.
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
