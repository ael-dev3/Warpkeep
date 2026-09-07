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

These checks used pinned Node 22.22.3. They are cryptographic component tests, not live service observations. A fresh enabled status is necessary but insufficient for deployment: authorization and claim verification, exact run/artifact correlation, twice-fresh status acquisition, and protected workflow integration remain unfinished. Full Task 2 and the release remain incomplete.

## Stdin command integration

The command now accepts exactly `node scripts/verify-recovery-status.mjs --epoch N`, where `N` is the expected canonical positive integer epoch from independently verified release authority. It reads compact JWS bytes only from binary stdin. Do not put a token in arguments, shell history, environment variables, a here-document, or logs. The authenticated acquisition process must pipe the raw compact bytes directly, close stdin, and check the verifier's exit status; no trailing newline is accepted.

Input is capped at 16 KiB with a five-second read deadline. EOF precedes the actual clock check, so expiry during input does not reuse a stale start time. The reader consumes and closes its stream, wipes the accumulation buffer and consumed binary chunks, and refuses text-mode or already-consumed streams. JavaScript immutable strings cannot be reliably zeroized; this is not a claim of complete process-memory erasure.

Success emits only JSON containing the verified epoch and issue/expiry seconds. Failure exits 1, writes `RECOVERY_STATUS_INVALID` to stderr, and emits no stdout. No key, clock, token, file path, or permissive verification option exists in the CLI. This stdin route implements the plan's stdin alternative; it does not accept arbitrary descriptor/file arguments. Tests cover positive signed input under test-only key injection, oversize/empty/text/error input, expiry during reading, child-process argument/error redaction, and an actual process with an unclosed stdin producer. These are synthetic tests, not a production-signed live status invocation.
