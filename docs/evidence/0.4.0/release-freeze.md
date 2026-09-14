# 0.4 release freeze evidence

Status: **generated-family refresh merged; final release freeze open**.

Protected `main` is now `3af84aa892a9222b8c6286d01e2fb50fb248f43e`; PR #256
updated the release records after PR #255 merged the generated-family refresh. Post-merge CodeQL `34833483317` and Verify
`34833483264` completed successfully. Read-only sealed preflight `34838183075`
passed for this exact merged source and emitted
`{"operation":"preflight","status":"preflight-inspected"}`. The Linux native
preparation and independent check that supplied the merged family completed
for its ancestor preparation input, candidate
`release-workspace-6c6d10e57c03ce0ead8c3ac35b285a19`:

- Transaction: `d2b3899b5e3597de236dce03f580c7fb`
- Family SHA-256: `593fdb280394632d0d3302b5fa127f162c1ef145b58b3f16be593c2021adce7c`
- Closure manifest SHA-256: `65a8c8feb58a2b432af919fc80b0c902b69efebf947e35ed87349711c94e2335`
- Scanner manifest SHA-256: `edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71`
- Checked source/candidate files: `3,229 / 3,229`
- Generated outputs: `102`
- `finalReleasePrepared`: `false`

The earlier sealed-realms preflight `34813075520` passed runner/source
attestation but failed bundle validation against older input `27c2d276`; no
provider call, realm mutation, owner provisioning or deployment occurred. The
preparation candidate reports `finalReleasePrepared:false` and is reproducible
preparation evidence, not deployment authorization. The merged-main preflight
above is the current read-only inspection evidence.

The next gates are genuine provider and owner authority, live recovery/readback,
G001 preservation, sealed G002 denial, owner-only PTR play, physical-device
performance and final hosting/deployment acceptance. Keep the saved sync
automation paused and do not create Desktop output.

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
4. Verify Pages/frontend, Cloudflare and SpacetimeDB deployment from the same
   reviewed source/artifact family, then record live URLs, versions, receipts
   and hashes before marking the final artifact family frozen.
5. Publish the credential-free delivery and complete every mandatory checklist
   record before claiming shipment; keep the saved sync automation paused and
   create no new Desktop files.

Historical candidates remain in [release-candidate-lock.md](release-candidate-lock.md)
and related evidence files for traceability. They do not override the current
release-engineering record or authorize deployment.
