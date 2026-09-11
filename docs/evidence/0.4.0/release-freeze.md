# 0.4 release freeze evidence

Status: **preparation complete; release freeze open**.

The current synchronized source is `7d920b9f57ec450071632fdc3f0b560f7526811a` on `codex/prepared-keep-bindings-fix`. It includes the Linux x64 Pages private lane, per-workflow closure pin derivation, and the native generated family. Native Linux `prepare` and independent `check` converged on the same candidate:

- Candidate: `release-workspace-69a975071850f1e562b593ffa811904e`
- Source tree: `2b23068063945029e439dbeb85bf4fa6b80b9735`
- Transaction: `5b1ab812dba7456e6c84493fe741efa4`
- Journal SHA-256: `324479d8b88cb59b61842b949260a35e9586a3e49f3d9aed912f7c6fd10f2f3d`
- Family SHA-256: `c6c45376b8662f58f602d59c7f41912ebdde6bb4856d519d8a0cdc65e975c67e`
- Candidate closure SHA-256: `c92fc469e86ca8ee285c4057901a9bd41c1be982283d04a82196cf541433702f`
- Checked source/candidate files: `3,192 / 3,192`
- Generated outputs: `102`
- Protected closure members: `1,199`
- `finalReleasePrepared`: `false`

The candidate is reproducible and source-integrity checked. It is not a release authorization, deployment receipt, or live acceptance record. The native evidence and exact reproduction route are maintained in [`local-operations.md`](local-operations.md).

## Freeze conditions still open

1. Read the current protected Verify run at terminal success and reconcile PR #228 with the signed-history requirement on `main`.
2. Complete authenticated recovery deployment/readback and provider receipts from the same reviewed source.
3. Finish the Linux migration for the B0 and legacy prepared private workflow callers; the Pages private lane and closure pin now run on Linux, while those two callers still require their separate Darwin-only executable/path migration.
4. Capture G001 preservation, sealed G002 denial, owner-only PTR journey, physical-device performance, and live hosting verification.
5. Only after those records pass may the final artifact family be marked frozen and promoted.

Historical candidates remain in [`release-candidate-lock.md`](release-candidate-lock.md) and related evidence files for traceability. They do not override this current source pointer or authorize deployment.
