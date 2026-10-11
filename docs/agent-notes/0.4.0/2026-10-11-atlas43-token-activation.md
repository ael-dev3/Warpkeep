# Atlas43 acceptance and PTR token activation recovery

0.4 is not shipped. The accepted atlas is retained; initial import, owner
provisioning, authenticated gameplay, mobile/performance acceptance and cutover
remain incomplete. Preserve Alpha, G001 progress/admission freeze, the G002 seal,
licensing and rollback. Do not rebuild an already accepted atlas for this
operator-only transport correction, or reapply the installed backend.

## Accepted candidate

Atlas source is signed commit 86a24f58a93829d9c4ea04e3d8db1e6c7c6316b2,
tree ed52abf19ea6044858eef5de8879321415048529, generator .53. Generation ran
2026-10-10 21:23:37.711–22:07:42.557 UTC and closed exit 0. The actual accepted
ordinal is 102. Maintained compare and package inspection independently verified
eligibility and all 26 proofs; select-runtime and prepare-runtime then closed
exit 0. Local runtime preparation is not a production install.

Canonical report SHA256:
80267b42e58633ad9e7d9d4ec5ddbdbe0c93de754b490039cd12467cb95d8ae5.
Completion receipt SHA256:
c752458fac5b3f457a1bd8c1f0e336b1c3635015fa7070f6eeb73f9c8fe1ab20.
Verified continuation manifest SHA256:
3210dcc240baca5b81c771d0c425c171f9bae48ac1f789d0671e1bba6da27d9d.
Prepared runtime release SHA256:
db17a790f1ffe47e747030838bf8d85e3ffc498c39333dc378ad0c5069b8b268.
Private world payloads, identities and handles are intentionally omitted.

## Actual provider path and failure

Read-only inspection ran 2026-10-10 23:44:12.607–2026-10-11 00:05:10.203 UTC,
closed exit 0, and proved the installed backend continuation by actual readback.
Atlas state was absent, readiness false. Installed backend source remains
3bd4214342262251be0a08792b9eee45cfd44157, program
6713e15292fc304ebc971e3bc37b852d81f4ee5507b813682634f6d6d172dae4.
Inspection summary SHA256:
10e35af56d22f3f2c4ba5dd68beb5160d3a8db74c66e36d336f0437355d525c2.

Import attempts both closed exit 1 with
PTR_PRODUCTION_ATLAS_ADMIN_TOKEN_CLAIMS_INVALID:

- 00:05:21.606–00:24:23.530 UTC; summary SHA256
  a714d0dbdd1c78748278f8fd2e4ad3aa3619d7619a93c6238cad34c5946fdcc5.
- 00:28:18.739–00:47:07.387 UTC; summary SHA256
  e1aed9b6a890df802951277e0db8732c500492dd0c2dda53675d25c54caeb723.

Source/index/refs held and cleanup completed in both attempts. The maintained
operator opens its atlas session before creating the import journal or submitting
a reducer. The actual canonical initial-atlas journal was absent after failure.
No atlas submission occurred. The launcher's conservative reconciliation flag
alone is not proof of a provider write; verify the real marker and readback.

A private-input, fixed-projection token probe showed valid exact claims and a
300-second lifetime, but issuance three seconds ahead of local time. It passed
the unchanged validator at issuance time and failed at local time. No token,
secret, FID, subject identifier or raw response was printed. Restarting the
existing native time synchronization service produced a valid fresh probe,
but the second actual import still failed: synchronization alone does not remove
ordinary subsecond/second clock differences between issuer and receiver.

The transport now first applies the unchanged validator at actual local time.
Only if the same token passes that validator five seconds ahead does it wait
once using a five-second timer, discard projected authority and revalidate at
actual local time before connecting. Wrong roles/owner, malformed claims,
expired tokens, larger clock skew and a clock that does not advance still fail.
Absolute expiry and the 300-second lifetime are unchanged. Close marks the
session closed immediately, drains in-flight work, and prevents a pending wait
or late connection from starting a command; late connections are disconnected.
Both atlas and owner transports use this correction.

The original production failure was reproduced by a public regression before
implementation. Final affected transport/import/owner/operator suites: 104 tests
passed on Windows and Linux. Root build-mode types passed on both platforms;
explicit strict transport/token/test types passed on native Linux. No unrelated
game feature or atlas proof changed. Final publication checks and provider
acceptance remain separate evidence.

## Remaining release order

1. Publish/synchronize this qualified operator correction, retaining Atlas43's
   original source provenance. Verify the exact native committed bytes/modes.
2. Inspect the current backend/atlas from the new signed operator source and use
   its newly bound confirmation. If an import marker exists, reconcile only;
   otherwise import once and verify actual readiness/receipt/preservation.
3. Inspect/provision the real reviewed owner using the actual import receipt.
4. Verify bridge/frontend, then accept authenticated gather → choose → build →
   benefit → return, mobile comfort and performance; finish cutover and rollback
   readbacks. Farcaster host login is verified, not owner PTR gameplay acceptance.
