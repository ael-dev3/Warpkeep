# Signer control component — 2026-09-07

Exact-parses the three deploy-owned control fields, literal boolean strings,
positive safe decimal epoch, and a bounded 32 KiB arming JSON document. Uses the
existing duplicate-rejecting JSON reader and complete arming-tuple validator;
requires manifest epoch equality. Missing/malformed manifests fail closed,
including disabled configurations. Keys and RPC credentials are not handled here.

The adapter passes enabled configuration with arming to the fixed control stub.
Disabled transitions omit arming, as required by the V2 ledger. The eventual
entry point must select that stub by the fixed control-object name; this helper
does not establish stub identity itself. Updating to a higher disabled epoch
currently requires a matching deploy-owned manifest.

Tests exercise the real V2 transition function behind an in-memory adapter:
enable, disable, forbidden reuse, disabled epoch advance and forbidden decrease.
They also cover strict config parsing, duplicate keys, missing fields, oversized
manifest and epoch mismatch. This is not SQLite/Workerd or live service evidence.

Final verification: 23 tests across signerControl, signerRequests and ledgerV2
passed; service `tsc --noEmit` passed. Node 22.22.3, Vitest 4.1.10. Initial
orchestration test failed because reconcileSignerControl did not exist.

Source-only development checkpoint. Signing-key/RPC-secret separation, named
entry point, complete issue/claim/reconciliation orchestration, gateway and
independent review remain pending. No credentials read or provider writes made.
