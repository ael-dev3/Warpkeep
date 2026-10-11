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

## Protected-target caller correction

The token fix was published as signed commit
9284aa94f80de189146742d43e16ac6767fe98f0 and synchronized to native Git blobs
and modes. Fresh inspection on that source ran 00:59:35.034–01:18:43.846 UTC,
closed exit 0 and verified the installed continuation and absent atlas.
Summary SHA256:
7252bbb1c66866480c324574643f8afa966d6bb4f6fbb0edb50ec61de89d4ffe.

Import ran 01:19:03.034–01:35:11.835 UTC, closed exit 1 with
PTR_PRODUCTION_IMPORT_TARGET_IDENTITY_FORBIDDEN. Summary SHA256:
3e7badb8c9779c38cf1a8d0ac0af6cb4106e8f3a1e2da4114faa60772813053c.
Source/index/refs held; cleanup completed. Unlike the earlier token failures,
this attempt created the journal directories. The actual nested journal contains
zero entries: no submission marker or acknowledgement exists and no reducer ran.
A directory alone does not establish a submission. Retain it; do not erase it or
blindly reconcile/replay based on the launcher's conservative failure flag.

The maintained initial-atlas caller supplied an empty exclusion list to the import
core, which requires a protected non-PTR database. The guard correctly rejected
that input. A fresh authenticated CLI alias readback resolved G001, PTR and sealed
G002. The correction requires the verified G002 identity through
WARPKEEP_GENESIS_002_SPACETIMEDB_DATABASE, validates it before provider operations,
and supplies the same immutable nonempty exclusion to transport and import.
Confirmation binds that identity as well as source/module/atlas. Missing, malformed,
G001-overlapping or PTR-overlapping input fails; the core guard is unchanged.
Never use an invented exclusion or remove target protection to pass this guard.

111 affected tests pass on Windows and native Linux. The existing full import
transition test now exercises the fixed-PTR caller's target shape through the real
import core; additional cases reject invalid/overlapping exclusions and verify
confirmation binding. Root build-mode types pass on both platforms. Publication,
new-source inspection and real import remain subsequent evidence.

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


## Interrupted import and reconciliation admission

On published source `5d6e743cd5fafd8d7c0a0f8c95cae8b93d147394`, import-v4
ran 2026-10-11T02:02:37.610Z to 02:23:47.332Z and closed exit 1 with
`IMPORT_OUTCOME_AMBIGUOUS_RECONCILE_ONLY`. Cleanup and source/index/ref holds
passed. Summary SHA256: `2974d650da3fdd74af4e713699ae63519905148694021e8181e19e284616d979`.
The actual journal has one submission marker and no acknowledgement. A direct
read-only backend query confirmed `importing`, next chunk ordinal zero, phase
`components`, and zero imported passable cells. Do not repeat the import or
remove its marker. This is partial staging, not atlas readiness or owner acceptance.

Read-only reconcile-v1 ran 2026-10-11T02:24:03.551Z to 02:45:42.270Z,
closed exit 1 with `IMPORT_CHAIN_RECEIPT_MISSING`, and left its whole owned
process group absent. Summary SHA256: `183faa6ebe17e7b3bd48e8e864b7827733c27a3b313e2c5ba88ada33eb2544aa`.
The caller's prior-chain gate demanded a completion acknowledgement before
reconciliation could report an interrupted import. The correction permits only
`reconcile-import` to continue read-only with an unverified chain. Missing
completion evidence still rejects import/inspection admission and owner work;
no receipt, acknowledgement or permission to resubmit is fabricated.

Next: qualify and publish the correction, synchronize exact native source, then
read-only reconciliation against the retained marker and actual backend. Diagnose
the original stage continuation failure from actual bound status before designing
an explicit, verified recovery. Preserve accepted Atlas43 provenance, the installed
backend, Alpha, G001 admission freeze/progress, G002 seal, and rollback.


## Corrected read-only reconciliation and fixed error codes

Signed `d43544caf7ad9f53d4a8ae38448185bd8755f98e` passed 72 affected tests
and build-mode types on Windows and native Linux. All 3,469 native Git blobs
and modes matched that checkpoint; GitHub signature and branch equality passed.
Corrected reconcile-v2 ran 2026-10-11T02:51:44.578Z to 03:04:53.125Z,
closed exit 1 with `PROVIDER_OR_PROTOCOL_FAILED`, no timeout, no provider write,
source/index/ref holds intact, and its complete owned process group absent.
Summary SHA256: `60911e81688e4b2f3b00929c544905741161e91cd4d5ced8ca13cebf4323a78f`.

Some maintained runtime validators and the fixed provider facade threw plain
`Error` with a fixed diagnostic message but no `.code`. The outer operator only
retains `.code`, hiding their reason behind the generic error. The correction
adds the same fixed code at those producers. It does not copy rejected input,
provider response text, tokens, stack traces or other arbitrary error messages.
The original failure remains unclassified until an actual corrected readback;
do not infer the cause from this reporting fix or resubmit the marked import.


## Reconciliation timing and redundant caller validation

On signed source `821ab0f3cbe833dda1341c89ac50636cdb06b451`, reconcile-v3
ran 2026-10-11T03:09:48.751Z to 03:42:27.705Z. Its configured deadline
retired the worker; no operation receipt was completed. Source/index/refs held,
cleanup completed, and all recorded worker PIDs were verified absent afterward.
Summary SHA256: `0e95bce284cfa74fd5bf4e5fd1d9331498effbb2a3ce25d31d84e30fffcfcac0`.
A missing operation receipt does not prove the operator was never invoked;
do not treat the launcher's default false field as successful reconciliation.

A credential-free local runtime readback passed in 10,281 ms. Source capture
passed in 66 ms and a separate source assertion in 10 ms. These measurements
exclude those isolated checks as sufficient explanations for the whole timeout.
The instrumented, read-only reconcile-v4 ran 03:45:41.085Z to 03:53:47.045Z.
It was deliberately retired after seven diagnostic intervals, not declared
failed from an observation timeout. Birth-bound retirement and complete worker
absence were verified. Summary SHA256:
`d29a84c3329321f81cf31f73efb0a9c57d9d811ce0419a626b3b0f3aae9b1696`.
Its bounded profile retains function names/sample counts only, no variables,
URLs, bearer data or provider response contents. Profile SHA256:
`1865110f8f42dea3f356ed0d2191b5a7c5bb6e689cfc8a2236fc4ba462c4defc`.
A ten-second process sample observed repeated `verify-commit` and `log` calls;
subprocess spawning dominated retained profiler samples. This demonstrates
validation cost; it does not establish the original partial-import cause.

The caller supplied the entire source/journal/signature/executable assertion as
both provider source validation and config validation. Each provider check thus
repeated the same full assertion, although config validation needs the held
config file's exact hash, identity, owner, mode and bounds. The correction wires
that exact config assertion separately and retains the full source assertion.
The owner-state request wrapper also repeated assertions already performed
before/after the awaited read by both the maintained inspector and provider;
that third wrapper is removed. Neither consumer nor provider guard is removed.
Signatures, ancestry, journals, held source/refs/index, executable checks,
protected targets, readback comparisons and write admission remain unchanged.

164 affected tests and root build-mode types pass on Windows and Linux.
License and tracked-file-size checks pass. This qualifies the caller cleanup,
not runtime recovery or owner acceptance. Publish/synchronize exact source and
reconcile read-only again; measure the actual result before claiming speedup.
The sole retained import submission marker still hashes to
`989d8388ae0a4f5e70df483a6b8fa67910d0530983c1be2e684ead99601724a2`;
there is no acknowledgement. Never erase it, resubmit blindly, fabricate a
completion receipt or provision the owner before verified import completion.

## Completed reconciliation and explicit staged recovery

Reconcile-v5 executed against signed published `dc3db08944ecfcc579e143105e6cf2ea4d9b3361`
(tree `29b92770b72335fd5b93aa3dedae9e83fd2ae323`) from **03:58:16.703Z to
04:22:55.642Z on 11 October 2026 UTC**. It closed with exit 1, no timeout,
`ATLAS_OPERATION_UNRESOLVED`: actual atlas importing, ownerless, submission uncertain,
no provider writes. Source/index/refs and credential cleanup passed; owned PIDs
1367900/1367924/1367935/1367947 were individually confirmed absent.

- Summary SHA256: `322fe2bef91aa97e10066fbcc8a19b6446c305adcb97efc1224eba387f65fefe`.
- Operation SHA256: `a6516f4397aff9155e41d975961f2f47d5d1cd59435b7c526e5090094023317f`.
- Actual installed program: `6713e15292fc304ebc971e3bc37b852d81f4ee5507b813682634f6d6d172dae4`.
- Direct authenticated SQL observed importing, ordinal 0, components phase,
  passable count 0, epoch 1, source `86a24f58a93829d9c4ea04e3d8db1e6c7c6316b2`,
  release `db17a790f1ffe47e747030838bf8d85e3ffc498c39333dc378ad0c5069b8b268`.
  SQL stdout SHA256 `d41607ff18dd50a2b37b9e445995f0845ad4c6a0ff630220ff2f3b0210c037a7`.

The original import submission remains retained without an ACK. Reconciliation
cannot manufacture a receipt or restart that invocation. The reviewed repair adds
explicit `inspect-import-recovery` and `resume-import` commands for the **exact
initialized staging prefix only**. It checks the existing release authority,
serialized header SHA state (using the actual backend length framing), empty atlas,
verification and protected population counters, epoch, mutation policy and owner.
It binds two equal full status reads, installed snapshot, bridge configuration,
original marker and current signed source into confirmation. First executor and
pre-send reads must match; a fresh status read inside the serialized transport
occurs after connection/token activation and before durable marking and reducer.
Stage is forbidden throughout recovery.

A recovery submission key depends on the original marker rather than source or
confirmation, preventing a changed checkpoint from authorizing another replay.
The recovery marker is exclusive and durable before the first reducer; it is
rechecked before both completion writes. The original marker is never replaced.
A genuine maintained ready receipt covers **continuation operations only**.
Separate completion provenance binds that receipt to the original marker and
approved recovery record; provenance precedes the original completion ACK.
Original reconciliation requires exact recovery provenance when a recovery marker
exists. Ambiguous continuation never receives a fabricated ACK or retry grant.

Independent bounded recovery review found two persistence gaps, both corrected
and tested: post-executor recovery marker mutation and missing/changed provenance
on original ACK reconciliation. No remaining review blocker. Windows/Linux:
155 affected tests passed, then the additional continuation-without-stage test
passed in the 53-test import suite (156 affected total). Root build-mode TypeScript
passed on both hosts. These are implementation qualification, **not actual import,
owner authentication, gameplay, frontend cutover or release acceptance**.

Owned QA-only helper versions retain private DPAPI stdin ingress, pinned tooling,
protected target readback, signed publication, source hold and whole-group cleanup:

- child-v4 SHA256 `f776e959023b7b4d72d73b3aa56edaf0f259137257cd5d076385a9e9b9b7e013`;
- run-v4 SHA256 `3ce31cf49abf1c44b3dabdaf1ca25317a1c6b3d858bcd022615121f7de8d96e3`;
- parent-v5 SHA256 `7780f4f524c287b292a7e157c1d91e2537c4957fd2a1ff31d76bf39c591a1cf8`.

Use a fresh ignored QA output stem per command. Inspect is read-only; resume needs
its exact actual confirmation on the unchanged reviewed checkpoint. Preserve
Alpha, G001 progress/admission freeze, G002 seal, licensing and rollback. Do not
rebuild the accepted atlas or reapply the installed backend to bypass recovery.
