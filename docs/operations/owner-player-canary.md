# Owner production player canary

Status: source-only, fail-closed, and not authorized for production deployment
or execution.

The unlinked `https://warpkeep.com/owner-canary/` document is a separate Vite
entry and module graph. It mounts only the Farcaster Mini App host, owner-canary
auth client/controller, and an injected evidence runtime. It does not import or
mount the normal `App`, `FarcasterAuthProvider`, `WarpkeepSpacetimeProvider`,
Greater Realm scene, or `greaterRealmProviderBridge`. Product version `0.3.43`
and both Greater Realm presentation-off constants remain unchanged. The page
has an exact narrow CSP, canonical URL, `no-referrer`, `noindex`, no manifest,
and no Open Graph or Farcaster discovery metadata.

## Browser-memory run contract

The local verifier privately provides exactly three values: one 256-bit
evidence nonce, one reviewed admission-plan digest, and the approved route-set
commitment. Each is exactly 64 lowercase hexadecimal characters. The route-set
commitment binds the raw four-route tuple retained in private operator state;
raw worker IDs, location IDs, route cells, and route metadata do not enter the
page. The page clears all three input fields immediately as the run begins.
None is placed in a URL, rendered status/result, log, storage API, cookie, or
sanitized evidence. Before the run, each exists transiently in its controlled
input and React state; start clears the current state references while the
active run retains only its call-stack input. Clearing does not promise
physical memory erasure, but makes those browser references eligible for
garbage collection.

The evidence runtime must invoke the injected `runStage(stage, operation)` once
for each exact stage, in order:

1. `baseline`
2. `founder`
3. `routes`
4. `dispatch`
5. `dispatch-replay`
6. `gathering`
7. `recall`
8. `returning`
9. `terminal`
10. `evidence`

Before every stage, the owner sees a separate Continue control. That user
action calls Farcaster Quick Auth with `{ force: true }`, exchanges the bearer
through the owner-only bridge endpoint, verifies the same approved subject,
opens one opaque player authority, runs the stage, and closes it. The bridge
response player JWT, bridge-verified FID, Spacetime identity, worker IDs,
location/cell IDs, and dispatch/recall idempotency keys remain only in the
relevant call stack or the injected runtime's private in-memory closure. They
are never returned to React or the sanitized result. The pinned Farcaster SDK
retains its most recent Quick Auth bearer in module memory even after expiry,
until it is replaced or the page realm is destroyed; Warpkeep never copies
that SDK cache into React, storage, logs, or the runtime. The shared Mini App
host context separately carries an untrusted
presentation FID in React memory; the owner-canary code never reads, renders,
logs, compares, or uses it as authority. Cancellation, subject change, missing
consent, stage reordering, or evidence-shape drift terminates the run and
attempts to close its Warpkeep authority. Starting a run permanently consumes
that one page realm: success, failure, or cancellation cannot start a second
run, because a server mutation may have committed before a browser error or
abort. Every dispatched worker must reach the urgent reviewed recall stage
without avoidable delay.

If authority closure or verifier handoff fails, the result is explicitly
unconfirmed. For every terminal outcome the owner must close the Mini App host
and obtain independent operator reconciliation before a separate reviewed run.
Closing the reviewed Mini App host also ends the remaining browser-memory
lifetime.

The browser validates a closed, ID-free journey shape and adds fixed claims:
`freshAuthenticationStageCount: 10`, `tokenPersisted: false`,
`adminImpersonation: false`, and `notificationBypass: false`. Returned evidence
is branded in a module-private `WeakSet`; `requireOwnerCanaryPlayerEvidence`
rejects parsed, spread, or reconstructed JSON. The same-subject commitment is
lowercase SHA-256 over these three UTF-8 text frames:

```text
warpkeep.production-player-canary.same-subject.v1
<private 64-hex evidence nonce>
farcaster:<verified decimal FID>
```

Each frame is encoded as ASCII decimal UTF-8 byte length, `:`, then raw UTF-8
bytes. Framed values are joined by `|` and one LF is appended after the final
frame. Only the digest leaves the controller; the nonce and FID do not.

## Private runtime plan and deterministic commands

There is no fourth browser field. During the authenticated `baseline` stage,
the future production evidence runner must call the separately generated
`get_production_player_canary_runtime_v1` API. That private server result
provides the exact `serverBaselineCommitment`, raw route tuple, and expected
`commandSetCommitment` bound to the nonce, reviewed plan, and supplied
route-set commitment. The raw tuple and both server values remain inside the
runtime's `evidenceApi.run` closure and never enter React, controller state, a
URL, a rendered result, or sanitized evidence.

The runtime-plan module validates the five 64-hex inputs, derives the stored
challenge digest and nine idempotency keys, compares the expected command-set
commitment, and returns an
empty frozen branded handle. The handle has no properties or getters. Its
command material lives only in a module-private `WeakMap`. A runtime-owned
consumer can receive exactly one selected key at a time; the page and
controller have no command-key access. A failed or overlapping consumption
poisons that plan, and disposal invalidates the handle. Raw routes and keys
must not be returned from a stage or copied into browser evidence.

For operation `dispatch` or `recall` and canonical decimal ordinal `1` through
`4`, the command digest is lowercase SHA-256 over these length-framed UTF-8
values, joined by `|` with one final LF:

```text
warpkeep.production-player-canary.command-key.v2
<stored challenge digest>
<reviewed admission-plan digest>
<server baseline commitment>
<private route-set commitment>
<dispatch or recall>
<ordinal>
```

The complete key is `pc2-d01-<64-hex digest>` through
`pc2-d04-<64-hex digest>` for dispatch, or `pc2-r01-<64-hex digest>` through
`pc2-r04-<64-hex digest>` for recall. A ninth
`pc2-f00-<64-hex digest>` key uses operation `fence` and ordinal `0`. The
command-set commitment uses the same framing and hashing over this exact
ordered sequence:

```text
warpkeep.production-player-canary.command-set.v2
<stored challenge digest>
<reviewed admission-plan digest>
<server baseline commitment>
<private route-set commitment>
<dispatch key 1>
<recall key 1>
<dispatch key 2>
<recall key 2>
<dispatch key 3>
<recall key 3>
<dispatch key 4>
<recall key 4>
<recovery fence key>
```

The challenge digest is the existing SHA-256 challenge-v1 commitment to the
private evidence nonce. Raw nonce bytes are absent from command-v2 framing.
Server dispatch, recovery, evidence, and inspection reconstruct the same v2
authority from the immutable stored challenge and registered tuple. The entire
`pc1-` namespace is reserved and rejected, as is every `pc2-` key that is not
the exact stored dispatch, recall, or fence key.

The source now contains a provisional production evidence adapter. It accepts
only the exact canonical Maincloud database, canonical auth origin and OIDC
audience with shared alpha explicitly enabled. Loading the production entry
only reads that public configuration: it performs no authentication, socket
construction, procedure call, reducer call, or other network work. The first
possible network action remains the controller's explicit post-consent
authentication stage.

The adapter implements the ten ordered, memory-only stages above. The
`baseline`, `founder`, and `routes` stages read and compare the caller-private
runtime plan; `founder` is strictly a read-only confirmation after normal
admission and server baseline capture. The server procedure requires the
direct active v17 Tier-I founded claim, current ownership, current entry
agreement and control readiness. Browser code does not found, admit, bootstrap,
accept Terms, or call an admin surface. `dispatch` revalidates the unexpired
server plan immediately before the four ordered commands. Replay uses the same
four opaque plan keys, preserves the exact capacity leases, and permits only a
normal outbound-to-gathering transition. Recall always sends the four ordered
reviewed keys before judging whether the bounded evidence window remained
valid. Terminal reads require stable atlas context, monotonic server clocks,
idle zero-cargo workers, zero pending worker amounts, and nondecreasing resource
balances. These browser checks are non-authoritative: independent server/admin
evidence remains the only resource-isolation and receipt authority.

Server-reviewed worker policy pins travel to 30 seconds per route step and one
gather quantum to 60 seconds. A classified canary assignment alone is clamped
to exactly 119,999,999 microseconds after arrival, while ordinary assignments
retain the generic duration. This admits exactly one completed 60-second
quantum and never a second. Gathering evidence is accepted at or after one
quantum and strictly before two, and dispatch/recall bursts each have a
30-second ceiling. The reviewed production composition pins a five-second poll
interval and 96 attempts. Its wait rejects any different requested interval
and aborts immediately. Ninety-five waits cover 475 seconds: 55 seconds beyond
the maximum 420-second route-plus-first-quantum bound and beyond the maximum
390-second terminal-return bound. The evidence adapter still requires explicit
policy injection and has no permissive default.

Every accepted pc2 or tolerated post-cutoff generic receipt is rebound to the
current immutable atlas revision, exact fingerprint, node count, capacity
digest, canonical route, and assignment timeline. A terminal idle revision is
not sufficient by itself: the canonical natural or explicit-recall
return-complete time must be at or before the observation, and no receipt may
be future-dated. These checks apply equally to replay, recovery, status, and
authoritative evidence.

The generic worker reducer does not return its authoritative dispatch receipt
timestamp. A control read immediately after each dispatch therefore provides
only a later observation bound. The adapter's per-route
`gatheringElapsedMs` is the conservative lower bound from that observation to
the accepted gathering observation after subtracting reviewed travel time;
the pre-dispatch observation separately proves the strict upper window. This
brackets the true gathering interval inside the reviewed 60-to-120-second
window, but it is not relabeled as an exact reducer-receipt elapsed time. The
admin evidence procedure remains the only exact receipt-timestamp authority.
The caller-private runtime plan now includes the registered `notAfterMicros`.
The browser requires the pre-dispatch observation and every post-dispatch
observation to remain strictly before it, while each post-read brackets the
immediately preceding invocation.

The first dispatch invocation also creates an empty, branded recovery handle
inside a private `WeakMap`. It retains only recall keys for ordinals whose
dispatch invocation was actually attempted, exposes no dispatch method, and
survives poisoning or disposal of the original full plan. A failed main run is
permanently consumed. Recovery can then be clicked only in `required` or
`unconfirmed` state. Every click forces a new owner Quick Auth exchange,
verifies the same memory-latched subject and reviewed plan digest, and opens a
new player authority. A ten-second pre-read validates all four workers and the
exact reviewed routes: unattempted workers must be clean idle; attempted
workers may be clean idle, returning, outbound, or gathering. Only attempted
outbound/gathering workers may invoke the dedicated conditional-recall reducer.
The browser sends only the reviewed plan digest, evidence nonce, and ordinal;
the server derives the dispatch and recall keys, requires the exact canary
dispatch receipt, and atomically proves that its assignment, resource, and
site are still current before mutation. A later same-route assignment is
rejected, an exact recall receipt replays read-only, and an already-idle worker
does not acquire a no-op receipt. The browser also binds recovery to the exact
four immediate pre-dispatch worker revisions and rejects any state outside the
reviewed B-through-B+4 transition window. Returning and idle workers are not
mutated. A ten-second post-read must show every attempted worker returning or
clean idle and every unattempted worker clean idle. Exact post-state is
authoritative even if a reducer response was lost; failures stay `unconfirmed`
so the same idempotent recall keys can be tried again. Nothing is stored,
transferred, journaled, or handed to another browser realm.

Recovery opens a separately branded authority only after the forced fresh
same-subject verification. It cannot enter the evidence/dispatch surface and
never reuses or clears an ambiguously closed main authority. If main-authority
closure was unconfirmed, the in-page control stops using ordinal-specific
salvage and invokes the same atomic ordinal-`0` all-four recall-or-fence reducer
as reload recovery. That marker serializes against a late old dispatch and
permanently makes evidence impossible. Browser state can never become `safe` in
that page realm: the handle stays retryable and repeated admin inspection is
the only terminal-safety authority. If closure of the new recovery authority is
itself unconfirmed, browser recovery is permanently disabled and the state
remains `unconfirmed` for operator-only reconciliation.

A newly loaded page has a separate recovery-only control for loss of the
original page realm. Its nonce and reviewed-plan fields are uncontrolled DOM
inputs and are cleared synchronously before validation, authentication, or any
I/O. Selecting the control permanently excludes the main canary in both the
controller and runtime. Every attempt forces fresh Quick Auth. The controller
latches the first valid exchanged subject before its fallible verifier/open;
the runtime independently latches the first parsed subject before its fallible
connection open. Neither layer can subject-hop after a failed attempt. The
separately branded authority invokes only the conditional canary reducer with
ordinal `0`.

The server atomically preflights all four exact stored tuples. A fresh sweep
first inserts every missing recall-shaped position fence at that ordinal's
exact dispatch request key, then performs exact assignment-local containment
recalls, and inserts `pc2-f00` **last** at the same transaction timestamp as
durable proof that the sweep completed. A valid existing `pc2-f00` makes replay
strictly read-only: the reducer validates every dispatch/position/recall row and
never heals a missing or malformed position. Fence timestamps satisfy
`approvedAtMicros <= createdAtMicros <= observedAtMicros`; every position fence
has exactly the marker timestamp. With `k` actual dispatches, the reserved
canary receipt set is bounded by `5 + k <= 9`. Bounded, canonical generic rows
created after cutoff are validated separately and never authorize a canary
mutation or evidence. No browser read, generic recall, dispatch, evidence,
storage, URL, or cross-page handoff participates. Every fresh-page result
remains `unconfirmed`, even when the reducer and authority close both
acknowledge; only repeated read-only admin inspection can establish terminal
safety.

An approval is active on exactly the half-open interval
`approvedAtMicros <= now < notAfterMicros`. During that interval the central
gameplay-player gate blocks caller-triggered generic gameplay mutations for the
target FID. Exact canary dispatch/recovery reducers and scheduled worker
transitions use their narrower owner authority and remain available. At
`now == notAfterMicros`, new canary dispatch is unavailable and generic
gameplay resumes; exact idempotent read-only replay remains permitted. This
prevents legacy dispatch, generic recall/all, collection, Inner Keep, chat, or
another gameplay write from pruning or materializing the at-most-nine canary
receipts. The schedule wrapper boundedly drains at most the three newly due
transitions for the same assignment in one transaction, so an overdue canary
can move arrival, expiry, and return-complete to a stable graph without a
caller mutation.

Ordinary `recall_all_workers_v1` is the one intentionally permanent gameplay
restriction for the target FID: once a valid v2 approval registration exists,
it fails with `PRODUCTION_PLAYER_CANARY_RECALL_ALL_PERMANENTLY_BLOCKED` during
the approval window, at cutoff, after cutoff, and after `pc2-f00`, including an
otherwise exact replay. Its workerless receipt cannot prove per-assignment
lineage. Ordinary per-worker recall remains available after cutoff and is
validated against its exact assignment. Other FIDs are unaffected. A malformed
registration is `STATE_INTEGRITY`, and historical recall-all rows are retained
but any one created at or after registration is invalid recovery topology.

The core 64-row Worker receipt maintenance boundary never prunes a `pc1-` or
`pc2-` request and never prunes an ordinary receipt correlated to a currently
active assignment. Once `pc2-f00` exists, it also retains every
assignment-correlated generic receipt, including a journey that completed
after the marker, because those rows are durable replay lineage for the marker
snapshot. Only the oldest uncorrelated ordinary row is eligible for eviction.
If no such row exists, the incoming Worker command fails before any receipt is
deleted or inserted.

Ordinal-`0` containment, and ordinal-specific recovery at or after cutoff,
uses a narrowly scoped assignment-local safety path. It rederives the exact
owner, baseline, approval, route, dispatch receipt, assignment, and whole-roster
graph, but intentionally remains available after the normal worker gameplay
gate is disabled or rolled back. It never settles the whole FID, shared passive
resources, or unrelated assignments. The selected canary preserves already
materialized value and forfeits at most its one unmaterialized canary quantum
before returning, leaving no latent credit. Pre-cutoff ordinal-specific recall
continues to use the ordinary gameplay-gated, evidence-preserving settlement
path. This carve-out is not available to generic worker commands.

Version 2 is a migration hard stop, not an in-place reinterpretation. Before
any module or live activation, the target FID must have no v1 approval
registration, canary receipt, assignment, occupation, or schedule. A pristine,
coherent stored baseline may be reused only with a newly coherent v2 approval.
A stale v1 registration fails closed. Immediately before a NEW registration
insert, the server rechecks the current founder/world/resource authority, four
idle revision-`0` workers, and zero assignment/occupation/schedule/receipt
graph against the stored baseline. Exact registration replay returns before
that mutable-state check. The first pc2 mutation repeats the whole
nonce-independent pristine check; every later NEW ordinal independently proves
its selected route is still idle revision/timeline `0` with an empty graph.
Fresh ordinal-`0` recovery applies the same rule to every undispatched,
non-later route before it can write a position fence or `pc2-f00`.

Every registration-present write gate, pc2 NEW/replay classifier, recovery
pass, and status inspection performs the same nonce-independent stored-authority
audit first. All four baseline and eight approval unique-index projections must
resolve to their exact complete immutable rows; baseline scalar/digest shapes,
pristine genesis balances and chronology, approval commitment material, and
capture/approval/observation ordering must agree. This audit intentionally
cannot recompute the nonce-framed server baseline commitment because the raw
private evidence nonce is not persisted. The raw-nonce final-evidence path
retains that stronger recomputation; no runtime or generic write gate infers it.

Hermes has a separate read-only
`admin_get_production_player_canary_recovery_status_v1` procedure and repeatable
operator `inspect-recovery` command. Its input is only the private FID, reviewed
plan digest, and evidence nonce. Its aggregate reports commitments, approval
expiry and observation time, exact dispatch/correlated/no-op/unexpected receipt
counts, four worker-state counts, assignment/occupation/schedule counts,
terminal safety, structural candidacy, and one of `recall-required`,
`return-in-progress`, `terminal-evidence-candidate`, or
`terminal-evidence-impossible`. Inspection never advances or creates the
operator journal and never calls a mutation. Structural candidacy is false at
or after `notAfterMicros` even when the graph is terminally safe, so expired
safety maps to `terminal-evidence-impossible`. Structural candidacy is
diagnostic only; the full
admin evidence procedure and protected receipt remain the sole evidence and
release authority.
Each dispatch-position fence and the deterministic global marker is counted in
the existing no-op recall count (at most five total). Their presence makes full
evidence candidacy impossible while leaving terminal safety independently
reportable. A valid nonzero no-op count includes the completed global sweep
marker, so `terminal-evidence-impossible` after that sweep is terminal guidance
for the canary recovery operation even when a validated later, unrelated
post-cutoff assignment is still outbound, gathering, or returning. Do not loop
ordinal-0 canary recovery in that state. Let the unrelated assignment finish or
use normal owner controls; repeat the read-only admin inspection afterward.

The checked-in `loadOwnerCanaryProductionRuntime` still deliberately returns
`null`, including for exact canonical configuration. The exact poll policy,
fresh branded subject verifier, approval cutoff, dispatch brackets,
recall-only recovery, and in-process acknowledgement now exist as inert source,
but the loader does not import or compose them. The protected predecessor must
merge first, then the combined source and closure must be independently audited
and refrozen. The in-process `acceptSanitizedEvidence` callback is only a
non-authoritative UX acknowledgement. It is not a journal, receipt, C7 input,
file writer, browser transfer, or network receiver. Failure remains ambiguous
and permanently blocks another main run in that page realm; browser evidence
never authorizes release.

## Owner-private manual launch packet

`scripts/production-player-canary-browser-launcher.mjs` is the local,
owner-private one-command packet writer and inspector. It accepts only an
absolute destination inside an existing current-user-owned directory whose
exact mode is `0700`. `write` creates a new regular file without following
links or overwriting a path, verifies one link and current-user ownership, and
fixes and verifies exact mode `0600`. `inspect` reopens without following links
and accepts only canonical UTF-8 JSON bytes with these three keys in this exact
order:

```json
{
  "evidenceNonce": "<64 lowercase hex>",
  "reviewedAdmissionPlanDigest": "<64 lowercase hex>",
  "routeSetCommitment": "<64 lowercase hex>"
}
```

The write command reads those three values from bounded standard input and
prints only a fixed success token, never a value or path. Example shape (do not
put live values in shell history) is:

```text
node scripts/production-player-canary-browser-launcher.mjs write /absolute/owner-only/directory/launch.json
```

The human inspects that file locally and manually enters the three values into
the already-clearing owner UI. There is intentionally no automated browser
launch or local-to-browser transfer and no POST, download, clipboard, storage,
file picker, `postMessage`, journal, or receipt path. Browser-to-local handoff
remains only the in-process non-authoritative acknowledgement described above.
Delete the packet through the owner's separately reviewed local retention
procedure after the run; this source slice does not invent one.

The launcher and evidence adapter are prepared-deploy closure graph
roots/security inputs. Their final manifest and protected-workflow pins are
refrozen only on the protected true merge that contains the predecessor
recovery correction.

## Final activation-request launcher

`scripts/production-player-canary-activation-launcher.mjs` is source-only in
this lane. Its separate execution performs no network call, deploy, activation,
or journal advance; its only mutation is publication of the fixed activation
request through the existing no-clobber writer. Merging this source does not
create that request, dispatch B0, invoke the private Pages deploy, mutate
Cloudflare, activate the player loader, or enable world presentation. The
ordinary protected closed-review `workflow_run` may still build, deploy, and
verify-live the inert Pages source after merge. The corrected recovery plus B0
closure has 382 members. The executable activation launcher and its declaration
originally filled the final two slots. Reload safety keeps the activation,
browser, and release-binding declaration files checked in and typechecked but
removes those three non-executable type-only paths from the production closure.
It protects executable `spacetimedb/src/auth.ts`,
`spacetimedb/src/castleWorkerAuthority.ts`, and
`spacetimedb/src/greaterRealmWorkerAuthority.ts` in their place. The matching
activation-launcher, browser-launcher, and release-binding runtime `.mjs` files
all remain protected. The closure therefore stays exact at 384 of 384 with no
spare slot. A later loader activation must modify only already-protected
members. Do not add another graph root or declaration.

Execution is a separate reviewed boundary. It requires all of the following:

- the protected C6 commit and tree containing the completed live canary;
- the C6 operator journal ending at exactly `receipt-installed`, with no active
  lock, temporary, unrelated operation, or later phase;
- exactly one settled, canonical owner-private canary receipt matching that
  journal, plan, claim, approval, baseline, route, command, registration, C6
  source, and live-root authority;
- the exact reviewed C7 candidate checked out at its supplied commit and tree,
  with only the fixed 18-path activation transition; and
- the separately reviewed player loader activation needed to have completed
  the live canary. Browser UI or sanitized browser evidence is never input or
  release authority.

The only command is literal `write`. It accepts no path, secret, identity,
repository, receipt directory, URL, or run-all selector in arguments or
environment. Standard input must already be a current-user-owned, one-link
regular file at exact mode `0600`, at most 32 KiB, containing this exact
pretty-printed canonical JSON shape and one final LF:

```json
{
  "schemaVersion": 1,
  "profile": "warpkeep-production-player-canary-activation-launcher-v1",
  "operatorOperationId": "<32 lowercase hex>",
  "candidatePagesSourceTree": "<40 lowercase hex>",
  "request": {
    "schemaVersion": 1,
    "profile": "warpkeep-production-player-canary-deploy-authority-v1",
    "candidatePagesSourceCommit": "<reviewed C7 commit>",
    "predecessorPagesSourceCommit": "<protected C6 commit>",
    "predecessorProtectedTree": "<protected C6 tree>",
    "productionPlayerCanaryReceiptDigest": "<64 lowercase hex>",
    "founderPlanDirectory": "<journal-bound absolute owner-private directory>",
    "reviewedAdmissionPlanReference": {
      "filename": "<journal-bound canonical JSON filename>",
      "sha256": "<64 lowercase hex>"
    },
    "ownerApprovalDirectory": "<journal-bound absolute owner-private directory>",
    "ownerApprovalReference": {
      "filename": "<journal-bound canonical JSON filename>",
      "sha256": "<64 lowercase hex>"
    }
  }
}
```

Run it only from the exact reviewed checkout, redirecting the already-created
owner-private file to standard input so its path does not become launcher
authority:

```text
node scripts/production-player-canary-activation-launcher.mjs write < /absolute/owner-private/activation-launch-v1.json
```

The launcher performs all source, closure, journal, receipt, plan, approval,
and publication-conflict checks read-only before its sole call to the existing
no-clobber activation-request writer. Success prints exactly the lowercase
SHA-256 digest of the canonical installed request plus LF. It prints no path,
secret, identity, receipt content, or browser evidence. The writer uses an
owner-only `0600` exclusive temporary, fsync, no-clobber hard link, directory
fsync, temporary unlink, and final directory fsync. A byte-identical retry
returns the same digest without replacing the destination; an exact pre-link
or post-link crash temporary is recoverable. A different destination,
temporary, hard link, reference, receipt, source, or closure is preserved and
fails closed before a known mismatch write. If stdout is lost after successful
publication, rerun only the exact same canonical input and compare the returned
digest; never synthesize a new request or infer success from browser UX.

The manifest and all three protected-workflow pin sets are refrozen at exactly
384 members on the protected true merge of PR205. Preserve that exact source
and obtain an independent audit before any execution.

## Approved Mini App reachability

A normal browser tab cannot run this page: the controller requires the SDK to
confirm a real Mini App host before it loads the production runtime. Once the
entry and runtime have separately passed deployment review, the owner must
reach it by exactly one of these reviewed mechanisms:

- open the logged-in desktop Farcaster Mini App Debug Tool and preview the
  exact URL `https://warpkeep.com/owner-canary/?miniApp=true`; or
- use the exact published Warpkeep Farcaster universal link with the
  `/owner-canary/` subpath, but only after the app ID/slug and resulting full
  link have been independently resolved from the official published app and
  recorded in the private operation plan. Do not add a `miniApp` parameter to
  the universal link: Farcaster appends its parameters to the published
  `homeUrl`, which already carries the hint. The observed resolved target must
  contain exactly one literal `miniApp=true` value and may not omit,
  duplicate, encode, or rewrite that hint.

Do not infer an app ID or slug, open the URL in an ordinary browser tab, add
discovery metadata to this document, or send the URL through an arbitrary
shared embed/preview service. Before entering any private value or granting
stage consent, confirm that the host reports the published Warpkeep Mini App
and the address is the exact canonical HTTPS subpath with exactly one literal
`miniApp=true` query value. The document's canonical metadata deliberately
remains the query-free base URL; it is not an authorized launch URL.

## Bridge secret and deployment blocker

`PLAYER_CANARY_OWNER_FID` is optional and managed-secret-only. If it is absent,
the endpoint returns generic `503 player_canary_unavailable` before verifier or
database work. If present, it must be one exact canonical positive safe-integer
decimal FID; whitespace, leading zeroes, and unsafe integers invalidate the
entire bridge configuration. Its value is excluded from response identity,
cookies, logs, configuration attestations, and release attestations.

The protected Cloudflare deployment currently recognizes exactly six secret
bindings. Its metadata uses `keep_bindings: ["secret_text", "secret_key"]`,
which preserves existing bindings but provides no reviewed creation path for a
new one. Do not deploy this bridge source until the deployment lane has an
audited transition that:

- accepts exactly the existing six names plus `PLAYER_CANARY_OWNER_FID`;
- stages the seventh value through a private managed-secret channel, never a
  repository variable, source file, output, receipt, shell argument, or log;
- proves the uploaded Worker sees all seven exact `secret_text` bindings;
- preserves the other six values unchanged and fails closed on ambiguity;
- records only the binding name/state, never the FID value; and
- has green recovery tests for interruption before and after secret staging.

## Required owner approvals

Separate explicit approval is required for each production-changing boundary:

- stage, replace, or remove `PLAYER_CANARY_OWNER_FID`;
- deploy/release the changed bridge and Pages artifacts;
- connect the live-v17 player runtime and private verifier handoff; and
- begin the canary that mutates the already-admitted live player, worker, and
  resource state.

No token file, browser session export, owner FID disclosure, realm presentation
enablement, admin impersonation, notification bypass, commit, push, protected
ref update, or production call is part of this source change.
