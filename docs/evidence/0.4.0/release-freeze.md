# 0.4 release freeze evidence

Status: **preparation complete; release freeze open**.

Native preparation `35471` and independent check `7224` both exited zero for
published input `8033e01c`, with exactly matching results. Guarded export `78755`
authenticated the complete output family and copied only seven changed manifests
and workflow pins; compiled bundles, bindings and tests were preserved. The
[release engineering record](release-engineering.md) owns the current candidate,
source/tree, transaction and digest identities. Exported-family publication and
final-head checks remain separate steps. `finalReleasePrepared` remains false;
this is reproducible preparation, not deployment or release acceptance.

The [workflow audit](workflow-sufficiency-audit.md#required-order-from-here) owns
the two-promotion sequence. Retain a source-history tag at the final published
development head before the first squash; branch auto-deletion would otherwise
remove the normal ref retaining historical `f603` source. The tag is planned,
not recorded as created. Squash reviewed source to M1, prepare/check actual M1,
then promote only its generated family to M2. After M2 Verify succeeds, run
read-only preflight at M2. Do not deploy from interim M1 or rerun preparation
solely because generated-only M2 changed HEAD: M1 remains its ancestor.

## Historical prepared family — 2026-09-12

This earlier generated source family came from native preparation input
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

That candidate was reproducible and source-integrity checked for its recorded
input. It does not certify the newer source. The original native evidence remains
in [local operations](local-operations.md).

## Freeze conditions still open

1. Complete the source-history retention and protected M1/M2 sequence above,
   with each head's required checks and successful M2 read-only preflight.
2. Complete authenticated recovery deployment/readback and provider receipts from the same reviewed source.
3. Execute the supported Linux prepared bridge deployment/recovery path with
   genuine authority. It replaces the historical Darwin caller. Preserve and
   re-attest the existing B0 predecessor; do not migrate or rerun B0. The initial
   prepared deployment creates its own journal and receipt after real postflight.
4. Capture G001 preservation, sealed G002 denial, owner-only PTR journey, physical-device performance, and live hosting verification.
5. Only after those records pass may the final artifact family be marked frozen and promoted.

Historical candidates remain in [release-candidate-lock.md](release-candidate-lock.md)
and related evidence files for traceability. They do not override the current
release-engineering record or authorize deployment.
