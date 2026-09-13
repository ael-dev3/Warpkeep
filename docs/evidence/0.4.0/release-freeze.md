# 0.4 release freeze evidence

Status: **accepted-main M1 preparation complete; generated-only M2 and release freeze open**.

Signed protected main is `27c2d27643c29988e5f364ff47a21c6368296900` (tree
`223d147f230247897ea2da81990cff25e66dd53a`). Its fresh main Verify run
`34754264099` passed every required lane. Native M1 preparation and the
independent rebuilding check both exited zero from that exact source and
converged on candidate `release-workspace-83bf0da57a1a622d84742c445f8450a9`:

- Transaction: `d0297bcb6821e4f1d5fbdf37cbd16f66`
- Journal SHA-256: `ea957b2f58a7702e1bead18e88d73b9443294703d3b1ef0f01ba7a71f3464f54`
- Family SHA-256: `0c97e825844d58ad3417a0298eb75a81c67f3bc1595863a9083c41d5bd648899`
- Closure manifest SHA-256: `13b8ec2559712b93560c62babe47e0e79dae4fa656da638d108f66e8f7a4e835`
- Scanner manifest SHA-256: `edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71`
- Checked source/candidate files: `3,229 / 3,229`
- Generated outputs: `102`
- `finalReleasePrepared`: `false`

The family is reproducible preparation evidence, not deployment authorization.
Its generated-only promotion through protected M2, fresh M2 Verify and sealed
read-only preflight remain separate steps.

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

1. Promote the authenticated M1 family through protected M2, with its own
   required checks and successful read-only preflight.
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
