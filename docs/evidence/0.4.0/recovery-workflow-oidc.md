# Fresh recovery workflow OIDC — 2026-09-07

`scripts/recovery-workflow-oidc.mjs` requests a new token on every invocation using the runner's `ACTIONS_ID_TOKEN_REQUEST_URL` and `ACTIONS_ID_TOKEN_REQUEST_TOKEN`, with the fixed audience `warpkeep-release-recovery`. It accepts no arguments, caches no token, performs no retry and emits no output. The caller must retain token bytes privately only for the immediately following authenticated recovery call.

The mechanism follows GitHub's [OIDC reference](https://docs.github.com/en/actions/reference/security/oidc) and [Actions toolkit implementation](https://github.com/actions/toolkit/blob/main/packages/core/src/oidc-utils.ts), inspected on 2026-09-07. Those sources establish the runner variables, custom audience and response `value` field. This implementation does not reuse toolkit debug logging or automatic retries.

Before sending the request credential, the helper requires the configured recovery job/repository/ref/workflow/event environment and an HTTPS subdomain of `actions.githubusercontent.com`, with no userinfo, non-default port, fragment or preexisting audience. These are defensive checks, not proof of authentic GitHub identity. A supported authorized runner and the service's independent signature/claim checks remain mandatory.

Transport uses identity encoding, redirect rejection, no-store and omitted ambient credentials. A single thirty-second monotonic deadline covers headers and body; body reads are bounded to 32 KiB. Exact response URL/status/media/encoding/length and a single string `value` JSON member are checked. Fatal UTF-8, duplicate/extra members and malformed compact-token shape fail with the fixed `RECOVERY_OIDC_REQUEST_INVALID` error. The returned token is at most 16 KiB. Its signature and claims are not verified here.

Consumed mutable chunks and the owned accumulator are cleared and transport is aborted/cancelled on exit. Immutable JavaScript strings and the runner-owned environment credential are not claimed to be erased. This helper has no CLI that prints a token.

## Verification and limits

Three tests failed against the absent implementation before coding. The final targeted run passed 392 tests (31 OIDC requester, 37 recovery transport and 324 signed-object verifier tests); root TypeScript exited zero.

```text
node node_modules/vitest/vitest.mjs run tests/recoveryWorkflowOidc.test.ts tests/recoveryAuthorizationClient.test.ts tests/recoveryAuthorizationVerifier.test.ts tests/recoveryClaimVerifier.test.ts tests/recoveryStatusVerifier.test.ts
node node_modules/typescript/bin/tsc -b
```

Tests use synthetic runner environment, controlled network responses and simulated timers. They verify fresh requests across calls, fixed audience, credential destination rejection, no retries, redaction, deadline continuity and cancellation. No real OIDC token was requested and no provider state changed. Authentic local-runner execution, live response compatibility, issue/claim/completion sequencing, private state lifecycle and deployment integration remain unfinished.
