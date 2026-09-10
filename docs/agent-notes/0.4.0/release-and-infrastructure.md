# Release engineering, CI and infrastructure audit

## Current source checkpoint — 2026-09-10

The current published implementation checkpoint is `3eb52ee9` (functional
source checkpoint `a11ca0e7`) on `codex/prepared-keep-bindings-fix`; later
commits on the branch are documentation-only overlays. The dependency, private
Sharp/libvips, runtime-verifier,
sealed-launch source-pin and recovery-loader repairs are published, and the
agent-facing evidence files reconcile to this source. GitHub Verify and CodeQL
for this branch must still be checked at the current head; older run IDs below
retain their original source and acceptance limits and are not current-release
evidence. The disposable Windows full-stack lane passed on the functional source
checkpoint with the warning boundary and re-entry diagnostics enabled; a fresh
run is still required after any further source change for release evidence.

## Connected QA checkpoint — 2026-09-10

The passing lane covered title/Terms continuity, realm entry, Inner Keep setup,
four-worker dispatch, outbound/gathering/returning presentation, individual
recall, Recall All, automatic settlement, return-completion lifecycle, released
node reuse, hard-reload persistence, delayed/failing private reads, timeout and
visibility seams, a canonical 10,000-cell realm and the mobile/desktop visual
aggregate. The product fix at `RealmMapScreen` exposes localized private-sync
failure telemetry so recovery is observable without weakening the private gate.

Known repository health item: GitHub currently reports one moderate Dependabot
alert on the default branch because its lock still carries Vitest 4.1.9. This
development branch already pins Vitest 4.1.11, the patched release; the alert
closes when that dependency update reaches `main`. Confirm the alert is closed
before a release cut.

## Dedicated local preparation namespace

The current source selects WSL `WarpkeepRunner`, intended user `warpkeep`
(UID/GID 1000), and `/home/warpkeep/.warpkeep/release-preparation-v1` across
local parents/workers and the fixture toolchain policy. Its installation
completed; after initial connection timeouts, Ubuntu 24.04.4 now runs commands
as `warpkeep` UID/GID 1000. Home/private directory modes are verified. A systemd
user-session warning persists; pinned tools, fresh attestations and native
current-source preparation remain pending.
No fallback into another project's distro is supported. Existing tool hashes,
UID/mode checks and private history remain intact. Source/mock verification
must not be presented as a working guest, regenerated native bundles or a
migration of the separate registered Actions runner. Use the current
[local preparation guide](../../operations/0.4.0-local-release-preparation.md);
the earlier observations below retain their original scope.

Exact `b306eed` includes the Linux preflight, reviewed recovery-policy repair and
current source guidance. Full native preparation and independent check passed;
generated-only commit `ba12a7f` integrates the output delta. Clean
candidate QA passed 658 tests across the two complete release/policy runs, with 25
privileged namespace skips; app/configuration types passed. The later panel fix
`0d98599` has separate scoped UI/type and incremental-closure evidence.
Required GitHub CI and final release preparation remain distinct. Follow the
[execution handoff](execution-handoff.md) and actual remote for current source.

The original September 7 audit was at `781e51e`; its dated provider/process/CI
observations below retain that scope. Later September 8 entries supersede only
the specific facts they rechecked. Provider observations expire; reverify the
relevant account, target and operating source before effects.

Use this map to connect implementation to its next real caller. It supplements
the single [release checklist](../../operations/0.4.0-release-checklist.md), not a
second acceptance contract. Historical component results remain useful evidence;
they are not final-source tests, live owner play or deployed-state proof.

## Hosting and access: separate facts from assumptions

| Surface | Observed / recorded state | What it does not prove |
| --- | --- | --- |
| GitHub source | September 7 API reads succeeded with repository push/admin permissions; PR #228 was draft/BLOCKED at `c42f6e6`, behind the then-inspected local HEAD | This dated PR observation is not current publication state; follow the execution handoff and verify the actual remote |
| Frontend | Fresh GitHub Pages settings: workflow build, custom domain `warpkeep.com`, HTTPS enforced, status null | Current served version, healthy 0.4 gameplay or recoverable complete artifact |
| Auth bridge | Correct `warpkeep-production` Wrangler profile freshly lists `warpkeep-auth-bridge`; newest deployment `ec7c0f41-1404-40f8-9330-3c531afae621`, created 2026-08-28T07:54:39.545445Z, version `79dfceec-9810-4868-afca-5b794d08a9a5` at 100% | Historical wrong-default-account Worker-not-found is superseded; deployment metadata does not attest exact source bytes, configuration or owner authentication |
| Persistent realms | Fresh authenticated Spacetime CLI 2.6.1 list returns G001, G002 and PTR with immutable identities matching the access ledger | Provider ownership/list/schema access does not grant application-admin or owner authority |
| G002 private state | Historical private aggregate read returned `INVALID_GENESIS_002_ADMIN_SESSION`; no new private-row read attempted in this audit | Do not infer empty/current state or bypass the denied application boundary |
| Actions runner | September 8: runner ID22, `warpkeep-wsl-production-01`, online/idle with Linux/X64 and the required production labels; persistent systemd service as UID1001; recovery directory provisioned at owner-only mode0700. Existing macOS runner ID21 remains offline | Registration and an empty private directory do not supply live job/OIDC evidence, signer keys, private claims or release authorization |

See [infra access](../../operations/0.4.0-infra-access.md),
[local operations](../../evidence/0.4.0/local-operations.md) and
[live delivery history](../../operations/0.4.0-live-delivery-status.md). Reconcile
dated entries with authenticated fresh account/route/database metadata. Use
configured credentials through their normal tools; never extract private OS
credential stores or copy secrets/raw player data into Git, logs or a Desktop bundle.
The [Linux runner operations guide](../../operations/0.4.0-linux-runner.md)
records its package provenance, exact unit/account/paths, maintenance commands and
Windows/WSL availability limitation.

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


### Existing G002/PTR update evidence — September 8

Authenticated schema and identity reads at 02:50 UTC confirmed the exact existing
G002 and PTR targets. Their live schemas lack the new gameplay tables. A detailed
comparison of retained source declarations found no change in ordered columns,
algebraic types, primary keys, indexes, constraints, sequences or private access.
A subsequent locked Linux build from exact source `1e90b2e` passed the complete
compiled table-schema comparison at 03:30 UTC, with an independent descriptor
replay. Every existing canonical table object and its reachable types match;
the added gameplay tables' private access, keys, indexes, sequence and actual
schedule target also match the source contract. PTR's sanitized browser bindings
contain no table descriptors and are not the comparison authority. The owned
in-memory loopback instance used no player rows and was stopped afterward.
This comparison did not observe the loaded program or populate rows. The later
04:02 UTC planning observation below supplies scoped program-hash evidence;
populated migration and retained-write recovery remain separate work.

At 02:59 UTC, one ordinary authenticated `st_module` metadata query per target was
denied: `INVALID_GENESIS_002_ADMIN_SESSION` and `INVALID_PTR_OWNER_SESSION`. The
requests asked for program hash/version only. No player rows, program bytes or
mutation were requested; the ordinary connection lifecycle was invoked, so zero
application effects were not independently established. That route was stopped
without retries or substitute authority. GET metadata's `initial_program` is
historical and must not be described as the current loaded program. A supported
SQL observer must satisfy both application admission and provider query authority.
A separate fixed, authenticated provider planning diagnostic succeeded at
04:02 UTC, supporting the initial-program fingerprint at each planning snapshot.
Complete metadata/schema matched before and after; expected additive plans had no
client-breaking or major-upgrade flags. No publication or player-row request was
made. This supersedes the earlier absence of a program-hash observation, while
preserving the SQL denial and the snapshot's explicit limits.

A separate native experiment on pinned SpacetimeDB 2.6.1 verified the update
protocol using synthetic modules in a private loopback network namespace. Valid
additive updates and forward replacements preserved exact old and new test rows,
including writes after planning. The token-checking policy rejected a stale
predecessor, changed candidate, absent token and wrong target. `Compatible`
ignored the token. Returning to the exact old program made its old token valid
again, so the token supplies neither a deployment epoch nor a row snapshot.

This protocol evidence does not establish a Warpkeep migration. The fresh-only
publishers and their receipts must retain their existing meanings. Connect a
distinct existing-target update variant through authenticated observation,
compiled compatibility, data-preserving recovery, durable reconciliation and the
canonical receipt consumer. Do not replay import/owner creation or rewrite old
receipts as evidence for a new module. The [engineering evidence](../../evidence/0.4.0/release-engineering.md)
records the preparation and diagnostic scope.

The historical creation record identifies module source `799814b` and recorded
bundle hashes. A bounded artifact search found no matching retained bytes, and
one isolated historical-source rebuild per realm did not reproduce those hashes.
Those files are diagnostic fixtures, not the original deployed executables. Exact
predecessor possession is not an explicit general recovery requirement: R16
requires compatible recovery preserving existing and subsequent writes. Do not
restore a pre-gameplay schema or old snapshot over newer state.

The first actual-module local preservation experiment confirmed the reconstructed
G002 table boundary but stopped at direct-HTTP admin authentication before any
import/update. The bridge token lacked the module-required `hex_identity` claim.
Source `95ce45c` now derives and signs that claim for G002 only; the unmodified
module and pinned host passed native positive and rejection tests. Focused tests
and all four affected type checks passed. No live provider change was made.

The transport distinction matters: direct HTTP forwards the original JWT payload,
whereas the pinned SDK first exchanges it at `/v1/identity/websocket-token`. That
endpoint signs a temporary token containing the computed identity. The earlier
SDK loopback did run successfully in CI; its projected-identity fixture did not
cover the failing direct-HTTP path. Native SQL evidence uses a synthetic Hermes
principal that also owns its disposable database, so it does not establish private
SQL access on the differently owned production database. Continue from the
[recovery evidence](../../evidence/0.4.0/recovery.md).


The 05:09–05:10 UTC rehearsal remains a retained failed attempt: it stopped at
PTR inspection because the historical parser rejects the SDK's exchanged identity
claim. Source `c5392e0` accepts only the original exact shapes or those shapes plus
the SDK identity, validates that field and binds it to the authenticated sender.
All existing owner/database/epoch and absolute-session checks remain enforced.
The historical A artifacts were not modified; their import, provisioning and
owner bootstrap use the actual host HTTP lifecycle with the original signed JWT.

The new rehearsal completed at 08:24 UTC. Real exporters/importers populated both
historical realms, followed by token-bound A-to-B updates that preserved every
existing row and complete table boundary. The updated PTR then completed gathering,
construction, issuance containment, autonomous timer settlement, expired-session
refusal and fresh-session resume. An explicit accepted-command retry changed no
rows. This is actual module behavior with synthetic local authority and persistent
test data; production owner play and code-replacement recovery remain unproven.
The server, temporary signing files and CLI snapshot were cleaned up.


The complete generated consumer family for `95ce45c` was independently reproduced
and verified. Commit `6a5123ed7fde3e5e6b21114b895477f8c6b43a03` installs its
reviewed generated changes. All affected suites passed: 432 cases, no skips,
including the complete prepared-workflow suite. Tracked source and generated
output bytes remained unchanged during QA. Retained compiled inputs and bundles
were verified without rebuilding; full preparation remains scoped to `b306eed`.
Final release preparation and required published-source CI remain separate.

The 08:19–08:24 UTC populated rehearsal subsequently passed actual G002/PTR
A-to-B preservation and PTR timer/session-containment behavior. See the dated
[recovery evidence](../../evidence/0.4.0/recovery.md) for its source/artifact scopes
and remaining code-replacement and production-authority work.

## Windows/WSL working environment and process evidence

For the connected synthetic existing-update tests, run
`bash scripts/test-sealed-realms-existing-update-linux.sh` from an isolated Linux
x64 checkout with the locked root dependencies installed and the pinned Node on
`PATH`. The hosted `native-contract` job invokes this launcher. It requires
passwordless sudo to create disposable mount/network namespaces, retains the
actual pre-unshare network identity, then drops to the original non-root UID/GID
with no supplementary groups or capabilities and an empty inherited environment.
Only loopback is enabled. A missing native boundary fails the job instead of
silently skipping the update tests.

On WSL where the ordinary account lacks passwordless sudo, the same script accepts
an explicit root invocation with `--as UID GID NODE REPOSITORY`; use the actual
checkout owner's numeric UID/GID and canonical absolute Node/repository paths.
The script verifies repository ownership before dropping privileges and runs only
the fixed test suites. Do not install dependencies in a shared worktree junction.
This fixture launcher grants no production credentials or deployment authority.
See the dated [recovery evidence](../../evidence/0.4.0/recovery.md) for v2 record
semantics and the separate scope of earlier native-module experiments.

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
authenticated network dumps to identify a process. The September 7 audit created
no persistent server, runner or test process and changed no provider configuration.
The separate September 8 setup registered the Linux runner and enabled/started
its systemd service without restarting WSL. Its service main PID was 2470710 at
00:28 UTC; recheck status before relying on that handle. The account, runtime and
recovery root are distinct from the UID1000 native assembler namespace.

Disposable local Linux execution can test compiler and filesystem behavior.
The supported Linux runner is now registered and available, but no live recovery
job/OIDC authorization was exercised by setup. Finish the executable operating
adapters and verify the exact workflow/source/authorization chain on that runner.
The owner excluded dependence on the Mac runner; legacy Mac-only production
callers remain separate migration work.

## Component status and next operating caller

| Component | Implemented / verified support | Remaining integration boundary |
| --- | --- | --- |
| Native compiler/family | `local-release-assembler.mjs` at `772d3a4` connects fixed producers, attested scanner, complete consumer derivation, independent byte verification and durable prepare/check/recover; the `16c8107` probe remains dated historical evidence | Use the exact selected committed source, regenerate after runtime changes such as `f558bd5`, and retain `finalReleasePrepared:false`; a source candidate is not activation or release authority |
| Candidate installation/recovery | `local-release-transaction-install.mjs`, candidate lock and transaction recovery: Linux identity/fsync, dirty refusal, crash recovery | Candidate-file recovery is not production database recovery preserving later player writes |
| Closure/inventory/source pins | `local-prepared-closure-family.mjs` and source-pin/manifest/policy derivation | Mechanically regenerate all consumers together after required source changes; no typed-in hashes/counts |
| Static recovery candidate | `recovery-activation-candidate.mjs`, `recovery-binding-projection.mjs` | Canonical schema and consistent digests do not authenticate provenance or grant deployment authority |
| Recovery private descriptor | `sealed-realms-production-activation-records.mjs` validates the S-bound corpus; the fixed `sealed-realms-production-recovery-candidate.mjs` derives Git/bootstrap/corpus facts and authenticates completed historical inspection | Real recovery/Worker/module/approval facts and provider-backed receipt captures remain missing; canonical shape alone is not their provenance |
| Activation generation and completion | `772d3a4` connects the fixed V2 generator, branded evidence consumption, atomic public artifact/private generation receipt and read-only reconciliation through the activation lane | The workflow's source-evidence and provider adapters still refuse unavailable authority; implemented generation does not manufacture those inputs |
| G001 producer-local capture | `sealed-realms-production-g001-lane-entry.mjs`: stable applicant pair, admitted capture at suspend, S-mode current-state capture | Other producer/adapters remain unavailable; A-mode inspection must preserve original preparation capture |
| Publisher ABI checks | `genesis002-production-publisher.mjs` and `ptr-production-publisher.mjs` corrected for real generated gameplay ABI | Fresh-create publishers still reject existing targets; both realms are confirmed to exist |
| Recovery Pages caller | `deploy-pages.yml` implements the Linux build/attestation/artifact/claim/boundary/deploy/postflight job at `c51bb00`; runner22 and its UID1001 private directory are now provisioned | Install/review the selected current generated source and bundle family, genuine activation inputs, signer private/control state and live authorization; no recovery job has yet established acceptance |
| Recovery Worker split | `services/release-recovery` gateway route and private signer/service binding, durable ledger, disabled gate | Configuration files do not prove deployed Workers, installed keys or armed authorization |
| Linux sealed preflight | Fixed authenticated G001 caller connected through `sealed-realms-production.yml`, with actual runtime/source/bundle/Verify/private-root checks | Only preflight is supported; other sealed operations refuse. Native synthetic tests do not establish a protected dispatch, provider readiness or launch authorization |

Read [compiled family evidence](../../evidence/0.4.0/local-release-compiled-family-probe.md),
[recovery validation map](../../evidence/0.4.0/recovery-binding-validation-map.md),
[release engineering](../../evidence/0.4.0/release-engineering.md), and the
[local assembler operating guide](../../operations/0.4.0-local-release-preparation.md).
The [assembler specification](../../superpowers/specs/2026-09-06-warpkeep-local-release-assembler-design.md)
provides the design boundary. Follow the evidence through its latest dated entries.
Earlier missing-component statements may be superseded; a later component pass
still does not prove its missing caller exists.

## Concrete stops in current execution paths

The source integration following `1277cc8` resolves the inert S/full V2
authentication mismatch, fixed GitHub Verify evidence loading and G001 durable
policy capture/adoption. The actual CLI preserves the frozen module snapshot
while correctly separating repository-root browser packages from its dependency
owner. Read the [executed engineering evidence](../../evidence/0.4.0/release-engineering.md)
for the combined native results and the separate generated-family boundary.

1. `.github/workflows/sealed-realms-production.yml` still emits
   `SEALED_REALMS_TASK_7_CLOSURE_UNAVAILABLE` and contains macOS/Darwin runtime
   contracts. The fixed Verify reader is implemented and tested through the real
   workflow factories; the executable lane still needs its real token mapping and
   supported attested runtime. A fixture or local source pass cannot supply them.
2. G001 workflow-entry adapters for private admin resolution, policy/census,
   suspension, dispatcher attestation, child execution and fixed observation are
   disconnected. G002/PTR workflow entries still lack operating marker, deployment,
   import-auth, publish/import/postflight/live adapters; PTR additionally lacks
   actual owner inspection/provisioning. Activation bridge/import/owner attesters
   remain unavailable. Trace `sealed-realms-production-*-workflow-entry.mjs` and
   their lane callers rather than merely deleting their throws.
3. The fixed activation dispatcher/lane, generator/assert/consume paths and durable
   completion/reconciliation are implemented at `772d3a4`; receipt-first candidate
   projection follows at `f558bd5`. The operating workflow's
   `readCanonicalRecoveryCandidate` now invokes the fixed canonical reader, which
   still rejects missing real recovery-core/realm facts. Completed historical
   inspection uses authenticated receipt time through an opaque callback scope;
   fresh descriptor creation cannot borrow that historical authority. The legacy
   early-dispatch Task6E refusal remains a separate path. Supply actual producer
   evidence and supported workflow context, not arbitrary callbacks or fixture JSON.
4. G002/PTR publishers are **fresh-create only** and reject existing aliases.
   Existing-state baseline, exact immutable target, schema-compatible data-preserving update,
   no-delete publication, ambiguous-outcome reconciliation and authenticated
   postflight are required for a safe update. Removing the refusal or resetting
   the database is not an update implementation.
5. `deploy-pages.yml` implements `deploy-recovery` at `c51bb00`; its actual source
   passes the fixed issuance and reconciliation workflow contracts. It owns the
   build, installed attestation, unique artifact and adjacent claim → fresh boundary
   → pinned Pages deploy → mandatory postflight under the non-cancelling production
   lock. Runner22 is online and its UID1001 private directory exists. The selected
   `b4df426` source family passed full native prepare/check and was integrated
   with this handoff. Later runtime changes require fresh derivation. Genuine
   activation inputs and live signer authorization remain missing. Private signer
   keys/control/ledger state and accepted run-specific claims are not supplied by
   the empty runner directory. Deployment acceptance remains unverified. These
   are operating prerequisites, not an absent workflow caller;
   see [release engineering evidence](../../evidence/0.4.0/release-engineering.md).
6. The **native-contract verification job has already migrated** to disposable
   hosted `ubuntu-24.04` and asserts Linux/X64 in `verify.yml`. The old
   local-operations table listing Verify as macOS-dependent is historical.
   Production migration remains incomplete: sealed-realms, the two protected
   Pages jobs, and both notification-bridge workflows still name macOS/Darwin
   labels, binaries or toolchain manifests. Changing labels alone is insufficient.
7. Registered runner availability does not establish a particular trusted job identity,
   final network allowlist, attested embedded toolchains or durable private claim
   state. Do not expose a privileged production runner to arbitrary PR code,
   mount host credentials into disposable verification or rename labels to fake
   an authorized execution environment.

Useful source anchors for the next operating slice:

- G001 entry: `sealed-realms-production-g001-workflow-entry.mjs` wires
  `resolveAdminSecretPath`, census collect/suspend, dispatcher
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
- The bridge state's fixed generation path now calls
  `writeSealedRealmsProductionRecoveryActivationDescriptor`, and the V2 generator
  calls `createRecoveryActivationBinding`. The remaining gap is the workflow's
  authentic provider facts, not missing calls between these implemented
  components. The canonical reader is connected; its real producer inputs and
  bridge evidence ordering remain unfinished.

## Recovery descriptor review boundary

The recovery-only reader at `f558bd5` validates its exact twelve non-historical
records before constructing a candidate. Each wrapper's source commit and
authority digest must match the authenticated preparation source S. It derives
frozen scalar facts, checks every overlapping candidate field and reopens the
corpus to detect replacement. It cross-checks G001 policy/census/suspension/current
state and G002/PTR module, atlas, publish/import/live/owner linkages, including
independently different module and atlas source coordinates. Failed validation
must not call the descriptor consumer. Schema1 remains a separate preserved path.

The fixed V2 generator and atomic generation-receipt path are connected. Read-only
reconciliation checks the retained artifact/receipt pair against reopened records
and original-run evidence without generating again. These checks do not supply
missing provider-backed recovery-core facts, live realm observations, source
workflow verification, public approval or bridge attestations. The fixed operating
candidate adapter is connected after the later source integration. It rejects
incomplete producer facts; matching caller-selected values is not provenance.
Authenticated historical inspection does not replace final bridge, workflow-run
and evidence-chain reconciliation.

The historical `1feb105` recovery consumer repair lets the private FD owner observe and
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

| Failed suite | Observed cause in that run | Resolution identified at that audit |
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
