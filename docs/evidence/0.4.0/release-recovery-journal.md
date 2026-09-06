# Prepared release journal checkpoint — 2026-09-07

Base: `8206df6ae7c464e46ddfde090d2c9f575bdfc205`.

Implemented a bounded canonical journal codec and pure all-target rollback
reconciliation. Records are source-bound data, not authenticated authority.
The fixed Task 7 output namespace excludes G001 bindings. Exact file identities,
hashes, modes, ownership, device and aggregate limits are checked. Inconsistent
or changed observations reject the complete proposed rollback before any action
list is returned. This component performs no filesystem writes.

Verification with Node 22.22.3:

- Initial behavior RED: 23 failures against temporary unimplemented functions.
  Those functions were replaced by the real implementation before this checkpoint.
- Windows Vitest: 57 passed, one explicit Linux-only skip, 2.23 seconds.
- WSL Ubuntu Linux UID1000 Vitest: all 58 passed, 140 ms.
- `node node_modules/typescript/bin/tsc -b`: exit 0.

Focused command: `node node_modules/vitest/vitest.mjs run tests/localReleaseRecoveryJournal.test.ts`.
Linux ran the same source/test files in an owned temporary root with a native
Node test environment. The Linux-only case captures actual stat/hash facts,
performs real rename replacement and restoration, then confirms that changed
restored bytes are rejected and remain untouched. Other recovery cases use
explicit metadata fixtures; they are not filesystem or process-crash tests.

Still mandatory: the native locked installer, durable staging/journal fsync,
interruption/restart tests, complete-family generation and same-source checks,
independent post-install verification, repeat-run convergence, and reviewed
integration. No complete journal marker, verification receipt, final freeze,
admission change, database operation, or deployment was produced here.

Independent read-only review approved this bounded component after the native
handoff contract explicitly ordered durable rollback-terminal recording before
sibling cleanup, and declarations were narrowed to the enforced mode/profile
values. The reviewer did not approve native durability or the full assembler.
