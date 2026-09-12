# Recovery workflow session — 2026-09-07

`scripts/recovery-workflow-session.mjs` composes the existing fixed-host
transport, fresh OIDC acquisition and signed-object verifiers in memory:

1. Validate static binding/context grammar; request issue with fresh OIDC.
2. Verify authorization against the independently established context.
3. Request claim with different freshly acquired OIDC; verify the receipt.
4. Drop the raw authorization reference and verify signed enabled/epoch status.
5. At the deployment boundary, repeat status and current-time claim checks.
6. Complete or reconcile using fresh OIDC, original locators and retained claim
   receipt, without sending the authorization JWS again; verify terminal result.

An initial post-claim status failure preserves a reconciliation-only session.
A failed boundary or ambiguous terminal response cannot re-enable deployment
or repeat completion. A disposed session cannot be revived by a pending
response. There are no raw-JWS getters, logging, caller transport overrides,
or deployment callbacks. Disposal drops references; JavaScript strings cannot
be claimed to be reliably zeroized in memory.

Verification: nine mocked-transport integration tests passed, plus targeted
strict TypeScript. The tests exercise ordering, distinct OIDC requests, private
field handling, verifier failures, reconciliation and disposal races. They do
not prove real authentication, signatures (covered by separate verifier tests),
GitHub job execution, or a live deployment.

Remaining integration is substantial: independently authenticated source and
artifact context; durable private handoff across the separate pinned Pages
action and terminal step; recovery after process loss or an ambiguous claim
response; protected workflow wiring; actual runner execution. This module
does not perform deployment, cannot resume after process loss and is not
itself a production entrypoint. No network or production operation was invoked
while testing this checkpoint.

## Retained receipt correlation

The session now verifies retained claim correlation immediately before sending
complete/reconcile, after fresh OIDC acquisition. A separate
`verifyRecoveryClaimCorrelation` API applies the same pinned signature, exact
payload/context and twenty-minute deadline checks but treats the receipt only
as row correlation after its two-minute deployment expiry. The strict
`verifyRecoveryClaimReceipt` API and stdin CLI still reject at `exp`; no caller
expiry-mode override is accepted. Correlation rejects at `claimDeadline`, not
just after it, and returns an explicitly non-authorizing result.

Initial combined claim/session run: 119 tests passed. Added cases cover the
two-minute and twenty-minute boundaries, altered deadlines, mismatched context
and attempted expiry overrides. This implements the existing recovery spec's
post-deployment correlation rule; it does not extend deployment authorization
or provide durable handoff by itself.
Final combined run including terminal-request denial after the deadline:
120 tests passed; targeted strict TypeScript passed.

## Private handoff storage primitive

`f766595` and `2c7f150` add Linux-only claim storage in an existing canonical,
current-owner 0700 directory. The fixed `recovery-claim-v1.json` file is created
exclusively as 0600 through a held directory descriptor, fsynced and read back
before persistence is acknowledged. It contains only the claim receipt,
private expected context and signed deadline—not the authorization JWS or OIDC.
The strict receipt gate is checked before and after writing.

Reopen is bounded to 64 KiB and rejects changed identity, links, ownership or
permissions, noncanonical bytes, changed deadline, and different independently
established run/artifact context. Separate deployment and reconciliation APIs
retain the distinct expiry rules. Return values are private and must not be
logged or uploaded. Failed writes are preserved for diagnosis, not overwritten
or removed through potentially replaced paths.

At `2c7f150`, the Linux handoff/claim/session suites passed 128 tests with one
Windows-only skip. Filesystem tests mock receipt-verifier calls; the adjacent
claim suite independently covers real cryptographic verification with test
keys. This is not a real signed-receipt persistence or power-loss test.

Still required: connect storage to the session and fixed runner-private path,
recover ambiguous claim responses/process loss, bind actual Actions context,
and implement the protected deployment workflow. The storage primitive alone
does not make the workflow resumable or production-ready.

## Session persistence integration

`7a70b0a` connects storage to the session. `persistClaim(privateRoot)` writes the
verified receipt/context without exposing them to the caller. The deployment
boundary now refuses an unpersisted session, reopens the handoff using the
independently supplied run/artifact context, and compares the returned receipt
and context with the session's originals before permitting continuation.
Storage failures leave reconciliation available but cannot restore deployment.

Linux session/handoff suites: 22 passed, one Windows-only skip. This includes
one session composition using actual 0600 Linux file creation and reopen;
network and signature-verifier calls in that test remain mocked. The earlier
13-case session suite also passed on Windows. Targeted strict types passed.

Remaining: choose/provision the fixed runner-private directory in the real
workflow, implement process-resume and ambiguous-claim handling, connect the
pinned Pages action and terminal step, and verify genuine Actions execution.
No live authorization or deployment occurred in these tests.

## Reconciliation reopen adapter

`scripts/recovery-workflow-reconciliation.mjs` reopens a persisted claim using
independently established current run/artifact context and exposes only
`reconcile()` and `dispose()`. It cannot issue, claim, deploy or recreate a
deployment boundary. After fresh OIDC acquisition it reopens and compares the
private handoff again, including its signed deadline, then sends the original
locators and receipt to the fixed reconcile endpoint and verifies the terminal
response. An ambiguous response permits only another fresh reconciliation;
concurrent requests and post-disposal revival are rejected.

This is an adapter for a later process, not yet an installed Actions entrypoint.
Tests mock the storage, network and verifier boundaries. Actual cross-process
signed-receipt recovery, fixed runner-directory provisioning, workflow wiring,
and recovery when no receipt was persisted remain unverified/unfinished.
Windows adapter/session run: 21 tests passed with one Linux-only skip;
targeted strict TypeScript passed. Eight adapter tests cover the normal path,
missing/substituted/expired storage, ambiguity, verifier failure, concurrency
and disposal. No live request was sent.

## 2026-09-07: native cross-process signature and persistence probe

`tests/fixtures/recoveryClaimHandoffNativeProbe.mjs` passed on WSL Ubuntu with
Node 22.22.3 using `node --experimental-vm-modules
tests/fixtures/recoveryClaimHandoffNativeProbe.mjs` from the repository.
Eight child-process scenarios check write, independent deployment reopen,
exclusive-write rejection, deployment expiry, post-expiry reconciliation,
reconciliation deadline, changed artifact context, and wrong signing key.
The persisted file's 0600 permissions are also checked. All children terminate
before the next starts; the parent removes its owned temporary directory.

This runs the actual handoff, claim verifier and signature protocol source with
real filesystem operations and real EC signature verification. Only the public
key module and clock are substituted inside a test-only VM. The ephemeral test
private key stays in parent memory; test inputs pass through stdin and child
stdout contains only an acceptance boolean. The result reports eight passing
scenarios and no production credentials used. It does not verify genuine OIDC,
the reconciliation network adapter, runner restart orchestration, or workflow
installation. Those release integration requirements remain outstanding.

## 2026-09-07: protected workflow execution boundary alignment

Inspection found that `githubEvidence.ts` accepted the old hosted-runner test
workflow even though `githubOidc.ts` already required the approved local runner.
The source validator now requires the matching five Linux runner labels,
github-pages environment, explicit least-privilege permissions, and the fixed
non-cancelling production lock. Job lock overrides, matrices, reusable jobs,
job containers/services, ignored job failures and non-object steps are rejected.
The historical schema-1 path is unchanged. The recovery specification records
this implementation of the existing local-execution and permission requirements.

The GitHub evidence and OIDC suites passed: 383 tests across two files, including
15 new negative workflow cases. Service TypeScript passed. This does not install
the recovery job: the bounded OIDC helper still needs source-validator/entrypoint
integration, and the current Pages workflow still has no deploy-recovery job.
The subsequent full recovery-service run passed all 932 tests across 31 files
in 74.60 seconds on native Windows Node 22.22.3.

## 2026-09-07: separate-process deployment preflight

`scripts/recovery-workflow-deployment-boundary.mjs` exports
`checkPersistedRecoveryDeploymentBoundary(privateRoot, bindingSource, contextSource)`
for a later Actions step. It parses the current recovery binding, opens the
persisted claim with strict deployment-time verification, and binds its signed
request ID and epoch to that binding. It fetches and verifies fresh fixed-endpoint
signer status, then reopens the file, rejects substitution, and repeats strict
receipt verification after the network wait. Only the bounded receipt timing/
epoch projection is returned. No raw receipt, reissue, deployment, or durable
permission is exposed; the result cannot be cached as an authorization.

The caller still must independently establish current source/artifact context
and execute the reviewed deployment step immediately after this preflight. This
module is not an installed workflow entrypoint and does not authenticate caller
context by itself. Eleven mocked-boundary tests passed; combined with session
and reconciliation tests, 32 passed with one Linux-only skip on Windows.
Targeted strict TypeScript passed. Real persisted signature verification is
separately covered by the native probe above, not claimed by these mock tests.

## 2026-09-07: independently cross-checked workflow run context

`scripts/recovery-workflow-run-context.mjs` adds a no-argument, read-only reader
for the protected Actions environment. It reads the bounded event file, checks
the fixed repository/owner, successful Verify push/main event, current run/attempt
and candidate SHA, then uses the configured job token against fixed GitHub API
paths. It verifies protected main before and after independently fetching the
exact source Verify attempt and current Pages attempt. It rejects mismatched
repositories, workflow paths, events, statuses, attempts and commits.

Requests use no-store, no redirects, fixed API version and identity encoding;
each response has a ten-second total deadline and 512 KiB streamed cap. Errors
are fixed and credential-free. No caller URL/token/run override is accepted.
Environment checks are not authentication by themselves: genuine signer-side
OIDC/job identity verification remains mandatory. This reader returns only five
run/source coordinates and does not establish candidate tree/closure, artifact
identity or digests, live state, or deployment permission. It is not yet wired
to an Actions entrypoint; those remaining context fields must be independently
derived before passing the complete context to the recovery session.

Twenty-six new mocked-event/API tests passed, including stale main, wrong
run/repository/event/path, response bounds, redacted errors and an unresponsive
transport ignoring abort. Combined run-context, deployment-boundary and OIDC
tests: 68 passed. Targeted strict TypeScript passed after correcting a test-only
header-fixture union type. No GitHub credential-bearing request or deployment
was performed by this new module during these tests.

## 2026-09-07: run-scoped artifact metadata

The run-context reader now also exports the no-argument
`readRecoveryWorkflowArtifactMetadata`. It repeats the existing run provenance
checks, discovers exactly one artifact named for the current Pages run/attempt,
rejects pagination or ambiguity, and compares the listed artifact with two
direct metadata reads. Both direct reads must have the same nonempty ETag and
identical response-body hashes. Projection checks bind numeric ID, name, size,
fixed API/archive URLs, node ID, validity dates, SHA-256 digest and originating
repository/run/branch/commit. Protected main is checked again after these reads.

The digest is deliberately returned as `advertisedArchiveSha256`: no archive
download or content verification occurs here. This does not yet prove TAR,
manifest or deployment-attestation hashes or install the Actions entrypoint.
Those checks remain required before the full session context can be assembled.
The transport remains the same bounded, fixed-host read-only client with no
caller token, artifact, URL or digest override.

Run-context suite: 38 tests passed, including 12 artifact scenarios for the
valid path, identity/expiry/URL/digest substitution, duplicate/paginated listings,
and changing ETag or response bytes. Targeted strict TypeScript passed. Tests
use mocked API responses; no production artifact was downloaded or deployed.

## 2026-09-07: workflow artifact/source composition

`services/release-recovery/scripts/read-recovery-workflow-artifact.ts` composes
the existing committed-candidate reader, local dist attestation verifier,
run-scoped metadata reader, one-hop credential-stripping GitHub transport and
the signer's existing streaming ZIP/TAR verifier. It accepts no caller inputs.
The archive is downloaded once and independently hashed/parsed against the
local candidate identity. Its actual archive hash must match GitHub metadata;
its attestation hash must match the independently verified local dist. The
existing parser checks the canonical embedded attestation and content manifest.

Before returning the complete ordered 11-field session context and fixed-path
binding bytes, it re-fetches metadata (not the archive), rechecks committed
source and local dist, then rechecks the source after reading the binding.
Any changed source, artifact metadata, archive, attestation or binding denies
the operation. It neither requests recovery authorization nor deploys anything.
No new archive parser or weakened signer rule was introduced.

Twelve composition tests use mocked component boundaries; the existing archive
and HTTP suites separately exercise their real implementations. Combined result:
128 tests passed across three files on Windows Node 22.22.3. Service TypeScript
passed after an explicit never-return in the redacted error handler. This is
not yet a built native Actions entrypoint or a production artifact test. The
protected workflow, executable packaging, fixed private storage provisioning and
live signer prerequisites remain unfinished.

## 2026-09-07: standalone artifact module packaging

`scripts/build-recovery-workflow-artifact-module.mjs` now builds the TypeScript
artifact reader and its archive/transport dependencies into an in-memory Node
22 ESM module. It requires the sole expected export and a fixed external import
set, and caps output at 2 MiB. Root MJS helpers deliberately remain external
at their existing relative locations: bundling their direct-CLI detection would
change `import.meta.url` semantics. Output therefore belongs beside the original
service script and is not a relocatable single-file application.

The existing fflate Node entry imports the `module` builtin for its worker shim;
the inspected external-import list records that dependency explicitly. No
dependency was installed or upgraded. Two builds produced identical bytes and
hashes. A separate Windows Node 22.22.3 process successfully imported the module
from a disposable mirrored layout and rejected caller override input without
network access. Both tests and targeted strict TypeScript passed.

This is an unprivileged packaging diagnostic, not an attested production compiler
or final installed artifact. The temporary module/layout was removed. Linux
execution, actual archive ingestion through the compiled module, final source
closure inclusion, and the protected Actions entrypoint remain unverified.

## 2026-09-07: Linux loading and cross-platform module convergence

The clean diagnostic Linux checkout was fast-forwarded to the committed source
and tested with Node 22.22.3. Both packaging/native-child tests passed on Linux
as well as Windows. Initial output differed only after discovering different
dependency resolution locations: Windows used the service pnpm tree and Linux
used the existing diagnostic root dependency tree. Both resolved fflate 0.8.3;
both entry files had SHA-256
`8d75534a30a0580608e1271c13d70943ed4cd3589fddff7b1197748036a5116e`.

The builder now removes source-path comments through esbuild whitespace
minification, avoiding installation-path differences in emitted bytes. At source
`a58f938`, independently built Windows and WSL outputs both measured 49,154 bytes
with SHA-256
`002673aa7cdb46d91e4bee23e92fce05f6c46fe2d8c8a1fb4ed5a710755fcfce`.
Both platforms again passed the two packaging/native-child tests. No final
generated artifact was installed and no production operation occurred.

This establishes module loading and observed byte convergence in these two
diagnostic environments, not complete dependency/toolchain attestation, compiled
archive-ingestion success, protected Actions execution, or full release-family
convergence. Those requirements remain outstanding.

## 2026-09-07: compiled archive ingestion in native Windows and Linux

At `4b166ba`, the compiled module was exercised in a separate Node 22.22.3
process with actual compressed ZIP/TAR bytes, an embedded synthetic attestation,
and independently computed expected archive/TAR/manifest/attestation hashes.
The compiled one-hop download transport, streaming parser, hash calculations
and comparisons were real. Fetch returned controlled synthetic responses;
the external source, GitHub metadata, local dist and binding readers were
test-only replacements in a disposable directory. No production credential or
network was used, and no production attestation was created.

The child confirmed one authenticated API redirect followed by a credential-free
artifact request, exact returned hashes, and rejection of a corrupted archive.
The initial fixture lacked the sanctioned upload action's central-directory
creator/file attributes and was correctly rejected. The fixture was corrected
to the same attributes already covered by the parser's compatibility tests;
production validation was not weakened. All three module tests passed on both
Windows and WSL Linux, and targeted strict TypeScript passed on Windows.
Temporary fixture files were removed by the tests.

This closes the compiled-ingestion diagnostic gap, not the complete release
workflow. Real GitHub artifact evidence, fixed private storage/entrypoint
integration, attested production tooling, live signer inputs, and deployment
acceptance remain required.

## 2026-09-07: claim persistence timing correction

Startup previously returned only after a status network request, leaving the
verified claim in memory until the caller invoked `persistClaim`. A process
failure during that wait could lose the receipt before reconciliation storage
existed. `beginRecoveryWorkflowSession` now requires the private directory as its
third argument and persists immediately after strict claim verification, before
the status request. The separate public `persistClaim` method was removed; no
operating callers existed outside the updated tests. Storage failure returns a
reconciliation-only session, never a deployment-capable one.

Before any OIDC or issue request, `preflightRecoveryClaimHandoff` checks the
existing canonical owner-private Linux directory, write access and emptiness
through a held descriptor. Preflight is not a guarantee against later disk
failure; exclusive write, fsync, identity/readback and strict receipt checks
remain mandatory at persistence. Existing files are preserved, not overwritten.
The caller still must provision the fixed runner directory before startup.

At source `a36c7cc`, Linux session/storage suites passed 23 tests with one
Windows-only skip. Windows passed 15 with nine Linux-only skips; targeted strict
TypeScript passed. The real-filesystem, real-signature native probe passed ten
scenarios, now including empty-directory preflight and prior-claim rejection.
No production issue/claim request or deployment occurred.

## 2026-09-07: fixed runner private directory

`scripts/recovery-workflow-private-directory.mjs` creates or resolves only
`/home/runner/.warpkeep-recovery-v1/pages-<run-id>-<attempt>`. It requires Linux
UID 1001, the runner image's existing user, and a preprovisioned canonical 0700
parent owned by that UID. Run coordinates are canonical positive decimal strings;
paths and extra arguments are rejected. Creation is exclusive, uses held parent
and child descriptors, verifies identities/ownership/permissions, and fsyncs the
new directory and parent. It never removes or reuses existing attempt state.
Resolution does not authenticate coordinates or replace signed receipt checks.

The real Node 22.22.3 module passed the native container probe for creation,
resolution, prior-state preservation, malformed coordinates, extra arguments,
symlink rejection, wrong child/parent permissions, and wrong UID (including
root). The runner base was the previously recorded image `5027b710...`.
The diagnostic image manifest is
`sha256:dd5bafb199eaabd41bdf38afb79ebc112615152b138dc18271289557943db0df`.
Its Dockerfile is `operations/local-runner/private-directory-probe.Dockerfile`;
it stages the local Node binary and test module before runtime. Initial Docker
copy into a read-only container failed before testing; that container was removed.
Using the staged image retained read-only rootfs, no network, dropped capabilities,
no-new-privileges, and a dedicated 0700 private-directory tmpfs. No host mount,
credential or production state was provided. All test containers were removed;
the diagnostic image and `/tmp/warpkeep-directory-probe-20260907-1453` build inputs
remain available in WSL. Unrelated containers were not changed.

This tests the directory implementation, not production registration, job
authorization, or storage survival after container destruction. Production
directory provisioning/lifecycle and entrypoint composition remain required.

## 2026-09-07: artifact-to-claim preparation composition

`prepare-recovery-workflow-claim.ts` connects the existing artifact verification,
fixed run-directory allocation and persisted session startup without accepting
caller inputs. It derives directory coordinates from the verified artifact
context, requests the session with that same binding/context/root, and requires
its strict boundary check before returning only `{claimPersisted:true}`.
This is not a deployment permit: the later deployment step must independently
repeat the current status and strict receipt checks. No deployment effect exists
in this composition.

If startup returns a reconciliation-only session, preparation cannot succeed.
Failure after receiving a session attempts only reconciliation and still returns
the fixed preparation error; it never reissues or reports success after a failed
check. Ambiguous startup without a returned receipt is not retried. Session
references are disposed, and existing private disk state is left for recovery.

At `0423051`, seven mocked composition tests plus 12 artifact-composition tests
passed (19 total); service TypeScript passed. The module builder gained a fixed
claim entrypoint with the exact expected export and two explicit external helper
imports. Four packaging/native-child tests passed on Windows and Linux,
including repeatable claim-module builds, native import and pre-I/O rejection
of overrides. Targeted strict TypeScript passed. No real issue/claim request,
production directory allocation or deployment occurred. The protected Actions
step, deployment-time entrypoint and full workflow reconciliation remain unfinished.

## Native preparation command and protected source contract — 2026-09-07

`a098ee2` adds the no-argument native preparation command. It imports only the
fixed installed claim bundle, rejects missing/failed/invalid preparation with a
fixed error and nonzero exit, and emits only a bounded acknowledgment on success.
Seven native CLI tests use synthetic prepared modules; four separate packaging
tests exercise compiled modules and native archive ingestion. All 11 passed on
Windows and Linux Node 22.22.3; targeted strict TypeScript passed. These tests
made no real authority requests and did not deploy anything.

The protected workflow validator now requires the exact preparation step and
command after its unique artifact upload, instead of accepting OIDC-related
shell substrings. It rejects comments, caller arguments, skipped/ignored steps,
environment overrides, duplicate preparation and preparation before upload.
The source specification records this bounded integration contract. Actual
compiled-family installation, the recovery job, fresh deployment-time context
reconstruction, terminal reconciliation and runner provisioning are still
required. No final freeze or production activation was performed.

## Full service regression and installation gap — 2026-09-07

At source `dab50fb27172bfa423143505eb135fc5dc1029ef`, the complete recovery-service
suite passed: 958 tests across 33 files, 48.27 seconds, Windows Node 22.22.3.
Command from `services/release-recovery`:
`../../.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run --maxWorkers=1`.
This is local service verification, not required GitHub CI or live evidence.

Installation audit: `local-release-artifact-inputs.mjs` currently coordinates
only all-realm bindings and the four operation bundles. It does not call either
recovery module builder. `local-operation-bundle-runtime-core.mjs` already has
fixed-source capture, pinned Node/Git checks, isolated repeat builds and native
loads; its worker obtains esbuild through its verified package namespace.
`bootstrap-operation-bundle-cache.mjs` pins esbuild 0.28.1 and its Linux binary,
but not the recovery parser's fflate dependency. The recovery builder currently
uses ordinary checkout dependencies and is expressly diagnostic, not an attested
producer. Connecting that builder directly to production installation would
not meet the existing provenance contract. Next integration must carry the
recovery source/dependency graph through the captured-source producer and include
its output in the installed family before the workflow can invoke this command.
No runtime compilation fallback or weaker installation path was added.

## Recovery dependency namespace — 2026-09-07

`c1e2402` adds a separate fixed recovery package selector/materializer to the
existing isolated package implementation. It adds only fflate 0.8.3, with its
exact registry URL, lockfile SHA-512 integrity and 17-file size inventory.
Historical operation materialization still selects only the compiler pair plus
YAML. Recovery extraction reuses integrity-checked cache reads, strict archive
validation, exclusive owner-private installation and namespace re-attestation;
all fflate files are non-executable (0400).

A read-only HTTPS fetch of the pinned registry archive returned 173034 bytes.
SHA-512 matched the checked-in lockfile; bounded decompression confirmed all 17
file names and sizes in the new specification. The archive was held in memory,
not installed, and no package lifecycle scripts ran. Thirteen package tests
passed on Windows and Linux; targeted strict TypeScript passed. New tests cover
the unchanged historical pair, missing/wrong recovery pin, exact inventory,
missing/extra files, wrong sizes and traversal paths. The synthetic inventory
test is not a substitute for authenticated extraction.

The recovery cache bootstrap and isolated worker have not yet been wired to this
new materializer. No complete recovery artifact family, activation, or live
deployment is claimed by this change.

## Native recovery cache and extraction — 2026-09-07

`eaca823` adds a separate no-argument recovery cache bootstrap using the existing
fixed-host bounded download, SHA-512 checks, private cache permissions and pinned
Node verification. Its distinct profile selects exactly three packages. The
historical entrypoint remains two packages. Thirty-nine cache tests pass on
Windows and Linux; targeted strict TypeScript passes. New cases cover repeated
recovery use, missing pins, caller overrides and preservation/rejection of
corrupted cached bytes without replacement.

On WSL Ubuntu 24.04, using the fixed Node 22.22.3 executable and an empty
environment, `node scripts/bootstrap-recovery-bundle-cache.mjs` returned
`packageCount: 3, installedCount: 1`. Its second run returned `installedCount: 0`.
The historical bootstrap then returned `packageCount: 2, installedCount: 0`.
The only persistent addition is the integrity-verified fflate archive in the
existing owner-private preparation cache; no dependency installation scripts ran.

At `d7cff79`, the native package fixture's `recovery` scenario successfully
extracted and re-attested the real cached packages, checking all 17 fflate files
are 0400. It returned `RECOVERY_NAMESPACE_VERIFIED` and an empty transport-builtin
list. The first probe invocation omitted `--experimental-vm-modules` and failed
before materialization; rerunning with the required flag passed. Reproduce from
the clean Linux checkout with the fixed Node executable, `--no-warnings
--experimental-vm-modules tests/fixtures/localOperationBundlePackagesNativeFixture.mjs
<absolute-checkout> recovery`. The fixture removes only its disposable directory.

This establishes cache/extraction behavior, not the final recovery worker or
artifact-family installation. The next connection is the fixed-entry build
engine using this isolated compiler/dependency namespace and captured source.

## Isolated compiler connection — 2026-09-07

`c923b0a` separates the fixed-entry recovery build engine from the diagnostic
checkout compiler import. The engine accepts an already-attested compiler and
source root; it does not authenticate those inputs or grant deployment authority.
The public checkout builders still accept no overrides. Both use the same fixed
entrypoints, external import allowlist, output size/export checks and no-write
esbuild options.

The native recovery fixture now copies the six required source files plus service
package/TypeScript metadata into its disposable private namespace, builds twice
with the cached esbuild 0.28.1 compiler and fflate 0.8.3, then re-attests the package
namespace. It returned `RECOVERY_ISOLATED_BUILD_VERIFIED`: 50024-byte claim module,
SHA-256 `d48cefcf82ee7eb2551ffba243c4040d8da0d50d74998b19afd82f70bb7b1901`,
identical in both builds. The Windows checkout builder produced the same bytes
and hash. Eight packaging/native-module/engine-rejection tests and targeted strict
TypeScript passed on Windows. The fixture removed its temporary namespace.

Source copies in this probe are diagnostic, not the protected captured-source
worker. Runtime source capture, artifact manifest/install integration and the
actual recovery Actions job remain incomplete. No real OIDC, issue, claim or
deployment request was made.

## Captured-source recovery producer — 2026-09-07

`cecc8d8c440ba76c2dfde788507462ca3f871237` successfully ran
`scripts/local-recovery-bundle-runtime.mjs` in the clean Linux checkout with the
fixed Node 22.22.3 binary, an empty environment plus `NODE_NO_WARNINGS=1`.
Captured tree: `9bca655adca9ac9dc04fc4afab62b181d150c67f`. The producer made two
independent source snapshots, materialized verified cached dependencies, built
the fixed claim entrypoint twice, and compared the bytes and seven input records.
Non-package inputs matched committed Git bytes; package inputs matched the
verified namespace. Source/materialization and dependency checks ran again
after compilation and input reads. The resulting 50024-byte module retained
SHA-256 `d48cefcf82ee7eb2551ffba243c4040d8da0d50d74998b19afd82f70bb7b1901`.

The shared capture implementation gained a separate fixed recovery control list
(including the engine and producer), leaving operation capture's list unchanged.
Forty-five targeted runtime/workspace/host-guard tests passed; targeted strict
TypeScript passed. The earlier native run at `42fe119` also passed and emitted
Node's expected experimental TypeScript warning. Successful disposable snapshot
directories were removed by the producer; failures retain their own directories.

This producer returns build bytes and input records, not deployment authority.
It is not connected to artifact-family installation yet. Compilation currently
runs within the preparation process; bounded worker-process containment and
manifest/installer integration still need completion before production use.
No final freeze, credentials, database writes or live deployment occurred.

## Bounded compiler child — 2026-09-07

At `85b3c5df071d1ab031f267f8c1dee13cb731e0f2`, the captured-source producer
successfully compiled both cycles through a separate native worker. Each child
has a 60000 ms deadline, 3 MiB per-stream output cap and detached process-group
containment using the existing bounded process implementation. The worker takes
only the exact cycle number through fd3; it derives fixed source, compiler and
working-directory paths, accepts no CLI overrides and uses a credential-free
environment. The parent validates canonical worker output, base64, SHA-256 and
input paths before retaining bytes, then rechecks source and package identities.
Tree `cee0cc64de77a78df033a033ae539c4cae355579` produced the same 50024-byte module
and SHA-256 `d48cefcf82ee7eb2551ffba243c4040d8da0d50d74998b19afd82f70bb7b1901`.

Twenty-two targeted recovery/operation runtime tests passed.
The broader binding/recovery runtime suite then passed 47 tests with four
platform-specific skips on Windows.
Separate real Linux
process-group probes covered timeout, failed parent and successful parent with a
surviving descendant. All returned the expected failure code, no surviving
parent or descendant, and retained evidence. These are reusable containment
tests, not injected failures inside an actual esbuild compile. The producer's
native build proves the successful compiler path, not every failure branch.

Artifact-family manifest/installer integration remains unfinished. No deployment
or authorization requests occurred.

## Release artifact and installer connection — 2026-09-07

`c4f1ce0755b7a022ef275b6df442a2a41edf6c41` adds the recovery producer to
`derivePreparedLinuxArtifactInputs`. Its commit and tree must match the realm
binding and operation-bundle producers. The recovery producer emits exactly
the claim bundle and `scripts/recovery-workflow-bundle-manifest-v1.json`; the
manifest records its distinct preparation profile, source identity, bundle hash
and byte length, and compiler input records. The journal's output allowlist
adds only these two fixed paths, not a general service-directory allowance.

The real Linux installation probe built at that commit/tree
`1c1a37e016c6f4b649a59964201bb579e8354ab8`, captured a matching private release
candidate, installed both files through the journaled installer, compared their
bytes, imported the installed native module and verified pre-I/O override denial.
It then released the candidate lock and successfully rolled back the transaction.
Result: `installedFiles: 2`, `nativeImport: true`, `rolledBack: true`,
`finalReleasePrepared: false`; bundle SHA-256 remained
`d48cefcf82ee7eb2551ffba243c4040d8da0d50d74998b19afd82f70bb7b1901`.
Run `tests/fixtures/localRecoveryBundleInstallNativeProbe.mjs` with the fixed
Linux Node from a clean checkout, empty environment plus `NODE_NO_WARNINGS=1`.
Candidate diagnostics remain private; rollback removed only its two new files.

Seventy-six artifact coordination/journal/installation tests passed on Windows,
with 19 platform-specific skips. Targeted strict TypeScript passed. Added tests
reject mismatched recovery identities and adjacent, unapproved service paths.
This is the two-file recovery installation test, not a rerun of the complete
realm artifact/closure family. Complete-family verification and the protected
Actions job/deployment-boundary/terminal integration still remain; no final
freeze, real authentication request, or live deployment occurred.

## Verified local content-manifest cross-check — 2026-09-07

At `7697711aa1f621685aa5d451ef1ca12d8b8e62b0`, the deployment-attestation
verifier returns the content-manifest SHA-256 derived from its actual bounded
file-tree scan, only after the installed attestation matches the derived bytes.
It does not obtain this result from unchecked stored JSON. Recovery artifact
intake compares that digest with the inspected archive's content manifest and
rechecks both local digests after metadata revalidation. No second archive
download was added.

Verification at that source:

- Windows attestation suite: 27 passed, five Linux-only installation tests skipped.
- Native WSL/Linux attestation suite: 31 passed, one Windows-only rejection test
  skipped. The five installation tests therefore ran on their supported host.
- Recovery workflow artifact composition: 14 passed, including manifest mismatch
  and changed second-read manifest denial with exactly one download.
- Compiled recovery workflow module suite: eight passed, including native child
  ingestion of a real compressed fixture. Source/API/dist fixture boundaries are
  synthetic; this is not authenticated production artifact evidence.
- Root TypeScript build passed.

Commands: run `tests/deploymentAttestation.test.ts` and
`tests/recoveryWorkflowArtifactModule.test.ts` with root Vitest; run
`test/workflowArtifact.test.ts` with the recovery service's Vitest. Linux used
the fixed Node 22.22.3 executable in the clean independent diagnostic checkout.

This exposes the independently verified local digest needed by the pending
separate-process deployment recheck. That recheck, protected workflow wiring,
live authentication, final freeze, and deployment are still incomplete. The
earlier complete-family result applies to its recorded source, not automatically
to this changed compiler input.

## Separate-process preflight progress — 2026-09-07

Implementation through `d35faef4d3424c76308c1cea8ef45001df773f56`:

- `readRecoveryClaimHandoffHistory` projects only signature/schema/deadline-checked
  historical context. It returns neither the private receipt nor deployment
  permission. Ten Linux filesystem tests passed (cryptography mocked there).
  The separate native handoff probe passed fourteen cross-process checks with a
  generated test-only key, including wrong-key denial, strict deployment expiry,
  and historical correlation stopping at the signed deadline. The probe requires
  Node's `--experimental-vm-modules`; the first invocation without it failed at
  module import, before running the probe.
- `readRecoveryWorkflowCurrentContext` matches signed history against fresh
  run/artifact metadata, candidate commit/tree and re-derived local content and
  attestation hashes, then repeats the relevant reads. Only the signed inner TAR
  digest is historical, anchored to the matching immutable archive SHA-256.
  Seventeen mocked composition tests and targeted strict TypeScript passed.
- `recovery-workflow-check-deployment.mjs` composes that reader with the existing
  signed-status/current-expiry persisted-claim boundary. It accepts no arguments,
  prints only a fixed acknowledgment, and never deploys. Thirty-three combined
  context/boundary/command tests passed, including native argument rejection.
  The command is included as a prospective closure graph root; this is not a
  final closure freeze.
- The GitHub workflow validator requires adjacent claim preparation, the exact
  boundary command, and the one exact pinned Pages deployment action and artifact
  name. Its 233-test suite and recovery-service TypeScript passed.

The actual Pages workflow remains unwired: its classifier still uses the schema-1
path; schema-2 routing, the local recovery job, postflight and terminal handling
remain required. These tests do not prove authenticated production execution.

Two subsequent full recovery-service runs failed only with reported five-second
test timeouts: first 967 passed/one failed, then 966 passed/two failed. Commits
`6cc89aa` and `2346198` apply the existing 60-second transaction-test allowance
to two rollback tests and a 30-second real-host-module import allowance to the
attestation schema test. No runtime timeout or acceptance gate changed. The
combined focused rerun passed all 71 tests in 44.95 seconds. The subsequent full
run at `2346198adf74c1be49cda47f3f35ee7e549badda` passed all 968 tests across
33 files in 74.70 seconds, exit code 0. Command, from `services/release-recovery`:
`../../.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run --maxWorkers=1`.
This is the Windows Node test suite, not the separate workerd/runtime suite or
live acceptance. The earlier full runs remain recorded as failures.

## Schema-2 routing comparison — 2026-09-07

`98212b8` adds an explicit schema-2 branch in the existing Pages classifier.
It retains exact clean-checkout checks and validates the complete recovery
binding and committed single-parent, three-file activation child through
`readRecoveryAttestationSource`. Its output is `sealed-g002-recovery`, not the
historical `sealed-g002` lane and not deployment authority. Schema-1 parsing and
classification still use the previous path. Fourteen Linux source/CLI tests
passed, including actual Git activation-child routing and stale/untracked denial.
`2f2c1dc` marks the two fixed-`/usr/bin/git` routing tests Linux-only.

The full legacy suite was compared in separate Linux checkouts with identical
diagnostic dependencies and the fixed Node 22.22.3 executable:

- Before routing, `3fe5d062769fe4a36a954a40510cb3b5c259c3f5`: 95 passed, 58 failed.
- After routing, `98212b8`: 95 passed, 58 failed.
- Comparing all failed assertion full names produced zero differences.

Reports remain at `/tmp/warpkeep-routing-baseline.nsA1QEbM/baseline.json` and
`current.json` in WSL. Command: root Vitest `run tests/sealedLaunchVerifier.test.ts
--maxWorkers=1 --reporter=json --outputFile=<report>`. The comparison proves no
additional failing test names in this suite, not general compatibility or a
green release. Existing authority/source and G001 monitor-state failures remain.
Earlier Windows runs also failed due to fixed Linux Git requirements and Git
timeouts/locked fixture cleanup; they are not counted as passing evidence.

No recovery job is wired in the Pages workflow yet. Final release preparation,
authenticated protected-main/live authority, postflight, and deployment remain
separate mandatory work.

### Copied-verifier regression correction — 2026-09-07

The equal failure counts above concealed a changed cause: the policy test copies
the verifier into a temporary directory, where its two new relative imports
could not resolve. Commit `9c4af62` resolves those test-copy imports to the actual
repository modules using absolute file URLs; production verification is unchanged.

The corrected Linux run completed with 95 passed and 58 failed out of 153 tests.
Its report is `/tmp/warpkeep-routing-baseline.nsA1QEbM/corrected.json`. Comparison
against `baseline.json`, keyed by full assertion name, found zero differences in
the first failure-message line for all 58 failures. This restores the observed
baseline failure reasons, not a passing suite or proof that every deeper cause
is identical. The remaining failures encounter the G001 admission-monitor
current-state guard before the intended downstream authority assertions. Do not
refresh production source pins merely to make these tests pass; required operating
sources and their review must precede the final release freeze.

### Source-pin causal diagnosis — 2026-09-07

The monitor's committed Linux bytes hash to
`50776faaeb1ccd0c7357e6058ed90ac5a4ad5ad043444126089bdd45d1fd4560`;
the legacy verifier still expects
`10c8286a38ac81a5672280dcede60f712a95bc78af2f263e3ee8cc40d4afd5ac`.
`git show 50169a5 -- scripts/genesis001-admission-monitor-current-state.mjs`
shows the September 1 producer-local return/export change; the verifier had no
change in that commit. The current assembler already includes this exact source
in `derivePreparedSourcePins` rather than needing a new hash override mechanism.

A read-only in-memory diagnostic at `9c4af62` on native Linux Node 22.22.3 derived
both prospective source outputs, evaluated the derived verifier with
`vm.SourceTextModule` (real imported dependencies and its normal module directory),
and called `verifySealedLaunchSources` with every fixed source path read from that
checkout, substituting only the two derived outputs in memory. It returned
`phase: preparation`, `packageVersion: 0.3.43`, `pagesDeploymentApproved: false`,
null realm identities/releases, and `ptrPresentationEnabled: false`, exit 0.
No source files were installed, no receipts were substituted, and no production
operation ran. This isolates the stale generated pins as the immediate obstacle
to this checked-in-source verification; it does not establish that the full
legacy suite passes after preparation or that local production execution works.
The monitor still depends on macOS launchctl/plutil, so this source-check result
does not satisfy the required no-Mac operating boundary. Final preparation and
the Linux production workflow remain outstanding.

### Current-run reconciliation command — 2026-09-07

`scripts/recovery-workflow-reconcile-current-run.mjs` now composes the fixed
current-context reader with the existing persisted-claim reconciliation session.
It accepts no arguments, overrides, or receipt input; it does not issue, claim,
deploy, or create a new private directory. It disposes the session after either
outcome and emits only a fixed completed/not-deployed acknowledgment or a fixed
error. The underlying session still owns fresh OIDC, signature/deadline checks,
and original-row correlation. Its new closure graph root includes the real
transitive runtime dependencies in prospective preparation.

Windows Node 22.22.3 verification: 33 tests passed across
`recoveryWorkflowReconcileCurrentRun.test.ts`, `recoveryWorkflowReconciliation.test.ts`,
and `recoveryWorkflowCurrentContext.test.ts`; root `tsc -b --pretty false` exited 0.
The composition tests mock context/session dependencies; the CLI argument rejection
is a native child process. These are not live signer or workflow proofs.

This command is limited to the still-running protected job accepted by the
current-context reader. It is not an arbitrary later-run recovery entrypoint.
The workflow is not wired yet; live postflight, signed terminal evidence delivery,
and successful release acceptance remain separate required work. A reconciled
not-deployed row does not mean a shipped release.

### Preserve verified terminal audit evidence — 2026-09-07

The resumed session previously verified and then discarded `terminalJws`, leaving
only an unsigned acknowledgment available to downstream evidence collection.
It now returns the exact signed terminal only after `verifyRecoveryTerminal`
succeeds. The current-run command projects exactly `outcome` and `terminalJws`
and emits one JSON line; this supersedes its original fixed success messages.
Missing/empty/over-16-KiB terminal strings fail. Private claim receipts, OIDC,
authorization JWS, and context are still excluded. The terminal protocol's exact
schema and signature checks remain unchanged; terminal evidence is not a permit.

Windows Node 22.22.3: the two reconciliation suites passed 19 tests, the terminal
verifier suite passed 69 tests, and root TypeScript exited 0. Terminal verifier
tests use actual ES256 signing/verification with an isolated generated test key;
they do not establish production-key access. Reconciliation composition still
uses mocked transport/verification. Live postflight, workflow wiring, and durable
release-ledger collection have not been completed by this change.

### Exact public attestation postflight — 2026-09-07

`verifyRecoveryWorkflowLivePostflight()` now reads the independently verified
current context, fetches only
`https://warpkeep.com/.well-known/warpkeep-deployment-v1.json`, and requires its
exact SHA-256 to match the locally verified attestation and signed claim history.
The request has no credentials, rejects redirects, requests uncached identity
encoding, requires HTTP 200/JSON/exact URL, and enforces both a 16-KiB streamed
body bound and a 10-second fetch/body deadline. It checks declared length where
present, cancels/releases resources, and independently rereads the context after
the network wait. Errors expose only a fixed code. There are no caller URLs,
digest overrides, authority requests, or deployment effects.

Windows Node 22.22.3: 14 focused tests passed; root TypeScript exited 0. Tests use
synthetic public responses and a mocked already-verified context, including a
body that ignores abort. They establish transport/composition behavior, not a
live deployment. The new graph root is included in prospective closure derivation.
The helper is not yet wired into the workflow or terminal completion command;
it proves only exact attestation availability, not full gameplay/live acceptance.

### Current-job postflight composition — 2026-09-07

`node scripts/recovery-workflow-postflight.mjs` now runs the exact public check
and then reconciles the existing claim with fresh OIDC through the fixed
current-run helper. A failed public check still triggers reconciliation, but
cannot produce success. Success requires both the completed outcome and a pinned
signature-verified terminal payload whose deployment-attestation digest matches
the public postflight digest. Output is limited to the completed outcome, digest,
and verified terminal JWS. Failure is a fixed error with no stdout; no reissue,
claim, or deployment fallback is available. The prospective closure includes
the command and its real imports.

Windows Node 22.22.3: 34 tests passed across the postflight, live-postflight, and
current-run reconciliation suites; root TypeScript exited 0. Composition uses
mocked dependencies, including the signature verifier, with native CLI rejection
tested separately. Earlier actual ES256 verifier tests remain separate evidence.
This does not prove a successful live postflight. The protected workflow source
validator and actual job still need integration; no final release freeze occurred.

### Required workflow postflight source contract — 2026-09-07

The GitHub evidence validator now requires the exact fixed postflight command
immediately after deployment, a unique `recovery-postflight` ID, the single
GitHub token environment binding, bash, and the exact always-after-successful-claim
condition recorded in the recovery specification. Missing/comment-only/argument-
modified postflight, ignored failure, weakened conditions, intervening steps,
and duplicate IDs are rejected. This prevents accepting workflow source that
omits the implemented postflight or skips reconciliation after deployment failure.

The release-recovery GitHub evidence suite passed 241 tests on Windows Node
22.22.3 (eight new negative cases). These are source/fixture tests, not evidence
that an authenticated production job executed. Actual workflow integration,
local production runner setup and live acceptance remain unfinished.

### Recovery Pages build gate — 2026-09-07

Workflow inspection found `--phase=pages-build` still rejected the distinct
recovery lane. It now accepts either the historical lane or the already-validated
`sealed-g002-recovery` lane, without changing the classifier's source/commit
checks. The build environment helper parses a full schema-2 binding with
`parseRecoveryBindingV2`; schema-1 retains its previous parser and activation
validation. Both retain enabled PTR, exact immutable PTR database matching,
G001/G002 separation, and forbidden alias/URI environment checks. This is static
build validation only, not signed runtime deployment authority.

Ten selected Windows tests passed: nine recovery build-environment cases and the
historical PTR environment case; 152 unrelated cases were filtered out, not
verified by that run. The first TypeScript run found broad fixture field types;
explicit runtime string narrowing corrected them and the final root TypeScript
check exited 0. The copied-verifier test now resolves the added real dependency
from its repository path. Native CLI recovery-build execution and actual workflow
integration still need verification; the legacy full suite remains nongreen.

### Native recovery build CLI verification — 2026-09-07

At `317c14e`, all 15 recovery source/CLI tests passed on native Linux Node
22.22.3. The new fixture commits the actual verifier and its real dependencies
before creating the exact three-file activation child. It invokes the real
`--phase=pages-build` subprocess, verifies the recovery-lane/PTR output, and
requires exit 1 with empty stdout for PTR targeting the G001 database. The
recovery CLI now uses a bounded fixed-path binding read rather than loading
unrelated historical source files merely to retrieve that binding; schema-1
retains its old read path. Binding bytes are erased after parsing.

Command: root Vitest `run tests/recoveryAttestationSource.test.ts --maxWorkers=1`
in the Linux diagnostic checkout. The fixture uses synthetic workflow environment
strings and no credentials or network authority. It is not authenticated Actions
execution and grants no deployment authority. Actual workflow wiring, production
runner provisioning, final preparation, and live acceptance remain outstanding.

### Issuance/reconciliation workflow mismatch repaired — 2026-09-07

The full recovery service suite at `7f80338` passed 976 tests across 33 files
on Windows Node 22.22.3 (50.22 seconds). Source inspection nevertheless found
reconciliation hard-coded to `ubuntu-latest` and deployment ID `deployment`,
while issuance requires the local production runner labels and
`recovery-deployment`. Separate positive fixtures had hidden this incompatibility.

Reconciliation now invokes the same exported `validateRecoveryWorkflowSource`
used by issuance before applying its additional parsing checks; its obsolete
runner/step-ID requirements were corrected. Its fixture now includes the exact
claim/boundary/deploy/postflight sequence, permissions, and non-cancelling lock.
Both suites passed 273 tests before the three additional regression cases;
the final reconciliation suite passed 35 tests including rejection of the old
hosted runner, old ID, and missing postflight. Service TypeScript exited 0.
These use fixture GitHub responses, not actual production execution. This
corrects a real cross-component contract mismatch, but does not wire the job.

### Local production-build script and runner recheck — 2026-09-07

Authenticated `gh api repos/ael-dev3/Warpkeep/actions/runners` still lists only
`warpkeep-production-runner-01`, macOS/ARM64, offline. No Linux production runner
is registered. The recovery private directory contract requires Linux UID 1001
and `/home/runner/.warpkeep-recovery-v1` owned at mode 0700; ordinary WSL UID 1000
or a runner-label rename cannot satisfy it.

The complete checked-in frontend build script passed at `ffdc431` in the isolated
Linux checkout `/tmp/warpkeep-attestation-install.logAv0lN/repo`, exit 0. The first
`npm run build` attempt could not start because this minimal Node toolchain has no
npm executable. The successful invocation used pinned Node 22.22.3 to read
`package.json`, reject unexpected prebuild/postbuild hooks, and execute its exact
`scripts.build` via `/bin/sh` with the checkout's `node_modules/.bin` on PATH.
No package script was removed or skipped. Dependencies were the existing
diagnostic installation, not a new pinned production install.

Voxel dressing, TypeScript, runtime asset inventories, Vite bundling, production
asset checks, exclusion checks, atlas public boundary (2926 tracked paths/1682
scanned entries), and Farcaster manifest/signature checks all passed. Vite warned
about three minified chunks over 600 kB: Three.js 610.02 kB, RealmMapScreen
746.57 kB, and application 796.22 kB (gzip 154.44/202.62/205.08 kB respectively).
These measurements do not establish device performance gates or transfer totals.

This is a preparation-checkout build with default local build environment, not
the final 0.4 activation artifact or an authenticated production build. No release
version transition, deployment, runner registration, or production mutation was
performed. The output remains disposable diagnostic evidence.
