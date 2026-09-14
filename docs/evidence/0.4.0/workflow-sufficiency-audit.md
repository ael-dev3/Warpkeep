# 0.4 workflow sufficiency audit

Updated 2026-09-14 (Europe/Budapest). This is the current operating sequence. Use the [execution handoff](../../agent-notes/0.4.0/execution-handoff.md), live Git refs and the [release checklist](../../operations/0.4.0-release-checklist.md) for acceptance. Historical candidate identities remain historical and do not certify later source.

PR #257 is protected-merged. `main` and `origin/main` are synchronized at `f0e9d3e8baec4b1a1e3cbbd1dddc865d9f518f9c`. Fresh Verify `34844704568`, CodeQL `34844704587`, Pages classifier `34850287588` and exact-main read-only preflight `34850381588` completed successfully.

The Pages classifier succeeded, but build, deploy and live verification were skipped under the sealed-launch policy, so the live 0.4 release remains unshipped. The saved sync automation is paused and no scheduled GitHub workflow exists.

## Verdict

The workflow now supports reviewed development, native preparation, protected integration, generated-family promotion, fresh main verification and a sealed read-only preflight. It is not yet sufficient to ship 0.4: genuine provider and owner authority, real deployment and recovery/readback, G001 preservation, sealed G002 denial, owner-only PTR play, physical-device performance, hosting and final deployment remain open. Overall completion is approximately **86%** (80–88% judgment range), based on milestone coverage rather than arbitrary file or content counts. No reliable calendar ETA is established.

## What is working

- Protected `main` and `origin/main` are synchronized at `f0e9d3e8baec4b1a1e3cbbd1dddc865d9f518f9c`; PR #257 is protected-merged.
- Fresh Verify `34844704568`, CodeQL `34844704587`, Pages classifier `34850287588` and exact-main read-only preflight `34850381588` are green for the same source.
- The preflight is source, runner and fixed-bundle inspection only. Pages deploy/live lanes are intentionally skipped under sealed launch; the served site remains Genesis.
- The saved sync automation is paused and no scheduled GitHub workflow exists. Continue manual fetch, secret scan, reviewed commit/push and exact remote-SHA verification.
- G001 progress, access, timers and admission freeze remain protected; G002 remains sealed and the isolated actual-owner PTR path is still required.

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
