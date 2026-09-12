# PTR gameplay closure readiness implementation plan

Historical implementation plan. Its bounded prerequisite was completed in
`16db897`; see [recorded evidence](../../evidence/0.4.0/ptr-closure-readiness.md).
The original task boxes below preserve planning history and are not a current
work queue or an instruction to repeat completed work. Follow the current
[agent handoff](../../agent-notes/0.4.0/README.md) for continuation.

**Goal:** Make the existing closure derivation recognize the real, reviewed PTR gameplay client ABI without admitting arbitrary generated files or performing final refreeze.

**Architecture:** Retain the fixed path allowlists in the closure policy and verifier. Add only committed generated procedure files actually reached from the shipped client. Exercise real graph derivation and negative path cases; leave the frozen manifest and deployment authority unavailable until the complete assembler transaction.

**Tech Stack:** Existing Node 22.22.3, Vitest, TypeScript and native closure parser; no new dependencies.

**Spec:** docs/superpowers/specs/2026-09-06-warpkeep-local-release-assembler-design.md; Task 7 of docs/superpowers/plans/2026-08-30-warpkeep-0.4.0-preparation.md.

## Global constraints

- Preserve `warpkeep-spacetime-binding-final-preparation-linux-x64-v1`.
- G001 bindings and every G001 adoption projection member are validation-only.
- No admissions change, provider call, credential use, final manifest/pin/count update, or deployment fence removal.
- No broad generated-directory exemption, private table binding, arbitrary inventory override, or source-byte callback as authority.
- Preserve unrelated edits and shared dependencies. Use the existing isolated checkout.
- This prerequisite does not complete the assembler, authenticated activation, or live release.

## Evidence and bounded scope

At `78a0a7a7c3a48807e31111dfd56dd6fd1c49a6d5`, both closure modules list
18 PTR generated paths. The committed generated index imports five additional
gameplay procedure modules. The existing real-repository test reproduced
`AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_IMPORT_INVALID` at policy
`canonicalMemberPath:263`, reached through `resolveLocalSpecifier` and the script
graph. Command below failed one selected test (117 name-filtered skips), at
00:13:43 local, 4.00 seconds total. Identify the exact rejected import in the
test before concluding that every derivation blocker is covered.

The five candidate additions are:

```text
spacetimedb/ptr/generated-bindings/dispatch_gameplay_04_worker_v_1_procedure.ts
spacetimedb/ptr/generated-bindings/get_gameplay_04_keep_v_1_procedure.ts
spacetimedb/ptr/generated-bindings/initialize_gameplay_04_keep_v_1_procedure.ts
spacetimedb/ptr/generated-bindings/recall_gameplay_04_worker_v_1_procedure.ts
spacetimedb/ptr/generated-bindings/start_gameplay_04_building_v_1_procedure.ts
```

The generated `types/procedures.ts` and `types/reducers.ts` also exist, but
existence alone is not grounds to admit them. Trace actual runtime/type imports;
include either only if the current protected graph requires it, and record the
specific importing file. The table schema in the generated index remains empty.

### Evidence-driven path-scope amendment

After the five procedure additions, the real graph next rejects
`spacetimedb/gameplay04/policy.ts`, reached from `src/main.tsx` through App,
WarpkeepExperience, RealmMapScreen and GreaterRealmWorldScene. Both current
member-path patterns exclude this shared directory. Extend the same task to
permit the exact reached shared source filenames: commands.ts, construction.ts,
keep.ts, placement.ts, policy.ts, workerJourney.ts, workerState.ts and workers.ts.
These are existing client imports and their transitive dependencies, not new
gameplay. Evaluate reconciliation.ts only against a demonstrated protected-graph
import, not its mere presence on disk. Require a positive graph assertion for
the admitted shared files and negative imported-unknown-file cases against both
policy and verifier. Do not allow arbitrary files in the shared directory or
change any shared source bytes. All other no-refreeze constraints stand.

Follow-up audit established the missing backend edge: PTR's source namespace is
enumerated, but its index is absent from the protected graph roots (G002's index
is already a root). Add the exact `spacetimedb/ptr/src/index.ts` root. Its imports
to gameplayKeep/gameplayWorkers/gameplaySchedule demonstrate the required
`spacetimedb/gameplay04/reconciliation.ts` dependency, so admit that ninth exact
shared filename too. Assert reconciliation reachability and reject an unknown
shared dependency imported only from the PTR backend. This is dependency
coverage, not a new runtime or caller-selected root interface. Preserve the
fixed source inventory until the complete final assembler derives it.

### Task 1: Restore exact PTR client graph coverage

**Files:**
- Modify: `scripts/auth-bridge-notification-prepared-deploy-closure-policy.mjs`.
- Modify: `scripts/auth-bridge-notification-prepared-deploy-closure.mjs` (path policy only, not frozen inventory).
- Create: `tests/ptrGameplayClosurePolicy.test.ts`.
- Cover: `tests/authBridgeNotificationPreparedWorkflow.test.ts`.

**Interfaces:** Retain `deriveAuthBridgeNotificationPreparedDeployClosurePaths({ repositoryRoot })` and the verifier's existing manifest validation API unchanged. No new public operating interface.

- [ ] Read both path-policy implementations and the generated imports. In the focused test, record the rejected member using a test-local diagnostic copy or bounded file-operation trace; do not add raw path/error transport to production. Confirm the exact import chain and compare against the fixed candidates above.
- [ ] Write a positive test against current committed source that requires all five procedure paths in the derived graph. Do not assert a new total closure count.

```ts
const paths = deriveAuthBridgeNotificationPreparedDeployClosurePaths({ repositoryRoot });
expect(paths).toEqual(expect.arrayContaining(gameplayProcedurePaths));
expect(paths).toEqual([...new Set(paths)].sort());
expect(paths.some(path => path.endsWith('_table.ts'))).toBe(false);
```

- [ ] Add disposable-fixture negative cases for an imported unknown PTR generated procedure, a private table binding, a symlink at an admitted path, and a deleted required procedure. Reuse existing policy fixture construction, but do not assume its old frozen manifest already contains the new source. Expected failures remain the existing fixed policy errors, not generic test exceptions. Assert the verifier's path predicate rejects unknown paths too, using its existing manifest test seam and an otherwise valid candidate manifest.
- [ ] Run the new tests and the existing reproducer before changing production source; retain the meaningful failure and import identity.

```powershell
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/ptrGameplayClosurePolicy.test.ts
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/authBridgeNotificationPreparedWorkflow.test.ts -t 'derives the production browser admission and request graph'
```

- [ ] Insert the exact reached procedure paths into both `PTR_GENERATED_BINDING_MEMBER_PATHS` sets in sorted order. Keep all existing entries, conditions, maximum bounds and private-table restrictions. Do not touch `AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS` or the checked-in manifest. If another graph error appears, identify its exact cause and report it rather than widening patterns or suppressing the test.
- [ ] Run focused tests, the original reproducer and the pinned typecheck. Confirm the new tests prove both policy implementations retain the same exact admissible PTR namespace. Existing frozen-manifest mismatch is expected until final assembly; distinguish that from the graph derivation result.

```powershell
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/ptrGameplayClosurePolicy.test.ts
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/authBridgeNotificationPreparedWorkflow.test.ts -t 'derives the production browser admission and request graph'
.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -b
git diff --check -- scripts/auth-bridge-notification-prepared-deploy-closure-policy.mjs scripts/auth-bridge-notification-prepared-deploy-closure.mjs tests/ptrGameplayClosurePolicy.test.ts
```

- [ ] Independently review the exact namespace delta and negative cases, commit only the three task files, scan the outgoing commit and push the development checkpoint. Record source identity, commands, failures and unresolved closure checks in the release evidence ledger.

## Successor and self-review

This plan covers the observed path-admission prerequisite only. The complete
assembler still needs same-source builders, complete consumer generation,
owned-Linux durable installation/recovery and full-family convergence. It must
derive the expanded frozen inventory from the corrected graph at final assembly,
not copy an arbitrary caller list. Activation and genuine workflow evidence are
separate unfinished source work, and final freeze waits for them and gameplay.
The existing function names and return type remain unchanged; all task paths and
positive/negative cases are explicit. No fixed member count is invented here.
