# Warpkeep 0.4 recovery evidence

Status on 2026-09-08: **integrated production recovery acceptance remains open**.
Recovery must preserve legitimate player writes made both before and after an
update. Restoring an old database snapshot over later progress is unacceptable.
Source-file recovery, frontend hosting recovery and persistent-world recovery
have separate implementations and acceptance evidence.

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
