# Local recovery claim verifier

Checkpoint: 2026-09-07, after `ff513f082a1c741d9625392dc810e2e6f6f0fbe7`.

The strict deployment-time function in `scripts/verify-recovery-claim-receipt.mjs` verifies a pinned ES256 claim receipt against eighteen independently expected authorization/run/artifact/target coordinates. Expectations are exact compact JSON, not a runtime key, path, verifier callback, or expiry mode. The future authorization verifier/client must derive those expectations from verified authority; caller-supplied matching JSON alone is not authority.

`scripts/recovery-authorization-protocol.mjs` now shares pinned signature and canonical wire-byte checking between status and claim. It accepts only the fixed status/claim kinds, exact protected header and payload key order, canonical base64url/JSON, fatal UTF-8 without BOM stripping, and low-S 64-byte P1363. It does not perform complete kind-specific semantic checks and must not be used alone as a deployment gate. Status retains its prior semantic checks and bounded stdin command.

Claim semantics require exact issuer/audience/profile/subject/key, canonical UUIDs and decimal-string IDs without Number coercion, SHA/commit lengths, distinct source/Pages runs, exact run-derived artifact name, fixed operation/origin, positive epoch, `claimSequence === 1`, `claimedAt === iat`, `claimDeadline === claimedAt + 1200`, `nbf === iat`, `iat <= now < exp`, and a positive receipt lifetime no longer than 120 seconds with `exp <= claimDeadline`. Sequence and timestamps match the durable ledger and post-deployment row-correlation contract. An expired receipt is rejected even before the reconciliation deadline. There is no post-expiry mode in the local verifier.

The result exposes only epoch, claim sequence, and issue/expiry seconds. Errors are redacted to `RECOVERY_CLAIM_INVALID`. The CLI remains explicitly unavailable (exit 1), pending secure receipt/expected-context input integration; there is no false successful `--check`.

Verification uses ephemeral test-only signing keys. Root tests cover the positive gate, every missing claim field, every independently mismatched expected coordinate, invalid coordinates even when expectations agree, malformed ordering/extra/duplicate/BOM bytes, strict expiry and invalid deadline relations. A service WebCrypto signer produces bytes checked independently by Node, including expiry and artifact mismatch rejections. The production-key entrypoint rejects test-signer tokens. No production private key or live receipt is used.

Commands (Node 22.22.3):

- Root: `node node_modules/vitest/vitest.mjs run tests/recoveryClaimVerifier.test.ts tests/recoveryStatusVerifier.test.ts tests/recoveryActivationCandidate.test.ts tests/recoveryAuthorizationBinding.test.ts`
- Root: `node node_modules/typescript/bin/tsc -b`
- Service: `node node_modules/vitest/vitest.mjs run test/localClaimVerifier.test.ts test/localStatusVerifier.test.ts test/crypto.test.ts`
- Service: `node node_modules/typescript/bin/tsc --noEmit`

Review exposed mismatches in durable sequence/timestamp equality and unnecessarily number-bounded GitHub IDs. Seven failing regressions demonstrated both before correction. Fresh verification passed all 555 root tests (94 claim, 57 status, 404 binding/projection), all 42 service crypto/status/claim tests, and both TypeScript checks.

This is component implementation, not a deployed claim or complete Task 2. The historical checkpoint above left authorization verification and CLI integration unfinished; subsequent changes are recorded below.

## Private stdin integration — 2026-09-07

Following authorization integration in `3da0aa59`, the claim command now accepts no arguments and consumes one private compact JSON envelope from stdin, with exactly these ordered fields: `claimReceiptJws` and `expectedSource`. The latter is the exact private JSON string derived by the authorization verifier, not an assertion of authority from arbitrary matching JSON. The workflow must establish and preserve that context independently.

Input is binary, non-interactive, limited to 65,536 bytes and a five-second deadline. Malformed UTF-8, BOM, duplicate/reordered/extra keys, noncanonical JSON, text-mode streams and pre-consumed streams are rejected. Receipt verification samples the real wall clock after EOF; no CLI clock, key, token or expiry override is accepted. Consumed mutable chunks and the owned accumulator are cleared, and the input stream is destroyed. JavaScript immutable strings are not claimed to be zeroized.

The command emits only epoch, sequence and issue/expiry times after successful verification; failures emit the fixed redacted error and exit one. This is a necessary claim gate, not a complete deployment authorization or fresh status check. Example invocation is `node scripts/verify-recovery-claim-receipt.mjs` with the envelope supplied through a private pipe, never command arguments or logged shell interpolation.

Four tests failed against the unimplemented input boundary before implementation. Expanded verification: 315 root authorization/claim/status tests passed; 43 service authorization/claim/status/crypto tests passed; root `tsc -b` and service `tsc --noEmit` exited zero. CLI rejection tests execute real child processes; the successful signed-input test uses an ephemeral test key through the imported stdin entrypoint, not the production private key.

Authenticated acquisition, authorization CLI/private-context persistence, full workflow ordering, boundary status rechecks and live deployment remain unfinished.
