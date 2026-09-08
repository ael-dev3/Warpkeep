# Remaining release-engineering execution gaps

Inventory 2026-09-06; inspected checkout based on `c7f3c4d`.
**R12 incomplete.** This names executable gaps, not permission to bypass fences.

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
