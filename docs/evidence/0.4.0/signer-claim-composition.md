# Recovery claim composition — 2026-09-07

R12 remains open. `RecoverySigner.claim` now composes exact request parsing,
server configuration/key validation, strict authorization signature/expiry
verification, fresh GitHub workflow verification, exact retained-row lookup,
metadata-only GitHub rechecking, phase-2 realm observation, control refresh,
durable claim and receipt signing.

The full observation interval must satisfy from <= through <= claim time,
with claim time - from <= 120 seconds. Claim uses a new timestamp after the
awaited observation/control work, not the authorization timestamp. Clock values
are bounded, safe integers and cannot go backward within the operation.
The ledger checks stable invariants and one-time use, erases its authorization
bytes, then returns the claim projection used for the signed 120-second receipt.
Signing failure after a committed claim does not reopen it or authorize replay.

The integration test runs issuance into claim through real ledger transitions,
key self-check, signing and verification with ephemeral test-only public pins.
Provider evidence and OIDC verification are mocked at component boundaries;
no real workflow identity, provider calls, Worker RPC or Durable Object runtime
is proven by this test. Production calls the existing verifier/observer modules.

Covered claim checks: exact 120-second acceptance; 121-second rejection despite
a recent observation end; future observation; wrong phase; changed invariant;
non-distinct snapshot; metadata failure before observation; failed fresh OIDC;
claim timestamp 1202 distinct from authorization 1002; 1322 receipt expiry;
2402 stored claim deadline; authorization erasure and replay rejection. The
archive-loader call count cannot increase during claim. Metadata recheck and
phase-2 observation arguments are checked. Issuance also explicitly rejects a
non-issue observation phase/sequence.

Tests were extended alongside implementation, not a separately observed RED.
Verified using pinned Node 22.22.3 in the service directory: TypeScript
`--noEmit` exit 0; Vitest signerSecrets, signerControl, signerRequests, crypto
and ledgerV2 with `--maxWorkers=1`: 66 passed across five files (2.34 seconds).
Independent review, Worker entrypoint, completion/reconciliation/terminal
composition and deployment remain pending. Existing full-suite Windows timeout
failures remain recorded in signer-issue-composition.md; this change does not
claim to resolve them. No production credentials or state were used.
