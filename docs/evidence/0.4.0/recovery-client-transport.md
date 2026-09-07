# Recovery client transport — 2026-09-07

`scripts/recovery-authorization-client.mjs` implements the six fixed endpoint contracts from the recovery service plan: status, issue, claim, complete, reconcile and terminal lookup. It accepts an endpoint enum and exact canonical request JSON, never a caller URL, headers, epoch, database, evidence body, or timeout override. Returned signed objects are private and remain unverified until passed through the appropriate signed-object verifier.

All calls target `https://release-auth.warpkeep.com/v1/recovery/`. Status and terminal lookup are bodyless GETs; other calls POST the exact prescribed locator/token/JWS fields. Completion and reconciliation require the claim receipt, not the authorization JWS. Requests use no-store, omitted ambient credentials, identity encoding and redirect rejection. Unexpected response encodings are rejected, preserving the meaning of exact Content-Length checks under Node fetch.

One absolute monotonic deadline covers fetch plus body reading: issue 405 seconds; claim 105 seconds; status, complete, reconcile and terminal 30 seconds. No automatic retry exists. Response consumption is limited to 32 KiB with fatal UTF-8, exact final URL/status/media/cache checks, optional exact length comparison, and a one-string-member JSON grammar that rejects duplicate or additional keys. Received mutable chunks and the owned accumulator are cleared; pending transport is aborted and the body cancelled on exit. Immutable strings are not claimed to be erased.

## Evidence

Ten tests failed against the absent client before implementation. Review identified the compressed-wire-length versus decoded-body mismatch; seven regression failures were observed before adding identity encoding negotiation and rejection of unexpected encodings.

Commands using pinned Node 22.22.3 from the repository root:

```text
node node_modules/vitest/vitest.mjs run tests/recoveryAuthorizationClient.test.ts tests/recoveryAuthorizationVerifier.test.ts tests/recoveryClaimVerifier.test.ts tests/recoveryStatusVerifier.test.ts
node node_modules/typescript/bin/tsc -b
```

Result: 361 targeted tests passed, including 37 client transport tests; TypeScript exited zero. Bounded independent review approved after the encoding correction.

Tests use controlled transport responses, real Response/stream objects and simulated deadline timers. They cover all endpoint request/response shapes, the six deadlines, body timeout without deadline reset, failure/overflow cancellation, input substitution, JSON/UTF-8 errors, redirects, encoding, length and no-retry behavior. This is not an authenticated production HTTP test.

## Remaining release work

This component does not obtain fresh GitHub OIDC, verify signed responses, persist private workflow state, implement the signer/gateway entrypoints, or deploy. The workflow must request a fresh token before each authenticated call, verify each returned signed object, retain and erase private material at the specified boundaries, recheck status and strict claim expiry immediately before deployment, then complete or reconcile. No production request or mutation was made for this checkpoint.
