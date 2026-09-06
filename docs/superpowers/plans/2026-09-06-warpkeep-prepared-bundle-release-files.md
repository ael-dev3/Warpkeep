# Prepared bundle release files implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Derive all four bundle/declaration pairs and their manifest for the complete release assembler.

**Architecture:** A pure serializer consumes the accepted Linux bundle result and captured declaration bytes, checks exact fixed lane relationships and byte digests, and returns copied output files. Reuse the bundle engine's fixed lane definitions. The fixed assembler, not this serializer, establishes source authority and installs files.

**Tech Stack:** Node22 builtins-only ESM, existing bundle engine, Vitest and TypeScript.

**Spec:** docs/superpowers/specs/2026-09-06-warpkeep-local-release-assembler-design.md.

## Global Constraints

- Preserve all G001 adoption projection bytes and G001 generated bindings.
- G002 remains sealed; PTR remains owner-only.
- No credentials, provider mutations, generated repository installation or node_modules modification.
- No caller-supplied callback or executor is production authority.
- This component is not the complete assembler, final freeze, or deployment.
- Preserve existing legacy bundle builder API and fixed lane semantics.

### Task 1: Derive complete operation bundle release files

**Files:** modify scripts/sealed-realms-production-bundle-engine.mjs and .d.mts; create scripts/local-prepared-bundle-files.mjs and .d.mts; create tests/localPreparedBundleFiles.test.ts. Cover tests/sealedRealmsProductionBundles.test.ts and tests/sealedRealmsProductionBundleEngine.test.ts.

**Interfaces:**
- Add getSealedRealmOperationBundleSpecification(lane) to the engine. Return its existing deeply frozen lane spec; reject unknown lanes with existing error identity. Do not duplicate LANE_SPECS in the new serializer or expose an override.
- Add derivePreparedOperationBundleFiles({bundles,entryDeclarations}). bundles has the exact result shape declared by local-operation-bundle-runtime.d.mts; entryDeclarations is a native Map containing exactly the four workflow-entry.d.mts paths derived from the fixed engine entry paths, each Uint8Array.
- Return frozen {profile,sourceCommit,sourceTree,files}, with unchanged Linux preparation profile. files is a frozen path-sorted array of frozen {path,bytes} with copied bytes: eight bundle/declaration files and scripts/sealed-realms-production-bundle-manifest-v1.json. This result grants no authority.
- Exact options and nested keys; sourceCommit/sourceTree lowercase40hex. Require exactly activation/g001/g002/ptr in existing runtime order. Reject duplicates, missing/extra lanes, wrong basename/exportNames/factoryExport/factoryFailureCode, mismatched load byteDigest/exports/failureCode/profile, wrong body hash, malformed graph paths/duplicates/order/digests/byte lengths. Use the engine's existing graph hashing rules; extract a shared validation helper if needed rather than inventing another digest domain.
- Bundle cap4MiB each, declaration cap64KiB each, aggregate32MiB before copying, manifest cap1MiB. Error class LocalPreparedBundleFilesError with fixed code LOCAL_PREPARED_BUNDLE_FILES_INVALID; do not include raw inputs. Reject nonbytes, empty files, invalid UTF8 declarations, CR bytes or NUL in declarations. Do not mutate/wipe caller buffers; wipe owned intermediates on failure.

**Declaration rule:** Workflow-entry declarations already describe the exact two exported functions and import dispatcher types through a same-directory relative path. Copy captured declaration bytes unchanged to the corresponding .bundle.d.mts path. Validate exactly the two fixed top-level exported function names with no other export declaration, export assignment or reexport. Reject additional external imports; retain the existing type-only ./sealed-realms-production-dispatch.mjs import. Do not replace signatures with any/unknown, regenerate generic wrappers, or strip private branded types. Tests must compile consumer fixtures against all four resulting declarations and compare their accepted/rejected operation inputs with entry declarations. If reliable declaration syntax validation needs a parser beyond builtins, report the concrete constraint before introducing an ambient dependency.

**Manifest rule:** schemaVersion1, profile Linux preparation profile, sourceCommit, sourceTree, bundles in fixed runtime lane order. Each record field order: lane,path,byteLength,sha256,sourceClosureDigest,graphManifest,declaration,exportNames,factoryExport,factoryFailureCode. declaration fields path,byteLength,sha256. Preserve validated graphManifest records {path,byteLength,sha256}. Serialize JSON.stringify(value,null,2) plus trailing LF; no timestamps, absolute paths or host-private locations. Manifest records derive from copied bytes, never claimed digest values without checking.

- [ ] **Step 1: Write meaningful RED tests.** Use small valid bundle fixture bodies and independently calculated hashes/graphs based on existing engine fixtures. Prove all nine exact output paths, declaration byte preservation, complete manifest content, stable repeat generation and output/caller nonaliasing. Mutation matrix must cover every rejection described above, including one-field load mismatches and a declaration exporting an extra function. Missing-export RED must be distinct from broad rejection assertions.

```ts
const result = derivePreparedOperationBundleFiles({ bundles, entryDeclarations });
expect(result.files.map(file => file.path)).toEqual(expectedNinePaths);
expect(result.files.find(file => file.path === manifestPath)?.bytes).toEqual(expectedManifestBytes);
expect(derivePreparedOperationBundleFiles({ bundles, entryDeclarations })).toEqual(result);
```

- [ ] **Step 2: Run RED.**

```powershell
& '.git/ci-node-22.22.3/node.exe' 'node_modules/vitest/vitest.mjs' run tests/localPreparedBundleFiles.test.ts
```

- [ ] **Step 3: Implement shared fixed metadata access and pure serialization.** Reuse existing lane source and graph rules. The core emission is:

```js
const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
files.push({ path: 'scripts/sealed-realms-production-bundle-manifest-v1.json', bytes: manifestBytes });
```

Validate every input before emitting a complete family; no filesystem reads/writes, network calls, code evaluation or authority minting in this pure function. Captured declaration bytes are source data, not executable modules.

- [ ] **Step 4: Run focused and covering tests, declaration consumer compile and types.** Use exact existing Node22/Vitest command above plus identified engine/legacy builder tests. Run:

```powershell
& '.git/ci-node-22.22.3/node.exe' 'node_modules/typescript/bin/tsc' --project tsconfig.app.json --noEmit --tsBuildInfoFile .git/tsbuildinfo/prepared-bundle-files.app.tsbuildinfo
```

Compile disposable declaration consumers with the existing compiler, without altering dependencies or generated working-tree files. Include real current four entry declarations as fixtures, captured from committed Git blobs (not Windows line-ending-converted working files). Record baseline failures separately; no generated pin/count updates here.

- [ ] **Step 5: Self-review, exact commit and report.** Commit feat: derive complete operation bundle release files. Report RED/GREEN, all commands/results, consumer ABI evidence, source preservation and exact commit. Independent review required.

## Successor contract

The complete assembler must call the authenticated fixed builders itself, capture declarations from that same committed source, invoke this serializer, derive all other closure/consumer outputs, and execute the full native recoverable transaction. This task neither replaces that work nor proves live readiness.

## Self-review

This plan implements only the bundle/declaration family responsibility of the assembler spec; source capture, complete consumer generation and durable transaction remain explicit successor requirements. Fixed lane metadata is produced by the existing engine and consumed by the serializer without a second catalog. Source/declaration bytes remain data and cannot mint authority. The source-graph digest domain is the existing engine's JSON tuple ['warpkeep-sealed-realms-production-source-graph-v1',lane,manifest]; extract/reuse that computation rather than duplicate it. All new interfaces are defined above; output namespace and byte ownership have explicit tests. No final generated installation occurs here.
