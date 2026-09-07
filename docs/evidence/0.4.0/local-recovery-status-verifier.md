# Local recovery signed-status verifier

Implementation checkpoint: 2026-09-07, after `714fdfffd3bcb3d93784a8de604d32f5dd5adba7`.

`scripts/verify-recovery-status.mjs` implements the enabled-status gate required by recovery release plan Task 2. It accepts compact signed bytes, the independently expected positive authorization epoch, and an integer observation time. It imports only Node built-ins and checked-in public verification material; callers cannot select a verification key.

The verifier requires the service's exact ES256 protected header and ordered status payload, canonical base64url and JSON, fatal UTF-8 decoding, a 64-byte P1363 low-S signature, pinned public-key thumbprint, exact issuer/audience/subject/key, enabled state, matching epoch, and `iat <= now < exp` with `nbf === iat` and a positive lifetime no longer than 60 seconds. Its result contains only `authorizationEpoch`, `issuedAt`, and `expiresAt`; failures expose only `RECOVERY_STATUS_INVALID`.

The positive test first failed against a rejecting stub. A signed BOM-prefix test additionally exposed default UTF-8 BOM stripping; decoding now preserves that character so the exact grammar rejects it. Root verification passed 47 status tests plus 404 binding/projection tests. Review prompted explicit signed missing-field/order/header mutations and 63/65-byte signature cases. The service's independent signer also produces status bytes accepted by the Node verifier under test-only key injection; service key parity and exclusive-expiry checks passed alongside the existing crypto suite (41 tests total). No production private key was read or used.

Commands:

- Root: `node node_modules/vitest/vitest.mjs run tests/recoveryStatusVerifier.test.ts tests/recoveryActivationCandidate.test.ts tests/recoveryAuthorizationBinding.test.ts`
- Root: `node node_modules/typescript/bin/tsc -b`
- `services/release-recovery`: `node node_modules/vitest/vitest.mjs run test/localStatusVerifier.test.ts test/crypto.test.ts`
- `services/release-recovery`: `node node_modules/typescript/bin/tsc --noEmit`

These checks used pinned Node 22.22.3. They are cryptographic component tests, not live service observations. A fresh enabled status is necessary but insufficient for deployment: authorization and claim verification, exact run/artifact correlation, twice-fresh status acquisition, protected workflow integration, and private descriptor/stdin handling remain unfinished. Direct CLI invocation exits 1 with `RECOVERY_STATUS_CLI_NOT_IMPLEMENTED` rather than reporting a check it has not performed. Full Task 2 and the release remain incomplete.
