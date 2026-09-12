# Pre-Task 7 CI Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the independently broken 0.4.0 preparation checks without weakening release authority or refreezing protected artifacts before Task 7.

**Architecture:** Correct the two stale G002 contracts at their owning boundaries: the sealed-source verifier must validate the intentionally secret-free publisher, and the local G002 integration must mint its admin credential for the dedicated G002 audience. Repair stale test/harness expectations separately. No closure manifest, workflow pin, bundle, generated binding, or protected-source count is changed here; those remain one atomic Task 7 transaction.

**Tech Stack:** TypeScript, Node.js 22.22.3, Vitest, SpacetimeDB CLI 2.6.1, GitHub Actions YAML.

**Spec:** `docs/superpowers/plans/2026-08-30-warpkeep-0.4.0-preparation.md` (Tasks 3, 6C, 6D, and 7).

## Global Constraints

- Keep Genesis 001 permanently at 0.3.43, with existing admissions preserved and all new admissions closed.
- Keep Genesis 002 sealed and PTR separate, private, and owner-only.
- Do not add a G002 admin secret, import authority, or live-status authority back to `genesis002-production-publisher-cli.ts`.
- Do not change a production attestation predicate merely to accommodate a test fixture.
- Do not regenerate G001 bindings or write any closure/bundle/workflow pin; Task 7 owns that full atomic surface.
- Run the G002 loopback only against its local in-memory `127.0.0.1` server with the checked 2.6.1 CLI.

---

## File Structure

- `scripts/verify-0.4.0-sealed-launch.mjs`: static release-policy check for the G002 publication boundary.
- `tests/sealedLaunchVerifier.test.ts`: consumer-level regressions for accepted publisher separation and rejected publisher authority bleed.
- `scripts/genesis002-private-loopback-verifier.ts`: disposable local integration credential construction.
- `tests/genesis002PrivateLoopbackVerifier.test.ts`: focused loopback credential/integration regression coverage.
- `scripts/auth-bridge-notification-prepared-deploy-journal.mjs`: read-only completed-journal error classification.
- `tests/authBridgeNotificationPreparedReceipt.test.ts`: receipt-only state regression.
- `tests/authBridgeNotificationB0Workflow.test.ts`: Linux emulation of the real runner-private Node file mode.
- `tests/genesis001HistoricalDependencyClosure.test.ts`: correct workflow-job provenance expectation.
- `tests/greaterRealmHostQaNavigation.test.tsx`: public PTR selector accessibility expectation.

### Task 1: Restore the G002 publisher/verifier authority separation

**Files:**

- Modify: `scripts/verify-0.4.0-sealed-launch.mjs:1202-1216`
- Modify: `tests/sealedLaunchVerifier.test.ts`

**Interfaces:**

- Consumes: the existing `genesis002PublisherCliSource` string supplied to `verifySealedLaunchSources`.
- Produces: a verifier that accepts the reviewed secret-free publisher contract and rejects publisher-side secret/import/live-status authority.

- [ ] **Step 1: Make the accepted publisher contract fail explicitly**

  Use the existing `accepts the exact disjoint G002 administrator authority sources` case as the red test and add a focused hostile-source case. The hostile case must add a direct `takeGenesis002ProductionAdminSecret` call to an otherwise checked-in publisher source and expect `SEALED_LAUNCH_G002_PUBLISHER_CLI_INVALID`.

  ```ts
  const hostile = checkedInSources();
  hostile.genesis002PublisherCliSource += '\nvoid takeGenesis002ProductionAdminSecret;\n';
  expect(() => verifySealedLaunchSources(hostile, 'preparation'))
    .toThrow('SEALED_LAUNCH_G002_PUBLISHER_CLI_INVALID');
  ```

- [ ] **Step 2: Verify the red state**

  Run: `npm test -- tests/sealedLaunchVerifier.test.ts --maxWorkers=1`

  Expected: the positive checked-in source case fails with `SEALED_LAUNCH_G002_PUBLISHER_CLI_INVALID`, because the stale verifier still demands the intentionally absent secret/import symbols.

- [ ] **Step 3: Implement the narrow static contract**

  Replace the two obsolete required tokens with required publisher-local evidence:

  ```js
  const requiredPublisherTokens = [
    'WARPKEEP_SPACETIME_CLI_CONFIG_PATH',
    'attestGreaterRealmProductionProtectedMain',
    "networkMode: 'protected-main-attestation-only'",
    'authenticatedCliPostflight: true',
    'cliConfigSourcePath: local.cliConfigSourcePath',
    'spacetimeCliConfigSha256: artifact.spacetimeCliConfigSha256',
    'publishReceipt: receipt,',
    'publishReceiptDigest: receipt.publishReceiptDigest,',
  ];
  const forbiddenPublisherTokens = [
    'takeGenesis002ProductionAdminSecret',
    'verifyGenesis002FreshPublishStatus',
  ];
  ```

  Retain the existing rejection of URI/database environment overrides. The verifier must still fail if a required publisher-local safeguard disappears or a forbidden import/secret authority appears.

- [ ] **Step 4: Verify green and mutation coverage**

  Run: `npm test -- tests/sealedLaunchVerifier.test.ts --maxWorkers=1`

  Expected: the checked-in publisher passes; the injected secret-authority mutation fails with `SEALED_LAUNCH_G002_PUBLISHER_CLI_INVALID`.

- [ ] **Step 5: Commit the independently reviewable change**

  ```bash
  git add scripts/verify-0.4.0-sealed-launch.mjs tests/sealedLaunchVerifier.test.ts
  git commit -m "fix: preserve G002 publication authority separation"
  ```

### Task 2: Give the local G002 import credential the dedicated audience

**Files:**

- Modify: `scripts/genesis002-private-loopback-verifier.ts:187-222,407-413`
- Modify: `tests/genesis002PrivateLoopbackVerifier.test.ts`

**Interfaces:**

- Consumes: `GENESIS_002_AUDIENCE` from `spacetimedb/genesis002/src/contract.ts` and the checked SpacetimeDB 2.6.1 local server.
- Produces: a service-admin JWT with exactly `aud: ['warpkeep-genesis-002-spacetimedb']`; anonymous and non-admin rejection probes remain non-privileged.

- [ ] **Step 1: Add an observable admin-claim regression**

  Add a focused test seam or pure claim builder only if it is also used by `jwt`. Assert the service-admin claim has exactly one audience, `warpkeep-genesis-002-spacetimedb`; assert the non-admin probe does not gain that admin claim. Name the test after the regression: a generic audience must make the local import fail.

- [ ] **Step 2: Verify the red state**

  Run the focused claim test, then run:

  ```bash
  npm run stdb:genesis002:verify-private-loopback
  ```

  Expected: before the fix, the local integration ends in `GENESIS_002_PRIVATE_LOOPBACK_FAILED`, caused by the generic `warpkeep-spacetimedb` audience.

- [ ] **Step 3: Implement the minimal claim correction**

  Import `GENESIS_002_AUDIENCE`; make the JWT helper accept its audience explicitly; pass that exact constant only for the `service:hermes` admin token. Keep the deliberately non-G002 audience for the non-admin rejection probe.

  ```ts
  const adminToken = jwt(privateKey, {
    subject: 'service:hermes',
    roles: ['warpkeep-admin'],
    audience: GENESIS_002_AUDIENCE,
  });
  ```

- [ ] **Step 4: Verify green in the real local integration**

  Run the focused test and the same loopback command with the exact staged CLI 2.6.1.

  Expected: the import completes its sealed finalization, and anonymous/non-admin connection, SQL, subscription, and procedure probes remain rejected.

- [ ] **Step 5: Commit**

  ```bash
  git add scripts/genesis002-private-loopback-verifier.ts tests/genesis002PrivateLoopbackVerifier.test.ts
  git commit -m "fix: bind G002 loopback admin audience"
  ```

### Task 3: Correct stale test and harness expectations without relaxing production policy

**Files:**

- Modify: `tests/authBridgeNotificationB0Workflow.test.ts:86-110`
- Modify: `tests/genesis001HistoricalDependencyClosure.test.ts:223-228`
- Modify: `tests/greaterRealmHostQaNavigation.test.tsx:50`

**Interfaces:**

- Consumes: the existing protected B0 workflow, `linux` and `spacetimedb-module` Verify jobs, and `Public Test Realm` selector label.
- Produces: test fixtures aligned with the real runner-private Node (0700), workflow topology, and accessible product label.

- [ ] **Step 1: Write focused red assertions for each stale expectation**

  Add a harness assertion that a root-owned `0700` runner-private Node remains acceptable in the Linux-only transformed B0 test while a group-writable target still fails. Preserve the existing negative tests. The existing historical and host-QA failures are already red evidence for the workflow-job and accessible-label corrections.

- [ ] **Step 2: Verify red state**

  Run:

  ```bash
  npm test -- tests/authBridgeNotificationB0Workflow.test.ts tests/genesis001HistoricalDependencyClosure.test.ts tests/greaterRealmHostQaNavigation.test.tsx --maxWorkers=1
  ```

  Expected: current code rejects the runner-private Node fixture and looks for the aggregate `verify` job / obsolete `PTR` accessible label.

- [ ] **Step 3: Apply only test-side corrections**

  In `protectedLaunchForTrustedNode`, admit target mode `700` alongside `555` and `755`, while retaining the `0022` write-bit rejection. Change the historical job list from `verify` to `linux`; change the host-QA role lookup from `PTR` to `Public Test Realm` while retaining the exact PTR version and admitted-state checks.

- [ ] **Step 4: Verify green**

  Re-run the three focused files under a root-owned, non-group-writable Node 22.22.3 replay path. Expected: positive runner-private path passes; forged/hard-linked/group-writable target cases remain rejected; only `linux` and `spacetimedb-module` carry PTR lock provenance; all three selector radios remain accessible.

- [ ] **Step 5: Commit**

  ```bash
  git add tests/authBridgeNotificationB0Workflow.test.ts tests/genesis001HistoricalDependencyClosure.test.ts tests/greaterRealmHostQaNavigation.test.tsx
  git commit -m "test: align sealed launch checks with reviewed runtime"
  ```

### Task 4: Classify an absent completed journal as absent state, not unsafe directory state

**Files:**

- Modify: `scripts/auth-bridge-notification-prepared-deploy-journal.mjs:938-958`
- Modify: `tests/authBridgeNotificationPreparedReceipt.test.ts:750-781`

**Interfaces:**

- Consumes: a canonical private receipt directory with no completed deployment journal.
- Produces: `AUTH_BRIDGE_PREPARED_DEPLOY_JOURNAL_EXISTING_STATE_INVALID` for a missing journal path while preserving `...DIRECTORY_INVALID` for a present unsafe path.

- [ ] **Step 1: Extend the existing receipt-only test with a structural negative**

  Keep the existing missing-journal assertion as the red test. Add a separately created present-but-unsafe journal child (for example, a symlink or wrong mode) and assert it remains `AUTH_BRIDGE_PREPARED_DEPLOY_JOURNAL_DIRECTORY_INVALID`.

- [ ] **Step 2: Verify red state**

  Run: `npm test -- tests/authBridgeNotificationPreparedReceipt.test.ts --maxWorkers=1`

  Expected: the missing completed journal currently reports `...DIRECTORY_INVALID` instead of `...EXISTING_STATE_INVALID`.

- [ ] **Step 3: Implement a missing-path-only mapping**

  Before calling `assertPrivateDirectory` for each required journal parent, distinguish `ENOENT` from an existing unsafe directory. Map only `ENOENT` to `AUTH_BRIDGE_PREPARED_DEPLOY_JOURNAL_EXISTING_STATE_INVALID`; preserve all symlink, ownership, mode, and unexpected-I/O failures as the existing security-specific codes.

- [ ] **Step 4: Verify green**

  Run the focused receipt test and `tests/authBridgeNotificationPreparedDeployRuntime.test.ts`.

  Expected: a missing completed journal is read-only missing state, while foreign or unsafe state remains fail-closed and produces no byte changes.

- [ ] **Step 5: Commit**

  ```bash
  git add scripts/auth-bridge-notification-prepared-deploy-journal.mjs tests/authBridgeNotificationPreparedReceipt.test.ts
  git commit -m "fix: distinguish absent prepared journal state"
  ```

### Task 5: Verify the correction boundary and hand off Task 7

**Files:**

- Verify only: all files changed in Tasks 1-4
- Do not modify: closure manifests, bundle outputs, workflow hashes, generated bindings, or Task 7 pin consumers

- [ ] **Step 1: Run the independent focused suites**

  ```bash
  npm test -- tests/sealedLaunchVerifier.test.ts tests/genesis002PrivateLoopbackVerifier.test.ts tests/authBridgeNotificationB0Workflow.test.ts tests/genesis001HistoricalDependencyClosure.test.ts tests/greaterRealmHostQaNavigation.test.tsx tests/authBridgeNotificationPreparedReceipt.test.ts tests/authBridgeNotificationPreparedDeployRuntime.test.ts --maxWorkers=1
  npm run stdb:genesis002:verify-private-loopback
  git diff --check
  ```

- [ ] **Step 2: Confirm the expected Task 7-only failures remain**

  Record but do not bypass: the private PTR source closure contradiction, stale closure manifest count/pins, B0 protected-workflow hash, and PTR generated-binding diff. Ensure no deployment workflow has been run.

- [ ] **Step 3: Review and request explicit Task 7 architectural approval**

  Present the planned single transaction: explicit public/protected closure subset excluding only the four private PTR sources, deterministic four-lane build under the named macOS ARM64 Node 22.22.3 toolchain, exact G002/PTR binding generation with G001 zero-diff, atomic installation of every consumer, and second-run zero-diff convergence. Do not implement that transaction before approval.
