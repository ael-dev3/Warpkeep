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
