# 0.4 workflow sufficiency audit

Updated 2026-09-15 (Europe/Budapest). This is the current operating sequence. Use the [execution handoff](../../agent-notes/0.4.0/execution-handoff.md), live Git refs and the [release checklist](../../operations/0.4.0-release-checklist.md) for acceptance. Historical candidate identities remain historical and do not certify later source.

Protected `main` and `origin/main` are synchronized at exact SHA
`a224602404cff4689320b5a9193a53c0ceb71698` after protected PR #268. Main Verify
`35018032678` and CodeQL `35018032651` passed; Pages classifier run
`35023589225` passed for that exact source while build, deploy, recovery,
notification and live verification were correctly skipped by sealed-launch
policy. Current-source sealed preflight `35029391986` was attempted but failed
in `phase:"workflow"` because the protected operation inputs were empty; it made
no provider mutation. Earlier preflight `35023663671` passed for superseded
source `f11c8b6b` and is historical. This proves protected source rails only:
provider, owner, live deployment,
recovery/readback, device acceptance and final-freeze evidence remain open. The
live site remains Genesis.

## Verdict

The workflow supports reviewed development, native preparation, protected
integration, generated-family promotion, fresh main verification and sealed
preflight. It is not
yet sufficient to ship 0.4: genuine provider and owner authority, real
deployment and recovery/readback, G001 preservation, sealed G002 denial,
owner-only PTR play, physical-device performance, hosting and final deployment
remain open. Overall completion is approximately **88%** (82–90% judgment
range), based on milestone coverage rather than arbitrary file or content
counts. No reliable calendar ETA is established.

## What is working

- The Keep04 gather → choose → build → benefit → return foundation, readable
  duration presentation and dispatch-return preview are implemented and
  protected by focused tests.
- Source closure, generated pins, Linux, SpacetimeDB, native, recovery, auth,
  analysis and CodeQL checks are green for the merged PR source.
- The saved sync automation is paused and no scheduled GitHub workflow exists;
  manual publication remains the durable development rail.

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

## Product acceptance priorities

The implemented economy, Verdant Citadel renderer and water foundation should be
judged through a complete owner session before adding another system. The next
player-facing pass should make expedition duration and return timing readable,
make each civic building's benefit obvious at the moment it is earned, and keep
the first build and improved return understandable on a narrow phone view. Use
diagnostics that explain a warning or blocked action instead of exposing raw
counts. Keep the renderer and world rules bounded; measured play, accessibility
and device performance should decide targeted fixes rather than another engine
rewrite.

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
