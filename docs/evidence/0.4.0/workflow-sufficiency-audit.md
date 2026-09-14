# 0.4 workflow sufficiency audit

Updated 2026-09-14 (Europe/Budapest). This is the current operating sequence.
Use the [execution handoff](../../agent-notes/0.4.0/execution-handoff.md) and live
Git refs for the latest checkpoint, and the
[release checklist](../../operations/0.4.0-release-checklist.md) for acceptance.
Historical candidate identities remain in [release engineering](release-engineering.md)
and [recovery evidence](recovery.md); none certifies later source.

PR #250, PR #251 and PR #252 are protected-merged; Verify `34800429035` and
CodeQL `34800429052` passed every required lane on `a452e9f`. Pages classify
`34803660169` passed but skipped build/deploy under the current release
classification, so the live 0.4 release remains unshipped.

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

- Protected main is `a452e9feb5c3383a446ae3fdd5dfd255a869d984`; PR #252's mobile
  overview merge and fresh Verify `34800429035` are green across all required
  lanes, with CodeQL `34800429052` also passed.
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
