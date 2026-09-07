# Release engineering, CI and infrastructure audit

Snapshot: 2026-09-07, local `1600f4b`. Provider observations expire; reverify before
effects. This document does not contain credentials or authorization artifacts.

## Hosting and access: separate facts from assumptions

| Surface | Observed / recorded state | What it does not prove |
| --- | --- | --- |
| Frontend | Authenticated GitHub Pages settings: workflow build, custom domain `warpkeep.com`, HTTPS enforced | Current 0.4 deployment or recoverable complete artifact |
| Auth bridge | Cloudflare Worker behind `auth.warpkeep.com`; earlier connector found it, local Wrangler later used a different account and returned Worker-not-found | Wrong-account 10007 does not mean Worker is globally absent; configured login is not sufficient for the owning account |
| Persistent realms | Configured Spacetime CLI 2.6.1 listed G001, G002 and PTR; G002 schema read succeeded | CLI ownership/list/schema access does not grant application-admin or owner access |
| G002 private state | Recorded private aggregate read was rejected with `INVALID_GENESIS_002_ADMIN_SESSION`; no private baseline obtained | Do not infer empty/current state or bypass the denied application boundary |
| Actions runner | Fresh repository inventory: only runner ID21, old macOS runner, offline | Local Docker/WSL image is not a registered production runner with genuine job/OIDC identity |

See [infra access](../../operations/0.4.0-infra-access.md),
[local operations](../../evidence/0.4.0/local-operations.md) and
[live delivery history](../../operations/0.4.0-live-delivery-status.md). Reconcile
dated entries with authenticated fresh account/route/database metadata. Use
configured credentials through their normal tools; never extract private OS
credential stores or copy secrets/raw player data into Git, logs or a Desktop bundle.

Specific remaining access needs are the owning Cloudflare account/Worker binding
and genuine application-admin/owner sessions for required private inspections.
These are concrete access limits, not a blanket prohibition on the owner's infra.

## Component status and next operating caller

| Component | Implemented / verified support | Remaining integration boundary |
| --- | --- | --- |
| Native compiler/family | `local-release-artifact-inputs.mjs`, compiled-family probe; recorded `16c8107` probe compiled 86 files +14 closure outputs, installed 100 files, checked 1,136 members and convergence | Historical diagnostic reports `finalReleasePrepared:false`; rerun complete exact final source/toolchain, not arbitrary overlays |
| Candidate installation/recovery | `local-release-transaction-install.mjs`, candidate lock and transaction recovery: Linux identity/fsync, dirty refusal, crash recovery | Candidate-file recovery is not production database recovery preserving later player writes |
| Closure/inventory/source pins | `local-prepared-closure-family.mjs` and source-pin/manifest/policy derivation | Mechanically regenerate all consumers together after required source changes; no typed-in hashes/counts |
| Static recovery candidate | `recovery-activation-candidate.mjs`, `recovery-binding-projection.mjs` | Canonical schema and consistent digests do not authenticate provenance or grant deployment authority |
| Recovery private descriptor | `sealed-realms-production-activation-records.mjs`, new recovery export at `1600f4b` | No operating production caller; must feed a fixed authenticated generator, not caller-chosen evidence |
| G001 producer-local capture | `sealed-realms-production-g001-lane-entry.mjs`: stable applicant pair, admitted capture at suspend, S-mode current-state capture | Other producer/adapters remain unavailable; A-mode inspection must preserve original preparation capture |
| Publisher ABI checks | G002/PTR publishers corrected for real generated gameplay ABI | Fresh-create publishers still reject existing targets; both realms already exist |
| Recovery claim workflow helpers | OIDC/current-context/prepare-claim/deployment-boundary/postflight/reconciliation helpers | Fixed helper installation and genuine operating job remain absent |
| Recovery Worker split | `services/release-recovery` gateway route and private signer/service binding, durable ledger, disabled gate | Configuration files do not prove deployed Workers, installed keys or armed authorization |

Read [compiled family evidence](../../evidence/0.4.0/local-release-compiled-family-probe.md),
[recovery validation map](../../evidence/0.4.0/recovery-binding-validation-map.md),
[release engineering](../../evidence/0.4.0/release-engineering.md), and the
[assembler specification](../../superpowers/specs/2026-09-06-warpkeep-local-release-assembler-design.md)
through their latest dated entries. Earlier missing-component statements may be
superseded; a later component pass still does not prove its missing caller exists.

## Concrete stops in current execution paths

1. `.github/workflows/sealed-realms-production.yml` still emits
   `SEALED_REALMS_TASK_7_CLOSURE_UNAVAILABLE` and contains macOS/Darwin runtime
   contracts. `sealed-realms-production-workflow-evidence.mjs` rejects valid SHA
   syntax with `SEALED_REALMS_TASK_7_WORKFLOW_EVIDENCE_UNAVAILABLE`. Supply real
   protected Verify evidence, not a caller's plausible commit string.
2. G001 workflow-entry adapters for private admin resolution, policy/census,
   suspension, dispatcher attestation, child execution and fixed observation are
   disconnected. G002/PTR workflow entries still lack operating marker, deployment,
   import-auth, publish/import/postflight/live adapters; PTR additionally lacks
   actual owner inspection/provisioning. Activation bridge/import/owner attesters
   remain unavailable. Trace `sealed-realms-production-*-workflow-entry.mjs` and
   their lane callers rather than merely deleting their throws.
3. Dispatcher, activation lane and auth-bridge-state generator/assert/consume paths
   remain fenced. The old callback-style Task6E generator is unavailable. Restoring
   arbitrary callbacks or weakening the test is not the approved implementation.
4. G002/PTR publishers are **fresh-create only** and reject existing aliases.
   Existing-state baseline, exact immutable target, schema-compatible data-preserving update,
   no-delete publication, ambiguous-outcome reconciliation and authenticated
   postflight are required for a safe update. Removing the refusal or resetting
   the database is not an update implementation.
5. `deploy-pages.yml` has no `deploy-recovery` job; two protected jobs still target
   macOS. `services/release-recovery/src/githubEvidence.ts` already validates the
   intended fixed Linux labels/permissions/environment, non-cancelling production
   lock, unique artifact and adjacent claim → boundary → pinned Pages deploy →
   mandatory postflight. The workflow must actually implement that contract and
   pass both issuance and reconciliation validation.
6. Local runner diagnostics do not establish registered trusted job identity,
   final network allowlist, attested embedded toolchains or durable private claim
   state. Do not expose a privileged production runner to arbitrary PR code,
   mount host credentials into disposable verification or rename labels to fake
   an authorized execution environment.

## Recovery descriptor review boundary

The new recovery-only writer accepts canonical schema2 candidate bytes and exact
twelve non-historical producer records. It deliberately does not read the absent
G001 historical freeze receipt; schema1 remains separate. It cross-checks G001
policy/census/suspension/current-state semantics and G002/PTR module, atlas,
publish/import/live/owner linkages, including independently different module and
atlas source coordinates. Failed validations must not call the descriptor consumer.

Important: record framing checks `sourceAuthorityDigest` for digest shape but this
reader does not authenticate the original workflow with a provider. Likewise,
static candidate validation is not independent authentication of program Keccak,
protected source, atlas provenance, public approval or bridge interlock. No
production caller was found for this writer or `createRecoveryActivationBinding`.
The downstream fixed generator must independently establish these coordinates.
Matching attacker-chosen values in two files is not provenance.

The interrupted recovery consumer repair lets the private FD owner observe and
reject an asynchronous result before closing the handle; async consumption remains
unsupported. No-clobber descriptor state remains as audit evidence after failure.
The historical wrapper has a similar thenable-observation risk if touched later;
add a dedicated regression without silently changing schema1 semantics. Do not
describe the recovery-only correction as covering all historical consumers.

## Fresh CI and PR inventory

Only open PR on 2026-09-07: [#228 — Prepare sealed 0.4.0 realm launch](https://github.com/ael-dev3/Warpkeep/pull/228),
draft, BLOCKED, `codex/prepared-keep-bindings-fix` → `main`, head
`c42f6e606640a49acdb9db64adc8ede30b37bb3d`. No other open PR needs release
reconciliation at this snapshot. Recheck at integration; do not expand this into
an endless unrelated PR/refactor project.

[Verify 34145030182](https://github.com/ael-dev3/Warpkeep/actions/runs/34145030182)
at that source: auth bridge, release recovery and native contract passed; database
job was still running during inspection. Completed Linux job `101815086934`
reported at 17:14:32 UTC: **5 failed files, 582 passed, 1 skipped; 62 failed tests,
8,806 passed, 76 skipped**, duration 1,426.57s.

| Failed suite | Current observed cause | Correct next resolution |
| --- | --- | --- |
| `authBridgeNotificationB0Closure` | 2 failures: derived 1,125 versus recorded 1,027; G002 gameplay source absent from recorded namespace | Full mechanically derived family and exact set tests |
| `greaterRealmReleaseGateDeployBoundary` | 1 failure: recorded 997 versus comparison 1,027 | Derive corresponding consumer, retain exact boundary |
| `ptrPreparedDeployClosure` | 1 failure: derived 1,125 versus recorded 1,027 | Derive complete real dependency inventory |
| `sealedLaunchVerifier` | 58 failures: stale G001 current-state source pin; positive G002 authority rejection | Complete source-pin family, run all positive/mutation tests on candidate |
| `sealedLaunchActivationGenerator` | Collection throws Task6E authority unavailable; 11 skipped | Implement fixed genuine generator/caller; regeneration alone cannot fix absent authority |

The compiler lifecycle fixture repair **passed all 12 tests in actual CI**.
The five remaining families match the earlier
[failure baseline](../../evidence/0.4.0/ci-preparation-failure-baseline.md), with
current counts above. Do not raise timeouts, delete equality checks or hand-edit
pins to manufacture green. Do not label the running aggregate CI a pass.

## Completion is one linked evidence chain

Required gameplay/visual/operations sources and isolated write-preserving recovery
proof → complete final family freeze → protected reviewed integration → exact
deployed artifacts → live verification → Desktop handoff. Required baseline and
recovery testing must precede production effects, not follow a live release.

R09 must record exact live frontend/service/module/database identities and private
admitted-player baseline before effects. Legitimate gameplay changes data; whole
database hash equality is not preservation. An expired historical Pages artifact,
metadata record or HTML hash is not an available rollback package. Candidate-file
crash tests do not establish recovery preserving post-deployment player writes.

R17/R18 must link reviewed commit, artifact hashes/IDs, URLs, databases and every
mandatory result, including owner journey, G001 preservation, sealed G002 denial,
performance and tested recovery. Ship a credential-free Desktop `Warpkeep 0.4.0`
package with reproducible commands, results, limitations and file/hash manifest.
No final freeze or live-completion claim was made by this audit.
