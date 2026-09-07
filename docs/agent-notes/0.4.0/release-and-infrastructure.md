# Release engineering, CI and infrastructure audit

Original source inspection: 2026-09-07, local
`781e51e364d1e5a7319ca2364744c8730e83b0d6`. Current caller status below was updated
on 2026-09-08 through development `c51bb00`; the original provider/process and CI
observations retain their dates and source scope.
Authenticated provider and local-process observations were refreshed on September 7
around 21:48–21:51 UTC. Later publication state belongs in the
[execution handoff](execution-handoff.md). Provider observations expire; reverify
the relevant account, target and operating source before effects.

Use this map to connect implementation to its next real caller. It supplements
the single [release checklist](../../operations/0.4.0-release-checklist.md), not a
second acceptance contract. Historical component results remain useful evidence;
they are not final-source tests, live owner play or deployed-state proof.

## Hosting and access: separate facts from assumptions

| Surface | Observed / recorded state | What it does not prove |
| --- | --- | --- |
| GitHub source | Fresh API reads succeed with repository push/admin permissions; PR #228 is draft/BLOCKED at `c42f6e6`, behind inspected local HEAD | Old socket denial is not current; permission metadata is not a verified new push |
| Frontend | Fresh GitHub Pages settings: workflow build, custom domain `warpkeep.com`, HTTPS enforced, status null | Current served version, healthy 0.4 gameplay or recoverable complete artifact |
| Auth bridge | Correct `warpkeep-production` Wrangler profile freshly lists `warpkeep-auth-bridge`; newest deployment `ec7c0f41-1404-40f8-9330-3c531afae621`, created 2026-08-28T07:54:39.545445Z, version `79dfceec-9810-4868-afca-5b794d08a9a5` at 100% | Historical wrong-default-account Worker-not-found is superseded; deployment metadata does not attest exact source bytes, configuration or owner authentication |
| Persistent realms | Fresh authenticated Spacetime CLI 2.6.1 list returns G001, G002 and PTR with immutable identities matching the access ledger | Provider ownership/list/schema access does not grant application-admin or owner authority |
| G002 private state | Historical private aggregate read returned `INVALID_GENESIS_002_ADMIN_SESSION`; no new private-row read attempted in this audit | Do not infer empty/current state or bypass the denied application boundary |
| Actions runner | Fresh repository inventory: only runner ID21, old macOS runner, offline/not busy; no registered Windows/Linux production runner returned | Local Docker/WSL does not supply genuine repository job/OIDC identity |

See [infra access](../../operations/0.4.0-infra-access.md),
[local operations](../../evidence/0.4.0/local-operations.md) and
[live delivery history](../../operations/0.4.0-live-delivery-status.md). Reconcile
dated entries with authenticated fresh account/route/database metadata. Use
configured credentials through their normal tools; never extract private OS
credential stores or copy secrets/raw player data into Git, logs or a Desktop bundle.

The owning Cloudflare profile now works for the inspected deployment-list
operation. Use it explicitly; the default profile in this worktree is a different
account. Remaining unverified authority includes genuine application-admin/owner
sessions, release-specific private inspections and the fixed workflow identity.
Report the exact failed command/target when a boundary is denied. Do not attribute
it to a blanket infrastructure prohibition or carry a historical denial forward
after a successful fresh check.

G002 and PTR were recorded as created on September 4 UTC / September 5 local;
the fresh provider list confirms both still exist. The immutable identities and
safe inspection commands are maintained in
[infra access](../../operations/0.4.0-infra-access.md). Do not rebuild a fresh-create
plan on the assumption that those databases are absent, and do not treat their
existence as evidence that current gameplay or owner provisioning is deployed.

## Windows/WSL working environment and process evidence

| Check on September 7 | Observation | Practical consequence |
| --- | --- | --- |
| Checkout/remotes | HEAD `781e51e`; `upstream` is GitHub; `origin` is a local temporary baseline repository | Use explicit `upstream` and a reviewed SHA; the displayed ahead count against `origin` is misleading |
| Dirty state | 1,755 tracked dirty paths; only two substantive paths under `git diff --ignore-space-at-eol --name-only` at the audit instant, plus 18 untracked entries | Recheck concurrent edits and exact bytes; preserve unrelated EOL churn, diagnostic files and private material |
| Windows Node | PATH Node 24.19.0; repo-local `.git/ci-node-22.22.3/node.exe` is 22.22.3 | Select pinned Node explicitly; a successful command under PATH is not the recorded toolchain |
| Root dependencies | `node_modules` is a shared junction into the temporary baseline's dependencies | Do not install into it; use a fresh isolated checkout for dependency/build experiments |
| WSL | Ubuntu-24.04 is running under WSL2; Docker daemon is reachable | Useful local Linux tooling exists; this is not production runner registration |
| Ubuntu processes/containers | `ps -eo pid,ppid,comm` showed `containerd` PID189 and `dockerd` PID265; Docker listed only unrelated monitoring containers | These are live infrastructure handles at this time, not a Warpkeep build, publisher or owner-play session |
| Game/runner process evidence | The bounded Ubuntu process check found no node, spacetime, Runner.Listener or Runner.Worker process; the Windows command-line-path filter identified no Warpkeep node process and no 4173/5173 listener was observed | No reusable Warpkeep runtime handle was established; do not claim a test/server is still running from historical notes |

Process IDs and ports are ephemeral. Before reusing a server, confirm its PID,
start time, exact checkout/entrypoint and listening endpoint through a safe
projection of process metadata. Never kill all Node/Docker/WSL processes or stop
unrelated services. Do not log full command lines, environment variables or
authenticated network dumps to identify a process. This audit created no
persistent server, runner or test process and changed no provider configuration.

Disposable local Linux execution can test compiler and filesystem behavior.
Actual production actions that require GitHub OIDC still need a genuine authorized
supported runner. Local platform support therefore has two separate gaps:
finish executable Windows/WSL contracts, and install/verify their authentic
workflow/runner integration. The owner excluded dependence on the Mac runner.

## Component status and next operating caller

| Component | Implemented / verified support | Remaining integration boundary |
| --- | --- | --- |
| Native compiler/family | `local-release-artifact-inputs.mjs`, compiled-family probe; recorded `16c8107` probe compiled 86 files +14 closure outputs, installed 100 files, checked 1,136 members and convergence | Historical diagnostic reports `finalReleasePrepared:false`; rerun complete exact final source/toolchain, not arbitrary overlays |
| Candidate installation/recovery | `local-release-transaction-install.mjs`, candidate lock and transaction recovery: Linux identity/fsync, dirty refusal, crash recovery | Candidate-file recovery is not production database recovery preserving later player writes |
| Closure/inventory/source pins | `local-prepared-closure-family.mjs` and source-pin/manifest/policy derivation | Mechanically regenerate all consumers together after required source changes; no typed-in hashes/counts |
| Static recovery candidate | `recovery-activation-candidate.mjs`, `recovery-binding-projection.mjs` | Canonical schema and consistent digests do not authenticate provenance or grant deployment authority |
| Recovery private descriptor | `sealed-realms-production-activation-records.mjs`, recovery export at `1600f4b`, asynchronous-consumer rejection fixed in `1feb105` | No operating production caller; must feed a fixed authenticated generator, not caller-chosen evidence |
| G001 producer-local capture | `sealed-realms-production-g001-lane-entry.mjs`: stable applicant pair, admitted capture at suspend, S-mode current-state capture | Other producer/adapters remain unavailable; A-mode inspection must preserve original preparation capture |
| Publisher ABI checks | `genesis002-production-publisher.mjs` and `ptr-production-publisher.mjs` corrected for real generated gameplay ABI | Fresh-create publishers still reject existing targets; both realms are confirmed to exist |
| Recovery Pages caller | `deploy-pages.yml` implements the Linux build/attestation/artifact/claim/boundary/deploy/postflight job at `c51bb00`, using the fixed recovery helpers | Actual runner/private state, tracked generated bundle/manifest installation, final source family and live authorization acceptance remain outstanding |
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
5. `deploy-pages.yml` implements `deploy-recovery` at `c51bb00`; its actual source
   passes the fixed issuance and reconciliation workflow contracts. It owns the
   build, installed attestation, unique artifact and adjacent claim → fresh boundary
   → pinned Pages deploy → mandatory postflight under the non-cancelling production
   lock. The supported Linux runner and UID 1001 private state remain unprovisioned;
   the tracked generated claim bundle/manifest and final derived source family
   still require installation. Live authorization and deployment acceptance remain
   unverified. These are operating prerequisites, not an absent workflow caller;
   see [release engineering evidence](../../evidence/0.4.0/release-engineering.md).
6. The **native-contract verification job has already migrated** to disposable
   hosted `ubuntu-24.04` and asserts Linux/X64 in `verify.yml`. The old
   local-operations table listing Verify as macOS-dependent is historical.
   Production migration remains incomplete: sealed-realms, the two protected
   Pages jobs, and both notification-bridge workflows still name macOS/Darwin
   labels, binaries or toolchain manifests. Changing labels alone is insufficient.
7. Local runner diagnostics do not establish registered trusted job identity,
   final network allowlist, attested embedded toolchains or durable private claim
   state. Do not expose a privileged production runner to arbitrary PR code,
   mount host credentials into disposable verification or rename labels to fake
   an authorized execution environment.

Useful source anchors for the next operating slice:

- G001 entry: `sealed-realms-production-g001-workflow-entry.mjs` wires
  `resolveAdminSecretPath`, policy persistence, census collect/suspend, dispatcher
  attestation, child execution and fixed current-state observation to
  `unavailable`. Its lane helper is not an operating workflow by itself.
- G002/PTR entries: `sealed-realms-production-g002-workflow-entry.mjs` and
  `sealed-realms-production-ptr-workflow-entry.mjs` stop at the fixed marker and
  inject unavailable deployment/binding/import/publish/postflight/live adapters;
  PTR also lacks the operating owner inspection/provisioning adapters.
- Existing-target rejection is explicit:
  `genesis002-production-publisher.mjs` throws
  `GENESIS_002_DATABASE_ALREADY_EXISTS`; `ptr-production-publisher.mjs` throws
  `PTR_PRODUCTION_DATABASE_ALREADY_EXISTS`. Implement update/reconciliation with
  a real caller and preservation proof; removing these checks is not an update.
- Source search found definitions, but no production call site, for
  `writeSealedRealmsProductionRecoveryActivationDescriptor` and
  `createRecoveryActivationBinding`. Tests/local diagnostic invocations do not
  close that integration gap.

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

The committed `1feb105` recovery consumer repair lets the private FD owner observe and
reject an asynchronous result before closing the handle; async consumption remains
unsupported. No-clobber descriptor state remains as audit evidence after failure.
The historical wrapper has a similar thenable-observation risk if touched later;
add a dedicated regression without silently changing schema1 semantics. Do not
describe the recovery-only correction as covering all historical consumers.

## Refreshed CI and PR inventory

Inspected on 2026-09-07: [#228 — Prepare sealed 0.4.0 realm launch](https://github.com/ael-dev3/Warpkeep/pull/228),
draft, BLOCKED, `codex/prepared-keep-bindings-fix` → `main`, head
`c42f6e606640a49acdb9db64adc8ede30b37bb3d`. Recheck open PR inventory at
integration; do not expand this into an unrelated PR/refactor project. These
results cover that remote head, not local `781e51e` or later documentation overlays.

[Verify 34145030182](https://github.com/ael-dev3/Warpkeep/actions/runs/34145030182)
at that source is now completed **FAILURE**. Auth bridge, release recovery,
native contract and database jobs passed; the aggregate Verify job failed.
Completed Linux job `101815086934`
reported at 17:14:32 UTC: **5 failed files, 582 passed, 1 skipped; 62 failed tests,
8,806 passed, 76 skipped**, duration 1,426.57s. Database completed successfully at
17:44:23 UTC, and aggregate Verify completed with failure at 17:44:28 UTC. This
supersedes the earlier database-still-running observation.

The CodeQL Actions `analyze` job succeeded, while the separate
[CodeQL alert check](https://github.com/ael-dev3/Warpkeep/runs/101816113867)
failed with **14 reported alerts: 9 high and 5 medium**. Its annotations identify
only test files: nine incomplete string escaping/encoding findings, two shell
commands built from environment values, and three improper code-sanitization
findings. The provider notes that a large PR can surface pre-existing alerts.
These are reported findings requiring scoped triage, not a fresh proof that all
are exploitable or newly introduced. Do not dismiss them just because the paths
are tests, or flatten successful analysis into “CodeQL passed.” Neither result
verifies a newer local head.

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
pins to manufacture green. The failure counts are from the recorded Linux job,
not a fresh full local run. This documentation audit inspected source, provider
metadata and local tooling; it did not rerun the full test suite or deploy.

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
