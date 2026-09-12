# Task 1 report — persistent construction and completed-building effects

Status: implementation complete for the Task 1 backend/adapters scope. Base was `ac5d5e3160dc3c34ace401bd128eabf50b6a018e`; the accepted Worker predecessor is `d0d4d0ac073f34f8c19b1b0af3f30c0075ec71d8` in that history. No G001 source, root package/lock, dependency tree, checked-in generated binding, release pin, credential, deployment, or live database was changed.

## Implementation

- Added the dependency-free construction core with the fixed layout digest, six permanent building rows, one project row, five levels, exact quote fingerprinting, checked resource/timestamp/revision arithmetic, exact replay, receipt retention, placement/upgrade invariants, schedule repair and once-only completion.
- Added project-first then ordinal Worker reconciliation with one aggregate revision and an explicit accumulated keep passed through both subsystems.
- Moved generic revision/command commit helpers to `commands.ts`; existing Worker command fingerprints and public semantics remain intact.
- Added real PTR construction storage and procedure wiring. Owner auth and ready-atlas validation precede the core (including replay), while G002 exposes the identical wire and fails closed before storage access.
- Added private `gameplay04_building_v1` and `gameplay04_project_v1` families and changed the single SDK scheduler family to exact mutually-exclusive `worker`/`project` lanes. Whole-graph validation enforces five stable rows, four Worker rows and one project row; callback matching includes id, keep, lane, payload and due time.
- Connected reads, dispatch and scheduler callbacks to real persisted completed levels/effects. A due project resolves before Workers and before a new dispatch target captures yield/travel; ongoing journeys retain their captured values.
- Extended public keep projection with layout binding, bounded building/project state, completed levels and derived effects without private identifiers, receipts, keys, FID or sessions.
- Updated exact module/schema/source contracts to PTR 31 private families, G002 30 private families, the construction owner procedure, and an absent client scheduler surface.

## TDD evidence

RED command:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/gameplay04Construction.test.ts tests/gameplay04ConstructionModules.test.ts --maxWorkers=1
```

Expected RED: both new suites failed to load because `spacetimedb/gameplay04/construction`, `spacetimedb/gameplay04/reconciliation`, and the two realm `gameplayConstruction.ts` adapters did not exist. Result: 2 failed test files, implementation had not been written.

Focused iteration after core/adapters: 9 files passed, 109/109 tests. The first app-wide typecheck then correctly caught five fixture-only typing errors (a `WorkerSlot04` clone omitted required optional-valued properties and zero-level fixtures inferred literal zero values); the fixture declarations were corrected without weakening production types.

Final exact brief suite:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/gameplay04Construction.test.ts tests/gameplay04ConstructionModules.test.ts tests/gameplay04Workers.test.ts tests/gameplay04WorkersModules.test.ts tests/gameplay04Keep.test.ts tests/gameplay04KeepModules.test.ts tests/gameplay04Policy.test.ts tests/gameplay04Placement.test.ts tests/gameplay04WorkerJourney.test.ts --maxWorkers=1
```

Result: exit 0; 9/9 test files passed, 109/109 tests passed; duration 15.61s. Coverage includes earned-resource purchase/deduction, permanent level-zero placement, completion boundary/once-only replay, immutable upgrades, Builder busy, Cathedral future-project duration, all four insufficient-resource paths, quote/layout/policy/placement failures, transaction rollback, all six placements, actual PTR gather/build/complete/dispatch effect capture, project plus multiple due Workers in one revision, five-row unified scheduler replacement with transient sixth row and rollback, malformed lanes, foreign project identity, stale/missing/disabled callbacks, auth renewal/expiry/cross-database checks, G002 caller classes, and legacy empty flags.

Exact source/module contract command:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/ptrRealmBackend.test.ts tests/genesis002SealedBackend.test.ts --maxWorkers=1 --reporter=dot -t 'PTR schema appends|PTR registers only|compiled PTR payload|every G002 table descriptor'
```

Result: exit 0; 2/2 files passed, 4 selected tests passed and 16 unrelated tests skipped. This executes the actual PTR build/source graph assertion as well as exact PTR/G002 private-family and owner-procedure assertions.

## Type, build and ABI evidence

All exact TypeScript commands exited 0 with no diagnostics:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -p tsconfig.app.json --tsBuildInfoFile .git/gameplay04-construction.tsbuildinfo
& .git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -p spacetimedb/ptr/tsconfig.json --noEmit
& .git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -p spacetimedb/genesis002/tsconfig.json --noEmit
```

Both actual pinned CLI builds exited 0 with `Build finished successfully.`:

```powershell
& 'C:/Users/heyas/AppData/Local/Programs/SpacetimeDB/2.6.1/spacetime.exe' build --module-path spacetimedb/ptr
& 'C:/Users/heyas/AppData/Local/Programs/SpacetimeDB/2.6.1/spacetime.exe' build --module-path spacetimedb/genesis002
```

Both exact fresh ABI-generation commands exited 0 and ended `Generate finished successfully.`:

```powershell
& 'C:/Users/heyas/AppData/Local/Programs/SpacetimeDB/2.6.1/spacetime.exe' generate --lang typescript --out-dir .git/gameplay04-construction-abi/ptr --module-path spacetimedb/ptr
& 'C:/Users/heyas/AppData/Local/Programs/SpacetimeDB/2.6.1/spacetime.exe' generate --lang typescript --out-dir .git/gameplay04-construction-abi/genesis002 --module-path spacetimedb/genesis002
```

PTR codegen reported these 31 skipped private tables:

`access_request_v1, admin_audit, allowed_fid, alpha_terms_acceptance_v1, castle, gameplay04_building_v1, gameplay04_keep_v1, gameplay04_project_v1, gameplay04_receipt_v1, gameplay04_reservation_v1, gameplay04_schedule_v1, gameplay04_worker_v1, greater_realm_activation_v1, greater_realm_castle_claim_v1, greater_realm_castle_slot_v1, greater_realm_cell_occupancy_v1, greater_realm_cell_v1, greater_realm_chunk_v1, greater_realm_navigation_component_v1, greater_realm_release_v1, greater_realm_resource_node_v1, mark_account_v1, player, player_ownership_v2, player_v2, ptr_owner_anchor_v1, realm_atlas_v1, realm_atlas_visible_region_v1, realm_profile_v1, realm_worker_system_v2, resource_account_v1`.

G002 codegen reported the same set except `ptr_owner_anchor_v1`, proving 30 skipped private tables. Both generated `tablesSchema` objects are empty. Both generated procedure schemas contain exact `start_gameplay04_building_v1` input/output; PTR contains the approved owner calls, and neither generated index contains `run_gameplay_04_schedule_v_1` or another callable scheduler symbol.

`git diff --check` over every task file exited 0. A scoped G001 diff assertion also exited 0 with no paths.

## Files

Created:

- `spacetimedb/gameplay04/construction.ts`
- `spacetimedb/gameplay04/reconciliation.ts`
- `spacetimedb/ptr/src/gameplayConstruction.ts`
- `spacetimedb/genesis002/src/gameplayConstruction.ts`
- `tests/gameplay04Construction.test.ts`
- `tests/gameplay04ConstructionModules.test.ts`

Modified:

- `spacetimedb/gameplay04/commands.ts`
- `spacetimedb/gameplay04/workers.ts`
- `spacetimedb/ptr/src/{gameplayKeep,gameplayWorkers,gameplaySchedule,gameplaySchema,schema,schemaContract,contract,index}.ts`
- `spacetimedb/genesis002/src/{gameplayKeep,gameplaySchema,schema,population,index}.ts`
- `tests/gameplay04KeepModules.test.ts`
- `tests/gameplay04WorkersModules.test.ts`
- `tests/ptrRealmBackend.test.ts`
- `tests/genesis002SealedBackend.test.ts`

## Self-review and remaining gates

- Re-read the task brief against the implementation and traced replay/fresh command order, accumulator use, state validation, scheduler matching, completion-before-dispatch effects, rollback boundaries and aggregate revision behavior.
- Confirmed actual generated ABI rather than relying only on source fixtures; verified empty public tables and absent scheduler callability.
- The checked-in PTR/G002 binding snapshots were intentionally not refreshed under this task contract. Their existing final equality gate remains a downstream release integration gate and will become green only when the release owner deliberately refreshes checked-in bindings.
- No live PTR/G002 database migration, owner runtime/browser journey, deployment, activation, reset or release-readiness claim was performed. Those remain downstream acceptance gates.

## Review round 1 fixes — 2026-09-06

Review base: `999a60c`. The original report's coverage sentence was broader than its evidence: the original 109/109 suite did **not** exercise dispatch/recall as the transaction that settles both construction and multiple Worker returns, nor all construction-specific rejection/auth/callback cases. The following evidence supersedes that claim.

Added focused core coverage for construction receipt conflict, sequence gap, stale revision, pruned replay, aggregate revision overflow and rollback; invalid kind, levels zero/six, overlapping placement and support-boundary rejection; and corrupted canonical building identity/project quote graphs. Every rejection asserts the complete construction/Worker/keep/receipt/schedule snapshot remains unchanged.

Added real PTR adapter coverage in which:

- direct dispatch, with no preceding read, settles a due Mill and two due Worker returns, carries the credited balance through the command, preserves an ongoing expedition's captured yield10, captures yield12 for the new expedition, and advances revision/sequence once;
- direct recall, with no preceding read, settles the same due project/returns plus the recalled ongoing expedition and advances revision/sequence once;
- a later target rejection and a final keep-persistence failure each roll back the earlier project/Worker reconciliation and all command mutations;
- a current project callback completes exactly once without consuming command sequence;
- a failed project callback rolls back, simulated engine cleanup removes the wakeup, and an authenticated read completes exactly once;
- a disabled owner can neither complete nor repair a missing project wakeup, while re-enabling permits authenticated recovery;
- exact start-building replay is rejected under expired and cross-database credentials before receipt lookup, then succeeds inertly under a renewed owner session.

These review tests passed against the existing production implementation; no production defect was demonstrated and no production source changed in this fix. One initial disabled-owner test run failed because advancing to the project due time also expired the fixture JWT (`INVALID_PTR_OWNER_SESSION` masked the intended anchor check). Renewing the fixture session before the disabled-owner read corrected the test setup; the focused rerun passed 4/4 selected cases.

Focused review command:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/gameplay04Construction.test.ts tests/gameplay04ConstructionModules.test.ts tests/gameplay04KeepModules.test.ts --maxWorkers=1
```

Result: exit 0; 3/3 files and 39/39 tests passed.

Updated exact brief suite:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/gameplay04Construction.test.ts tests/gameplay04ConstructionModules.test.ts tests/gameplay04Workers.test.ts tests/gameplay04WorkersModules.test.ts tests/gameplay04Keep.test.ts tests/gameplay04KeepModules.test.ts tests/gameplay04Policy.test.ts tests/gameplay04Placement.test.ts tests/gameplay04WorkerJourney.test.ts --maxWorkers=1
```

Result: exit 0; 9/9 files and 119/119 tests passed; duration 15.07s.

Review typecheck:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -p tsconfig.app.json --tsBuildInfoFile .git/gameplay04-construction-fix1.tsbuildinfo
```

Result: exit 0 with no diagnostics.

The original build/generation console output was not retained as a workspace artifact. Fresh post-fix builds and generation were therefore run after the source was stable. Their complete credential-free stdout, exact commands, exit codes and provenance are retained verbatim in `task-1-build-output.txt`. Both builds and both generators exited 0; codegen again reports PTR31/G00230 skipped private families, the exact construction procedure, empty public table schemas and no generated callable scheduler.

G002 rationale: `spacetimedb/genesis002/src/gameplayWorkers.ts` remains an unconditional closed procedure implementation and has no SDK storage decoding; `spacetimedb/genesis002/src/gameplaySchedule.ts` remains an unconditional closed reducer whose argument references `gameplay04ScheduleV1.rowType`. The realm-local schema change therefore updates that callback ABI automatically. Editing either closed file would be a no-op, so they intentionally remain unchanged; the shared schema-shape and all-caller closure tests cover this behavior.

Downstream gates remain unchanged: checked-in binding refresh/equality, live database preservation evidence, actual owner runtime/browser journey, release preparation and deployment are not completed by this backend task.
