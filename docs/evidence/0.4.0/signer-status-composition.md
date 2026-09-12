# Signer status composition — 2026-09-07

`RecoverySigner.status()` connects deploy-control parsing, pinned secret
validation, the V2 control reconciliation contract, and real status JWS signing.
Control input is snapshotted before awaiting key verification. Status exposes
only the protocol's enabled/epoch projection, not arming or secret material.
It rejects arguments, invalid clocks and inconsistent returned control.

The integration test uses ephemeral test-only public pins, real key self-check,
real ledger state transitions, signing and verification. It covers enabled and
disabled status, 60-second expiry, consumed-arming rejection, and failure before
ledger access for invalid secrets, clock or request arguments. The ledger
transport is an in-memory adapter, not a deployed Durable Object.

Verification: service TypeScript `--noEmit` and focused signer/crypto/control/
request/ledger tests. Tests were written alongside implementation. Independent
review is pending. No production keys or provider writes were used.

R12 remains incomplete: no named Worker RPC entrypoint/configuration yet, and
issue/claim/completion/terminal orchestration still needs implementation.
