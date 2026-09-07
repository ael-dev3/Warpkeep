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

The caller must establish authentic binding and runtime context, including source ancestry and protected workflow identity. This function does not acquire that evidence, request authorization, claim a deployment, or persist private state. Its returned claim context is private operational data and must not be published or logged. Direct CLI invocation deliberately fails with `RECOVERY_AUTHORIZATION_CLI_NOT_IMPLEMENTED`; a supported private-input CLI and workflow integration remain unfinished. This checkpoint does not complete Task 2 or the release.
