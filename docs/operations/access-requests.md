# Access requests

> Greater Realm cutover freeze: legacy access-request npm operators and direct
> TypeScript entrypoints are deliberately unavailable. Historical envelope rows
> below explain completed evidence only. For the sealed-realms release, fixed
> Node 22 runs the authenticated G001 lane bundle through only
> `g001-census-first` and `g001-census-second-inspect`; those existing operations
> collect both the applicant and admitted-player evidence passes. Owner-canary
> reset remains unavailable.

The sealed-realms operations described here are non-runnable from every
preparation Task 6B-6E intermediate commit. Task 6B's two current raw closure
member edits begin the stale-pin interval. Task 6C's surface intersects 21
current raw members total, including those same two, and adds 19 newly distinct
members; the union through Task 6C is 21. Task 6C and the Task 6D/6E changes
continue the interval. Protected prepared and
sealed-realms/live workflows must fail closed throughout. Focused task-specific
source/module/static tests are not full-green workflow evidence. Task 7 alone
atomically refreezes the closure manifest, workflow pins, and downstream
consumers, and only its green first run plus zero-diff second run restores
executability.

An access request is a private expression of interest from a server-verified
Farcaster account. It stores only the FID, a server-derived admission cycle,
and the SpacetimeDB request time. It does not grant access, reserve a castle,
or create player state.

Never-admitted and disabled founders can both apply. Repeated submission in
the same admission cycle is idempotent. Re-enablement resolves the current
request; a later revocation requires a new submission and database timestamp.
Disabling or re-enabling a founder does not remove or rebuild their castle,
ownership, profile, resources, workers, schedules, or other persistent state.

The completed pre-freeze candidate enumeration used only the no-argument
`hermes-list-pending` row in the reviewed historical launch envelope. It paged
the immutable production inspection
procedure at a fixed 100 rows, accepted at most 41 pages/4,096 rows, and rejected
changing totals, broken cursors, duplicates, non-pending rows, or non-canonical
ordering. The result was a content-addressed 0600 JSON census under the
owner-private production-admin report directory. Its filename and raw digest
are retained only in private historical state; current terminal/public output
must not emit either. It was advisory, not admission authority: every
historical `hermes-admit-*` or `hermes-allow-*` command reread and CAS-bound the
individual request immediately before mutation.

The former general list operator remains a refusal stub and must not be invoked
through npm or a direct TypeScript fallback. Do not copy the private census into
the repository, CI artifacts, issue comments, or public operator logs.

The 0.4.0 auth bridge independently rejects both `POST` and browser preflight
for `/v2/access/request` with the fixed `admission_requests_suspended` response
before rate limiting, credential verification, session lookup, admission
resolution, or database access. The read-only `/v2/access/status` route remains
available so existing state can still be inspected. The browser hides request
controls, but that presentation is not the security boundary.

G002/PTR publication ambiguity uses one pure, non-activatable canonical marker
profile, `warpkeep-sealed-realms-publication-possibly-submitted-v1`. Task 6C's
publisher/CLI constructs/parses/digests the exact lane/source/URI/alias/module/
release/artifact/toolchain/publish-plan/confirmation/nonce/time/submission-state
value plus a pure marker-to-receipt reconciliation value, but does not persist
either or claim restart safety. Publish inspect writes the marker privately
with no-clobber plus directory fsync before returning its confirmation or
allowing apply. Only the same
publish inspect may later append authenticated adoption or alias-absent/no-
effect reconciliation; neither the marker nor ambiguity authorizes replay.

For the sealed-realms release, only `g002-import-inspect` turns the protected
prepared receipt, completed journal, fresh attestations, and authoritative
POST/OPTIONS results
into import authority. It selects no caller path, authenticates exact `S`,
and expiry from the prepared receipt, derives completed run/attempt and deploy/
recovery ancestry from a strictly read-only journal scan, derives deployment
ID/Worker version/source commit from fresh private/public attestation, and
derives PTR identity/binding digest from fresh credentialed private attestation.
It appends immutable `deploymentAuthority`, then independently fresh
`g002Gate` and `ptrGate` records as the existing G002 and PTR inspect
operations each reattest and perform both probes. Each apply consumes only its
own gate-bound confirmation within five minutes and appends a cross-link to its
unchanged immutable realm receipt. The gates must share deployment authority,
source, PTR identity, and binding; cross-lane substitution fails.
Immediately before generation, `activation-evidence-inspect` reopens the chain
and performs fresh POST/OPTIONS probes. The resulting dedicated private bridge
receipt is the only source for the public bridge source commit and suspension
digest; caller injection, stale/swapped proof, replay/redeploy ambiguity, or
raw receipt/probe disclosure fails closed. This work belongs to those two
existing operations and creates no additional operation.

Expired unused or ambiguous confirmations never revive. The same lane inspect
may append a superseding gate only after proving no effect, or may adopt the
exact submitted receipt without replay. No new gate is allowed after prepared-
receipt expiry; a completed realm cannot authorize the missing other lane, so
release stops. The only recovery is the protected prepared workflow's internal
`recover-expired-authority-read-only` action,
`runAuthBridgeNotificationPreparedReadOnlyRecovery`, with outcome
`verified-read-only-recovery`; it adds no dispatcher operation. The ordinary
receipt writer is not reused because it always invokes its deploy callback.
Fresh protected-run/`S`, Cloudflare control-plane, public, credentialed private,
and PTR-binding attestations must prove the unchanged deployment/source/PTR
binding; read-only deployment/latest-upload enumeration and exact-version
inspection must prove the expired head's version is still uniquely latest
deployed. Only then may a new content-addressed receipt and completed no-deploy recovery
head are appended. The old receipt/head/authority file remains byte-identical
and terminal.

The new authority filename is deterministically
`auth-bridge-import-authority-<authorityChainDigest>.jsonl`; no caller selects
it. Zero/multiple eligible pairs, orphan/duplicate heads, drift, revival, or
overwrite fails closed. The existing G002 inspect/apply then freshly gates and
adopts the exact completed immutable G002 receipt through a dispatcher branch
that never calls its import core/reducer. PTR inspect/apply uses the equivalent
branch for a completed PTR receipt or proves no effect and calls its missing
import core/reducer once. All revisions remain append-only; none is
silently overwritten.
The exact physical grammar is one `deploymentAuthority`, zero-or-more abandoned
G002 gates, one final consumed G002 gate, one
`g002ImportAuthorityCrossLink`, zero-or-more abandoned PTR gates, one final
consumed PTR gate, then one `ptrImportAuthorityCrossLink`. Each new gate names
its immediately superseded same-lane predecessor; the old gate is never
modified and only the final gate is cross-linked. Forks, cycles, skipped
predecessors, or any gate after its lane cross-link fail closed.

## Completed Genesis 001 freeze and applicant archive

The freeze publisher invocation below is completed historical evidence and is
not current authority. It must never be run again:
`npm run stdb:genesis001:freeze-publish -- publish
--confirm-freeze-nonce=3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00`.
All requirements in this paragraph describe retained completed provenance, not
instructions to execute the publisher. The completed run used the exact
reviewed protected-main checkout with absolute
paths supplied for `SPACETIME_BIN`, `WKG001_NODE_EXECUTABLE_PATH`,
`WKG001_PRODUCTION_DEPENDENCY_CACHE_ROOT`,
`WKG001_PRODUCTION_SPACETIME_CLI_CONFIG_PATH`, and
`WKG001_PRODUCTION_ADMIN_SECRET_PATH`. The Node input was the reviewed
standalone v24.19.0 binary; the publisher copied it into the owner-private run,
required mode 0500, its exact SHA-256 and Node.js Foundation signature, and
re-attested it throughout the release. The dependency-cache input was read
only: the publisher derived the exact 16-package Darwin/ARM64 closure from the
historical lock, verified every integrity-addressed archive, safely constructed
`node_modules` without pnpm, Corepack, Bash, or network access, and re-attested
both archive and installed-tree identities after each build. The CLI config and
administrator secret were existing owner-private files. The pinned
SpacetimeDB 2.6.1 CLI (commit `052c83fe984a4c4eb7bb4f9afa5c6b1903891d87`)
and its standalone companion were copied into one private snapshot, re-attested
before and after builds, loopback proof, live reads, and the supervised release
gate, and bound into build provenance. No ambient `HOME`, raw
`SPACETIME_TOKEN`, or copied credentials were substituted.

Before it released its one supervised `--delete-data=never` publication, the
publisher privately materialized and built the exact
`2ae51984e1fa6ce5b0028c1a250359fed79d819b` source, proved
its full historical ABI, built the six-writer frozen candidate, and repeated
that proof against a disposable loopback database. It then re-attested protected
main and the held artifact before release. A transport error was never retried:
only a fresh exact production identity, full candidate ABI, canonical policy
receipt, and nonce could reconcile it as successful. Every other outcome retained
the private artifact and recovery metadata for manual reconciliation.

After an exact postflight only, the publisher created one non-overwritable
owner-private mode-0600 final receipt under the configured private workspace's
`receipts` directory. It bound the full production database identity,
protected-main commit, exact historical source and ABI digests, freeze nonce,
built artifact digest, equal candidate/postflight descriptor digests, and the
canonical live policy receipt and its digest. Its strict build-provenance block
also bound the reviewed Node digest/version, exact CLI version/commit and both
CLI executable digests, historical lock digest, dependency-installer profile,
selected archive closure, constructed dependency tree, and their canonical
provenance digest. Success output contained only the receipt basename and file
SHA-256. The final receipt is separate from retained
ambiguous-outcome recovery metadata; no applicant or player state enters either
record.

The legacy `list-access-requests` and `list-pending-access-requests` entrypoints
are source-suspended for the sealed 0.4.0 launch. They fail during argument
parsing, before trusted-launch capture, credentials, or network access, and do
not print applicant data or deterministic report digests. The reviewed private
`export-access-request-census` path below is the only applicant-export surface.

The prior direct `export-access-request-census` entrypoint is not a production
runtime surface. Its semantics are retained by the authenticated G001 bundle,
and collection cannot begin until the Genesis 001 admission freeze has been
deployed from the explicitly reviewed `0.3.43` source baseline
`2ae51984e1fa6ce5b0028c1a250359fed79d819b` and independently verified in the
deployed module. Verification must establish realm ID `GENESIS_001`, release
`0.3.43`, existing-player access retained, admission-state mutations disabled,
and new access-request submission disabled. The explicit attestation argument is
not live proof by itself. Immediately before each census pass, and once more
after both canonical snapshots match, the exporter calls the metadata-authorized,
read-only `genesis_001_access_policy_v1` procedure and requires the exact receipt
`GENESIS_001` / `0.3.43` / player access enabled / admission mutations disabled /
request submissions disabled / source baseline
`2ae51984e1fa6ce5b0028c1a250359fed79d819b` / freeze nonce
`3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00`.
A missing generated binding, procedure failure, additional or missing field, or
value mismatch aborts the operation. Independently verify the deployment first;
the exporter then records evidence only from that already-verified freeze.

The historical `--dry-run` and `--confirm` forms required the explicit
source-bound prerequisite
`--g001-admission-freeze-attestation`
`b043a0e2e4e2c23e183a0497f47c6d8265f4d95e1d3b58c85629d0de80683304`.
Any missing or different value fails during argument parsing, before production
credentials or the database are accessed. The attestation digest commits to the
realm, release, source baseline, source-bound freeze nonce, disabled admission
mutations, and disabled request submissions. The report's target digest additionally commits to the
source-suspended Hermes command set, canonical production database URI and
identity, authentication bridge, fixed live-freeze and census procedures,
inclusion of resolved requests, pagination bounds, and two-pass census
requirement, plus the exact descriptor-anchored writer source, canonical
owner-private exporter-reference directory, canonical JSON reference format,
and basename/status-only command output.

Production performs no package-manager or direct tsx invocation. Exact source
mode `S`, fixed signed Node 22, and the authenticated G001 bundle perform pass
one inside `g001-census-first` and pass two inside
`g001-census-second-inspect`. The dispatcher keeps the administrator secret out
of argv, logs, and inherited child output. The bundle retains the read-only
`genesis_001_access_policy_v1` binding. There is no manual redirect or shared
output file.

Each applicant pass reads the complete bounded census twice and fails closed
unless both canonical snapshots match exactly. The readiness stage writes
nothing and emits only a privacy-safe ready status; it never prints count, byte
size, SHA-256, a path, FIDs, or the report body. The confirmed private stage creates
one non-overwritable, timestamped mode-0600 TXT file in the actual production
administrator account's canonical Desktop and a distinct non-overwritable
mode-0600 raw exporter reference under the canonical
`Library/Application Support/Warpkeep/operations/audit/private` directory.
Confirm output contains only `schemaVersion`, `status=written`, and the two
privacy-safe basenames. Ambient `HOME` is ignored. The writer holds and
repeatedly re-attests both directories and both destination identities, refuses
symlinks, cleans exact partial files on failure, and does not overwrite an
existing timestamp.

When the exact created leaf remains reachable, failed-write cleanup reopens it
through the held Desktop descriptor, verifies its identity, truncates it to
zero, and fsyncs it. Portable unlink is still name-based. A hostile process
running as the same administrator UID could move the inode before cleanup or
replace the leaf after the final identity check; the former can leave the moved
private inode behind and the latter can cause the replacement to be unlinked.
No replacement receives census bytes, which are written only through the held
expected inode. Run the one-time export only while other processes under that
administrator account are trusted.

Keep the resulting applicant TXT only on that private Desktop and the raw
exporter reference only in the private audit directory for the later activation-
evidence review/generation.
The raw reference contains count, size, TXT SHA-256, and basename; never print
or copy it into the repository, logs, shell history, CI artifacts, cloud sync,
tickets, chat, or release evidence. Neither applicant pass calls an admission
or access-request mutation.

## Separate admitted-player proof

The applicant archive above and the admitted-player census are distinct and
both are mandatory. The applicant archive answers which access requests exist;
it does not prove the complete currently admitted player set or stable auth
epochs. The admitted-player proof is read-only, has no human-readable export,
and never adds an identity, epoch, player count, or raw/private digest to the
applicant TXT.

The preferred pinned SpacetimeDB 2.6.1 query is exactly
`SELECT fid, enabled, auth_epoch FROM allowed_fid`. The G001 bundle treats its
output as bounded machine data, requires unique canonical FIDs and epochs,
requires every row enabled, and exact-matches `allowedFids` and
`enabledAllowedFids` before and after the query. If that exact query is not
available without changing the frozen ABI, the sole fallback enumerates
`player_v2`, invokes the existing administrator status procedure for every
canonical FID, and accepts only when the reconstructed enabled set exactly
equals aggregate `allowedFids`. Any mismatch or changing result blocks release.

`g001-census-first` stores pass one of the applicant and admitted-player pairs.
After 60-300 seconds, `g001-census-second-inspect` stores pass two of both,
requires distinct timestamps/nonces and private stability within each pair,
and issues the one-time suspension confirmation. Only
`g001-census-second-suspend` consumes that confirmation. The admitted-player
public profile is exactly
`warpkeep-genesis-001-admitted-player-census-privacy-safe-v1`; only its opaque,
domain-separated commitment becomes public. FIDs, epochs, count, normalized
set digest, and raw receipt remain owner-private.

The `0.3.43` source baseline also suspends every Hermes admission/reset operator
at command dispatch, before trusted-launch capture, credentials, network calls,
profile resolution, plan reads, or reducers. This covers `admit-founder`,
`allow-fid`, `disable-fid`, `bump-auth-epoch`, `reset-access-request`, and
`recover-admission-notification`, in both dry-run and confirmed forms. Read-only
status and notification inspection remain available; sealed-release census
work is available only through the authenticated G001 bundle and existing
dispatcher operations described above.

The 0.4.0 auth bridge independently rejects both `POST` and browser preflight
for `/v2/access/request` with the fixed `admission_requests_suspended` response
before rate limiting, credential verification, session lookup, admission
resolution, or database access. The read-only `/v2/access/status` route remains
available so existing state can still be inspected. The browser hides request
controls, but that presentation is not the security boundary.

Admission remains deliberately separate and unavailable while this source-bound
suspension is present. If a later reviewed release reopens it, a missing FID may
use only the reviewed `hermes-admit-dry` and `hermes-admit-confirm` envelope rows;
a disabled founder whose retained graph has passed review may use only
`hermes-allow-dry` and `hermes-allow-confirm`. Listing never fetches a profile
and never admits or edits state.

Both mutation paths fail closed on the current world authority. While legacy
founding is explicitly open, Hermes preserves the exact v3/v4 100-slot graph
checks. Once the Greater Realm is current, new founding instead requires the
admin-only cutover aggregate to report the active, exact 600-slot v17
claim/slot/cell/occupancy/account/worker graph and remaining capacity. A v17
re-enable uses the separate target-specific proof for that founder's exact
claim, resources, four-worker roster, disabled epoch, and pending request CAS;
it does not consume capacity. Prepared, draining, canary, halted, corrupt, or
mode-changing checkpoints submit no admission mutation.

The checked-in Hermes notification-delivery approval literal is also `false`.
That temporary delivery blackout permits read-only/dry-run review but
blocks confirmed new-founder admission and existing-founder re-enable before
notification transport, administrator-token issuance, database connection,
plan claim, or reducer submission. It may become `true` only in the coordinated
durable-final notification phase after the Worker, Pages generation zero, and
checked-in live root. Greater Realm client/server presentation remains false
until the later canary-bound activation-client release. Hermes approval never
authorizes skipping the required pre-admission notification.

## Owner canary reset

Owner-canary reset and reset inspection are unavailable during the cutover.
Their npm aliases are refusal stubs, and the reviewed launch envelope has no
replacement row. Do not pass an administrator secret through the environment
or a shell pipe, and do not invoke the historical entrypoint directly. Any
future reset must add a command-specific trusted row and re-review its
state-binding, ambiguity recovery, and preservation guarantees before use.

This reset does not change Farcaster notification consent or its signed token.
Removing the Mini App or changing notifications is a Farcaster client action;
the database operator must never imitate it.

## Historical/future notification recovery

This is not a sealed-realms production operation and is unavailable throughout
this release. A later separately reviewed release may use the retained contract
below; it does not add a dispatcher operation here.

A never-admitted founder cannot use owner-canary reset. If the exact pending
request is still `missing` admission and its notification reached
`delivery-exhausted`, use only these reviewed launch-envelope rows:

- `hermes-notification-inspect FID` for the notification status;
- `hermes-notification-recover-dry FID 'non-sensitive reviewed recovery note'`
  to create the private recovery plan; and
- `hermes-notification-recover-confirm REVIEWED_PLAN_FILENAME
  REVIEWED_PLAN_SHA256` to consume that exact plan.

The envelope receives canonical owner-private administrator- and
notification-secret file paths according to the selected row. It opens each
secret late with no-follow identity checks. Never carry secret values in the
environment, pipe them through a shell, or substitute a direct npm/TypeScript
invocation.

The dry-run requires the exact missing/pending request timestamp, token-free
`delivery-exhausted` diagnostics, zero prior recoveries, current notification
consent, and the immutable production targets. The 30-minute plan binds that
entire diagnostic snapshot and is claimed before submission. The bridge then
rechecks both admission and the request timestamp and permits only that plan ID.
A competing plan conflicts; replaying the same ID is idempotent.

Recovery preserves the exhausted receipt and the original deterministic
notification ID. A sent receipt always wins and can never be reset. Neither
stage changes admission or any database row. Run the ordinary reviewed
`admit-founder` flow only after token-free diagnostics report `already-sent`;
`queued`, `delivery-exhausted`, and `not-subscribed` all leave admission
pending. Without notification consent, recovery remains blocked unless the
owner grants a separate explicit policy change; this recovery mechanism cannot
override that boundary.
