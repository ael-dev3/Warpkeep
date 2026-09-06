# Task 1 report: shared operation bundle engine

## Result

Implemented the root-explicit internal operation-bundle engine and retained the legacy public wrapper. The wrapper still owns capability attestation, two-build comparison, load attestation, private-state publication, and zeroization; its only build-rule change is delegation to the internal engine with its trusted `REPOSITORY_ROOT` and imported esbuild function. The engine is not exposed through the public CLI or as operator-selected authority.

- Review base: `936c469144e48a3209d09fb602323a75b6d802d2`
- Corrected-baseline prerequisite: `ed81b1bcfc75f3966b479d907776b910c53583a0`
- Extraction source: `527750b89774bc524a1bb7108c78b07082d89240`
- Compiler observed by the baseline probe: esbuild `0.28.1`

## Baseline diagnosis and prerequisite

Before extraction, the prescribed legacy suite was run:

```powershell
& '.git/ci-node-22.22.3/node.exe' 'node_modules/vitest/vitest.mjs' run 'tests/sealedRealmsProductionBundles.test.ts'
```

At the original base it failed all 5 tests at activation graph validation with `SEALED_REALMS_BUNDLES_SOURCE_GRAPH_INVALID`; this was reported before changing a rule and was not used as extraction RED evidence. A bounded real-esbuild metafile probe found exact actual counts `activation=14`, `g001=12`, `g002=131`, `ptr=131`, versus fixed `12/15/127/127`. Subsequent bounded emitted-source probes, each stopped and reported before rule changes, found:

- activation built successfully;
- G001 rejected exact fixed literals from `scripts/genesis001-admission-monitor-current-state.mjs`;
- G002/PTR rejected the two embedded child-program `process.argv` expressions and then the remaining fixed Git/null literals from `scripts/genesis001-binding-frozen-source.mjs`;
- without `preserveSymlinks`, G002/PTR metadata crossed the approved local junction into an external `.pnpm` target and was rejected by graph containment.

The controller amendments authorized only exact counts, exact existing-pattern literal transforms, exact two-expression bootstrap construction, the fixed `preserveSymlinks: true` option, and the existing async-factory test assertion repair. No validator was relaxed, no general escaping was added, and no dependency/junction was installed or changed. The exact transform inventory added was:

- current-state: `/usr/bin/git` x1, `/bin/launchctl` x1, `/usr/bin/plutil` x1, `/dev/null` x2, `/usr/bin/false` x1, `/usr/bin:/bin` x1;
- frozen-source: `/usr/bin/git` x1, `/dev/null` x2, `/usr/bin:/bin` x1, and each of `core.hooksPath=/dev/null`, `core.attributesFile=/dev/null`, `core.excludesFile=/dev/null` x1;
- frozen-source bootstrap: the two exact argv-bearing expressions only, reconstructed at runtime and covered by evaluated-byte equality plus source-shape rejection.

The corrected legacy baseline at exact commit `ed81b1b` passed: 1 test file, 5 tests. There was no unhandled rejection. This evidence remained provisional until the extraction engine tests proved the two child bootstrap strings byte-identical; that test is now GREEN.

## Graph path evidence and delta from `3799797`

All paths below are normalized esbuild metafile input paths. Counts remain exact equality constants, not runtime-derived expectations.

### Activation (14)

```text
scripts/auth-bridge-config-attestation.mjs
scripts/auth-bridge-notification-prepared-deploy-journal.mjs
scripts/auth-bridge-notification-prepared-receipt.mjs
scripts/production-admin-token-budget.mjs
scripts/sealed-realms-production-activation-lane-entry.mjs
scripts/sealed-realms-production-activation-workflow-entry.mjs
scripts/sealed-realms-production-auth-bridge-state.mjs
scripts/sealed-realms-production-continuation.mjs
scripts/sealed-realms-production-dispatch.mjs
scripts/sealed-realms-production-private-state.mjs
scripts/sealed-realms-production-source-authority.mjs
scripts/sealed-realms-production-workflow-authority.mjs
scripts/sealed-realms-production-workflow-evidence.mjs
scripts/sealed-realms-production-workflow-private-state.mjs
```

Delta from the 12-path graph at count-setting commit `3799797`: added `scripts/sealed-realms-production-continuation.mjs` and `scripts/sealed-realms-production-workflow-authority.mjs`; no removals.

### G001 (12)

```text
scripts/genesis001-admission-monitor-current-state.mjs
scripts/genesis001-admitted-player-census.mjs
scripts/genesis001-sealed-launch-adoption.mjs
scripts/sealed-realms-production-continuation.mjs
scripts/sealed-realms-production-dispatch.mjs
scripts/sealed-realms-production-g001-lane-entry.mjs
scripts/sealed-realms-production-g001-workflow-entry.mjs
scripts/sealed-realms-production-private-state.mjs
scripts/sealed-realms-production-source-authority.mjs
scripts/sealed-realms-production-workflow-authority.mjs
scripts/sealed-realms-production-workflow-evidence.mjs
scripts/sealed-realms-production-workflow-private-state.mjs
```

Delta from the 15-path graph at `3799797`: removed `scripts/auth-bridge-config-attestation.mjs`, `scripts/auth-bridge-notification-prepared-deploy-journal.mjs`, `scripts/auth-bridge-notification-prepared-receipt.mjs`, `scripts/production-admin-token-budget.mjs`, `scripts/sealed-realms-production-activation-lane-entry.mjs`, and `scripts/sealed-realms-production-auth-bridge-state.mjs`; added `scripts/genesis001-admission-monitor-current-state.mjs`, `scripts/sealed-realms-production-continuation.mjs`, and `scripts/sealed-realms-production-workflow-authority.mjs`.

### G002 (131)

```text
node_modules/yaml/dist/compose/compose-collection.js
node_modules/yaml/dist/compose/compose-doc.js
node_modules/yaml/dist/compose/compose-node.js
node_modules/yaml/dist/compose/compose-scalar.js
node_modules/yaml/dist/compose/composer.js
node_modules/yaml/dist/compose/resolve-block-map.js
node_modules/yaml/dist/compose/resolve-block-scalar.js
node_modules/yaml/dist/compose/resolve-block-seq.js
node_modules/yaml/dist/compose/resolve-end.js
node_modules/yaml/dist/compose/resolve-flow-collection.js
node_modules/yaml/dist/compose/resolve-flow-scalar.js
node_modules/yaml/dist/compose/resolve-props.js
node_modules/yaml/dist/compose/util-contains-newline.js
node_modules/yaml/dist/compose/util-empty-scalar-position.js
node_modules/yaml/dist/compose/util-flow-indent-check.js
node_modules/yaml/dist/compose/util-map-includes.js
node_modules/yaml/dist/doc/Document.js
node_modules/yaml/dist/doc/anchors.js
node_modules/yaml/dist/doc/applyReviver.js
node_modules/yaml/dist/doc/createNode.js
node_modules/yaml/dist/doc/directives.js
node_modules/yaml/dist/errors.js
node_modules/yaml/dist/index.js
node_modules/yaml/dist/log.js
node_modules/yaml/dist/nodes/Alias.js
node_modules/yaml/dist/nodes/Collection.js
node_modules/yaml/dist/nodes/Node.js
node_modules/yaml/dist/nodes/Pair.js
node_modules/yaml/dist/nodes/Scalar.js
node_modules/yaml/dist/nodes/YAMLMap.js
node_modules/yaml/dist/nodes/YAMLSeq.js
node_modules/yaml/dist/nodes/addPairToJSMap.js
node_modules/yaml/dist/nodes/identity.js
node_modules/yaml/dist/nodes/toJS.js
node_modules/yaml/dist/parse/cst-scalar.js
node_modules/yaml/dist/parse/cst-stringify.js
node_modules/yaml/dist/parse/cst-visit.js
node_modules/yaml/dist/parse/cst.js
node_modules/yaml/dist/parse/lexer.js
node_modules/yaml/dist/parse/line-counter.js
node_modules/yaml/dist/parse/parser.js
node_modules/yaml/dist/public-api.js
node_modules/yaml/dist/schema/Schema.js
node_modules/yaml/dist/schema/common/map.js
node_modules/yaml/dist/schema/common/null.js
node_modules/yaml/dist/schema/common/seq.js
node_modules/yaml/dist/schema/common/string.js
node_modules/yaml/dist/schema/core/bool.js
node_modules/yaml/dist/schema/core/float.js
node_modules/yaml/dist/schema/core/int.js
node_modules/yaml/dist/schema/core/schema.js
node_modules/yaml/dist/schema/json/schema.js
node_modules/yaml/dist/schema/tags.js
node_modules/yaml/dist/schema/yaml-1.1/binary.js
node_modules/yaml/dist/schema/yaml-1.1/bool.js
node_modules/yaml/dist/schema/yaml-1.1/float.js
node_modules/yaml/dist/schema/yaml-1.1/int.js
node_modules/yaml/dist/schema/yaml-1.1/merge.js
node_modules/yaml/dist/schema/yaml-1.1/omap.js
node_modules/yaml/dist/schema/yaml-1.1/pairs.js
node_modules/yaml/dist/schema/yaml-1.1/schema.js
node_modules/yaml/dist/schema/yaml-1.1/set.js
node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
node_modules/yaml/dist/stringify/foldFlowLines.js
node_modules/yaml/dist/stringify/stringify.js
node_modules/yaml/dist/stringify/stringifyCollection.js
node_modules/yaml/dist/stringify/stringifyComment.js
node_modules/yaml/dist/stringify/stringifyDocument.js
node_modules/yaml/dist/stringify/stringifyNumber.js
node_modules/yaml/dist/stringify/stringifyPair.js
node_modules/yaml/dist/stringify/stringifyString.js
node_modules/yaml/dist/visit.js
scripts/atlas/greater-realm-biomes.ts
scripts/atlas/greater-realm-candidate-generator.ts
scripts/atlas/greater-realm-candidate-rejection.ts
scripts/atlas/greater-realm-castle-distribution.ts
scripts/atlas/greater-realm-chunk-benchmark.ts
scripts/atlas/greater-realm-composition.ts
scripts/atlas/greater-realm-contracts.ts
scripts/atlas/greater-realm-geology-authority.ts
scripts/atlas/greater-realm-geomorphology.ts
scripts/atlas/greater-realm-git.ts
scripts/atlas/greater-realm-hydrology-authority.ts
scripts/atlas/greater-realm-legacy-lowlands.ts
scripts/atlas/greater-realm-living-world.ts
scripts/atlas/greater-realm-private-workspace.ts
scripts/atlas/greater-realm-relief-structure.ts
scripts/atlas/greater-realm-runtime-release.ts
scripts/atlas/greater-realm-strategic-audits.ts
scripts/atlas/greater-realm-terraces.ts
scripts/atlas/greater-realm-terrain.ts
scripts/atlas/greater-realm-topographic-qa.ts
scripts/atlas/greater-realm-topography-patch-support.ts
scripts/atlas/greater-realm-topography.ts
scripts/auth-bridge-config-attestation.mjs
scripts/auth-bridge-notification-prepared-deploy-journal.mjs
scripts/auth-bridge-notification-prepared-receipt.mjs
scripts/genesis001-binding-frozen-source.mjs
scripts/genesis002-activation-receipts.mjs
scripts/genesis002-production-publisher.mjs
scripts/greater-realm-openat.ts
scripts/greater-realm-production-immutable-artifact.ts
scripts/greater-realm-production-provenance.ts
scripts/production-admin-token-budget.mjs
scripts/ptr-binding-locked-source-build-core.ts
scripts/ptr-binding-locked-source-build.ts
scripts/ptr-production-publisher.mjs
scripts/sealed-realms-production-auth-bridge-state.mjs
scripts/sealed-realms-production-continuation.mjs
scripts/sealed-realms-production-dispatch.mjs
scripts/sealed-realms-production-g002-lane-entry.mjs
scripts/sealed-realms-production-g002-workflow-entry.mjs
scripts/sealed-realms-production-private-state.mjs
scripts/sealed-realms-production-reconciliation.mjs
scripts/sealed-realms-production-source-authority.mjs
scripts/sealed-realms-production-workflow-authority.mjs
scripts/sealed-realms-production-workflow-evidence.mjs
scripts/sealed-realms-production-workflow-private-state.mjs
scripts/spacetime-additive-migration-proof.mjs
scripts/spacetime-cli-attestation.mjs
spacetimedb/src/foodSitePolicy.ts
spacetimedb/src/forestLayoutContract.ts
spacetimedb/src/forestLayoutPolicy.ts
spacetimedb/src/goldSitePolicy.ts
spacetimedb/src/lowlandsSurface.ts
spacetimedb/src/resourceSitePlacementPolicy.ts
spacetimedb/src/stoneSitePolicy.ts
spacetimedb/src/waterRevision.ts
spacetimedb/src/waterWorld.ts
spacetimedb/src/woodSitePolicy.ts
spacetimedb/src/world.ts
```

### PTR (131)

The complete PTR list is the complete 131-path G002 list immediately above with exactly these two substitutions and no others:

```text
- scripts/sealed-realms-production-g002-lane-entry.mjs
- scripts/sealed-realms-production-g002-workflow-entry.mjs
+ scripts/sealed-realms-production-ptr-lane-entry.mjs
+ scripts/sealed-realms-production-ptr-workflow-entry.mjs
```

For each of G002 and PTR, the delta from the 127-path graph at `3799797` is: removed `scripts/sealed-realms-production-activation-lane-entry.mjs`; added `scripts/genesis001-binding-frozen-source.mjs`, `scripts/ptr-binding-locked-source-build-core.ts`, `scripts/ptr-binding-locked-source-build.ts`, `scripts/sealed-realms-production-continuation.mjs`, and `scripts/sealed-realms-production-workflow-authority.mjs`.

With `preserveSymlinks: true`, exactly 72 members use the logical `node_modules/yaml/dist/...` namespace, no member starts with `../`, and graph counts remain 131. A before/after option probe showed identical bundle bytes: G002 `7d5686f44ab8ec4f07947f75709dd77f72f42ac343d6277376808ad1d3b051e2`; PTR `dd0529b3bc58b9a276cb24664a49c8759d22462ac0b3a9a7101a82062c828724`.

## TDD and verification

Extraction RED command:

```powershell
& '.git/ci-node-22.22.3/node.exe' 'node_modules/vitest/vitest.mjs' run 'tests/sealedRealmsProductionBundleEngine.test.ts'
```

Expected result observed: the new test file could not resolve `../scripts/sealed-realms-production-bundle-engine.mjs`; 1 file failed during collection and 0 tests ran. This was distinct from the pre-existing baseline failure. The first post-implementation run then exposed a test-only expression-slice syntax error; correcting that test produced 1 file passed, 6 tests passed.

The 6 engine tests prove: node-only/no-bare-package import; equal output from two independently copied roots after relocating one; manifest/source-closure change from a supplied-root mutation; invalid lane and relative root rejection before compiler invocation plus public error identity; real G002 exact 72-path logical YAML graph and exact evaluated bytes for both child bootstrap operations; and fail-closed source-shape rejection.

Combined GREEN:

```powershell
& '.git/ci-node-22.22.3/node.exe' 'node_modules/vitest/vitest.mjs' run 'tests/sealedRealmsProductionBundles.test.ts' 'tests/sealedRealmsProductionBundleEngine.test.ts'
```

Result on extraction implementation: 2 files passed, 11 tests passed. After the combined run, the only source edit was adding two explicit test-helper parameter types; engine-only verification then passed 6/6 and the typecheck below exited 0. Production source was unchanged between the combined run and commit `527750b`.

```powershell
& '.git/ci-node-22.22.3/node.exe' 'node_modules/typescript/bin/tsc' --project tsconfig.app.json --noEmit --tsBuildInfoFile .git/tsbuildinfo/shared-operation-bundle-engine.app.tsbuildinfo
```

Result: exit 0, no diagnostics.

Fresh real-engine artifact capture at extraction source `527750b` compared equal to the exact corrected-baseline capture at `ed81b1b`:

| Lane | Bytes | Byte SHA-256 | Source-closure SHA-256 | Count | Manifest SHA-256 |
|---|---:|---|---|---:|---|
| activation | 143788 | `957f4123cc368ac3c57c48d54560055895e6612df7320dabe53b5501c0acae5b` | `ab5800dc5d5e1359ca43a99d701421059f1d8326c2f42c832ec1cda47e665c19` | 14 | `441548526b3bc387dcfdc9bdb899669c2fd74628cf4103f79feed591f41e64e3` |
| g001 | 117977 | `c6e56b3114bfead0c0f67ba5e4bc04b6af3679d80585969df594658b933b5a63` | `dd5faea207e356544c4a691c59fe696c5477dd4240bcea3a4fb8c873b0621a46` | 12 | `0dd1840d889d51a12efb027a2768a2e45d38d9e48ccfa0f8d1d49a646fa59f7e` |
| g002 | 482695 | `7d5686f44ab8ec4f07947f75709dd77f72f42ac343d6277376808ad1d3b051e2` | `c1761c1184a432b151d12c1ea32e7a8133cd21d91408ccc06d4f29ee47f776ef` | 131 | `32eafdb8b1a1bcc1ef9e4e759dd6981b30531473de92d78dc2b7a6feacb52e6d` |
| ptr | 483730 | `dd0529b3bc58b9a276cb24664a49c8759d22462ac0b3a9a7101a82062c828724` | `1043a6f8e9e40c1d976bd32bc40d32fe55b07814c336476d40fd95e370a49912` | 131 | `dee1559952f271260a186d79d7913d69e39b8c4f047fad0b0285cdc7cbba543c` |

The manifest digest is SHA-256 of the JSON-encoded returned manifest. All four byte lengths, byte digests, source-closure digests, exact manifest entries, and manifest digests matched; there is no extraction delta.

## Protected projection

`GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS` was imported from the verifier and confirmed to contain exactly 34 roots. A read-only probe used `git ls-tree -r HEAD -- <root>` for membership and expected blob IDs, `git hash-object -- <member>` for current working bytes, and `git ls-files --others --exclude-standard -- <root>` for additions. At extraction commit `527750b` it found 143 tracked members, 0 untracked members, and 0 working blobs differing from `HEAD`. `git diff --name-only 936c469..527750b -- <34 roots>` was empty, so committed bytes were also unchanged across the full task source range.

The exact 34 roots checked were:

```text
package.json
package-lock.json
spacetimedb/package.json
spacetimedb/pnpm-lock.yaml
spacetimedb/pnpm-workspace.yaml
spacetimedb/tsconfig.json
spacetimedb/src
spacetimedb/scripts
scripts/genesis001-frozen-materializer.mjs
scripts/genesis001-frozen-materializer.d.mts
scripts/genesis001-frozen-publisher-core.ts
scripts/genesis001-frozen-publisher-runtime.ts
scripts/genesis001-frozen-publisher.ts
scripts/greater-realm-production-immutable-artifact.ts
scripts/greater-realm-production-provenance.ts
scripts/greater-realm-production-transport.ts
scripts/production-admin-token-budget.mjs
scripts/publish-spacetime-dev.mjs
scripts/spacetime-cli-attestation.mjs
scripts/hermes-admin.ts
scripts/hermes-machine-output.ts
scripts/founder-admission-authority.ts
scripts/profiles/founder-admission-plan.ts
scripts/access-requests/reset-plan.ts
scripts/admission-notifications/recovery-plan.ts
scripts/genesis001-census-privacy-safe-receipt.mjs
scripts/genesis001-admission-monitor-suspension.ts
scripts/greater-realm-legacy-production-seal.mjs
scripts/greater-realm-production-publisher.ts
scripts/greater-realm-production-publisher-core.ts
scripts/greater-realm-production-import-operator.ts
scripts/greater-realm-production-relocation-operator.ts
scripts/greater-realm-downstream-release-policy.ts
docs/operations/greater-realm-production-launch-envelope.sh.txt
```

## Files and self-review

Prerequisite commit `ed81b1b` contains only the amended task brief, legacy wrapper baseline correction, and legacy regression test. Extraction commit `527750b` contains only:

```text
scripts/build-sealed-realms-production-bundles.mjs
scripts/sealed-realms-production-bundle-engine.mjs
scripts/sealed-realms-production-bundle-engine.d.mts
tests/sealedRealmsProductionBundleEngine.test.ts
```

`git diff --cached --check` was clean before the extraction commit. The existing modified `scripts/build-sealed-realms-production-bundles.d.mts`, extensive unrelated LF/CRLF dirt, ignored build-info files, Python caches, and the external `node_modules` junction were not staged or changed by the task. Two bounded diagnostic temporary graph projections were removed after use.

Self-review against the brief found no public signature change, no new arbitrary lane/entry/output selection, no import-time filesystem work in the engine, no bare runtime dependency import, and no ambient repository root read. The engine validates exact input shape, lane, absolute root, and compiler function before invocation, and preserves exact build options, transforms, graph hashing, output validation, and error-class identity.

## Remaining concerns and scope boundary

`preserveSymlinks: true` provides stable logical metafile paths but is not canonical filesystem containment or dependency-package attestation. The future fixed Linux wrapper must attest that its real YAML dependency namespace is contained and approved. This task does not implement Linux runtime/bootstrap, eight independent materializations, bounded load children, bundle/declaration family installation, refreeze, or final transaction; all remain successor work.
