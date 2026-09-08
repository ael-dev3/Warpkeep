# Warpkeep 0.4 recovery evidence

Status on 2026-09-08: **complete integrated recovery acceptance remains open**.
This record distinguishes source-file recovery, hosting recovery, protocol
experiments and recovery of persistent game state. Success in one does not prove
the others.

## Required result

The [release checklist](../../operations/0.4.0-release-checklist.md) requires
recovery tested in isolation before deployment, compatible with the deployed
schema and preserving legitimate writes made before and after deployment. An old
database snapshot must not overwrite subsequent player progress.

Possession of the exact historical G002/PTR executable is not itself this
requirement. It would strengthen a faithful historical-artifact rehearsal, but a
tested forward-compatible replacement can preserve state without reinstalling old
code. Fresh authenticated current-program identity is still needed at an actual
update boundary. A reconstructed schema-equivalent fixture must not be described
as the exact deployed predecessor.

## Evidence available

| Evidence | Established scope | Remaining limit |
| --- | --- | --- |
| Native preparation transaction and journal recovery | Restores candidate source files and retains verifiable transaction/recovery records. | Does not restore a deployed game or prove player-write preservation. |
| Pages recovery caller and authorization protocol | Connects selected frontend artifacts, claims and postflight to the hosting recovery boundary. | The recovery signer is not a database administrator or realm rollback API. |
| Native SpacetimeDB 2.6.1 protocol experiment | Actual compiled toy modules preserve complete fixture rows through additive update and forward replacement; wrong/stale target/program/token cases refuse, and ABA behavior is observed. | Synthetic in-memory protocol evidence, not a populated Warpkeep migration or crash-durability result. |
| Compiled G002/PTR schema comparison | Exact `1e90b2e` candidates preserve the captured old table/type boundary and declare the intended private gameplay additions. | No player rows were populated or migrated by that comparison. |
| Authenticated 04:02 UTC provider planning | Supports the loaded-program fingerprints and expected additive plans at the captured snapshots. | No publication or row-preservation test; no continuous-currentness or no-effect inference. |

The [engineering record](release-engineering.md) retains exact commits, artifact
hashes, test results and their limits. The first historical-source reconstruction
did not match the recorded original bundle hashes. Those files remain diagnostic
fixtures, not recovered original executables or selected recovery artifacts.

## Actual-module continuation

The next isolated experiment uses retained compiled Warpkeep modules, synthetic
local authority and representative valid atlas/owner/gameplay state. First confirm
the `799814b5` historical fixture's complete compiled schema, import through the real
reducers, update to the exact retained `1e90b2e` candidate without deletion, and compare
retained state. Exercise real gathering and construction with unmodified policy
timings, then verify continued settlement and single credit through containment
and resume. Its first attempt created only the local historical G002 fixture and
confirmed the complete table boundary, then stopped on
`INVALID_GENESIS_002_ADMIN_SESSION` before private reads, import or update. The
G002 bridge token omitted the module's required `hex_identity` on direct HTTP.
Source `95ce45c` corrects the producer and passed actual pinned-host HTTP and SDK
interoperability, with all module guards retained. The SDK separately exchanges
its token before subscribing; that host-signed replacement includes the computed
identity, explaining the earlier successful loopback CI. Its fixture did not prove
direct-HTTP interoperability. Disposable servers and signing files were cleaned
up. The original failed preservation attempt remains failed; populated migration
and recovery acceptance remain open.


The subsequent isolated rehearsal at 05:09–05:10 UTC verified both historical
compiled schema boundaries and completed G002's real atlas import. It then failed
at PTR import inspection before any PTR import writes or module update. PTR's
strict claim sets reject the identity added by the SDK token exchange; offline
tests reproduced this with all three actual PTR token producers. A separate PTR
module correction is under review. The historical artifacts remain unchanged.
No additive migration, owner gameplay or recovery acceptance is established.
The disposable server was stopped and signing files and CLI snapshot removed;
the failed attempt and its persistent disposable database are retained.

PTR's existing auth-bridge issuance switch can stop new owner sessions while
already-issued leases drain. It leaves the enabled database anchor and schedules
intact. Re-enabling issuance can restore fresh authority to the same keep. This is
access containment and resume, not a repair for defective database code; the
recovery-ready observer must not claim readiness while its enabled-PTR prerequisite
is false. Permanent owner suspension has no inverse and stops that anchor's
scheduler, so it is unsuitable as reversible maintenance.

A code-replacement recovery experiment needs a useful compatible recovery artifact
and actual evidence that old and newly accepted writes survive it, timers continue,
retries retain their identity and normal service resumes on the same persistent
data. No such PTR maintenance artifact is implemented or accepted by this record.
An arbitrary rebuild with identical behavior does not establish that result.

Existing G002/PTR fresh-create publishers and receipts continue to mean fresh
creation. Existing-target update, preservation and reconciliation must be connected
explicitly; do not remove refusal checks, rerun owner/import creation or fabricate
fresh/empty facts. An uncertain update cannot be retried merely because an old
program hash is observed afterward.
