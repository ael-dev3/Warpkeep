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
