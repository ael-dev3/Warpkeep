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
