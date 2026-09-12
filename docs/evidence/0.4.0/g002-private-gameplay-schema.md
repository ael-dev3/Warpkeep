# G002 private gameplay schema verification — 2026-09-07

The previous verifier expected 23 private tables and rejected every ScheduleV1
identifier. The approved module already contains 30 tables: 23 inherited
descriptors forced private, plus seven module-local private gameplay tables.
This correction changes verification only; no backend schema or data changes.

`verifyGenesis002PrivateSchemaSources` checks the exact registration expressions
for all 30 entries, retained wrappers for the 23 inherited tables, the explicit
30-table count, and canonical SDK option blocks for all seven gameplay tables.
Public option overrides, unknown/missing registrations and duplicate table
declarations fail. Only the exact gameplay04ScheduleV1 identifier is excluded
from the existing legacy-scheduler prohibition. The full source reader now
includes the fixed G002 gameplay-schema path.

These static checks complement, not replace, the authenticated source closure
and actual SDK descriptor verification. They are not live SQL/privacy evidence.

## Evidence

The new positive test failed against the rejecting implementation stub. After
implementation, 13 schema tests and 28 bundled keep-module tests passed:

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/sealedLaunchPrivateSchema.test.ts tests/gameplay04KeepModules.test.ts
41 passed; 950 ms; exit 0.

.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -b
exit 0.
```

Negative schema cases cover removal of a privacy wrapper, inherited-table public
visibility, missing/extra registrations, wrong count, and public options on each
of the seven gameplay families. The bundled SDK test now also requires exactly
30 G002 table descriptors and verifies every one has Private access. Existing
G002 denied-call-before-storage tests remain in that module suite.

The focused schema suite also passed all 13 cases on native Linux (186 ms),
using the existing isolated test helper with `--private-schema`. Independent
bounded review approved this correction with no findings.

The actual generated-verifier Linux diagnostic now stops at
`SEALED_LAUNCH_REALM_CHOICE_POLICY_INVALID`. Inspection identifies the obsolete
required string `statusLabel: 'Not admitted'`: current G002 selection accurately
uses `statusLabel: 'Sealed'` while retaining `admission: 'not-admitted'` and the
no-request/no-connection notices. This UI expectation needs a separate correction;
no full preparation or live release result is claimed here.
