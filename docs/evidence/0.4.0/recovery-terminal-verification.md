# Recovery terminal verification — 2026-09-07

Commit `da41d52` adds local verification of the existing signer terminal
protocol. Previously the transport could receive `terminalJws`, but the local
signed-payload verifier supported only authorization, claim and status.

`verifyRecoveryTerminal(compact, expectedSource, nowSeconds)` checks the pinned
ES256 signature, low-S canonical encoding, exact terminal payload grammar,
issuer/audience/profile/subject, positive epoch, bounded freshness and the
complete private expectation document retained from verified authorization.
Both `completed` and `not-deployed` are explicitly reported; neither is a
deployment permit. The result contains outcome, completion time, epoch and
issuance/expiry times, not private claim identifiers or signed bytes.

Verification:

- Initial terminal + authorization + claim + status suites: 363 passed.
- Expanded terminal suite: 69 passed, including every missing payload field,
  mismatched expected coordinates, wrong signature, high-S mutation, expiry,
  caller-key injection and refusal of the test key by the production entrypoint.
- Targeted strict TypeScript passed.

Tests use ephemeral synthetic test signing keys, never production signing keys
or live evidence. No complete/reconcile request was sent. The recovery workflow
must still connect this verifier to the terminal response and its privately
retained, verified claim context. Workflow integration remains incomplete.
