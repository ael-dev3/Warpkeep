# Recovery workflow session — 2026-09-07

`scripts/recovery-workflow-session.mjs` composes the existing fixed-host
transport, fresh OIDC acquisition and signed-object verifiers in memory:

1. Validate static binding/context grammar; request issue with fresh OIDC.
2. Verify authorization against the independently established context.
3. Request claim with different freshly acquired OIDC; verify the receipt.
4. Drop the raw authorization reference and verify signed enabled/epoch status.
5. At the deployment boundary, repeat status and current-time claim checks.
6. Complete or reconcile using fresh OIDC, original locators and retained claim
   receipt, without sending the authorization JWS again; verify terminal result.

An initial post-claim status failure preserves a reconciliation-only session.
A failed boundary or ambiguous terminal response cannot re-enable deployment
or repeat completion. A disposed session cannot be revived by a pending
response. There are no raw-JWS getters, logging, caller transport overrides,
or deployment callbacks. Disposal drops references; JavaScript strings cannot
be claimed to be reliably zeroized in memory.

Verification: nine mocked-transport integration tests passed, plus targeted
strict TypeScript. The tests exercise ordering, distinct OIDC requests, private
field handling, verifier failures, reconciliation and disposal races. They do
not prove real authentication, signatures (covered by separate verifier tests),
GitHub job execution, or a live deployment.

Remaining integration is substantial: independently authenticated source and
artifact context; durable private handoff across the separate pinned Pages
action and terminal step; recovery after process loss or an ambiguous claim
response; protected workflow wiring; actual runner execution. This module
does not perform deployment, cannot resume after process loss and is not
itself a production entrypoint. No network or production operation was invoked
while testing this checkpoint.

## Retained receipt correlation

The session now verifies retained claim correlation immediately before sending
complete/reconcile, after fresh OIDC acquisition. A separate
`verifyRecoveryClaimCorrelation` API applies the same pinned signature, exact
payload/context and twenty-minute deadline checks but treats the receipt only
as row correlation after its two-minute deployment expiry. The strict
`verifyRecoveryClaimReceipt` API and stdin CLI still reject at `exp`; no caller
expiry-mode override is accepted. Correlation rejects at `claimDeadline`, not
just after it, and returns an explicitly non-authorizing result.

Initial combined claim/session run: 119 tests passed. Added cases cover the
two-minute and twenty-minute boundaries, altered deadlines, mismatched context
and attempted expiry overrides. This implements the existing recovery spec's
post-deployment correlation rule; it does not extend deployment authorization
or provide durable handoff by itself.
Final combined run including terminal-request denial after the deadline:
120 tests passed; targeted strict TypeScript passed.

## Private handoff storage primitive

`f766595` and `2c7f150` add Linux-only claim storage in an existing canonical,
current-owner 0700 directory. The fixed `recovery-claim-v1.json` file is created
exclusively as 0600 through a held directory descriptor, fsynced and read back
before persistence is acknowledged. It contains only the claim receipt,
private expected context and signed deadline—not the authorization JWS or OIDC.
The strict receipt gate is checked before and after writing.

Reopen is bounded to 64 KiB and rejects changed identity, links, ownership or
permissions, noncanonical bytes, changed deadline, and different independently
established run/artifact context. Separate deployment and reconciliation APIs
retain the distinct expiry rules. Return values are private and must not be
logged or uploaded. Failed writes are preserved for diagnosis, not overwritten
or removed through potentially replaced paths.

At `2c7f150`, the Linux handoff/claim/session suites passed 128 tests with one
Windows-only skip. Filesystem tests mock receipt-verifier calls; the adjacent
claim suite independently covers real cryptographic verification with test
keys. This is not a real signed-receipt persistence or power-loss test.

Still required: connect storage to the session and fixed runner-private path,
recover ambiguous claim responses/process loss, bind actual Actions context,
and implement the protected deployment workflow. The storage primitive alone
does not make the workflow resumable or production-ready.

## Session persistence integration

`7a70b0a` connects storage to the session. `persistClaim(privateRoot)` writes the
verified receipt/context without exposing them to the caller. The deployment
boundary now refuses an unpersisted session, reopens the handoff using the
independently supplied run/artifact context, and compares the returned receipt
and context with the session's originals before permitting continuation.
Storage failures leave reconciliation available but cannot restore deployment.

Linux session/handoff suites: 22 passed, one Windows-only skip. This includes
one session composition using actual 0600 Linux file creation and reopen;
network and signature-verifier calls in that test remain mocked. The earlier
13-case session suite also passed on Windows. Targeted strict types passed.

Remaining: choose/provision the fixed runner-private directory in the real
workflow, implement process-resume and ambiguous-claim handling, connect the
pinned Pages action and terminal step, and verify genuine Actions execution.
No live authorization or deployment occurred in these tests.

## Reconciliation reopen adapter

`scripts/recovery-workflow-reconciliation.mjs` reopens a persisted claim using
independently established current run/artifact context and exposes only
`reconcile()` and `dispose()`. It cannot issue, claim, deploy or recreate a
deployment boundary. After fresh OIDC acquisition it reopens and compares the
private handoff again, including its signed deadline, then sends the original
locators and receipt to the fixed reconcile endpoint and verifies the terminal
response. An ambiguous response permits only another fresh reconciliation;
concurrent requests and post-disposal revival are rejected.

This is an adapter for a later process, not yet an installed Actions entrypoint.
Tests mock the storage, network and verifier boundaries. Actual cross-process
signed-receipt recovery, fixed runner-directory provisioning, workflow wiring,
and recovery when no receipt was persisted remain unverified/unfinished.
Windows adapter/session run: 21 tests passed with one Linux-only skip;
targeted strict TypeScript passed. Eight adapter tests cover the normal path,
missing/substituted/expired storage, ambiguity, verifier failure, concurrency
and disposal. No live request was sent.

## 2026-09-07: native cross-process signature and persistence probe

`tests/fixtures/recoveryClaimHandoffNativeProbe.mjs` passed on WSL Ubuntu with
Node 22.22.3 using `node --experimental-vm-modules
tests/fixtures/recoveryClaimHandoffNativeProbe.mjs` from the repository.
Eight child-process scenarios check write, independent deployment reopen,
exclusive-write rejection, deployment expiry, post-expiry reconciliation,
reconciliation deadline, changed artifact context, and wrong signing key.
The persisted file's 0600 permissions are also checked. All children terminate
before the next starts; the parent removes its owned temporary directory.

This runs the actual handoff, claim verifier and signature protocol source with
real filesystem operations and real EC signature verification. Only the public
key module and clock are substituted inside a test-only VM. The ephemeral test
private key stays in parent memory; test inputs pass through stdin and child
stdout contains only an acceptance boolean. The result reports eight passing
scenarios and no production credentials used. It does not verify genuine OIDC,
the reconciliation network adapter, runner restart orchestration, or workflow
installation. Those release integration requirements remain outstanding.
