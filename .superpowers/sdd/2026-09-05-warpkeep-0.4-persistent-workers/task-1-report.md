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
