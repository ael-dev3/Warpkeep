# Warpkeep 0.4 recovery evidence

## G002 and PTR adoption consumers — 2026-09-13

The follow-up on `codex/0.4-g002-existing-state` / PR #245 connects the existing
G002 producer to activation and recovery. Its fixed completion and adoption
writers retain genuine signed evidence; the activation runtime authenticates
both realms before constructing its provider. The separate G002 envelope remains
schema 1 and the existing PTR envelope remains schema 4.

A new public schema 5 (`warpkeep-0.4.0-sealed-launch-g002-ptr-adoption-v5`)
replaces unavailable original G002 publish/import/live claims with the actual
completed update, module/tool facts and signed atlas/sealed-state evidence.
The private corpus and bridge suspension receipt have explicit matching V5
profiles. No G002 gate or import cross-link is manufactured. Dual-adoption bridge
instances reject initial import, owner-provision and legacy live-evidence paths.
The notification-enabled flag is omitted because these signed observations do
not prove notification configuration. Schemas 2–4 retain their existing formats
and commitment domains; their continued support is checked independently.

The two retained proofs must agree on source/tree and signed bridge configuration
and authorization epochs. Both must belong to the same private-state owner.
The bridge deployment attestation establishes source/version and PTR database
binding; it does not independently expose configuration identity or epochs.
The recovery receiver checks those coordinates against freshly observed state
and requires the adopted G002 sealed-state HMAC alongside the existing PTR
sealed-state and owner HMACs. Existing G001 preservation and admission safeguards
remain enforced. The durable V2 ledger retains the exact extended projection;
legacy storage continues to reject unsupported projections. No new JWS, ledger
storage version, realm RPC or mutation authority was introduced.

Component verification before publication:

- Root bridge, activation-runtime and bridge-facts suites: 134 passed in three
  suites (137.41s). New runtime cases prove G002 authentication finishes before
  provider/preparation access; missing PTR and failed authentication fail closed.
- Public projection, candidate, generator and consumer suites: 1,165 passed with
  14 expected Windows platform skips. Published V4 canonical document/core
  vectors and existing V3 vectors remain unchanged. The actual immutable Git
  source/activation case passed separately; prepared Linux CLI acceptance is pending.
- Recovery service: 414 cases in seven suites passed. Real Workerd durable-ledger
  coverage passed all 16 cases, including V5 issue, eviction, claim and JWS erasure.
  The source/artifact receiver consumes actual generated V5 ZIP/tar inputs and
  rejects unsafe G002 fields even when their commitments are recomputed.
- Root, service and Workerd type checks passed. All 11 actual operation-bundle
  graph cases passed. Independent bridge/workflow, public-consumer and service
  reviews confirmed capability reopening across asynchronous boundaries and the
  distinction between retained signed scope and fresh provider facts.

The joined private-store test reproduced two concrete defects: an adopted bridge
could still create an initial G002 import gate, and raw V5 corpus validation could
combine capabilities authenticated through different private-state owners.
The fixes reject both paths without creating historical receipts or weakening
legacy profile validation. The genuine joined Windows case passed (24.95s): signed
dual history, real private bridge receipt, corpus/candidate and public projection
validate together; mixed owners and changed retained evidence reject. Windows
uses the existing explicit platform relaxation. The POSIX descriptor generator
and completed-generation restart are exercised separately on Linux; no platform
bypass was added.

This is source implementation evidence. A coherent generated family, independent
native preparation/checking, normal protected integration and live preservation,
actual-owner play and mobile render acceptance remain separate open work.

## Existing G002 update producer — 2026-09-13

The follow-up on `codex/0.4-g002-existing-state`, based on published `27671943`,
reuses the PTR update engine through fixed private realm policies. Its G002
artifact capability binds actual source-built bytes, program Keccak and complete
RawV10 description. Provider credentials target only the immutable G002 identity;
compatible table/schema preservation and an authenticated candidate-bound migration
plan are required before submission. G002 capability registries, private journal,
completion profile and signed sidecars are distinct from PTR.

The signed G002 observation service validates the complete private bridge response,
including G001/PTR guards, before projecting G002 program, atlas and sealed-state
facts. Separate audience, endpoint and `operate_g002` identity prevent reuse of a
PTR observation. Signed pre/post correlation retains source/tree, claim, terminal,
completion, bridge configuration, authorization epoch and unchanged G002 sealed
invariants. The signature grants neither provider credentials nor effect authority.
The shared engine reopens owned history after asynchronous verification; retained
completion and adoption capabilities are invalidated by disposal, foreign state
or changed canonical records. No historical publish/import receipt is invented.

Verification before publication:

- Six affected service suites passed 155 cases, plus adjacent service coverage.
  Actual Workerd gateway → named production entrypoint → G002 signer and gateway
  regression coverage passed five cases. Service and Workerd types passed.
- Provider/schema suites passed all 110 cases across both realm facades, including
  cross-capability rejection, cleanup and unchanged PTR canonical digests.
- G002 artifact coverage passed 76 cases with eight native-only skips on Windows;
  the adjusted existing operator fixture passed its 12 cases.
- The shared signed-observation caller passed all 62 cases, including complete
  signed pre/post pairs, cross-profile rejection and authority/freshness changes.
- The full engine unit suite passed 28 cases, including G002 real service-signed
  pre/post, lost acknowledgement/reconciliation, completion/adoption isolation,
  retained reuse and tamper rejection. Provider, source and continuation owners
  are explicit fixture seams in this suite. A new fractional terminal timestamp
  exposed a test-fixture rounding error: use the next whole observation second,
  preserving the service's actual requirement that observation follows terminal.
- Independent source review found the G002 workflow omitted the Linux builder's
  required materialization parent, which the mocked lifecycle had not exercised.
  Ten regressions reproduced the omission and unsafe/replaced-parent cases. The
  corrected caller passes the existing sealed runtime directory, validates its
  canonical path/ownership/private mode, and pins its inode across reattestation.
  All 22 workflow lifecycle cases passed after the fix. No defect was found in
  the reviewed service, shared adapter,
  signed caller or capability isolation. All 11 actual bundle/source-graph cases
  passed; generated manifests still need coherent regeneration.
- Scanner regression passed seven cases; real Gitleaks accepted 45 exact fixtures
  and detected all 88 mandatory hostile copies/mutations. New exceptions retain
  exact path/value/rule conjunctions.

The genuine private-store/continuation suite passed 14 cases with five native-only
skips on Windows. Its two new G002 cases cover real claim/terminal state, distinct
reconciliation identity and newly constructed state/store/adapter owners reopening
the same retained proof without another request or PUT. Windows uses the explicit
existing fsync/platform relaxation, so it does not establish POSIX acceptance.
The actual G002 workflow constructor has separate lifecycle/runtime/dispatcher
coverage (123 passed, one deliberate skip), plus fixed-job, permission and
preflight routing checks. The privileged preflight suite includes a new actual
G002 bundle import case and requires a freshly generated coherent donor family;
it remains pending for this source-only checkpoint.

Published producer `1664405dfb7eb9c3ea66a98222c769f08761373f`, tree
`abc0ca30e3927cbd8e00640f10deb6f97851cf00`, was secret-scanned, pushed and
verified equal to GitHub before synchronizing the clean idle native checkout.
Native session `61892` closed with exit zero: **356 passed in 13 suites, no skips**,
38.90 seconds, using UID 1000 and pinned Node 22.22.3. This exercised actual Linux
G002 artifact lifecycle, both signed update facades, genuine continuation/storage
and fresh-owner restart, provider/schema isolation, workflow configuration and
bundle graph. Native stayed clean and returned to idle with its persistent runner
intact. The prepared-donor and live provider boundaries were not part of that run.

Generated source manifests remain stale for this implementation until the complete
source family is rebuilt.
Activation/public/recovery adoption consumers still need the explicit G002 branch;
normal protected integration, live update/preservation and owner/mobile acceptance
remain open. This is a development producer checkpoint, not a deployed release.

## Earlier recovery checkpoints

The dated records below retain the evidence and limitations of their original
source. Use the execution handoff and the latest section above for current work.

Status on 2026-09-12: **integrated production recovery acceptance remains open**.
Recovery must preserve legitimate player writes made both before and after an
update. Restoring an old database snapshot over later progress is unacceptable.
Source-file recovery, frontend hosting recovery and persistent-world recovery
have separate implementations and acceptance evidence.

Native preparation and independent checking now cover composed source
`7cb573baab40e54f52ab2aeb26c56c9e8f1cf9f5`; sessions `90120` and `72208`
both exited zero with the same candidate, journal, family and closure identities.
The complete family was authenticated before its 17 changed bodies were exported,
preserving the later test-only correction. Exact identities and export evidence
belong to the [release engineering record](release-engineering.md). The marker
still reports `finalReleasePrepared: false`; final-head CI, protected source
promotion and genuine deployed recovery remain open.
Post-export Windows types and file-size checks passed; selected native-boundary
suites did not pass on Windows. Their Linux rerun after publication is pending,
as recorded in release engineering, and does not require weakening those checks.

## Authenticated Worker recovery source — 2026-09-12

The actual prepared-bridge recovery caller now derives the original uploaded
module digest from its authenticated durable journal. It validates the complete
record lineage and preserves the distinction between the original completion
and later read-only recovery heads. It reconstructs the reviewed configuration
from the original source and authenticated receipt, then reads Cloudflare's
actual version content, bindings, routes, domain, namespaces and runtime settings.
It does not rebuild a historical Worker to invent its deployed digest.

Each source/configuration read is composed with the existing live deployment,
public/private attestation and PTR checks. The configured public PTR identity
must match retained and observed authority. Original upload, latest journal and
pinned prior receipt are reopened after remote reads; source and live observation
freshness are retained through the durable-write boundaries. Canonical recovery
descendants may advance the latest head without changing original-upload identity.

Independent review found executable multipart bytes could be disguised as a
metadata field and excluded from hashing. Recovery and ordinary version reads
now share a validator that permits only one optional JSON metadata form field
without a filename and with the matching executable entrypoint. A realistic
HTTP-shaped regression reproduced the acceptance before the correction and now
rejects it; genuine module responses with and without metadata still pass.

The dedicated `warpkeep` Linux account (UID 1000), pinned Node 22.22.3 and the
reviewed source overlay passed all 178 tests across the complete deployment
runtime, recovery-source and receipt suites, with no skipped cases. Windows
build-mode TypeScript and tracked file-size checks also passed. Native tests
exercise actual journals and HTTP response parsers with controlled providers;
they do not establish production credentials, private receipt presence or a
successful live recovery. At that checkpoint the completed `27700d61` family
predated the change. The later `7cb573ba` preparation/check above covers the
composed implementation, without establishing live recovery.

That review also exposed two operating defects, addressed by the subsequent
connected change below: repeated renewal rejected a retained original authority,
and the live reader compared multiple requests against one initial time sample.

## Repeated recovery and sealed provider composition — 2026-09-12

The writer and sealed lifecycle reader now validate the complete retained
authority history. Each recovery edge reproduces the canonical journal-head
digest and preserves source, Worker, deployment and PTR identity. Missing,
foreign, forged and forked history fail. Interrupted head publication can reenter
at the authenticated tip; already-published authority remains idempotent. Existing
storage bounds are retained, reserving lifecycle directories, and renewal refuses
before receipt/head publication when no authority slot remains. No historical
record is deleted or overwritten to make a recovery pass.

Provider reads now own monotonic elapsed-time sampling for response arrival,
body completion and final reconciliation. Receipt verification/publication also
rechecks expiry after awaited work. Regression tests reproduced valid responses
being falsely treated as future-dated and expiry during an in-flight request;
the corrected paths preserve the existing future/expiry rules.

The sealed activation caller now uses one authenticated bridge provider instead
of independent deployment/binding callbacks. Actual source/configuration and
live observations are bound to original upload, receipt, current journal, source
and private-state instance. The state consumes an opaque observation once, then
reopens its own receipt and journal. A controlled HTTP test exercises the real
parsers and independently reads the first durable authority file, without a
circular requirement for a previous import authority.

Both activation workflow jobs receive the existing account/zone/provider/admin
secret slots and public PTR variable only for activation operations, retain them
through their narrow environment filter, and keep credentials out of command
arguments. Credentials are captured and scrubbed once, then validated when an
observation is requested; unrelated update operations do not acquire an extra
Cloudflare prerequisite. The composed source now has native preparation and an
independent generated-family check. Import/owner producers, final-head CI,
protected promotion and actual live acceptance remain unfinished.

Combined verification on Windows under pinned Node 22.22.3 passed 193 tests in
seven suites (provider, timing, history, workflow, PTR lifecycle, workflow runtime
and bundle engine), with 42 platform skips. The compiler tests build and inspect
the actual reachable source graph. Independent review found no further provider
or ancestry defect in this change. Source
`44b91b94e401ed51512e11ca786bd04f8413d112` subsequently passed all 519 tests
in twelve affected suites on Linux under UID 1000 and Node 22.22.3, with no
skips. The pass includes complete deployment runtime, receipt, source, history,
timing, bridge state/provider, recovery facts, workflow/PTR lifecycle and bundle
engine suites. The actual private journal/receipt integration preserves two
renewals and pending-head reentry. Controlled provider fixtures remain distinct
from genuine protected provider execution and live recovery acceptance.

Hosted native-contract verification and the subsequent constructor audit found
three older dispatcher/update fixtures passing independent callbacks without
a test capability.
Those fixtures now acquire the real test-only capability. Production continues
to require the branded provider; the gate is not relaxed to accommodate tests.
The corrected fixtures passed 67 tests on Windows with 33 native skips, plus
a standalone strict TypeScript check. On `7cb573ba`, the isolated Linux update
launcher and dispatcher suite then passed 196 tests under UID 1000 and Node
22.22.3; the only skip was the unsupported-runtime rejection inside the supported
namespace. The test-only `132355e0` correction uses exact parsed URL origin and
route assertions, passed all 43 recovery-source tests and strict types, and
received successful CodeQL analysis/security checks.

The existing initial prepared-deployment path owns creation of its durable
journal and prepared receipt. It authenticates retained B0 evidence and performs
the real source/configuration checks and provider postflight. Empty Linux private
roots do not establish a need to copy an old Mac prepared journal. Recovery of an
already-deployed prepared Worker still requires that deployment's genuine retained
authority; missing evidence must not be fabricated or replaced by rerunning B0.

## What has been verified

| Evidence | Result | Limit |
| --- | --- | --- |
| Native preparation transaction recovery | Candidate source files and transaction journals can be recovered and verified. | Does not recover a deployed world. |
| Pages recovery caller | Selected frontend artifacts, authorization claims and postflight are connected to hosting recovery. | The recovery signer is not a realm database administrator. |
| Pinned SpacetimeDB protocol experiment | Compiled toy modules preserve fixture rows through additive update and replacement; wrong or stale identities and tokens refuse. | Synthetic protocol fixture, separate from real Warpkeep state. |
| Populated Warpkeep A-to-B rehearsal | Real importers populate G002/PTR; updates preserve all old rows and complete table boundaries; PTR gathering and construction settle on actual timers. | Historical A is reconstructed source, and external player identity is synthetic. |
| Lost-acknowledgement reconciliation | The host accepts one update; a fresh adapter reopens durable records and confirms preservation without another PUT. | Adapter reopening occurs within one isolated process/runtime, not after host restart. |
| V2 inspection contention | Two competing OS processes share one exclusive predecessor slot; one succeeds and the other refuses. | Partial-record crash recovery and production activity remain outside that proof. |

The populated direct-protocol rehearsal completed at 08:24 UTC and a dispatcher
draft rehearsal at 08:40 UTC. The v1 acknowledgement-loss attempt first recovered
both updates but later timed out polling gathering schedules. A separately retained
instrumented run completed the full journey at 09:25 UTC without changing game code
or timeouts. The original timeout remains unexplained; this is not a timeout fix.

The repository-owned Linux harness passed the dispatcher, continuation and v2
update suites under UID 1000 and UID 1001. The unsupported-runtime case is skipped
inside the supported namespace. Restoring the former UID restriction caused the
required UID 1001 native check to fail. Publisher/reconciliation regression and
app/configuration type checks also passed. Current development and CI are tracked
in the [agent handoff](../../agent-notes/0.4.0/README.md).

## Useful code replacement

The disposable native rehearsal completed at `2026-09-08T11:12:35.729Z` from source `923e024d20d49b3d35396c225f53833013dbc4bc`.

A synthetic B artifact rejects city-mill construction immediately after the actual owner and atlas checks, before construction mutates state. Gathering remains unchanged and earns spendable resources. The rejected construction leaves every table unchanged. Another accepted worker command creates later progress and a real pending schedule.

The actual dispatcher installs correct C with an injected lost acknowledgement, then a fresh adapter reopens its durable records and reconciles completion without a second PUT. C references B’s exact accepted inspection and completion digests. Program identity changes; the complete schema and every post-B row remain unchanged. A longer valid route and observed arrival deadline keep this comparison inside a quiescent interval without changing game timers.

The same construction succeeds under C using a fresh sequence/revision. Worker and building settlement continue while fresh session issuance is disabled. The expired lease receives `INVALID_PTR_OWNER_SESSION`; a renewed lease returns the completed keep, and the explicit accepted-command retry changes no rows. Server termination, signing-file removal and CLI-snapshot cleanup all pass.

Fault B SHA-256: `db8b615a55191693db6465a117eefdfb3d0640494f79f700540814587f359f0d`. Correct C SHA-256: `5e954be30fd2fa7505d6619855bc7d09d333a3f27ec2c9fd113a2cae92f1b87a`. The fault was compiled twice with identical output, and its complete registered module description matches C. Private result SHA-256: `4632e8dc908a399a8d8319ce9f233d15b26afa9435af8fd90c2c6670d2304d46`; final driver SHA-256: `441df5905afb17b97c8dee7194ab6367040c5086f3896fec3c0afa15449cccb1`. Exact source, helper, schema, receipt and row records remain in the private rehearsal evidence.

This proves a useful repair on real Warpkeep code and populated disposable state. It does not prove production workflow authority, preservation during concurrent writes, process/host restart or the final integrated release.

## Artifact and authority boundaries

Historical A was rebuilt from `799814b5de3b3379c42961e86af595b7e5f82ac6`.
Its compiled schema matches the saved baseline, but its executable is not the
exact originally deployed artifact. Retained G002 B comes from `1e90b2e`; the
correct PTR artifact includes the reviewed `c5392e0` SDK-identity compatibility
correction. Its compiled source bodies match the corresponding paths at `923e024`.

The historical PTR module uses original bridge-signed HTTP tokens for import,
provisioning and bootstrap. The corrected module additionally accepts the SDK's
host-exchanged identity claim, validates it and binds it to the authenticated
sender. Owner, database, epoch and absolute-session checks remain enforced.
Earlier HTTP/SDK admission failures and the fixes are retained in the
[release engineering record](release-engineering.md).

The isolated rehearsal uses a persistent disposable database, a private network
namespace, a synthetic administrator and synthetic external identity/workflow
responses. It cannot establish production administrator ownership or actual-owner
play. G001 checks concern the local bridge admission gate; they do not substitute
for live G001 state and gameplay preservation. Raw rows, credentials, private
records and signing material stay outside Git and Desktop deliverables.

## Operating behavior

PTR's issuance switch denies fresh leases while preserving its enabled database
anchor and schedules. Already accepted work can settle autonomously. An expired
lease is refused by the module; a fresh lease resumes the same keep. An explicit
accepted-command retry must produce no second dispatch or credit. This server
idempotence probe does not claim automatic command-envelope transfer between
frontend sessions.

Issuance containment is reversible access control. It does not itself repair
faulty game code. Permanent owner suspension stops the anchor's scheduler and has
no inverse; it is unsuitable for reversible maintenance. Recovery readiness must
not be reported while its enabled-PTR prerequisite is false.

Existing updates use explicit inspect/apply operations and separate records from
fresh creation. Submission is recorded before the token-bound PUT; an uncertain
response is reconciled through fresh program, schema and row observations. Do not
rerun import or provisioning, fabricate empty-state facts, or retry a mutation
merely because an old program hash is observed. V2 does not reinterpret v1 records.

## Executing-host compatibility (September 8)

A credential-free GET to Maincloud's `/v1/health` at 12:20 UTC reported
`spacetimedb-cloud` version `2.10.0`. A separate read of the fixed PTR's
`schema?version=9` succeeded: it retains the six-field module definition, procedure
exports and empty row-level security used by the current compatibility work.
These reads performed no SQL, migration planning, module update or player command.
A service health version does not identify every database replica's exact binary
or durability configuration.

The earlier native recovery proof used 2.6.1. Official 2.10.0 source at
`baca5cdf77577ed4e3f30da48a5158189c4ea43f` still replans and checks the migration
policy, then changes the program and schema within the same serializable write
transaction. The AddTable branch creates the new table; it does not rewrite old
rows. Keep the old table definitions and reachable row types intact, reject
unsupported transformations, and check the full module definition rather than
only the displayed plan. See the [host transaction](https://github.com/clockworklabs/SpacetimeDB/blob/baca5cdf77577ed4e3f30da48a5158189c4ea43f/crates/core/src/host/wasm_common/module_host_actor.rs#L647)
and [migration implementation](https://github.com/clockworklabs/SpacetimeDB/blob/baca5cdf77577ed4e3f30da48a5158189c4ea43f/crates/engine/src/update.rs#L144).

The publish endpoint waits for the committed transaction and its configured
durability watcher. A lost response can still follow a successful update;
reconciliation must distinguish observed installation from a received durable
acknowledgement. Later legitimate gameplay writes must not invalidate a historical
production receipt. These source semantics support a production design without
requiring a new game-wide pause or row-revision subsystem solely to establish
non-destructive migration. They do not prove arbitrary candidate game code is
correct or make the synthetic quiescent adapter a production adapter. See the
[confirmation path](https://github.com/clockworklabs/SpacetimeDB/blob/baca5cdf77577ed4e3f30da48a5158189c4ea43f/crates/client-api/src/routes/database.rs#L1053).

A separate official 2.10.0 Linux toolset was downloaded and verified against its
release asset SHA-256. The pinned preparation toolchain remains unchanged. The real
2.10.0 compatibility rehearsal passed at `2026-09-08T12:40:50.891Z` from published
source `826ed94995c5d7389c0b3c03a30004e0d8e59de8`. It retained the attested 2.6.1
CLI and exact compiled artifacts while selecting the separately verified 2.10.0
host. Both A-to-B updates and B-to-C repair recovered lost responses without
resubmission. Earned resources, pending work, successful construction after repair,
autonomous timers, expired access, renewed access and exact retry all passed.
Independent complete snapshot/receipt/hash readback and cleanup passed. Private
result SHA-256: `af2af12212f170e53ef1f08b98df53144b9338385caa3221943ffa876c28f9ac`.
This used synthetic identity/workflow authority and reconstructed historical A.
It predates the later v3 definition adapter and is separate from production,
concurrent-write and host-restart acceptance.

## Production PTR update adapter implementation

The existing production factory now constructs an adapter from genuine source,
private-state and internally built artifact capabilities. Artifact construction
derives SHA-256 and program Keccak from the same copied bytes; the capability is
revoked on cleanup. A separate opaque transport reads the staged provider login,
uses only the fixed PTR endpoints and never exposes a token accessor. Its decoded
identity remains a local assertion; successful migration planning supplies the
server's UpdateDatabase authorization evidence.

Complete RawV10 comparison preserves old tables, reachable row types, names and
schedules while committing function changes to the full description. A metadata
initial-program value is only a hypothesis: the authenticated migration token
must match that predecessor and the actual candidate. Private no-clobber records
bind inspections, submission, acknowledgement and completion across sources.
Reconciliation proves the expected installation without comparing mutable player
rows and never invents a received acknowledgement or blindly repeats a PUT.
Current supported-host health is rechecked before submission/reconciliation; it
is a deployment observation, not replica attestation or an atomic version lock.

The combined Windows checks passed 170 tests with 34 native skips; strict types
and independent policy, credential and adapter review passed. Corruption, delayed
callbacks after failed no-effect persistence, changed host and lost-response cases
are covered. Real workflow/continuation execution, activation-corpus selection,
native artifact verification and live production acceptance remain unfinished.
The workflow entry still must construct these capabilities under its genuine
permit; production operation dispatch has not been enabled by this checkpoint.

## Remaining acceptance

The production update factory and genuine supported-runner authority must be
connected to the operating callers and canonical activation consumers. Complete
the actual release-family verification and production preservation evidence using
fresh authenticated identities and compatible artifacts. Exact row equality in a
quiescent synthetic window does not establish preservation during continuing
production activity.

Process/host restart, partial-record crash recovery, actual-owner play and the
integrated frontend/service/module recovery journey remain unproved. A passing
isolated rehearsal is one component of [release requirement R16](../../operations/0.4.0-release-checklist.md),
not a completed release or authorization to treat a diagnostic artifact as live.

## Complete definition policy

The synthetic v3 adapter binds all six RawModuleDefV9 fields. It preserves old
table definitions and reachable row types, requires empty row-level security,
and permits only procedure declarations in miscellaneous exports. Views, column
defaults and unknown declarations refuse. Procedure and reducer changes remain
possible, and their complete descriptions are checked after replacement. This
policy does not establish the correctness of arbitrary candidate game code.

Retained v2 records are explicitly refused before network activity; they are not
promoted into stronger v3 evidence. Native adapter tests passed 88 cases with one
platform skip; Windows passed 60 with 29 native skips, and focused strict types
passed. These tests use isolated HTTP fixtures. Captured real A/B definitions
and the separately observed public PTR definition also pass offline checks.
The production factory is implemented separately with complete RawV10 comparison;
its workflow and populated activation-receipt integration remain open.

## PTR workflow constructor and generated-bundle integration

The actual PTR runtime constructs the artifact and adapter for update operations
using its authenticated source, workflow permit and private continuation store.
Explicit runner configuration, pinned Node, source/configuration reattestation
and deterministic cleanup are implemented. The operating workflow remains
preflight-only; no live provider transition is claimed.

Root verification includes a real bundle-engine build, plain Node import and
invalid-input rejection. This caught newly reachable literal paths omitted from
the portability transform. Existing strict path checks remain intact. A separate
review caught an import-time Windows PATH dependency in the mocked lifecycle
tests; the final unconditional system-path constant resolves it. Failed
intermediate results are not counted as successful final verification.

Native CI for `846adb5` passed isolated update/recovery (168 cases, one skip) and
native production contracts (105 cases). Those results precede the constructor
change. New constructor checks use mocked dependency boundaries; real joined
continuation/provider execution, private V3 activation lineage, fresh preparation
and actual-owner release acceptance remain outstanding.
