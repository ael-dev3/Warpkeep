# Access requests

> Greater Realm cutover freeze: legacy access-request npm operators and direct
> TypeScript entrypoints are deliberately unavailable. Use only an exact row
> in the reviewed
> [production launch envelope](./greater-realm-production-launch-envelope.sh.txt).
> The only supported listing surface is the bounded, private
> `hermes-list-pending` census row. The one-time Genesis 001 frozen applicant
> archive described below is a separate post-freeze evidence operation.
> Owner-canary reset remains unavailable.

An access request is a private expression of interest from a server-verified
Farcaster account. It stores only the FID, a server-derived admission cycle,
and the SpacetimeDB request time. It does not grant access, reserve a castle,
or create player state.

Never-admitted and disabled founders can both apply. Repeated submission in
the same admission cycle is idempotent. Re-enablement resolves the current
request; a later revocation requires a new submission and database timestamp.
Disabling or re-enabling a founder does not remove or rebuild their castle,
ownership, profile, resources, workers, schedules, or other persistent state.

To enumerate candidates, run only the no-argument `hermes-list-pending` row in
the reviewed launch envelope. It pages the immutable production inspection
procedure at a fixed 100 rows, accepts at most 41 pages/4,096 rows, and rejects
changing totals, broken cursors, duplicates, non-pending rows, or non-canonical
ordering. The result is a content-addressed 0600 JSON census under the
owner-private production-admin report directory; terminal output contains only
its filename and SHA-256. It is advisory, not admission authority: every
`hermes-admit-*` or `hermes-allow-*` command must still reread and CAS-bind the
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

## One-time Genesis 001 frozen applicant archive

The freeze itself has one supported publisher entrypoint:
`npm run stdb:genesis001:freeze-publish -- publish
--confirm-freeze-nonce=3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00`.
Run it only from the exact reviewed protected-main checkout with exact absolute
paths supplied for `SPACETIME_BIN`, `WKG001_NODE_EXECUTABLE_PATH`,
`WKG001_PRODUCTION_DEPENDENCY_CACHE_ROOT`,
`WKG001_PRODUCTION_SPACETIME_CLI_CONFIG_PATH`, and
`WKG001_PRODUCTION_ADMIN_SECRET_PATH`. The Node input must be the reviewed
standalone v24.19.0 binary; the publisher copies it into the owner-private run,
requires mode 0500, its exact SHA-256 and Node.js Foundation signature, and
re-attests it throughout the release. The dependency-cache input is read only:
the publisher derives the exact 16-package Darwin/ARM64 closure from the
historical lock, verifies every integrity-addressed archive, safely constructs
`node_modules` without pnpm, Corepack, Bash, or network access, and re-attests
both archive and installed-tree identities after each build. The CLI config and
administrator secret must be existing owner-private files. The pinned
SpacetimeDB 2.6.1 CLI (commit `052c83fe984a4c4eb7bb4f9afa5c6b1903891d87`)
and its standalone companion are copied into one private snapshot, re-attested
before and after builds, loopback proof, live reads, and the supervised release
gate, and bound into build provenance. Do not substitute an ambient `HOME`, a
raw `SPACETIME_TOKEN`, or copied credentials.

Before it can release its one supervised `--delete-data=never` publication, the
publisher privately materializes and builds the exact
`2ae51984e1fa6ce5b0028c1a250359fed79d819b` source, proves
its full historical ABI, builds the six-writer frozen candidate, and repeats
that proof against a disposable loopback database. It then re-attests protected
main and the held artifact before release. A transport error is never retried:
only a fresh exact production identity, full candidate ABI, canonical policy
receipt, and nonce can reconcile it as successful. Every other outcome retains
the private artifact and recovery metadata for manual reconciliation.

After an exact postflight only, the publisher creates one non-overwritable
owner-private mode-0600 final receipt under the configured private workspace's
`receipts` directory. It binds the full production database identity,
protected-main commit, exact historical source and ABI digests, freeze nonce,
built artifact digest, equal candidate/postflight descriptor digests, and the
canonical live policy receipt and its digest. Its strict build-provenance block
also binds the reviewed Node digest/version, exact CLI version/commit and both
CLI executable digests, historical lock digest, dependency-installer profile,
selected archive closure, constructed dependency tree, and their canonical
provenance digest. Success output contains only the receipt basename and file
SHA-256. The final receipt is separate from retained
ambiguous-outcome recovery metadata; no applicant or player state enters either
record.

The legacy `list-access-requests` and `list-pending-access-requests` entrypoints
are source-suspended for the sealed 0.4.0 launch. They fail during argument
parsing, before trusted-launch capture, credentials, or network access, and do
not print applicant data or deterministic report digests. The reviewed private
`export-access-request-census` path below is the only applicant-export surface.

Do not run `export-access-request-census` until the Genesis 001 admission freeze
has been deployed from the explicitly reviewed `0.3.43` source baseline
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

Both `--dry-run` and `--confirm` require the explicit source-bound prerequisite
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

Run both modes from the exact verified release checkout through the installed
production administrator secret runner. It injects the existing secret without
putting it in process arguments, shell history, or the environment of the
calling shell; no secret rotation or manual secret copy is required. The release
bundle must include generated bindings for `genesis_001_access_policy_v1`.
Resolve `<operator-private-support-root>` locally to the reviewed owner-private
operations directory; never commit a literal user-home path.

```sh
cd /absolute/path/to/the/verified-release-checkout
'<operator-private-support-root>/bin/warpkeep-secrets' run-admin -- \
  node node_modules/tsx/dist/cli.mjs scripts/hermes-admin.ts \
  export-access-request-census --dry-run \
  --g001-admission-freeze-attestation \
  b043a0e2e4e2c23e183a0497f47c6d8265f4d95e1d3b58c85629d0de80683304
```

After the dry-run reports only that the export is ready, repeat the same command
with `--confirm` in place of `--dry-run`. Do not redirect either command's
output to a shared file.

Each mode reads the complete bounded census twice and fails closed unless both
canonical snapshots match exactly. `--dry-run` writes nothing and prints only
`schemaVersion`, `status=ready`, and `privateFilesWritten=false`; it never prints
count, byte size, SHA-256, a path, FIDs, or the report body. `--confirm` creates
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

Keep the resulting TXT only on that private Desktop and the raw exporter
reference only in the private audit directory for the later Genesis 002 review.
The raw reference contains count, size, TXT SHA-256, and basename; never print
or copy it into the repository, logs, shell history, CI artifacts, cloud sync,
tickets, chat, or release evidence. Neither mode calls an admission or
access-request mutation.

The `0.3.43` source baseline also suspends every Hermes admission/reset operator
at command dispatch, before trusted-launch capture, credentials, network calls,
profile resolution, plan reads, or reducers. This covers `admit-founder`,
`allow-fid`, `disable-fid`, `bump-auth-epoch`, `reset-access-request`, and
`recover-admission-notification`, in both dry-run and confirmed forms. Read-only
status, notification inspection, and census commands remain available.

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

## First-time notification recovery

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
