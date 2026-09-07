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
