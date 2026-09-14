# 0.4 workflow sufficiency audit

Updated 2026-09-14 (Europe/Budapest). This is the current operating sequence.
Use the [execution handoff](../../agent-notes/0.4.0/execution-handoff.md) and live
Git refs for the latest checkpoint, and the
[release checklist](../../operations/0.4.0-release-checklist.md) for acceptance.
Historical candidate identities remain in [release engineering](release-engineering.md)
and [recovery evidence](recovery.md); none certifies later source.

PR #250, PR #251, PR #252, PR #253 and PR #254 are protected-merged. PR #255 is
open at review head `539d5b8f`; CodeQL `34817207434` and Verify
`34817207464` remain in progress on the generated-family refresh. Pages run
`34810674281` classified the gameplay/source checkpoint but skipped
build/deploy/live verification under the current release classification, so the
live 0.4 release remains unshipped.

The fresh protected-main preflight `34813075520` passed runner and exact-source
attestation but failed at bundle validation against older preparation input
`27c2d276`; no provider, realm, owner or deployment mutation occurred. A fresh
Linux preparation/check completed for exact source `c0e1d2d6`, with candidate
`release-workspace-6c6d10e57c03ce0ead8c3ac35b285a19`, family
`593fdb280394632d0d3302b5fa127f162c1ef145b58b3f16be593c2021adce7c` and closure
`65a8c8feb58a2b432af919fc80b0c902b69efebf947e35ed87349711c94e2335`.
The generated-only refresh is now under PR #255 review; protected preflight is
the next delivery-critical step after merge.

## Verdict

The workflow now supports reviewed development, native preparation, protected
integration, generated-only M2 promotion, fresh main verification and a sealed
read-only preflight. It is not yet sufficient to ship 0.4: genuine provider and
owner authority, live recovery/readback, G001 preservation, sealed G002 denial,
owner-only PTR play, physical-device performance, hosting and final deployment
remain open. Overall completion is approximately **85%** (an 80–88% judgment
range), based on milestone coverage rather than test or file counts. No reliable
calendar ETA is established.

## What is working

- Protected main is `c0e1d2d667ced3d3613ee32ab9ce28001fc2914f`; PR #255 carries
  the reviewed generated-family refresh at `539d5b8f`, with CodeQL and Verify
  in progress.
- Native WSL is clean and synchronized to the exact M2 commit with RunnerService
  PID203 and Runner.Listener PID224 preserved. Sealed preflight `34763502943`
  returned `preflight-inspected` without mutating live state.
- The saved `keep-warpkeep-development-synced` automation is paused and the
  repository has no scheduled GitHub workflow. Continue manual fetch, complete
  outgoing-range scan, commit/push and remote-SHA verification at each checkpoint.
- Existing G001 progress/access/timers and admission freeze remain protected;
  G002 remains sealed and the isolated actual-owner PTR path is still required.

## What remains open

- Establish genuine publisher/provider and actual-owner authority, then complete
  the supported Linux prepared deployment, compatible existing-state
  update/adoption and recovery/readback paths.
- Capture fresh G001 preservation and sealed G002 denial baselines, including
  access, timers, admission freeze and legitimate later writes. Keep G002 sealed
  and never repeat initialization over live state.
- Complete the isolated actual-owner PTR journey, lifecycle/isolation checks,
  final rendered composition and fixed physical-device/performance measurements.
- Verify Pages/frontend, Cloudflare and SpacetimeDB deployment from the same
  reviewed source/artifact family, with live URLs, versions, receipts and hashes.
- Finish the credential-free delivery and every mandatory release record before
  claiming shipment. Keep the sync automation paused and create no new Desktop
  files.

## Required order from here

1. Establish genuine provider/publisher and actual-owner authority, re-attest the
   bridge predecessor and isolated PTR target, and capture fresh G001 and sealed
   G002 baselines. Preserve legitimate later writes; never restore an old
   snapshot or repeat initialization over live state.
2. Complete the supported Linux prepared deployment, compatible existing-state
   update/adoption and recovery/readback paths. Report the exact missing
   authority if the provider denies an operation; do not substitute a synthetic
   identity or administrator.
3. Complete actual-owner play, lifecycle/isolation, final rendered views and
   fixed physical-device/performance measurements. Resolve all findings before
   freeze, then deploy the accepted Pages/frontend, Cloudflare and SpacetimeDB
   family using its recorded source/artifact relationships.
4. Verify live G001 preservation, sealed G002 denial and the actual-owner PTR
   journey. Finish the mandatory release records and credential-free delivery at
   `artifacts/delivery/0.4.0/`; reuse existing checkouts/cache, retain referenced
   journals, remove only verified disposable owned output, and create no new
   Desktop files.
