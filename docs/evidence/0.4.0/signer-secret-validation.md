# Signer secret validation — 2026-09-07

Task 6 component only; R12 and the live release remain incomplete.

`validateSignerSecrets` exact-parses the deploy-owned secret projection and
bounded, duplicate-rejecting private JWK JSON. It canonically decodes both
32-byte secrets, rejects scalar/RPC byte equality, and calls the existing
pinned-public-key/thumbprint/sign-and-verify self-check. Errors expose one
stable code, not secret values. Temporary byte arrays are wiped; immutable
JavaScript strings and the returned private JWK cannot be reliably zeroized.
No network calls, ledger changes, or production credentials are used.

Tests generate ephemeral P-256 keys and substitute public pins only through
Vitest module mocking. Production has no caller-selectable pin or bypass.
Coverage includes successful self-check, frozen snapshots, equal secrets,
noncanonical encoding, duplicate keys, malformed/oversized input, wrong key
material, extra/inherited properties and accessors.

Verified from `services/release-recovery` using pinned Node 22.22.3:

- `node_modules/typescript/bin/tsc --noEmit`: exit 0.
- `node_modules/vitest/vitest.mjs run test/signerSecrets.test.ts test/signerControl.test.ts test/signerRequests.test.ts test/crypto.test.ts`: 50 passed.

Initial typecheck caught a missing explicit return in the async catch path;
corrected before the successful run. Tests were added with implementation,
not a separately observed missing-module RED. Independent review pending.

This helper still needs to be called by the missing signer orchestration
before signing or using the observer RPC credential. No deployment occurred.
