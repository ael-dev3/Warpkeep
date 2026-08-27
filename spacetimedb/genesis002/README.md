# Warpkeep Genesis 002 sealed module

This is the standalone SpacetimeDB module for the sealed Genesis 002 realm.
It is not a migration or replacement for Genesis 001.

## Fixed identity and authority

- Realm: `GENESIS_002`
- Release: `0.4.0`
- Database alias: `warpkeep-genesis-002`
- Module identity: `warpkeep-genesis-002-sealed-v1`
- Atlas: `GENESIS_002_GREATER_REALM`
- Population, claims, occupancy, activation, and Worker state: exactly zero
- Player presentation and admission mutations: disabled

All 23 registered tables are private. The module accepts only the short-lived
administrator principal and exposes no anonymous or ordinary-player status,
SQL, subscription, or procedure surface. Every admission/player mutation
throws `GENESIS_002_ADMISSIONS_SEALED` before a database or audit effect.

Atlas ingestion is the only launch-time write exception. Its seven
administrator reducers stage/import/verify/finalize one exact G002 runtime
release while checking the zero-population boundary before and after every
write. Finalization makes all seven writers reject future calls; it does not
activate the atlas or create public roots.

## Local gates

From the repository root:

```sh
pnpm --dir spacetimedb/genesis002 run verify
npm run stdb:generate-genesis002
npm run stdb:genesis002:verify-private-loopback
npx vitest run tests/genesis002SealedBackend.test.ts tests/genesis002ProductionImport.test.ts tests/genesis002ProductionPublisher.test.ts tests/genesis002ProductionOperators.test.ts tests/genesis002SealedLiveReceipt.test.ts --maxWorkers=1
```

Generated bindings live under `scripts/genesis002_module_bindings/`. Review
their diff and require exactly 23 private tables and zero public tables.

The loopback gate starts an isolated SpacetimeDB 2.6.1 node, publishes this
module, finalizes a complete atlas fixture through the real wires, and proves
anonymous and non-administrator connection/SQL/subscription/procedure denial.
It never contacts Maincloud.

## Production boundary

Production publication and atlas import are not authorized by this README.
Use only the reviewed order in
`docs/operations/genesis-002-sealed-launch.md`. The G002 publisher must create a
fresh database distinct from immutable Genesis 001, build from exact clean
protected main, use the owner-private Spacetime CLI config boundary, and verify
the returned full identity. The G002 import operator accepts only the exact
regenerated `GENESIS_002_GREATER_REALM` runtime release and the seven atlas
writers.

Never use the legacy Greater Realm/G001 publisher or import operator for this
module. Never pass a database/server override, direct raw token, legacy G001
atlas package, or mutable `dist/bundle.js`. A failure after possible publish or
import submission is ambiguous and requires fresh read-only reconciliation; do
not retry it as an ordinary failure.
