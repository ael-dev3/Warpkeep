# 0.4 release freeze evidence

Status: **preparation complete; release freeze open**.

The current generated source family comes from native preparation input
`03cb8b8fc2c0c59bcb58c4303b2082dead6325d9` on
`codex/prepared-keep-bindings-fix`. It includes the Linux x64 Pages private lane,
per-workflow closure pin derivation, and the synchronized 1,200-member generated
family. Native Linux `prepare` and independent `check` converged on the same
candidate:

- Candidate: `release-workspace-2d70e1808817fcf50990e5a4b84409b9`
- Source tree: `108ef93c482ceb86d4a0a72efd7f3e7e50f7291e`
- Transaction: `dbc484aea13d55eb1e994a5f13a640c9`
- Journal SHA-256: `48d71bdeb4540329299244d674101b0ed849e4682ee446d9dc42558d1628979b`
- Family SHA-256: `841eb93123b88508d82febe883966722d0ffffe46c0cd84b36666a6ed4d2deee`
- Candidate closure SHA-256: `689dc56ab6ae708958093b6c8ffb89dcb7fd4671de82261f1c3bdc77ed4a7f77`
- Scanner manifest SHA-256: `edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71`
- Checked source/candidate files: `3,193 / 3,193`
- Generated outputs: `102`
- Protected closure members: `1,200`
- `finalReleasePrepared`: `false`

The candidate is reproducible and source-integrity checked. It is not a release authorization, deployment receipt, or live acceptance record. The native evidence and exact reproduction route are maintained in [`local-operations.md`](local-operations.md).

## Freeze conditions still open

1. Read the current protected Verify run at terminal success and reconcile PR #228 with the signed-history requirement on `main`.
2. Complete authenticated recovery deployment/readback and provider receipts from the same reviewed source.
3. Finish the Linux migration for the B0 and legacy prepared private workflow callers; the Pages private lane and closure pin now run on Linux, while those two callers still require their separate Darwin-only executable/path migration.
4. Capture G001 preservation, sealed G002 denial, owner-only PTR journey, physical-device performance, and live hosting verification.
5. Only after those records pass may the final artifact family be marked frozen and promoted.

Historical candidates remain in [`release-candidate-lock.md`](release-candidate-lock.md) and related evidence files for traceability. They do not override this current source pointer or authorize deployment.
