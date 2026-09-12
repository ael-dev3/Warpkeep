# Warpkeep 0.4 recovery evidence

Status on 2026-09-12: **integrated production recovery acceptance remains open**.
Recovery must preserve legitimate player writes made both before and after an
update. Restoring an old database snapshot over later progress is unacceptable.
Source-file recovery, frontend hosting recovery and persistent-world recovery
have separate implementations and acceptance evidence.

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
successful live recovery. The source must be prepared and independently checked
again before release; the completed `27700d61` family predates this change.

A separate existing retention limitation remains: after one recovery leaves
both original and recovered authority files, a later renewal's authority writer
allows only its immediate prior and new filename. The retained original then
causes `AUTH_BRIDGE_PREPARED_RECOVERY_CHAIN_CONFLICT`. Resolve this through
authenticated ancestor handling, preserving history, before claiming repeated
recovery acceptance. Also exercise response timing against actual provider reads;
the legacy live reader still samples one reference time for multiple requests.

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
