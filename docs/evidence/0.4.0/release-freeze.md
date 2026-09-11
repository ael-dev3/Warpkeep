# 0.4 release freeze evidence

Status: **preparation complete; release freeze open**.

The current source-bound implementation is `b0e634350ed1ef02e6ee9704421856c7db27d7e0` on `codex/prepared-keep-bindings-fix`. Native Linux `prepare` and independent `check` converged on the same candidate:

- Candidate: `release-workspace-29d221b4fa333fb308ee812d2721545e`
- Source tree: `f73be880adfeb18ec19a69136e2d33554d02297f`
- Transaction: `54330d68bf1c2512778619985d48ee80`
- Family SHA-256: `acc3f3fed36824a9a8cd7d892af22ca3b654d83e24b649248b24bace6cabc1a7`
- Candidate closure SHA-256: `258bb6c3237e2ca386d78358af442d9a6a562f5b21d4bcb18ae1e9caf6f3f2e6`
- Checked source/candidate files: `3,191 / 3,191`
- Generated outputs: `102`
- Protected closure members: `1,199`
- `finalReleasePrepared`: `false`

The candidate is reproducible and source-integrity checked. It is not a release authorization, deployment receipt, or live acceptance record. The native evidence and exact reproduction route are maintained in [`local-operations.md`](local-operations.md).

## Freeze conditions still open

1. Read the current protected Verify run at terminal success and reconcile PR #228 with the signed-history requirement on `main`.
2. Complete authenticated recovery deployment/readback and provider receipts from the same reviewed source.
3. Finish the Linux migration for the B0 and Pages private workflow callers; the Pages launcher profile is Linux-capable, but its workflow job is still Darwin-bound.
4. Capture G001 preservation, sealed G002 denial, owner-only PTR journey, physical-device performance, and live hosting verification.
5. Only after those records pass may the final artifact family be marked frozen and promoted.

Historical candidates remain in [`release-candidate-lock.md`](release-candidate-lock.md) and related evidence files for traceability. They do not override this current source pointer or authorize deployment.
