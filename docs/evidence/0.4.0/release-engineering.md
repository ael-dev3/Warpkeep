# Release engineering: implementation and evidence

Current reading point: the published development head is
`178f629bd1bab71d6be5299d5f40720cc945011d`; the September 9 source checkpoint
`206c036` records the latest retained assembled-artifact execution above the
historical entries in this record; the September 8 entries at the end cover
the published Linux preflight/Worker source `1e90b2e`, its completed native
prepare/check and generated-only integration `de10f83`, plus compiled G002/PTR
table-schema compatibility and synthetic update-protocol validation. The
[execution handoff](../../agent-notes/0.4.0/execution-handoff.md) gives the next
connected work and actual publication/check status. **0.4 is not shipped.**

Each dated section retains its exact source and scope. Earlier missing-component
entries are history when a later section demonstrates their implementation;
component success does not establish unrecorded production acceptance.

## Current assembled-artifact execution — 2026-09-09

The pinned WarpkeepRunner Ubuntu 24.04 guest executed the current native
materializer and child worker from source `206c03683c9039b513b878d7b0d3c6770eda2626`
and tree `ebc91c6cc7bf205de22e331d127b1f2f7b8ba5da`. The operation-bundle runtime
completed activation, G001, G002 and PTR lanes. The program-artifact path
completed frozen G001 and current G002, and the all-realms binding run completed
G001 current/compatibility, G002 and PTR. The compact all-realms receipt is
retained at `/home/warpkeep/warpkeep-all-realms-206c036.json` in the isolated
guest. This is local execution evidence only; it does not establish a protected
GitHub workflow, provider deployment, live owner admission or physical-device
acceptance.

## Historical execution inventory — September 6

Inspected checkout `c7f3c4d`; R12 was incomplete. These are the observed gaps at
that source, not a statement that every gap remains present in current code.

| Component | Observed unfinished behavior | Required completion evidence |
| --- | --- | --- |
| `.github/workflows/sealed-realms-production.yml:63` | Stale-closure step always emits `SEALED_REALMS_TASK_7_CLOSURE_UNAVAILABLE` and exits 1 before operations | Complete authenticated lane bundle/closure verification followed by genuine protected workflow execution |
| `scripts/sealed-realms-production-dispatch.mjs:188` | Activation-evidence operation returns `SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE` | Executable approved generator composition with exact source, receipt ownership and reconciliation checks |
| `scripts/sealed-realms-production-auth-bridge-state.mjs:2413` | `createSealedRealmsProductionActivationEvidenceGenerator` unconditionally fails; assert at 2422 and generator-consume at 2451 also fail | Canonical authenticated generator receipt and non-mutating reconciliation, valid private capability lifecycle, negative and recovery tests |
| `scripts/sealed-realms-production-workflow-evidence.mjs:7` | Every syntactically valid commit still throws workflow-evidence unavailable | Genuine workflow-attested Verify evidence bound to exact reviewed source; no caller-SHA self-attestation |
| Production runner/workflows | Current protected execution targets macOS/ARM64; no local Windows/Linux repository runner registered in authenticated inventory | Supported isolated local execution with real workflow identity, pinned toolchains and production credential separation |

The opaque activation-member checks and confirmation-consumption logic around the
generator stubs are existing implementation, not a complete generator. Do not
replace their private receipt boundaries with raw caller evidence to fill a stub.

## 2026-09-08 recovery workflow caller

The change following `c990a3bb361327f77d6f08faf74b3eb1537f5a03` adds the real
`deploy-recovery` job to `.github/workflows/deploy-pages.yml`. It selects the
existing `sealed-g002-recovery` classification and requires the supported Linux
runner identity, UID 1001 and the existing mode-0700 recovery directory. It does
not create that private state or compile an authorization helper during a run.

The job checks exact verified/current protected main, the installed claim bundle
and source closure, then builds with the existing V2-compatible configuration
checks. It rechecks Node and source around dependency installation/build, writes
and checks the deployment attestation, and uploads a run/attempt-specific Pages
artifact including its required hidden manifest. The fixed claim, fresh boundary,
pinned deployment and unconditional-after-claim postflight steps remain adjacent.
The existing signer independently verifies workflow/runner metadata and the
actual uploaded archive before permitting deployment.

The actual checked-in workflow now passes the unchanged recovery source-evidence
and reconciliation validators. Independent review caught a duplicate notification
YAML key that broke the older source parser/closure projection. Recovery's fixed
`false` value now goes through `GITHUB_ENV` in its first prerequisite step; the
existing build's single YAML authority and validators remain unchanged. A real
parser compatibility regression covers that interaction. Other jobs and global
workflow settings were compared structurally with the prior source and are
unchanged.

Executed verification for this caller:

- Release-recovery source-evidence/reconciliation suites: 278 passed; service
  TypeScript check passed.
- Linux root caller/parser/closure and attestation/context/boundary/postflight
  suites: 115 passed, one intentional non-Linux guard skipped, across nine files.
- All 12 Bash step bodies passed `bash -n`; scoped diff checks passed.
- Independent review repeated the real legacy parser check before and after the
  fix and found no remaining actionable caller defect.

The Linux run used the isolated `5ddefb0` verification checkout plus the exact
four-file workflow/test overlay. Relevant scripts, validators, test sources,
package locks and test configuration were compared with `c990a3b` and found
identical before the overlay. It used its own Node 22.22.3 and existing exact
YAML/TypeScript Linux dependencies through a service-local link. The primary
checkout's shared dependencies were not changed. Initial Windows Git fixtures
hit a timeout/cleanup contention and hardcoded `/usr/bin/git` failures; the
affected fixtures subsequently passed unchanged in the appropriate serial/local
or Linux run. No timeout, assertion or platform condition was weakened.

This is caller implementation, not an operating recovery deployment. A fresh
read of the GitHub runner inventory found only the offline Mac runner; the
required `warpkeep-wsl-production-01` Linux/X64 runner is not registered. The
inspected Ubuntu environment has the separate UID-1000 preparation account,
without UID 1001 or `/home/runner/.warpkeep-recovery-v1`. The generated claim
bundle/manifest, final source closure, signer/gateway configuration and authentic
release authorization must be installed and verified through their real owning
procedures. Missing prerequisites still fail. No runner, provider, credential,
admission, player state, security validator or generated pin changed here.

This workflow must be part of the preparation source: the existing recovery
activation child permits changes only to its binding and package version files.
Do not postpone this caller until activation or claim R12/R16 from its fixture
results. Other assembler/activation gaps below remain open.

## Existing work to retain

Verified local generation, bundle construction and closure components exist and
must be composed according to the existing local release assembler specification.
Accepted component tests are not proof that a complete candidate can be assembled,
frozen, dispatched, recovered and activated end-to-end.

The fixed work order remains representative playable keep, required gameplay and
visual coverage/local operations, final release freeze, deployment, live checks.
Source pins, artifact hashes and closure counts must derive from the finished
source family, not be edited to make an intermediate branch pass.

## 2026-09-07 source reinspection

Rechecked at `88e35b48cb0eb66ec35e472081caa906bb2df461` before final
freeze. The source fences above remain present. Additionally,
`scripts/sealed-realms-production-activation-lane-entry.mjs:221` rejects
`activation-evidence-generate` after validating the lane authority. Completing
the dispatcher alone therefore cannot make activation executable: the lane and
private generator must be completed together under the existing receipt rules.

The assembler has more reusable work than the original inventory states:
`scripts/local-prepared-bundle-files.mjs` exports
`derivePreparedOperationBundleFiles`, which derives four bundle/declaration
pairs and a source-bound manifest. It checks fixed lane identities, graph
digests, export names, declaration shape, and bounded bytes. Its returned files
are data, not an installed or authenticated candidate. A repository search for
that exported function found its definition, declaration, tests and component
plan, but no operating caller in `scripts/`.

The next assembler work is the specification's complete-family composition and
owned-Linux candidate transaction: derive bindings and all generated consumers
from one source identity, lock and journal replacements, recover interrupted
publication without overwriting unexpected bytes, then independently verify
the full family and repeat-write zero diff. The existing bundle-file helper
should be reused; its component tests cannot substitute for those transaction
and convergence checks. Do not perform final refreeze before remaining gameplay
and deployment source changes finish.

This is a refinement of R11–R13, not an additional release requirement. No
production changes or fence removals were performed during this inspection.

## Scope and acceptance boundaries

### Pages workflow regression coverage

Verify run `34170072520` at `5b97c5f` reported three additional root-suite
failures after the Linux recovery Pages job was added. Two assertions counted
workflow-wide checkout/verifier occurrences; the third read past `verify-live`
into the new deployment job and attributed its write permission to postflight.

The tests now inspect every named job's exact verified source checkout, fetch
depth and disabled credential persistence, compare the required verification
phases by job, and bound postflight source to its own job. All **17 workflow
security tests passed** on Windows with Node 22.22.3. This correction changes no
workflow permissions or deployment behavior. The same CI run still reports
source-pin/closure and activation-fixture failures; a passing focused test is
not a green full Verify run or a live deployment.

### No-Mac execution boundary reinspection

At `78a0a7a`, production migration is not just a runner-label change:

- `sealed-realms-production.yml` selects macOS and checks a fixed Darwin Node
  path and Mach-O ARM64 executable identity.
- `notification-bridge-b0.yml` and `notification-bridge-prepared.yml` also bind
  fixed Darwin Node/pnpm paths and the Darwin installed-toolchain manifest.
- `deploy-pages.yml` has Linux-aware disposable build setup, but its protected
  execution jobs still select macOS and consume that same Darwin manifest.
- `auth-bridge-notification-prepared-installed-toolchain.mjs` binds a Darwin
  profile and exact Darwin workerd, esbuild and native TypeScript executable
  paths. A Linux package tree cannot truthfully satisfy that attestation.

The local preparation runtime and hosted Linux native tests do not replace
these production contracts. Required migration must update the supported local
runner execution, fixed runtime checks, actual Linux installed-byte attestation
and all authenticated consumers together, before final source closure freeze.
Do not rename a Darwin manifest or accept a Linux runner under Darwin identity.
This inspection was read-only and did not register or alter a runner.

These are concrete entries within existing R11–R13, not additional product scope.
Remove a fence only in the same reviewed change that supplies its required
authority and tests. A deleted `exit 1`, changed status string, mock success or
locally fabricated workflow identity is not completion.

Before production effects, verify the G001 baseline and tested recovery preserving
post-deployment writes; preserve sealed G002 and owner-only PTR. R14–R17 still
require reviewed integration, real deployment identities and live acceptance.

## 2026-09-08 connected V2 activation generation

The development changes following `5b97c5f` replace the missing generator and
receipt seam with a fixed V2 implementation. This section supersedes the earlier
claim that every activation generation route is unavailable. It does **not**
establish production activation readiness or authorize a populated candidate.

`scripts/generate-0.4.0-recovery-launch-activation.mjs` owns the recovery
generator. It consumes the exact owner-private descriptor through a synchronous
file descriptor, validates all twelve non-historical receipt records and their
G001/G002/PTR relationships, and checks the current bridge confirmation and realm
import cross-links. Bootstrap tree, blob and SHA-256 derive from immutable Git
objects at authenticated preparation source S. The fixed source reader requires
an exact clean S checkout, canonical origin and matching main references; both
canonical HTTPS origin forms, with and without `.git`, are accepted. It does not
require Mac-only Git configuration or borrow the legacy generated bootstrap pin.

The original sealed-launch generator retains V1 behavior and re-exports the V2
entry points. V1 verification remains supported; no historical G001 freeze
receipt is synthesized for recovery. The V2 public artifact verifier checks
canonical schema and derived commitments before publication.

The connected caller is `sealed-realms-production-activation-lane-entry.mjs`.
A configured lane reopens actual bridge evidence, claims its durable activation
continuation and invokes the fixed generator capability. The bridge state checks
the claim synchronously before asynchronous work, reauthenticates live bridge
facts, and revokes the private member in `finally`. There is no caller-selected
generation callback. A lane without the fixed capability returns `unavailable`
before reserving a claim.

### Durable result and uncertainty handling

The operation atomically publishes one owner-private family under
`runtime/sealed-realms-v1/public/`:

- `0.4.0-sealed-launch.json`, the verified public binding;
- `activation-generation-receipt.json`, its private completion receipt.

The workflow's existing exact-file upload includes only the binding. The receipt
must not be added to a directory upload. Its canonical profile is
`warpkeep-sealed-realms-activation-generation-receipt-v1`; fields bind source,
source authority digest, fixed operation, original GitHub run/attempt, activation
evidence/chain digests, descriptor/artifact SHA-256, artifact schema/profile,
generation time and generated outcome. The codec only validates data; a
caller-created JSON receipt does not establish operation authority.

If the operation result or terminal continuation write is lost, a later
independently attested run can reconcile only the matching complete family. The
reader revalidates the original run, receipt, fixed descriptor, reopened receipt
corpus, bridge chain and mathematically derived binding. Missing, partial, extra,
changed or retained-lock state is ambiguous and is not repaired or regenerated.
Reconciliation performs no provider probes or effect replay. G001 freshness is
validated at the matched generation timestamp; actual generation still uses
current-time evidence checks. This permits recovery after the original freshness
window without granting fresh authority to stale evidence.

### Verification performed

The focused Linux run passed **231 tests across eight suites**: activation
records, bridge state, continuation, private state, V1 generator, public artifact
verifier, generation receipt codec and fixed V2 source reader. A subsequent
targeted run passed all **eight connected generation cases**, including four new
rejections for a wrong original run, extra file, partial family and retained lock.
The existing successful generation, next-day lost-acknowledgment reconciliation,
changed artifact and changed descriptor cases also passed. Other tests were
filtered out in that second run; they were not disabled in source.

All twelve V1 generator tests now use fresh real bridge confirmation and durable
continuation machinery for each synchronous test body. The former `beforeAll`
fixture tried to retain an opaque member indefinitely through an unavailable
callback factory. The replacement requires the existing opaque test capability,
revokes the member before returning, and explicitly checks that it cannot be
read afterward. The V2 test-facts entry also requires that capability and rejects
it outside the test environment. Positive and negative V1 coverage was retained.

Linux verification used Node 22.22.3 and Vitest 4.1.9 in the independent
`5ddefb0` verification checkout with the exact activation-source/test overlay.
This is scoped verification, not a claim that the older checkout is the complete
current source. No shared dependency installation occurred. Windows passed the
26 pure codec/source-reader tests, application `tsc --noEmit` and scoped diff
checks. An earlier Windows filesystem-heavy run had timeout failures and stale
expected-status assertions; the complete Linux suites establish those affected
contracts on their supported platform.

### Remaining operating dependency

`sealed-realms-production-activation-workflow-entry.mjs` now composes the fixed
records/generator capability, but its **canonical recovery candidate reader is
explicitly unavailable**. Its four-field checked-in source projection remains
inert metadata. A prepared assembler directory is also source, not live recovery
facts or authorization. Neither is accepted as a populated recovery candidate.

The next implementation must derive the canonical candidate through fixed,
authenticated recovery-core, source, realm and private-record readers. That
producer must join independently authenticated recovery authorization/worker
facts to the actual source S and the exact G001/G002/PTR receipt corpus. The
workflow's deployment, binding, import and owner-receipt provider adapters are
also still explicit unavailable functions, and workflow evidence/runtime/runner
contracts remain separate operating work. Filling their values from caller JSON,
copying test fixtures or treating local preparation success as authorization
would bypass the missing work.

No provider mutation, runner registration, live authorization, production
generation or deployment was performed for this slice. Generated source pins and
compiled artifacts must still be derived and verified from the final reviewed
source family by the assembler; no pin was hand-edited here.

## Complete Linux source assembler — 2026-09-08

`scripts/local-release-assembler.mjs` now connects the fixed native producers,
complete generated consumer derivation, independent candidate comparison,
durable installation and recovery. The
[operating runbook](../../operations/0.4.0-local-release-preparation.md) describes
its `prepare`, `check` and `recover` commands and exact environment. Component
and diagnostic verification was followed by the full committed-source operating
run recorded below.

The fixed TypeScript scanner inventory was derived from exact archives matching
the committed auth-bridge lock's SHA-512 integrities. The manifest generator
reproduced its complete bytes. Scanning worked without repository dependencies;
repeated attestation checked the complete namespace and detected late metadata,
binary and namespace changes. Scanner and consumer suites passed **104 tests**.
The actual legacy generator test bootstrap pin is now included in the generated
consumer family. Planned files without real generated slots were not invented.

The operation graph suites passed **101 tests**, including disconnected or
missing inputs, unauthorized relative/package/synthetic edges, absent authority
modules, newly reachable source, raw-source hashing and repeat-build equality.
The final diagnostic in-memory compilation of every operation lane and recovery
succeeded. No compiler input intersected a generated closure/consumer or binding
output. Generic private record reads retain their existing limit; native bundle
loaders use their separate bounded artifact reader and exact size/digest checks.

The read-only whole-candidate verifier passed **34 native cases**, with one
unsupported-platform case skipped. It checks all source and candidate bytes,
complete generated namespaces, G001 preservation, unexpected files, aliases,
modes and late identity changes. Transaction recovery passed **21 native cases**
with one unsupported-host case skipped, including genuine held-lease use.

The assembler's real recovery CLI passed **14 native integration cases** using
actual Git source/candidate repositories and installer journals. Tests cover
completed/pending markers, existing-history restarts, no-marker interruption,
invalid/ambiguous metadata, held locks during archival and preserved user edits.
An actual child process was killed after history rename and before directory
sync; resumed recovery re-established durability. Its completion metadata was a
synthetic journal-bound fixture, not evidence of compilation or preparation.
CLI argument/import/error boundaries also passed **15 tests** on Windows.

Native checks used WSL Linux x64, UID 1000, the pinned Node 22.22.3 and Vitest
4.1.9. Fixtures copied exact current source overlays into independent directories;
shared dependency metadata remained unchanged and caches stayed local. The
scanner/graph diagnostic used the `5b97c5f` baseline plus current overlays.
Independent reviews corrected late scanner/candidate mutation checks and the
history-restart durability gap before these passing runs.

These component tests preceded the full operating run recorded below. They do
not establish a prepared final release, populated production evidence, runner
readiness or owner acceptance.

### Full prepare, independent check and recovery at `772d3a4`

The fixed CLI ran from a clean, separate native Linux checkout of
`772d3a44b2c4fff9c1626147bc447b85534005eb`, tree
`bc1758ad4c304da2413bd24461b99ce9e70be815`, under the pinned operating profile.
Both `prepare` and a subsequent independent `check` completed with exit 0 and
the same journal/family/closure/scanner commitments. The check compiled expected
outputs again from fresh captured source and compared the entire retained
candidate. No dependency directory was installed into the candidate.

| Verified record | SHA-256 |
| --- | --- |
| Generated family | `972f113f82dfcb36af6f3846f1afbd46d07589c092c3a7278aa3d5d7ba8f21f5` |
| Native journal | `d91f1cbe3b3bfe214db78414e4acc9e4400f48fd193654e9ea2858a08a2b210a` |
| Prepared source closure | `aca6f27059ccd937bbb435feaf27bd817ce5f746d05e86208119e67c7dad55e8` |
| Installed scanner manifest | `edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71` |

The result checked 2,977 source files and 3,001 candidate files, with 101 exact
generated outputs. These are observed verifier results, not manually maintained
inventory policy. The result explicitly retained `finalReleasePrepared:false`.

A separate QA clone of this exact source received only the journal-verified
generated outputs. Four closure/activation suites passed; the remaining PTR
suite found stale explicit browser and binding members. Updating the real member
lists passed all eight PTR cases and was committed at `f558bd5`. The test file is
outside the compiled inputs and prepared closure. All generated hashes and the
read-only dependency metadata stayed unchanged during QA and patch export.

After retaining that export and the newer source's independent preparation,
the real `recover` CLI restored the earlier candidate's complete generated
transaction and returned `rolled-back`, exit 0. The active completion marker was
absent and its history was retained. A separate full-byte verification against
the original Git source matched all 2,977 restored files, including the original
binding namespaces; Git reported no source changes. This proves local candidate
recovery for this actual family, not live database recovery or preservation of
post-deployment player writes. The old candidate is now the restored baseline;
its archived completion is not active preparation authority.

## Recovery receipt projection — 2026-09-08

The V2 record reader now authenticates its complete private receipt corpus before
constructing a recovery candidate. It returns frozen scalar facts to the existing
candidate callback, compares every overlapping candidate field, then reopens the
corpus to reject replacement during construction. Source and authority digests
must match the authenticated preparation source. Realm identities, module and
atlas sources, imports, sealed state and owner proof must agree across records.
V1 behavior is preserved. Historical inspection does not grant fresh generation
authority, and a projection alone supplies neither authorization nor missing
worker/source facts.

The connected generator, records, bridge state and continuation suites passed
**191 tests on Linux without skips**. The fixture used the retained independent
`5ddefb0` checkout with the exact current activation overlay; unchanged runtime
companions were compared to development `772d3a4`. Application TypeScript and
scoped diff checks also passed. A Windows filesystem-heavy diagnostic had one
timeout; the supported Linux run completed all selected cases.

The records runtime is compiled into the activation, G002 and PTR operation
bundles, and its runtime/declaration bytes belong to the prepared source closure.
The source family therefore must be regenerated after this change is committed.
The earlier native candidate built from `772d3a4` cannot attest these later bytes.
Do not carry forward its generated hashes or relabel its source commit.

### Next operating producer

The G001 policy observation lane already authenticates its frozen child envelope,
source/bootstrap coordinates, cleanup result and exact policy observation, but
its persistence adapter remains unavailable. Connect that authenticated result
to the existing private record writer for the fixed policy-observation member.
Lost-acknowledgment adoption must reopen and validate the matching durable
record; lifecycle completion alone cannot replace missing evidence or justify
replaying an effect. The workflow Verify reader, live transport adapters,
remaining realm receipt captures and canonical recovery inputs remain separate
unfinished callers.

## Complete generated source at `f558bd5` — 2026-09-08

The operating assembler was repeated from the committed receipt-projection and
PTR-test source `f558bd5aeb306e783e674eed9bf02df2dbeeeae6`, tree
`f746972e05e89951f62493682c16c3cd06a0940d`. Native `prepare` and the subsequent
independent operating `check` both completed with exit 0. The check rebuilt from
fresh captured source and verified the complete retained candidate. Both runs
returned exactly the same source, tree, transaction, journal, family, closure,
scanner and inventory results; neither conferred final release authorization.

| Verified preparation record | SHA-256 |
| --- | --- |
| Complete generated family | `f00fe8de0859f6c6af591037ce65f9a25db4d4d5882e5843a42075d25d3286f5` |
| Native journal | `27977449f89129683602e0daf952992a4847b7a27a747faddf295083cc4a9275` |
| Prepared source closure | `755b6467e34aaef27e0f2d57f89960b54dc398438edacd93f059bb02ad60fc25` |
| Installed scanner manifest | `edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71` |

The result verified 2,977 source files, 3,001 candidate files and 101 generated
outputs. The output set contains complete G002/PTR bindings, the operation and
recovery bundles and manifests, and their derived closure/consumer/source pins.
G001 source and bindings remain unchanged. These values are measured outputs,
not new fixed policy counts, and the candidate retains `finalReleasePrepared:false`.

An independent clone of this exact commit plus only the journal-verified outputs
passed **234 tests across six complete suites**: B0 closure, Greater Realm deploy
boundary, PTR closure, sealed-launch verifier, V1 activation generator and
activation records. Application and Vite-config TypeScript checks both passed
with `--noEmit`, using the pinned Linux TypeScript 7.0.2 and Node 22.22.3. No
fixture source overlay was present. The source/test bytes, generated family and
read-only dependency metadata matched before and after. Caches and build-info
stayed in the QA fixture; the actual candidate remained dependency-free.

The exported patch contains only the 41 changed paths within the 101 verified
outputs. It passed application checks against the primary checkout, and all 101
staged Git blobs matched the journal's exact bytes, sizes and modes. Workflow
changes are generated closure commitments; job permissions and operating phases
are unchanged. Manifests retain `f558bd5` as compiler input instead of claiming the
later containing commit supplied those bytes.

This establishes source preparation and scoped regression verification. It does
not establish live provider receipts, signer authorization, complete current CI,
owner play, physical-device/performance acceptance or deployment. The canonical
activation/provider adapters and remaining Linux operating callers still require
implementation and actual execution.

### Generated public constants and secret scanning

The first outgoing scan identified compiled copies of two already reviewed
public values: the `g002AdmissionMutationsEnabled` schema field and the public
recovery verification-key thumbprint. Their existing `generic-api-key` exceptions
now include only the exact activation/G002/PTR bundle paths, with the same
anchored values and combined path/value condition. Generated bytes were unchanged.
The pinned scanner's real regression passed 20 permitted-value and 29 required
negative findings, including changed values in all three bundles and unchanged
wrong-path checks. The complete scanner regression suite passed six cases in a
fresh Linux clone of `ff813f9` with only the three scanner files overlaid.
Independent review found no broad suppression; the outgoing scan then passed.

## Source authority, durable policy capture and Verify readback — 2026-09-08

The reviewed source integration follows `1277cc8`. Preparation metadata remains
strictly null; actual Git identity and exact protected Verify evidence establish
its source. Native V2 activation is now authenticated through the canonical full
binding, actual sole parent/tree, exact three regular-file delta and version-only
package transition. The four read-only operations available after activation are
unchanged. Every workflow Git reader ignores replacement objects.

The actual Verify CLI exposed an incorrect G001 history projection. The frozen
materializer extracts `2ae5198:spacetimedb/**`, and the immutable artifact's root
manifest is `spacetimedb/package.json`. Repository-root browser packages do not
own that frozen build. Only those two root package files were removed from the
G001 projection; their exact structures remain independently checked. Module
source, locks, manifests, workspace and frozen operators retain current snapshot
equality, with ancestry and exact activation delta checks. A reverted historical
edit no longer fails an otherwise identical final snapshot. The frozen
materializer, its toolchain and pinned artifact identities are unchanged.

G001 policy capture now writes the authenticated frozen child result through the
existing fixed private writer and reopens it before completion. Lost-acknowledgment
adoption binds the retained terminal record, original cleanup commitments,
source/bootstrap/command/run and durable wrapper. Missing or altered evidence
fails before replay. The terminal reader is bounded, owner-checked and read-only;
it does not create a caller-selected path or generalized writer.

The four actual workflow factories now load fixed read-only GitHub evidence into
an opaque, expiring scope, refresh it before dispatch reauthentication and revoke
it on completion or failure. The latest authenticated Verify run for the exact
push/main source must succeed; an older green run cannot mask a newer failure or
pending run. Current run/attempt and discovery are reopened to detect races.
Repository/owner/workflow/source identities, bounded strict JSON, fixed origin,
redirect rejection and timeouts are enforced. Tests use synthetic HTTP responses;
no production authorization or live token readback is claimed by those tests.

Related CI regressions preserve the real containment and effect assertions:
promise rejection handlers are attached before process polling, a byte-identical
Node executable at the wrong path exercises the host rejection, and supported
Linux scanner races remain enabled. Unsupported hosts test their explicit
rejection. The obsolete early-activation error expectation was corrected.

Independent reviews found no blocking issue in the source-authority, policy,
Verify transport or CI patches. A fresh native Linux clone with the complete
reviewed source passed **731 tests across 20 suites**, with two expected platform
skips and no unhandled errors. App and Vite-config noEmit checks passed. The
actual source-pin generator ran only for diagnostic verifier tests; its outputs
were restored and byte-checked before exporting source. These tests establish
connected local contracts, not a new prepared family or deployed release.

The previously published generated family still identifies `f558bd5`. This new
compiled source requires fresh complete native prepare/check and generated-output
integration. The sealed production workflow still contains its explicit closure
fence, Darwin-specific runtime and missing token mapping. Remaining private/live
provider adapters, canonical recovery facts, data-preserving existing-database
updates, signer authorization and actual owner acceptance remain unfinished.

## Fixed recovery candidate and historical inspection — 2026-09-08

The source integration following `b4df426` connects the actual activation workflow
callback to `sealed-realms-production-recovery-candidate.mjs`. The reader derives
source/tree/bootstrap facts from fixed immutable Git reads, reopens the scoped
private corpus and checks canonical policy fields. It does not accept a generic
provider bag or substitute plausible values for missing deployment evidence.
Recovery request/epoch, Worker version/source/configuration, source-closure,
realm program identities, bridge source, suspension digest and approval records
still require genuine producer evidence. Incomplete inputs cannot emit a descriptor.

Independent review found and resolved a historical-continuation defect: the
outer reconciliation used completed receipt time while the newly connected
reader reopened records at the current clock. The revised path first authenticates
the fixed completed receipt, descriptor and public V2 artifact, including source,
authority, byte commitments, exact creation time and all private receipt bodies.
Only that callback receives an opaque, records-bound historical read context.
It expires after callback use and rechecks retained evidence afterward. Direct
and fresh-generation reads still use current time; caller timestamps, reused or
cross-record contexts and replaced completion/corpus data reject. Final bridge,
workflow-run and evidence-chain reconciliation remains mandatory.

The full revised eight-path candidate patch passed **156 native Linux tests**
across activation records, workflow evidence and V2 runtime suites, with app
noEmit exit 0. Regressions invoke the actual fixed reader after freshness expiry
and exercise replacement before/after derivation and independently valid but
different corpus data. Independent review found no remaining blocker within this
scope. The initial candidate export without historical support was superseded;
it must not be applied alongside the revised patch. This is local evidence,
not live provider provenance or activation approval.

## Whole-source inventory and current CI — 2026-09-08

The tracked source inventory exceeded the notification verifier's former file
and aggregate ceilings after real generated bundles grew. Its inventory now
permits at most 1 MiB per file and 64 MiB aggregate. The separate presentation
parser limit remains 512 KiB. Git inventory/object/size/path, UTF-8, AST, immutable
source and authorization checks remain in place. Tests read the real committed
tree and reject a file one byte over its ceiling and an aggregate over its limit.
The closure fixture now removes the generated members from its modeled baseline
before adding them once; duplicate production members still reject and owned
buffers are cleared.

All 65 cases across the four affected Linux suites were exercised successfully:
64 passed in the clean committed-source run, and its one test-local timeout was
corrected and rerun successfully. Only scoped test budgets changed for measured
whole-tree Git/TypeScript traversal; no application, network or global test timeout
changed. App noEmit passed. The reviewed integration also passed app and
Vite-config noEmit together with the player-feedback changes.

At exact `b4df426`, [Verify 34177573424](https://github.com/ael-dev3/Warpkeep/actions/runs/34177573424)
reported a failed Linux job: 9,121 passed, 74 failed and 121 skipped. Of those
failures, 62 stop at stale generated source pins or inventories, 11 concern the
inventory/fixture defects above, and one requires replacing an obsolete literal
classifier-source expectation with behavior. Do not relabel that run successful
from focused local passes. Its database job was still running when inspected.
CodeQL's analysis workflow completed, but its separate
[security check](https://github.com/ael-dev3/Warpkeep/runs/101910854549) reported
nine high and five medium findings in test fixtures/helpers. The reviewed
ten-file correction preserves deliberate one-key and mixed-line-ending corruption
through explicit splices, uses direct Windows tool argument arrays, and passes
fixture values as JSON data and module URLs as arguments to fixed child code.
No negative assertion, alert or check was removed, dismissed or suppressed.
The affected native suites passed 567 root and 333 recovery-service tests;
application and service noEmit checks passed. A Windows path diagnostic retained
the prior filesystem mode behavior with spaces, an apostrophe and shell
metacharacters. Actual CodeQL clearance still requires a new GitHub analysis.
Fresh source-family derivation and passing checks on the selected final source
remain required.

## Rebuilt source family from b4df426 — 2026-09-08

The actual native assembler completed prepare and a separate independent check
from source `b4df4263b1f640c264b5c2cf1d3a81a1c1e2bebd`, tree
`72f0b59486e78b6d60cd486b00590a9c83ca8c35`. Both exited 0 and returned identical
candidate, journal, family, closure and scanner commitments. The generated-only
commit is `e789815012225bbe9ea30f14f3eaefdaac4bd339`.

| Derived commitment | SHA-256 |
| --- | --- |
| Journal | `c6b4cca8caa837254cd68a7268cb3d7ff153cd697f07dd0ed901c3795d23e31b` |
| Source family | `4431712afbc064a031829483a457f9445ab0579542b52c6580354fa029d5f8e3` |
| Closure manifest | `45cd8446ea57f5c8b63b3e9b2f5accba551727cf4228bd7121672968cc2325ff` |
| Exact generated patch | `46eb4ca073e94b2baefc77aab1c500c13ec7e01d1eeab8a038a629b6daf6bef7` |

The journal admitted 101 outputs; only 18 differed from committed input. All
3,008 candidate files and 2,907 preserved source files were checked, alongside
the actual bundle/recovery input sets. A fresh native QA checkout received only
the journal-approved outputs. Ten complete release suites passed **325 tests**
with no skips, and app/config noEmit passed. Before/after source and generated
snapshots matched. Integration verified every output's canonical Git bytes
against its journal size/hash and staged only the exact changed allowlist.

A separate copied test overlay replaced the obsolete Pages classifier source
substring check with execution of the actual classifier over its complete fixed
source map. Its eight tests passed, including the preparation-blocked result and
existing workflow boundaries. That test belongs to the next source checkpoint;
it was excluded from the generated export. The newer candidate reader, inventory
fixes, security helpers and keep feedback likewise do not belong to this prepared
input. Their next combined source needs fresh derivation. The result remains
`finalReleasePrepared:false`; no production authorization or deployment occurred.

## G001 compiled public-value scanner scope — 2026-09-08

The independently rebuilt G001 bundle contains the same public boolean schema
key and recovery verification-key thumbprint already allowed in the other fixed
lane bundles. The existing two scanner exceptions now include only its exact
anchored path, retaining the exact values, rule scope and AND condition. Generated
bytes and scanner rules remain unchanged. Real Gitleaks 8.30.1 regression passed
22 accepted cases and all 33 required negative findings, including altered values
and unchanged values at a lookalike path. The six native scanner unit tests passed.
The actual outgoing commit range must also pass before publication.

## Published checkpoint and supported Linux preflight — 2026-09-08

Checkpoint `a4ec99f8202d34ef067c28461ea7200066b943f4` published six reviewed
commits after the actual outgoing first-parent/merge-aware Gitleaks scan passed.
Fetch after non-forced publication verified local/GitHub equality. The maintained
main, profile, assets, water and editor repository refs were also fetched and
equal. Its [CodeQL analysis](https://github.com/ael-dev3/Warpkeep/actions/runs/34180632901)
passed, and the separate [CodeQL security check](https://github.com/ael-dev3/Warpkeep/runs/101919500304)
passed with zero annotations. This clears the earlier 14 reported annotations
on this source. Three service/native Verify jobs passed; Linux and database jobs
were still active when inspected. The earlier b4df database build/binding step
passed before the next push cancelled its later recovery stage; that cancelled
job is not a full module-lane pass.

The next source connects a dedicated Linux preflight executable to the sealed
workflow. It preserves protected main/manual `operate` identity, read-only
permissions, environment and shared non-cancelling production lock. Unsupported
operations refuse before checkout. The shell checks actual account, fixed Git,
Node bytes and committed bootstrap files, then retains the token only in the
environment. The caller authenticates actual prepared ancestry, G001 source graph,
bundle/declaration and imported bytes, and invokes the genuine bundled runtime
factory and operation with source/runtime rechecks around both awaits. It accepts
no provider bag, digest/path/factory override or mutation operation.

Independent caller review found no blocker within this preflight scope. All 31
native caller tests passed, with no skips, and application types passed. The tests
use the completed b4df generated bundle in an independent source snapshot,
real UID/GID 1001 inside a private mount namespace and fixed synthetic GET-only
GitHub responses. They exercise the actual factory/run plus runtime, graph,
import replacement, workflow and private-root rejection. The actual retained
journal authenticated all 101 before/after output bytes, with exactly 18 changes;
copied dependencies had no symlink outside their respective isolated roots.
Normal unprivileged CI skips the 25 privileged namespace cases; its ordinary
caller suite does not repeat this full native proof. The workflow's 67 native
tests passed, including real shell syntax/guards, ignored startup injection,
source/token transport and every unsupported operation; application types passed.
The workflow changes none of the static verifier's selected source bytes. An exact
a4ec source diagnostic also passed the actual preparation-mode static verifier.
These are local composition results, not live GitHub job or provider evidence.

The registered Linux runner remained online/idle with its systemd service active
as UID/GID 1001. Its separate sealed-operation roots were initially absent and
then created as empty owner-only directories with checked no-follow descriptors,
exact ownership/modes, no ACL and fsync. No credentials, keys, receipts or authority
records were created. The fixed caller continues to require existing roots rather
than provisioning them. The account remains noninteractive. A successful future
`preflight-inspected` result establishes operating prerequisite inspection only;
real provider adapters, signer authorization, owner acceptance and live release
proof remain unfinished. The newly combined source requires fresh preparation
and independent check; b4df's completed family is not relabelled as that result.

The same next checkpoint fixes the connected keep-to-atlas Worker handoff.
“Find resources for Worker 3” previously selected Worker 1 in the atlas. An actual
surface-host regression failed on that mismatch before the fix at both tested
DOM widths. The source now carries a bounded ordinal as presentation state while
retaining fresh target review, authoritative idle checks and capability-scope
reset. All 41 affected surface-host/keep tests passed, including a selected Worker
becoming busy, invalid or busy chooser values, and target/duration reset on scope
replacement. Integrated application and Vite-config types passed with the Linux
caller/workflow changes. No server economy, automatic dispatch or live owner
evidence was introduced.


## Current-source preparation and existing-target protocol — 2026-09-08

Native `prepare` and the independent rebuilding `check` both exited 0 for
`1e90b2e4a67208c5ea70fd8589ec56ddacee2226`, source tree
`ee1ce7b49a8b5f49205c3a82049d8c41fdc6287f`. Their complete returned results agree.
Journal SHA-256 is
`1a362293715d58dc863f81bf8017a961ba976faa06826e6cc4f21a063f6be8b4`;
generated-family SHA-256 is
`f6b6a8b425b449d9dd20c1115274cec5abf8e1d5a0ca1e91d82385e04af5b95b`.
The closure manifest is
`74db0de3fdc3d46943e579210b2bbedf1fd75b3b068146e0364250d7888cdb8d`.
The actual logs and exit records were independently re-read and hashed after
completion. These results remain `finalReleasePrepared:false`; generated-output
QA, publication and real release authority are separate outcomes.

During the check, new Windows-to-WSL command launches stalled and then returned
`Wsl/Service/E_UNEXPECTED`. Bounded read-only UNC observations confirmed the
actual Linux check and successive compiler children continued. The native check
completed successfully at 03:21 UTC. Explicit Linux-directory/direct-exec command
access subsequently recovered without restarting WSL or interrupting the guest.
The failed control calls are neither failed compiler tests nor positive evidence.
Do not restart an operation from an old process note without checking its actual
log, exit record and process identity.

Separately, twelve native provider-protocol assertions passed at 03:24 UTC against
official SpacetimeDB 2.6.1, pinned Node 22.22.3 and SDK 2.6.1. The test used its own
private Linux network namespace, local signing keys, synthetic owner and in-memory
loopback server. Its compiled old/new table boundary matched; all observed program
hashes were checked against exact compiled bytes, and preserved rows were compared
in full. The server stopped and its local keys were removed.

The tested harness SHA-256 is
`5b806dcc0d51e54744798883f0f0c62544190db73c0a1d6d432e3f40bb939bdb`;
result SHA-256 is
`c3a3a0fac696d259dd75b05e4e0080945083b66c8df3e996544cd1492f45ad10`.
Retained native and Windows harness/result/module inventories match byte for byte.
The fixture's copied repository helpers match source `a4ec99f`; its dependency
copies contain no escaping symlinks. Earlier staging and wire-decoding failures
were retained separately and do not count as successful assertions.

The experiment confirms that `Compatible` ignores the migration token. The
token-checking policy rejects wrong target, changed candidate, stale predecessor
and missing token without changing the tested state. An approved additive update
and compatible forward replacement preserve exact pre-update, post-update and
after-plan writes. ABA restores the original token's validity. The token is not
an epoch, authorization credential or postflight receipt. This agrees with the
[official migration-policy source](https://github.com/clockworklabs/SpacetimeDB/blob/v2.6.1/crates/schema/src/auto_migrate.rs#L79).

The diagnostic's flag classifier is not a production additive-plan validator.
This in-memory toy experiment does not prove Warpkeep's real migration, private
population, schedules, application admission, crash durability, uncertain PUT
reconciliation or recovery artifact. No live database or persistence source was
changed. Read the [infrastructure boundary](../../agent-notes/0.4.0/release-and-infrastructure.md)
for the real schema observations and denied current-program queries.

## Integrated Linux preflight family and compiled schema — 2026-09-08

Generated-only commit `de10f83103c45ba90f8375c922ab96b30779a864` has the exact
prepared input `1e90b2e` as its parent. Its tree is
`264d1e8725d1e618e17f92232bb18122e7359dda`. Every journal-approved output was
reopened and checked against its size/hash before staging only the nine changed
paths. The exact export SHA-256 is
`3b7de8a375e918c0ba8d0ecc410b4d3d629aa56d8dfe73b8f001cf362fd568f7`.

The requested release/Worker coverage passed 499 unique tests across explicitly
separate Git topologies, with 25 privileged namespace cases skipped under normal
UID1000. Nineteen suites passed with the generated overlay; LiveReceipt correctly
rejected that dirty checkout, then passed all 20 cases in a clean synthetic child
with identical tracked source/output bytes. The synthetic commit was not exported
or treated as the preparation input. Both app and Vite-config type checks passed.
An extra unchanged PreparedWorkflow baseline reproduced the 13 CI failures;
it is not included in the passing coverage claim. No source guard was relaxed.

Separately, G002 and PTR were freshly compiled from exact `1e90b2e` through the
actual locked Linux build callbacks. Both real noEmit/build operations passed.
The retained G002 module SHA-256 is
`0037a0979a460aea8607a36fccd649d4311046925faeb3d8186276ac0a6ccbd3`;
PTR is `c5c2cc46d428e85c87352c341d1a5235a69336a960f566b0a91a484deba3ec4e`.
Each had one successful compile; this diagnostic is not a separate two-build
reproducibility result. Temporary source-mode staging failures were corrected
only inside scratch fixtures before compilation, with fixed helper checks intact.

Their fresh RawModuleDef descriptions on an owned in-memory loopback instance
preserve every existing canonical table object and reachable typespace from the
02:50 UTC provider captures. G002's old boundary SHA-256 is
`7e568010e2c2babed106e577a64ed7f866a92258337bd2aae4fac93aee8c7d21`;
PTR's is `2b0463765c1c076e6c987774df65f6f8a45554c5b5d7ae16604d1c05cb2cf922`.
The comparison keeps numeric type references and complete nested declarations.
All added gameplay table descriptors match their declared private access,
primary/index/unique keys and schedule sequence. The scheduler resolves to the
exact `run_gameplay_04_schedule_v_1` reducer and row argument. Independent
read-only replay passed both complete object comparisons and every new descriptor.

This diagnostic used ordinary loopback, not a private network namespace; no
player rows were seeded or read. Its server and temporary credentials were
removed and cleanup independently checked. It closes compiled table-schema
compatibility only. Actual current provider program, populated migration,
post-update writes/recovery, procedure behavior, timers and owner play remain
unverified. The native protocol experiment above has separate synthetic scope.
Neither result is a deployed-state or final-release claim.

## Exact 1e90b2e GitHub CI result — 2026-09-08

[Verify 34181594471](https://github.com/ael-dev3/Warpkeep/actions/runs/34181594471)
completed with failure. Auth bridge, native contract, release recovery and the
entire database job passed. The latter includes its real module/generated-binding
verification, synthetic exporter/server compatibility, connected relocation and
rollback, populated gathering rehearsal and dependency audit. It completed at
03:47 UTC; earlier running-state notes are superseded for this exact source.

Linux's main batch passed 9,266 tests across 596 files, with 146 tests and two
files skipped. Its later dedicated PreparedWorkflow suite passed 105 cases and
failed 13; the accompanying canary closure suite passed. The subsequent Linux
static checks, type checks, build and audit did not run. Both the CodeQL analysis
workflow and separate security check passed for this source. A new source repair
must earn its own required checks; these results cannot be relabelled as that run.

## Prepared recovery workflow policy repair — 2026-09-08

Source-only commit `1f91470e879550a4c5610f3ac6d97b5f2fad41fd` changes the static policy verifier and its affected
suite. The published YAML already selected deployment or explicit read-only
recovery; its old verifier still required deployment invocation/credentials in
both steps and an obsolete final condition. That drift originated with the
earlier workflow change `326cc9c`. The repaired verifier checks each actual
operation, recovery's smaller credential relay and verified result, and the
complete terminal outcome step. Credential/scrub uses are paired to their real
functions so preserved global string totals cannot conceal a missing use.

The three source-owner workflow comparison hashes were mechanically derived from
unchanged committed `1e90b2e` YAML and independently reviewed. Its four generated
bootstrap slots retain their existing canonical projection. Exact comparison
with `de10f83` confirms unchanged operation behavior after that projection; no
workflow, generated output, admission gate, authority, timeout or credential
boundary was widened. Declaration tests now compare exact executable/declaration
pairs and explicit exceptions; the existing generated member-count slot remains
owned by its generator. Negative closure cases establish a valid baseline and
verify actual set changes before asserting the current exact rejection.

All 159 native cases passed in the final complete run: the 118 existing cases and
41 new cases, including execution of the real configured final shell and targeted
recovery/outcome/credential mutations. Both app and Vite-config noEmit checks
passed. Tests ran in an owned Linux fixture with a copied pinned Node executable
matching its actual test UID; this is not operating-runner authority. Earlier
fixture UID/indentation errors and superseded runs were retained, then corrected
without weakening source checks. The final exact two-path export SHA-256 is
`a8cbf046c147f4dbfc0881827780b2d9c27de084803433cdbecc478a60fb1e2d`.
This source repair needs its own generated family and required CI result.

## Existing-program planning and recovery direction — 2026-09-08

At 04:02 UTC, a fixed owner-authenticated diagnostic called the documented
`pre_publish` endpoint once for each existing G002/PTR immutable identity with
the retained exact `1e90b2e` compiled candidate. Its complete metadata and schema
captures matched the pinned earlier baseline before and after planning. Both
plans contained the intended private gameplay tables and schedule, with
client-breaking and major-upgrade flags false. No publication, SQL or player-row
request was made. Schema/planning access can start a dormant host and normal
scheduling; this is not a claim of zero application or infrastructure effects.

For each response, the returned migration token matched the independently
calculated Keccak256 of immutable identity, recorded initial-program hash and
candidate-program hash in the provider's documented hexadecimal encoding.
Independent retained readbacks recomputed both results from the exact candidate
bytes. Under the authenticated provider semantics and collision-resistance
assumption, this supports the recorded initial hash as the loaded old program at
the planning snapshot. It does not prove continuous currentness after the
response, an update epoch, original source provenance, retained executable bytes,
row preservation or completed publication. A program can change and change back,
restoring the same token; that cannot establish no effect after an uncertain PUT.

The diagnostic used the configured CLI's normal credential export through bounded
private pipes. Credentials and identity-bearing response headers were not retained
or printed. Fixed transport, target/candidate hashes, duplicate-key and response
validation, token decoding, owner assertions and marker-before-request behavior
were reviewed before the one-shot operation. No retries or redirects were allowed.
The retained diagnostic SHA-256 is
`1e7b4d5ff9a88ae4177776bc154815b09451b71dd565348fff5f7dad61bd6a50`;
sanitized result SHA-256 is
`9caa0de3a9a1b355a4b11640d5887d56d4f93cba9d286381a834d310cfdcdd6e`.
This is local diagnostic evidence, not an authenticated production-producer
receipt, current-source observation, consumed permit or release authority.

No supported deployed-byte download route was found in the inspected exact
SpacetimeDB 2.6.1 public API/CLI/dashboard sources. The system-table SQL route
remains behind the already-denied application connection lifecycle; it was not
retried. A bounded local artifact search found no matching original bundle.
One isolated build per realm from historical module source `799814b5` completed
but did not match the recorded publication SHA-256. The original Windows build
used parent dependency resolution and path-sensitive inline source maps; the
Linux reconstruction did not reproduce that environment. These are reconstructed
historical-source fixtures, not recovered original executables.

The missing original executable limits an exact deployed-artifact rehearsal.
It is **not an explicit general recovery prerequisite** in `AGENTS.md` or R16.
The requirement is isolated, schema-compatible recovery that preserves existing
and subsequent writes. A useful forward-recovery design can meet that requirement
without restoring a pre-gameplay executable or snapshot. Actual-module populated
migration and forward-recovery testing remains unfinished; label a historical
schema-equivalent fixture honestly and retain fresh authenticated old-program
binding at the actual update boundary.

The connected fresh-create publishers and V1 receipts must retain their present
meaning. Existing updates need explicit target/predecessor/candidate observation,
preservation evidence and uncertain-outcome reconciliation. They cannot pass by
removing the existing-target refusal, asserting `freshDatabase:true`, rerunning
owner/import creation or rewriting historical receipts to a new module hash.

## Verified recovery-policy source family — 2026-09-08

Full native preparation and an independent rebuilding check both passed for
`b306eedd8c4fe8f32661d89abc32f04938a5aa8e`, tree
`92a5abb1fdf4d38a916611debfe8ff745d574e5f`. Their complete result commitments agree.
Journal SHA-256 is `b64a5ae6875b3fa12fc2a2652dce146822ae5b3441d71667ee25dae350464edb`;
family SHA-256 is `e7d4f39733bcb9e67ce22316a3250e1c59b99a8636e9815e79098c6c6b312f3e`.
The operating result explicitly retains `finalReleasePrepared:false`.

Clean candidate QA passed 499 cases across twenty suites with 25 privileged
namespace skips, followed by all 159 prepared-workflow cases. App and configuration
noEmit checks passed. The source-sensitive tests used an explicitly synthetic
clean Git child; export retained the original b306 source HEAD. Every tracked
source/test body and all journal-approved outputs matched before and after QA.
Dependencies were copied into owned exact-lock fixtures; no shared install,
source overlay or validation relaxation was used.

Root reopened all journal outputs and compared their actual bytes/hashes and
changed Git blobs before integrating only the six changed generated files at
`ba12a7ff9539a5fd460251a73662a51f28935012`. Its tree matches the verified clean QA tree. Exact patch
SHA-256: `61ddf5fc886e8f995c24e80bda62e1198cafa8fb47671ac3244076cb4f798727`.
The selected input was locally committed when this preparation began; older
scratch filenames containing “published” do not prove it had already been pushed.

Panel fix `0d98599c1f26ecc74c4182fc587cd21278c3af63` is later source work with separate scoped tests. Its
affected source manifest/workflow references are derived incrementally through
their existing owner; this does not relabel the combined source as fully prepared.
See [gameplay evidence](gameplay.md) and the actual publication record. Required
CI, populated recovery, real owner play and live deployment remain separate.

## Navigation source closure — 2026-09-08

From exact `0d98599c1f26ecc74c4182fc587cd21278c3af63`, the existing closure owner
derived the complete consumer family in an owned Linux checkout. An independent
clone passed the real installed-closure verifier and reproduced all fifteen
outputs byte for byte. Every tracked source body, accepted preparation output,
reviewed UI input and scanner/config identity was checked before and after.
The original b306 candidate and journal were not opened by this caller.

Generated-only commit `cd6d89b5455a658a724601c3f7cc86f33f36cc27` installs the four
changed outputs: two runtime-file hashes in the closure manifest and that
manifest's three workflow pins. There are no inventory membership, count,
compiler-input or compiled-bundle changes. Closure manifest SHA-256 is
`4fdfca65f38beb3f530e75b9151260d2948fd89cb289ca5e3a1e8be9d2cf0ec9`;
reviewed export patch SHA-256 is
`7f5bf5ff937d4f0be6df96433880e6436eaf0ff0dbff2f711394da2142275fc9`.
Root compared the exported bytes with the verification clone before integration.

This is incremental development evidence. It does not extend b306's full native
preparation to later source, rerun the retained UI/policy tests, establish required
CI success or authorize a deployment. Final release preparation remains open.


## G002 direct-HTTP identity correction — 2026-09-08

Source `95ce45c0fd823f2d1b0c37872b8fa13a7bae5774` corrects a transport-specific
authentication mismatch. The bridge's original G002 admin JWT omitted
`hex_identity`, while the module's strict claim parser and sender comparison
require it. Direct HTTP forwards that original signed payload. The producer now
derives the identity from the existing issuer/subject using the exact pinned
SpacetimeDB 2.6.1 BLAKE3/checksum construction and includes it in the signature.
The existing locked `@noble/hashes` version becomes a direct service dependency.
G001/PTR claim schemas and all module authorization guards remain unchanged.

The earlier statement that the host never supplies this field was too broad.
The pinned SDK's `src/sdk/ws.ts` first calls `/v1/identity/websocket-token`, then
subscribes with the replacement token. The endpoint re-signs the validated claims
for a short lifetime and serializes the computed identity. Raw-payload forwarding
after that exchange therefore receives an already enriched token. Official
2.6.1 identity/auth/subscribe sources and the actual SDK call chain explain this
distinction; a direct-HTTP request performs no such exchange.

The completed old CI log confirms that private loopback ran and finalized its
atlas successfully at 03:14–03:15 UTC in PR `1e90b2e`'s merge checkout `f77d88b`.
It was neither skipped nor a no-op. The earlier projected-identity fixture modeled
that SDK path but did not verify the original bridge JWT against direct HTTP.
The corrected fixture now uses the actual producer, and a route regression checks
the real signature plus unchanged module parser, including signed-field tampering.

Focused native tests passed 61 root and 258 service cases. Service, workerd, app
and configuration noEmit checks all passed. Pinned pnpm validated the exact lock
offline in an owned checkout. Direct dependency resolution remained inside that
service's owned package tree. The real root-only loopback import also succeeded
without a service installation, using the root's existing exact dependency.
The reviewed nine-path patch SHA-256 is
`7b39ed86840549a0afeae52397c591215047ffe3b56997c8313c9bfd071af0f0`.

A separate private-network native oracle passed at 05:01 UTC using the retained
historical G002 artifact and actual bridge minting. Direct HTTP entered the
unmodified lifecycle successfully; the generated SDK client exchanged its token,
reported the same sender identity and called the protected status procedure.
Missing identity, wrong audience and extra claims received the expected module
403 refusal. Two correctly signed wrong-identity cases and unsigned payload
tampering received host 401 refusals. The public error may reflect OIDC fallback;
tests do not require exposure of the internal validator message. Program rows
and source hashes matched after the probes. The final result SHA-256 is
`b654e76f6e234aca59ce23f2fbc8c6ad41724f51f1e1463daeaa2a627d367686`.

The first oracle attempt stopped after HTTP success on a harness URL-object
handling error; the second stopped on an overly specific public-error expectation
after its positive and module-negative probes. Both were retained separately.
The final run completed every intended case; all disposable servers were stopped,
signing files and CLI snapshots removed, with no cleanup failures.

This uses synthetic authority. Hermes also owns the disposable database, so SQL
success is not evidence of private-query authority on a production database owned
by another principal. The protected procedure, HTTP lifecycle and SDK exchange
are separately established. No live provider request, module update, populated
migration, recovery completion or owner-play acceptance is claimed. The original
failed populated rehearsal remains failed and can now continue with the corrected
bridge in a fresh isolated fixture. Generated consumers and publication are
recorded separately from this source and interoperability evidence.

## G002 generated source family and rehearsal continuation — 2026-09-08

The complete generated consumer family for `95ce45c` was independently reproduced
and verified. Commit `6a5123ed7fde3e5e6b21114b895477f8c6b43a03` installs its
reviewed generated changes. All affected suites passed: 432 cases, no skips,
including the complete prepared-workflow suite. Tracked source and generated
output bytes remained unchanged during QA. Retained compiled inputs and bundles
were verified without rebuilding; full preparation remains scoped to `b306eed`.
Final release preparation and required published-source CI remain separate.


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


## PTR SDK identity and release verification — 2026-09-08

Source `c5392e0` corrects the PTR SDK exchange boundary while preserving original
direct-HTTP claims. Native tests exercised the protected atlas procedure with the
actual exchanged token and rejected wrong audiences, extra claims, mismatched
identities and unsigned tampering. Focused tests and module/application/configuration
type checks passed. Source `d7798e6` updates the exact release-parser contract for
that one optional identity field; the focused verifier suite passed.

Full preparation and independent checking of `c5392e0` succeeded, but its candidate
QA correctly rejected the old parser contract. That family was not integrated.
A fresh preparation from `d7798e6` and its independent rebuilding check both
passed. Generated-only commit `582f498b0cd86117bdf8c5ea5d0cf8a2d1a741fd` contains the verified
family. All affected candidate suites and both type checks passed, while complete
tracked bodies and journal outputs remained unchanged. This is source-candidate
acceptance; `finalReleasePrepared` remains false. See [recovery evidence](recovery.md) for the completed populated
module update, real timer settlement and access-resume rehearsal.

Published `00c0399` CI completed with successful module, auth, native, recovery and
CodeQL jobs. Linux's only failed suite was `genesis002BridgeClaims.test.ts`: its
root SDK mock missed the separately installed module SDK, which cannot initialize
its server runtime in Node. The failure reproduced with the locked CI workspace
layout. Resolving the ESM mock from the actual module importer passes both that
layout and the root-only layout. It changes test resolution, not game authority.


At 08:40 UTC, a second native run replaced the direct update calls with the actual
existing-update dispatcher and adapter draft, which remain local work outside the
committed source checkpoint. Both populated realm updates passed
through durable continuation/submission/completion records, followed by the same
gathering, construction, session-expiry and access-resume checks. Every draft input
body matched before and after, and both completion records were reopened. Workflow
and source authority were explicit fixtures; native database and HTTP behavior
were real. The production adapter factory remains unavailable pending its genuine
authority and operating callers. This does not establish code-replacement recovery.


The accepted source-candidate journal SHA-256 is
`1edb25eac1d4a10c434c4b88f40a39c76e479ff97be7af9c7bcea638178e19c8` and the complete family SHA-256 is
`40773aacfaed31ac2faeb7edf65562d96e60369207ad0d717bb4ca02abd9999d`. Prepare/check logs matched the same exact result.
Both app and configuration type checks exited successfully. Retained test summaries:

- Tests  513 passed | 25 skipped (538)
- Tests  159 passed (159)

The test-only CI correction is committed as `0ab958f7bc088f61fcf9e7a63e7cadeda31d50c1`. Both supported
dependency layouts passed its focused suite. Required checks on the published
checkpoint still need their own fresh GitHub readback.
