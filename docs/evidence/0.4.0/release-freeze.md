# 0.4 release freeze evidence

Status: **0.4 is not shipped; final release freeze remains open**.

Current protected source is generated-only M2
[`e22fca5c395748eb517214952aaf797d0f9d9738`](https://github.com/ael-dev3/Warpkeep/commit/e22fca5c395748eb517214952aaf797d0f9d9738).
Exact-main Verify, CodeQL and read-only preflight passed. Two read-only policy
observations failed with the generic G001 label; [PR #345](https://github.com/ael-dev3/Warpkeep/pull/345)
adds safe stage diagnostics and awaits hosted checks. The [execution handoff](../../agent-notes/0.4.0/execution-handoff.md)
records exact run identities and the required source-specific M1 prepare/check,
generated-only M2, and fresh-observation sequence. Earlier native evidence and
generated families remain bound to their recorded inputs; none certify this
maintenance source or grant deployment authority.

`finalReleasePrepared:false` remains explicit. Provider/private authority,
G001 preservation, sealed G002 denial, PTR owner play, physical-device
acceptance, hosting and recovery/readback are still open. Keep sync automation
paused and create no Desktop output.

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

1. Establish genuine publisher/provider and actual-owner authority, then run the
   supported Linux prepared bridge deployment and recovery/readback path. It
   replaces the historical Darwin caller; preserve and re-attest the existing
   B0 predecessor and never replay it.
2. Capture fresh G001 preservation and sealed G002 denial baselines, including
   admission freeze, timers, access and legitimate later writes. Keep G002
   sealed and do not repeat initialization over live state.
3. Complete the isolated actual-owner PTR journey, lifecycle/isolation checks,
   final rendered composition and physical-device performance measurements.
4. Prepare, independently check and freeze the immutable reviewed source/artifact
   family after the predeployment gates pass. Record its source and hashes before
   deployment; historical preparation alone is not this final freeze.
5. Deploy that frozen family through the supported Pages/frontend, Cloudflare and
   SpacetimeDB paths, then add actual live URLs, versions, receipts and readback
   results to the release ledger. Live acceptance follows the artifact freeze.
6. Publish the credential-free delivery and complete every mandatory checklist
   record before claiming shipment; keep the saved sync automation paused and
   create no new Desktop files.

Historical candidates remain in [release-candidate-lock.md](release-candidate-lock.md)
and related evidence files for traceability. They do not override the current
release-engineering record or authorize deployment.
