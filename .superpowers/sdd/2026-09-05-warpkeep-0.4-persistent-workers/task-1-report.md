# Task 1 report — persistent Workers

## Implementation

- Added dependency-free command/receipt preflight and bounded Worker assignment/outcome validation. Keep initialization retains its original fingerprint and four empty Worker rows; reads now validate optional state and validate ordinal scalars before sorting.
- Added atomic dispatch, recall, reconciliation, reservation, one-shot wakeup replacement/recovery, ordinal settlement, explicit cap overflow, latest-128 receipt pruning, u64 overflow guards, and single aggregate revision commits. Credits occur only on completed return.
- PTR procedures perform fresh owner JWT, signed database identity, enabled retained FID/auth epoch, ready atlas/root/binding checks before gameplay. Dispatch loads and validates an actual inactive/unassigned resource group, obtains the complete verified parent-tree route, and captures zero completed-building levels (the only current real state).
- PTR scheduler requires database sender/null connection and exact stored callback identity/time. Stale/missing/future callbacks are no-ops; disabled owners cannot settle or repair. Authenticated reconciliation repairs an engine-cleaned missing wakeup only with an exact assignment/reservation graph.
- G002 registers the identical private schema and procedure shapes but every player command and scheduler caller rejects `GENESIS002_GAMEPLAY_CLOSED` before storage.
- Added private reservation/schedule descriptors, structured Worker state, authenticated read projections, exact procedure contracts, source-graph fixtures, and 29/28 intermediate population counts. Legacy G001 rows and inactive/unassigned atlas resource flags are untouched.
- `gameplayScheduleLink.ts` in each realm is an 11-line module-local late-binding cell only. It breaks schema→scheduled reducer→schema ESM initialization while retaining the pinned SDK thunk; it contains no authorization, storage, or gameplay authority.

## TDD evidence

Initial RED:

`& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/gameplay04Workers.test.ts tests/gameplay04WorkersModules.test.ts --maxWorkers=1`

Result: exit 1; both suites failed on missing `spacetimedb/gameplay04/workers.ts` and realm `gameplayWorkers.ts`/`gameplaySchedule.ts`, before implementation.

Scheduler-cleanup recovery RED: the new missing-wakeup test failed `GAMEPLAY04_STORED_STATE_INVALID`; after repair it passed. Self-review RED: 12-test Worker run had two failures (zero-distance recall rejected stored state; forged overdue wakeup was accepted). After the narrow fixes: 12/12 passed.

Final focused GREEN:

`& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/gameplay04Workers.test.ts tests/gameplay04WorkersModules.test.ts tests/gameplay04Keep.test.ts tests/gameplay04KeepModules.test.ts tests/gameplay04Policy.test.ts tests/gameplay04WorkerJourney.test.ts tests/ptrAtlasReadContract.test.ts --maxWorkers=1`

Result: exit 0; 7 files, 80 tests passed. This includes SDK-registered callbacks, a production PTR atlas-loader/storage-adapter dispatch, G002 caller-class closure, rollback, replay, wakeup loss repair, exact timing, overflow, and full-route regression.

Additional contract checks: G002 sealed backend 6/6 passed; PTR exact compiled source graph 1/1 passed (13 skipped). The full PTR backend run intentionally retains one failure: checked-in generated bindings differ from the additive ABI. The equality assertion was not weakened and bindings were not refreshed.

## Compile and ABI evidence

- App TypeScript: `tsc -p tsconfig.app.json --tsBuildInfoFile .git/gameplay04-workers.tsbuildinfo` exit 0.
- PTR and G002 module TypeScript: both `tsc ... --noEmit` exit 0.
- Pinned CLI 2.6.1 generation for PTR and G002: both exit 0. PTR skipped exactly 29 private tables; G002 skipped exactly 28. Generated indices contain exact `dispatch_gameplay04_worker_v1` and `recall_gameplay04_worker_v1` procedure schemas. Neither generated client index contains `run_gameplay` or exposes the private scheduled reducer.
- The first PTR generation RED was `Table gameplay04_schedule_v1 not found`. Module-hook metadata showed the schedule descriptor's registry token was camel-case. Changing only the internal schema registry/accessor token to `gameplay04_schedule_v1` made generation pass; descriptor SQL name and public wires did not change.

## Changed files

Shared: `gameplay04/{commands,workerState,workers}.ts`, `gameplay04/keep.ts`. PTR: `atlasReadPolicy.ts`, `contract.ts`, `gameplayKeep.ts`, `gameplaySchema.ts`, `gameplayWorkers.ts`, `gameplaySchedule.ts`, `gameplayScheduleLink.ts`, `schema.ts`, `schemaContract.ts`, `index.ts`. G002: matching gameplay files plus `population.ts`, `schema.ts`, `index.ts`. Tests: Worker/core/module tests and keep-module, route, PTR backend, G002 backend fixtures. Also included the controller-approved one-line plan amendment.

## Self-review and remaining limits

Reviewed exact command shapes/fingerprints, no-write preflight ordering, route/node bounds, reservation uniqueness, schedule identity/time, callback authority, revision/sequence overflow, rollback, receipt bound, read privacy, G002 closure, and source graph. Fixed forged overdue schedules and zero-distance recall during review. No root package/lock, checked-in binding, deployment, credentials, G001 authority, or legacy population was changed.

This is not final release acceptance: schemas remain the planned intermediate 29/28 (later construction raises them to 31/30 and must bind real completed rows); checked-in bindings require the controller-owned final refreeze; the actual Worker module has not been published and exercised through a fresh authenticated owner journey on the pinned runtime. The controller's separate pinned-engine probe proves one-shot rollback/deletion/successor semantics, but is not claimed as this module's runtime acceptance. The controller's G002 runtime evidence proves outer 403 denial, not inner closed-body or zero-row SQL through that route.

## Fix round 1 — independent-review findings

The original report overstated callback coverage: the Task 1 baseline inspected PTR schedule registration and executed the G002 closed callback, but did not execute the production PTR scheduled reducer. Fix round 1 adds that missing execution and the complete requested adapter callback matrix; the separate pinned-engine probe remains the only real-engine lifecycle evidence.

### RED / GREEN

Core RED command:

`& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/gameplay04Workers.test.ts --maxWorkers=1`

After correcting two coverage-only expectations, exit 1 with 2 substantive failures: immediate recall reconciliation produced `40n` instead of `100n`, and active revision-zero/same-revision-return graphs did not throw. After the fixes, the same command exited 0 with 16/16, later 17/17 after the additional invalid-command coverage.

Production adapter RED command:

`& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/gameplay04KeepModules.test.ts --maxWorkers=1`

Exit 1: a resource group whose only changed fact was a foreign component key did not throw `GAMEPLAY04_TARGET_INVALID` (the second reported failure was an old snapshot literal updated for the expanded five-table snapshot). After binding the first resource row to the destination component, the module test passed. Scheduler-matrix tests exercised already-intended callback behavior and were green when introduced; they close the review's missing execution coverage rather than claim a scheduler production change.

Final focused command:

`& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/gameplay04Workers.test.ts tests/gameplay04WorkersModules.test.ts tests/gameplay04Keep.test.ts tests/gameplay04KeepModules.test.ts tests/gameplay04Policy.test.ts tests/gameplay04WorkerJourney.test.ts tests/ptrAtlasReadContract.test.ts --maxWorkers=1`

Result: exit 0, 7 files and 95 tests passed after all Fix 1 additions.

Registered-module callback evidence command:

`& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/gameplay04WorkersModules.test.ts tests/gameplay04KeepModules.test.ts --maxWorkers=1`

Result: exit 0, 2 files and 22 tests passed. Seven PTR callback-focused tests execute 12 distinct registered-reducer invocations across system/current, future, missing, foreign argument, stale/replacement, foreign sender, connected caller, disabled owner, successful settlement, failed completed settlement, and failed arrival cleanup paths. G002 closed callback execution remains separately covered in the same 22-test result.

Verification after all test changes: app TypeScript exit 0; PTR and G002 module TypeScript exit 0; the PTR exact compiled-source graph test passed 1/1 with 13 unrelated tests skipped. Pinned 2.6.1 PTR and G002 builds had already been rerun after the two production fixes and both exited 0.

### Fixes and coverage

- The immediate-return recall path now supplies the first reconciliation's returned keep to the second pass, preserving all earlier ordinal settlement balances and outcomes. Regression covers Worker A settlement plus zero-distance Worker B recall and exact replay stability.
- Active assignments now require a positive assignment revision, and any retained prior return must be strictly older than the active revision. Matched revision-zero and same-revision graphs reject without mutation before financial reconciliation.
- PTR resource resolution now requires the resource group component to equal the actual destination cell component. Production-adapter tests additionally reject duplicate IDs, noncontiguous release ordinals, and active legacy rows with exact no-write snapshots.
- A rollback-capable adapter harness executes the SDK-registered `runGameplay04ScheduleV1` reducer. Distinct cases cover system/current, missing, stale replacement, future, foreign argument, foreign sender, connected caller, disabled owner, one-time settlement, no sequence consumption, reducer rollback followed by separate engine cleanup, authenticated repair before return, and authenticated one-time settlement after return. Snapshots include all five gameplay tables, keep balance/revision/sequence, fresh schedule identity, and retained legacy inactive/unassigned facts.
- Added pruned replay rejection, stale expected revision after scheduler reconciliation, invalid atlas epoch/duration/resource no-write cases, renewed-session replay before resource loading, expired/suspended/cross-database replay denial, and simulated primary-key race rollback.

Changed in Fix 1: `spacetimedb/gameplay04/workers.ts`, `spacetimedb/ptr/src/gameplayWorkers.ts`, `tests/gameplay04Workers.test.ts`, `tests/gameplay04WorkersModules.test.ts`, `tests/gameplay04KeepModules.test.ts`, and this report.

Limitations remain unchanged: no published authenticated PTR Worker journey was performed; the harness distinguishes reducer transaction rollback from simulated engine one-shot deletion but does not replace the controller's real pinned-engine probe; checked-in bindings remain intentionally stale for final refreeze; schemas remain intermediate 29/28; completed construction levels remain real zero until the later construction lane.
