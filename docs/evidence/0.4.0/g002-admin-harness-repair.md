# G002 administrator harness repair — 2026-09-07

Completed [Verify run 34081082873](https://github.com/ael-dev3/Warpkeep/actions/runs/34081082873), source `714fdfffd3bcb3d93784a8de604d32f5dd5adba7`, passed the module, auth bridge, recovery and native-contract jobs but failed Linux tests. The output recorded two suite-load failures and 68 failed tests. This repair addresses only the `genesis002AdminBoundary` suite-load failure; closure/refreeze and other failures remain separate.

The failure reproduced locally against source `3f27c464`: esbuild could not resolve `table` from the harness's virtual `spacetimedb/server` module when bundling the existing gameplay schema. All 43 boundary tests were skipped because setup failed. The mock predated the existing sealed gameplay exports and also lacked their scalar/chaining types.

The test-only repair supplies the registration-time `table`/scalar methods and updates the exact exported and registered ABI expectation to include the already implemented five sealed gameplay procedures and schedule reducer. No production code, admission policy or database state changes. Existing admin claim, sender binding and lifecycle/import checks remain intact.

A new test invokes all six real bundled gameplay handlers with valid admin credentials and no JWT. A guarded database getter fails any read or write, including inside `withTx`; every handler returns `GENESIS002_GAMEPLAY_CLOSED` without touching that getter. The initial test incorrectly prohibited entering a transaction; inspection showed the existing handlers intentionally deny inside the transaction, so the test was corrected to measure the required no-database-access behavior instead. This is local mocked-runtime evidence, not live zero-write evidence.

Local boundary suite: 44 tests passed. Final related run included `genesis002AdminBoundary`, `gameplay04KeepModules`, `gameplay04WorkersModules` and `gameplay04ConstructionModules`: 79 tests passed; root `tsc -b` exited zero. Independent review approved the test-only repair. CI must rerun on the pushed repair before any claim that the Linux job is fixed.
