# Task 1 report: real private keep initialization and authenticated state read

Status: `DONE_WITH_CONCERNS`

Base: `582339bbb98aada9a1bdd3870a14a582c3c1bc55`

Implementation commit: `374c91d` (`feat(gameplay04): persist private keep initialization`)

## Implementation

- Added a dependency-free Gameplay 0.4 keep authority with the required row and storage interfaces, exact keep/worker/receipt identities, strict ordinary-record input checks, u64/i64 and bounded-string validation, canonical initialization fingerprints, bounded stored-state scans, immutable read results, replay/conflict/expiry/gap handling, and fail-closed binding/state validation.
- Initialization persists one private keep, four retained worker slots (ordinals 0 through 3), and one receipt through the supplied transaction adapter. The authority performs no authorization itself and accepts no injectable authorization callback.
- Added fresh, structurally matching module-local private table descriptors to PTR and G002 for `gameplay04_keep_v1`, `gameplay04_worker_v1`, and `gameplay04_receipt_v1`. Primary keys and `keepId` indexes match the brief; no descriptor is public or autoincrementing.
- Added the real PTR procedures `initialize_gameplay04_keep_v1` and `get_gameplay04_keep_v1`. Each enters `ctx.withTx`, calls `requirePtrOwner(tx)` and then the existing exported `requirePtrReadyAtlas(tx)`, derives the binding from the transaction database identity, authenticated FID, validated atlas release/revision/root cell, uses the server timestamp, and delegates all storage operations to the shared authority.
- PTR responses expose only the declared gameplay state/result shapes. Owner FID, keep ID, request keys, fingerprints, credentials, JWT contents, and receipts are not returned.
- Added matching G002 procedure shapes. Both enter the actual transaction and unconditionally throw `SenderError('GENESIS002_GAMEPLAY_CLOSED')` before gameplay storage access for anonymous, owner, and admin callers.
- Extended G002's population-empty guard with direct counts for all three new gameplay tables without changing the legacy public population snapshot type.
- Appended the exact procedure names and private schema accessors without adding gathering, construction, scheduler, G001, public-table, or release-pin surface.

## TDD evidence

### Initial behavioral RED

The two new focused suites and their rollback-capable storage/real-module fixtures existed before production implementation.

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/gameplay04Keep.test.ts tests/gameplay04KeepModules.test.ts --maxWorkers=1
```

Exit code: `1`.

Behavioral output after correcting test-only fixture/compiler setup (that fixture correction was not counted as RED):

```text
FAIL tests/gameplay04Keep.test.ts
  Error: Failed to resolve import "../spacetimedb/gameplay04/keep"
FAIL tests/gameplay04KeepModules.test.ts
  Error: Build failed: Could not resolve "./spacetimedb/ptr/src/gameplayKeep.ts"
  Error: Build failed: Could not resolve "./spacetimedb/genesis002/src/gameplayKeep.ts"
```

There were no production keep authority or module adapter files at this point.

### Authority GREEN

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/gameplay04Keep.test.ts --maxWorkers=1
```

Exit code: `0`; `1` file and `9` tests passed.

### First focused adapter GREEN

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/gameplay04Keep.test.ts tests/gameplay04KeepModules.test.ts --maxWorkers=1
```

Exit code: `0`; `2` files and `17` tests passed.

### Self-review regression RED

Self-review identified that a retained receipt with `resultRevision` ahead of the aggregate keep revision was not rejected.

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/gameplay04Keep.test.ts --maxWorkers=1
```

Exit code: `1`; `1` failed and `9` passed. The new test failed because the expected `GAMEPLAY04_STORED_STATE_INVALID` exception was not thrown.

### Self-review regression GREEN

After adding the receipt-to-aggregate revision invariant:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/gameplay04Keep.test.ts --maxWorkers=1
```

Exit code: `0`; `1` file and `10` tests passed.

## Final focused verification

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/gameplay04Keep.test.ts tests/gameplay04KeepModules.test.ts tests/gameplay04Policy.test.ts tests/gameplay04WorkerJourney.test.ts tests/gameplay04Placement.test.ts tests/ptrOwnerPolicy.test.ts tests/ptrAtlasReadContract.test.ts --maxWorkers=1
```

Exit code: `0`.

```text
Test Files  7 passed (7)
Tests       91 passed (91)
Duration    12.61s
```

The authority suite asserts durable initialization/replay and real state, rollback after a third-worker insertion failure, exact input and boundary validation, missing/changed/orphan/malformed state, receipt replay/conflict/expiry/gaps, retained result revisions, bounded worker/receipt scans, and no reseed. The module suite executes the actual SDK-wrapped registered callbacks and production authorization/atlas/storage adapters, rather than source-string substitutes. It covers missing JWT, admin-as-owner, wrong signed database, expiry, suspension, stale import epoch, changed atlas binding, successful initialized reconnect/status/suspension, privacy-safe response fields, G002 denial for all caller classes, and direct G002 gameplay population counts.

## Typecheck and real module build evidence

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -p tsconfig.app.json --tsBuildInfoFile .git/gameplay04-keep.tsbuildinfo
```

Exit code: `0`; no diagnostics.

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -p spacetimedb/ptr/tsconfig.json --noEmit
```

Exit code: `0`; no diagnostics.

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -p spacetimedb/genesis002/tsconfig.json --noEmit
```

Exit code: `0`; no diagnostics.

Installed CLI inspected before compilation:

```text
C:\Users\heyas\AppData\Local\Programs\SpacetimeDB\2.6.1\spacetime.exe
spacetimedb-cli 2.6.1; commit 052c83fe984a4c4eb7bb4f9afa5c6b1903891d87
```

```powershell
spacetime build --module-path spacetimedb/ptr
spacetime build --module-path spacetimedb/genesis002
```

Exit codes: PTR `0`, G002 `0`.

```text
Build finished successfully.
Build finished successfully.
```

No root dependency installation was performed. The existing G002 module-local SDK is pinned at 2.6.1; the controller prepared PTR's pinned module-local dependencies with the existing frozen lock before compilation.

## Actual generated schema and procedure evidence

Generation used the same installed CLI and wrote ignored evidence only beneath `.git/gameplay04-keep-abi-evidence`:

```powershell
spacetime generate --lang typescript --out-dir .git/gameplay04-keep-abi-evidence/ptr --module-path spacetimedb/ptr
spacetime generate --lang typescript --out-dir .git/gameplay04-keep-abi-evidence/g002 --module-path spacetimedb/genesis002
```

Both commands exited `0`.

- PTR generation enumerated `27` private tables, including all three new gameplay tables.
- G002 generation enumerated `26` private tables, including all three new gameplay tables.
- Both generated `initialize_gameplay_04_keep_v_1_procedure.ts` and `get_gameplay_04_keep_v_1_procedure.ts` SDK files, while the generated module index recorded the required canonical wire names `initialize_gameplay04_keep_v1` and `get_gameplay04_keep_v1` through explicit procedure schema entries.
- Both generated initialize parameter shapes contain, in order, `sequence: u64`, `requestKey: string`, `expectedRevision: u64`, and `policyVersion: string`, returning `Gameplay04InitializeResultV1`.
- Both generated reads have no argument object and return `Gameplay04KeepStateV1`.
- The module integration tests compare the full resolved row field types plus table indexes, constraints, access, and privacy between PTR and G002, not only descriptor names.

## Existing exact module contract tests

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/ptrRealmBackend.test.ts tests/genesis002SealedBackend.test.ts --maxWorkers=1
```

Exit code: `1`; `19` tests passed and `1` failed. The only failure is the deliberately stale checked-in PTR generated-bindings equality assertion: the freshly compiled module now contains the two new procedures and related types, while the checked-in release bindings were intentionally not regenerated by this task.

The source/schema portions were isolated and rerun:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/ptrRealmBackend.test.ts -t "compiled PTR payload" --maxWorkers=1
```

Exit code: `0`; `1` passed, `13` skipped.

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/genesis002SealedBackend.test.ts --maxWorkers=1
```

Exit code: `0`; `6` passed.

This preserves the exact G001/admission/unrelated-surface exclusions while admitting only the explicitly named Gameplay 0.4 keep sources. No blanket isolation guard was removed.

## Files in the implementation commit

```text
spacetimedb/gameplay04/keep.ts
spacetimedb/genesis002/src/gameplayKeep.ts
spacetimedb/genesis002/src/gameplaySchema.ts
spacetimedb/genesis002/src/index.ts
spacetimedb/genesis002/src/population.ts
spacetimedb/genesis002/src/schema.ts
spacetimedb/ptr/src/atlasReadReducers.ts
spacetimedb/ptr/src/contract.ts
spacetimedb/ptr/src/gameplayKeep.ts
spacetimedb/ptr/src/gameplaySchema.ts
spacetimedb/ptr/src/index.ts
spacetimedb/ptr/src/schema.ts
spacetimedb/ptr/src/schemaContract.ts
tests/gameplay04Keep.test.ts
tests/gameplay04KeepModules.test.ts
tests/genesis002SealedBackend.test.ts
tests/ptrRealmBackend.test.ts
```

`tests/ptrAtlasReadContract.test.ts` required no content change. No generated release bindings, release pins, manifests, package files/locks, build products, unrelated documentation, or unrelated dirty files were included.

## Self-review

- Confirmed the staged implementation contained exactly the 17 named task files and passed `git diff --cached --check` with no whitespace errors.
- Reviewed the authority and both adapters against the brief's exact types, names, validation order, transaction order, private-schema requirements, response redaction, storage bounds, and G002 closed behavior.
- Inspected the staged diff for G001, credentials, public tables, stale copied registration names, unintended gathering/construction/scheduler surface, and deleted isolation checks. No unintended production surface was found.
- Found and corrected one stored-state invariant during self-review using an explicit RED/GREEN regression: receipt result revisions may not exceed the current keep revision.
- Preserved the unrelated dirty workspace state and committed only explicit task paths.

## Unresolved concerns and release boundary

- The checked-in PTR generated binding family is now expectedly stale relative to the compiled module. Its exact equality test remains red until the controller's later release-family refreeze. This task intentionally did not mutate generated release artifacts or pins.
- This is the controller-approved incremental persistence slice for the initial three private gameplay families. It is not the complete Gameplay 0.4 release: the final seven-family gameplay model, worker assignment payloads, gathering/construction/scheduler behavior, final generated bindings, and live authenticated acceptance remain required before release.
- No secrets were accessed and nothing was deployed.
