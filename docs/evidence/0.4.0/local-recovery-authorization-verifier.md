# Local recovery authorization verifier — 2026-09-07

This component verifies a pinned service authorization against a complete validated schema-2 binding and eleven independently established runtime coordinates. It checks all signed fields, fixed realm policy, observation age, and authorization lifetime, then derives the private eighteen-field context required by the claim verifier. The authorization digest is SHA-256 of the exact compact JWS bytes.

## Verification

From the repository root, using the pinned Node 22.22.3 runtime:

```text
node node_modules/vitest/vitest.mjs run tests/recoveryAuthorizationVerifier.test.ts tests/recoveryClaimVerifier.test.ts tests/recoveryStatusVerifier.test.ts tests/recoveryActivationCandidate.test.ts tests/recoveryAuthorizationBinding.test.ts
node node_modules/typescript/bin/tsc -b
```

Result: 710 tests passed; TypeScript exited zero. The authorization suite covers every missing or invalid signed field, runtime substitutions, static binding mutations, expiration and observation boundaries, and preservation of large decimal string identifiers. The initial positive test failed against the missing implementation before implementation was added.

From `services/release-recovery`:

```text
node node_modules/vitest/vitest.mjs run test/localAuthorizationVerifier.test.ts test/localClaimVerifier.test.ts test/localStatusVerifier.test.ts test/crypto.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

Result: 43 tests passed; TypeScript exited zero. The authorization integration test uses the actual service signing implementation with an ephemeral test key, independently checks the authorization digest with WebCrypto, and verifies the subsequent service-signed claim locally. Expired receipts and substituted artifact coordinates are rejected.

## Boundary and remaining work

All fixture coordinates and keys are synthetic. These results are not production signatures, authenticated provider readbacks, owner playtesting, or deployment evidence. Independent bounded review found no blocking issue in this component.

The caller must establish authentic binding and runtime context, including source ancestry and protected workflow identity. This function does not acquire that evidence, request authorization, claim a deployment, or persist private state. Its returned claim context is private operational data and must not be published or logged. The original checkpoint deliberately rejected direct CLI invocation; the subsequent private-input implementation is recorded below. This checkpoint does not complete Task 2 or the release.

## Private input and service-chain integration — 2026-09-07

After `9ee0d943`, `node scripts/verify-recovery-authorization-jws.mjs` accepts no arguments and reads one private compact JSON envelope from stdin with exactly the ordered string fields `authorizationJws`, `bindingSource`, and `expectedSource`. The existing canonical binding and runtime context are nested as strings, preserving their original byte grammar. The outer input limit is 2,162,688 bytes (2 MiB plus 64 KiB), allowing escaped canonical binding JSON; downstream binding, signed-object and runtime limits still apply independently.

The binary, non-interactive stream must be pristine. A five-second deadline bounds input consumption. Fatal UTF-8 decoding, exact keys/order and canonical JSON reject malformed, duplicate, extra, reordered or BOM-prefixed input. The wall clock is sampled after EOF; caller clock/key/token arguments are not accepted. Consumed mutable chunks and the owned accumulator are cleared, and the stream is destroyed on success or failure. Immutable JavaScript string erasure is not claimed.

CLI success prints only `issuedAt` and `expiresAt`. The private `claimExpectedSource` is available only from the imported API for the workflow client; it is never CLI output. A successful check is not an authorization-acquisition operation or a complete deployment gate. Errors use only `RECOVERY_AUTHORIZATION_INVALID` and exit one.

Seven tests failed against the missing input implementation before implementation. Verification: 324 root authorization/claim/status tests and 43 service tests passed; root `tsc -b` and service `tsc --noEmit` exited zero. The service test now exercises service signing → authorization stdin verification → derived private context → service-signed claim stdin verification. Ephemeral test keys and simulated time are explicitly used; this is not production authority or a live provider request. CLI rejection tests execute real child processes.

Authenticated source acquisition, private context lifecycle and deployment workflow integration remain unfinished. No production configuration or state changed.
