# Signer request boundary component — 2026-09-07

Implements the recovery-service Task 6 transport-field boundary for issue,
claim, complete, reconcile and terminal. Status remains a no-argument method
to implement in the signer, not an accepted object endpoint here.

The helper snapshots exact own enumerable data properties through the existing
descriptor validator. It returns a frozen null-prototype string record in fixed
field order, preserves decimal IDs without Number conversion, validates UUID
and commit syntax, and caps opaque ASCII tokens at 16 KiB and serialized requests
at 32 KiB. Opaque strings are not authenticated by this helper.

Complete/reconcile accept claimReceiptJws and reject authorizationJws, including
when supplied alongside an otherwise valid receipt. Tests cover missing/extra,
symbol, inherited and accessor properties; nonenumerable fields; mutation after
snapshot; malformed values; exact aggregate size and escaped-JSON overflow.

Initial test run failed because the module was absent. Final Node 22.22.3 /
Vitest 4.1.10 run: 6 request tests plus 7 claim-correlation tests passed;
service TypeScript passed. Commands from services/release-recovery:
`node node_modules/vitest/vitest.mjs run test/signerRequests.test.ts test/claimReceiptCorrelation.test.ts`
and `node node_modules/typescript/bin/tsc --noEmit`.

Not yet an operating service: signer/gateway consumers, fresh OIDC verification,
ledger orchestration, configuration and end-to-end/live verification remain
incomplete. Independent review is pending. This component does not satisfy R12
or authorize deployment by itself.
