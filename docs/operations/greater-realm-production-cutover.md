# Greater Realm production cutover

> **SUPERSEDED — DO NOT EXECUTE AS WRITTEN.** This historical v14-to-v17 plan
> targeted Genesis 001. The owner-approved 0.4.0 release instead preserves the
> exact frozen same-schema Genesis 001 0.3.43 module and places the selected
> Greater Realm atlas in a fresh, private Genesis 002 database with zero
> population and activation/presentation disabled. The repository's current
> 86-table/future module must never be published to the Genesis 001 identity.
> Only the exact reviewed frozen 2ae same-schema lane may target G001. Future
> G002 admission, activation, or presentation requires a fresh reviewed release
> plan. Preserve the historical detail below for audit only; its production
> aliases remain refusal-only. The direct legacy G001 publisher, import/apply
> and recovery, relocation, activation, and cutover CLI mutations are also
> source-sealed before private-workspace inspection, credentials, network, or
> writes; the historical launch envelope enforces the same refusal. Only
> explicitly read-only inspection remains available.

This runbook describes the guarded tooling for the additive v14-to-v17 cutover. It does not authorize a release. The checked-in V4 entry agreement is the exact production-approved bundle, while the publisher, import, activation, browser, server-presentation, and notification feature gates remain false. The commands therefore fail before a production read or write until separate reviewed release changes approve the relevant lane; agreement selection alone approves none of those lanes.

## Immutable boundary

- Maincloud URI: `https://maincloud.spacetimedb.com`
- Database identity: `c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e`
- Publish deletion policy: `never`
- Predecessor: exact active v14, 56 tables
- Candidate: exact 86-table current candidate (frozen v17 prefix plus private canary refs 84–85); all 56 predecessor signatures unchanged
- Runtime capacity: 600 castles, six regions, 600 active slots, and 12,000 active resource nodes

No alias, target override, environment-carried administrator secret, destructive publish, or unknown status field is accepted. The reviewed launch envelope receives only the canonical absolute path of an owner-private administrator-secret file. The commit-bound operator opens that file with the exact no-follow, owner, mode, link-count, size, and descriptor/path identity checks only after local provenance, artifact, plan, and operator-lock checks. Git, dependency, proof, and publish-preparation children never inherit the secret bytes or descriptor.

The local repository must be the exact clean protected `main` commit and equal the canonical origin's current `refs/heads/main`. That branch, HEAD, configured and resolved origin, remote ref, and clean-tree proof all use the pinned trusted Git runner with inherited path, configuration, hook, fsmonitor, and replace-object controls removed. The pinned SpacetimeDB CLI and current additive migration proof are re-attested before publication. Runtime-release provenance has two deliberately separate identities:

- `atlasSourceCommit` is the immutable generation commit recorded by the verified private runtime release. The selected artifact is identified by the full tuple `{atlasSourceCommit, atlasId, publicReleaseId, expectedReleaseSha256}`; a source commit alone is not unique because different release seeds can produce different public releases.
- `moduleSourceCommit` is the independently attested protected-`main` commit containing the server module being operated.

Trusted Git must prove both commits exist in the canonical repository and `atlasSourceCommit` is an ancestor of `moduleSourceCommit`, with repository/environment replacement controls disabled. Release sequencing is generation/review first, then one candidate-specific inert-append approval commit. For `append-inert-v17`, the atlas-to-module diff may change only `scripts/greater-realm-production-publisher-core.ts`, and byte-normalization of exactly `entryAgreementApproved` plus `additivePublishApproved` from `false` to `true` must recreate the atlas source; every other approval remains false and no server or unrelated path may differ. The first import-enable publication permits exactly the import gate plus the cumulative entry/additive/import-forward approval literals; activation handoff permits exactly the activation gate plus the cumulative entry/additive/activation-forward literals. Normalizing those exact changes must recreate the atlas source in each case. Reviewed same-schema forward-fix lanes may use a later descendant module commit, but never a different selected artifact tuple.

## Publication lanes

`F` and `T` below are the compiled import/activation mutation gates, in that order. `TT` is never an accepted checkpoint.

| Lane | Exact transition | Required database phase |
| --- | --- | --- |
| `append-inert-v17` | v14/56 → current candidate/86, `-- → FF` | no v17 release |
| `enable-import-only-v17` | `FF → TF` | no v17 release |
| `forward-import-importing-v17` | `TF → TF` | importing |
| `forward-import-ready-v17` | `TF → TF` | verified ready |
| `handoff-activation-ready-v17` | `TF → FT` | verified ready, activation absent |
| `forward-activation-ready-v17` | `FT → FT` | verified ready, activation absent |
| `forward-activation-{prepared,draining,frozen,planned}-v17` | `FT → FT` | exact named private phase; public roots absent |
| `forward-activation-canary-v17` | `FT → FT` | exact canary graph and roots |
| `forward-activation-active-v17` | `FT → FT` | exact active graph and roots |
| `forward-activation-halted-v17` | `FT → FT` | exact halted phase/root contract |
| `forward-activation-rolled-back-v17` | `FT → FT` | ready release, rolled-back activation, roots absent |

The append/import/ready lanes retain the existing legacy production aggregate preflight. Every post-import publisher checkpoint also binds the full selected artifact tuple. Post-relocation canary, active, and halted forward fixes use the frozen 137-field cutover status instead: legacy claims and occupied legacy tiles are intentionally zero after relocation, so the legacy ≤100 topology verifier must not be weakened or misapplied there. The parser's exact field set is synchronized to the final 137-field core ABI and rejects additions, removals, or type drift.

The generic publisher still marks protocol v17 review-only. This cutover tooling uses its bounded low-level `publishModule` primitive only after its own composite lane approvals, exact schema proofs, state-before-write check, shared operator lock, and post-publication reconciliation all pass. Any change to `scripts/atlas/**` would alter candidate provenance; this tooling makes no such change.

Every publisher lane attempts `publishModule` exactly once. Success and submission error both invalidate the pre-publish websocket before postflight, so reconciliation uses one newly authenticated session connection and never races a delayed disconnect signal. Historical preflight and postflight inspections share those sessions; the complete lane needs two bridge-token requests, below the six-per-five-minute limit.

Publication is available only through the exact `publish` row of the reviewed
[production launch envelope](./greater-realm-production-launch-envelope.sh.txt).
That row binds the protected commit/tree/bootstrap approvals, pinned Node and
SpacetimeDB CLI identities, owner-private administrator and Maincloud CLI
credential paths, four reviewed aggregate counts, and the selected lane before
the commit-bound operator may run. The `stdb:greater-realm:publish` npm alias is
an intentional refusal stub during the cutover and must never be used as a
fallback.

## Runtime-release import

Inspection, confirmed apply, recovery inspection, and confirmed recovery are
available only through their exact import rows in the reviewed
[production launch envelope](./greater-realm-production-launch-envelope.sh.txt).
The import npm aliases are intentional refusal stubs. Recovery inspection is a
local authority read and opens no credential; confirmed recovery opens an
administrator secret only if the freshly re-inspected recovery mode actually
requires an authenticated journal resume.

Every operation reads both the bounded import status and the full cutover status as independent procedure transactions on one owner-scoped, serialized administrator session. The frozen generated cutover procedure wire name is `admin_get_greater_realm_cutover_status_v_1`; the nine reducer wires retain their `_v1` spelling. The session reuses one bridge token/connection, rotates before 180 seconds, enforces the bridge's six-token-per-five-minute budget locally, and disconnects and clears its references in `finally`. The two projections must agree, and the latter must bind the exact selected artifact tuple, canonical header SHA-256, epoch, totals, cursors, and counts. Import receipts label both `atlasSourceCommit` and `moduleSourceCommit`; they are never equated after the inert append. Batches are manifest-derived and bounded to 128 components, six regions, one immutable chunk payload, or 256 verification rows. The driver is capped at 4,096 submitted operations.

Each write has an immediate status read before and after it. A submission error invalidates the session connection but is never retried: the driver's explicit post-error status reconciliation may obtain one replacement connection and must prove that authority advanced. If post-status is unavailable, the result is ambiguous and the operator stops. Resume only after a fresh inspect; never manually advance a cursor or restage a different artifact.

Ready means import enabled, activation disabled, full verification complete, exact imported counts, and no claims, occupancy, activation row, public atlas/region roots, or v2 Worker root.

## Relocation phases

Run one explicit phase at a time through the exact relocation row in the
reviewed
[production launch envelope](./greater-realm-production-launch-envelope.sh.txt),
then inspect and archive the receipt before proceeding. The relocation npm
alias is an intentional refusal stub. The same envelope provides local recovery
inspection and digest-confirmed recovery; it never falls back to direct `tsx`
or a mutable worktree.

The forward sequence is `prepare → begin-drain → freeze → plan → canary → commit`. `halt` is available from a nonterminal phase, `resume` only from halted-after-active, and `rollback` only before the first active commit while rollback remains eligible. Repeat the command form above for the selected phase.

Each reducer has zero arguments. The operator performs two equal pre-write status reads and one post-write read, binds the stored full artifact tuple to the selected verified runtime release, independently records the protected-`main` module commit, rejects all unknown fields, and reconciles a lost response only when the exact target phase is visible. Founder population must not change. Every real phase transition must append exactly one on-server `adminAudit` row; an already-satisfied retry submits nothing and leaves `auditRows` unchanged. The before/after counts and exact delta are included in the receipt and status digest.

After canary, require zero legacy claims/occupied tiles; v17 claims and occupancy equal current founders; all six region counts sum to founders with no unassigned founder; and active slots/resources equal 600/12,000. `commit` makes rollback permanently ineligible. A halt after commit is resumable; it is not rollback.

## Production verification and Pages

The legacy production verifier remains capped at 100 founders. The additive
v17 verifier uses the administrator cutover projection and independently
accepts an explicit expected count from 1 through 600. It is available only
through the exact verifier row in the reviewed
[production launch envelope](./greater-realm-production-launch-envelope.sh.txt);
the `verify:greater-realm-production` npm alias is an intentional refusal stub.

It requires the exact active release/activation/atlas/v2-Worker graph, full selected artifact tuple, independently attested module commit, imported static counts, legacy evacuation, population/account/worker aggregates, relocation-versus-founded split, region distribution, and matching v1/v2 roster digests. Admission must be open below 600 and closed at 600.

After active verification, the exact `pages-active-evidence` envelope row
repeats the same authenticated check in process and durably installs a
content-addressed, owner-only `0600` handoff record. Its sole command argument
is the reviewed founder count (`1..600`), its freshness window is fixed at 24
hours, and terminal output contains only the record filename, SHA-256, bounded
timestamps, and capacity state. It accepts no notification credential, private
input, SpacetimeDB CLI path, mutable target, or direct npm/`tsx` fallback.

Pages continues to run the unchanged read-only legacy live verifier while its
notification presentation literal is false. The deploy workflow classifies
only the exact checked-in closed-review, generation-zero, or durable state; a
repository variable or secret never selects that lane. Closed review retains
the hosted build/deploy/postflight. Notification-enabled candidates build on
the hosted runner but deploy only on the persistent repository-exclusive production-admin runner
carrying the fixed labels `self-hosted`, `macOS`, `ARM64`,
`warpkeep-production-admin`, and `warpkeep-repository-exclusive`. CI runs
the source-only Pages build validator before build to accept only an explicitly
enumerated safe release phase. Hosted build performs no owner-private receipt
read or live bridge fetch. The current tree must be the closed-review
phase. Later envelopes permit production-approved pre-generation,
candidate-approved inert append, exact import-only `TF`, and exact
activation-only `FT`, followed by a three-step notification release that keeps
the world client/server gates false and the release identity at `0.3.43`. The
first notification step is Pages-only (`Pages=true`, `Hermes=false`) and
requires the short-lived prepared bridge receipt. Only after its live
postflight installs a durable chain root may a second, Hermes-inert source clear
prepared/private bindings and populate that root. This
`notification-pages-rooted-inert` phase retains `Pages=true`, `Hermes=false`.
A third projection-only source may then change Hermes `false` to `true` without
changing the root; that `notification-durable-final` phase forbids prepared
authority and still retains the inert `0.3.43` world presentation.

Only a later `activation-client` successor may atomically move the package and
Mini App identity to `0.4.0`, change downstream client approval false → true,
and change both client/server presentation gates false → true. It requires the
unchanged durable Pages root, Hermes already true in its predecessor, and a
checked-in content-addressed production-player-canary binding whose owner-only
receipt is authenticated before deployment network access. Partial approval
pairs, Hermes-before-live-Pages, active world presentation before durable
Hermes/canary proof, and every unenumerated combination fail. This final
presentation activation remains a separate successor to the earlier server
module publication; it does not redefine the C0-C3 rollout.

The hosted closed-review deployment job is a fresh checkout and does not reuse
the build job's dependency tree. Before its last release-gate check it installs
the exact root lock with lifecycle scripts, audit requests, and funding requests
disabled under umask `0022`. A dedicated builtins-only boundary then uses the
reviewed Greater Realm bootstrap to install and attest exactly the `yaml` and
`typescript` resolver links (including the runner's exact native TypeScript
package), imports and calls the release verifier literally, and always repeats
both resolver and clean-source attestation afterward. A missing, redirected,
polluted, or changed resolver stops before the Pages deployment action.

The bridge-prepared workflow receives the canary owner FID only as the
protected environment secret `WARPKEEP_PLAYER_CANARY_OWNER_FID`; this is
distinct from the Cloudflare binding name `PLAYER_CANARY_OWNER_FID`. The
entrypoint validates a canonical positive safe-integer FID and removes the
environment entry with the other credentials before runtime imports. Its
append-only v3 journal records the exact deployed predecessor deployment/version
pair but never the FID value. The reviewed path requires the predecessor already have migration
tag `v5`, the exact same reviewed version-specific module source digest, runtime
compatibility, plain-text and Durable Object bindings (including reviewed
namespace IDs), and exactly the
six established secret bindings. B0 must separately deploy that exact reviewed
source/configuration at `v5` with those six secrets; a migration-tag-only update
is insufficient. A `v4` predecessor stops for that separately reviewed B0
prerequisite. The nondeploying version-upload multipart retains exactly
`keep_bindings: ["secret_text", "secret_key"]`, contains no `inherit`
descriptors, and adds only one explicit `secret_text` binding,
`PLAYER_CANARY_OWNER_FID`. Before the operation enters its upload boundary, the
latest uploaded version must be the exact fully attested live six-secret B0
predecessor. The workflow repeats both the live-predecessor attestation and the
unfiltered latest-upload identity check immediately before the single Versions
API POST under the repository-exclusive writer lane. Any newer upload observed
by that final check stops the operation before mutation. Cloudflare offers no
conditional predecessor token for this POST, so operators must also exclude
dashboard, API, Wrangler, and other out-of-band Worker uploads until candidate
reconciliation completes. Candidate inspection then proves exactly
seven secrets, the reviewed source, and an immutable version number exactly one
greater than the predecessor. Reconciliation is authorized only in the same
runtime immediately after its sole POST. A fresh run seeing bare
`upload-invoked` or terminal upload adjudication performs zero provider I/O and
requires operator adjudication; it cannot adopt or release a candidate. In the
authorized path, the candidate must remain the unfiltered latest version in the final provider read before release. Before that final
read and the sole deployment POST, the exact six-secret predecessor is
re-attested again. The
workflow never calls the legacy Worker `/secrets` PUT or DELETE endpoints, and
same-runtime ambiguity reconciliation performs no second upload or cleanup
mutation. No FID value appears in argv,
terminal output, artifacts, checked-in variables, receipts, or journal records.
Runtime exports are attested exactly whenever the official version-detail API
returns them. If the API omits exports, the fallback is the exact metadata,
annotations, script/etag/`fetch`/API deployment source, all 22 named class
handlers, independently verified module digest, `v5` runtime, and exact raw
bindings with namespace IDs; null or partial exports are never equivalent.
Retain the undeployed `dfa24a4` version 47 and its `upload-invoked` journal as
evidence. It must not be retried, adopted, deleted, or manually released. Only
a new reviewed protected-main successor with a distinct source tag and journal
operation may continue, and its reconciler must ignore the retained candidate.

### Private Pages authority and recovery

Before installed packages or private files can load, a low-privilege job on
that runner installs the frozen, script-disabled auth-bridge resolver tree.
The privileged job must land on the same runner identity and performs the
builtins-only source-closure attestation, complete resolver/toolchain
attestation, then source-closure attestation again before dynamically importing
the operator. A runner mismatch, source change, resolver extra/missing byte, or
dangerous Node/shell override stops before private input or network access.

The one-time notification generation-zero source names three exact
owner-private inputs: the
active-v17 evidence digest, the forward-activation publish-receipt digest, and
the reviewed founder count. The prepared binding separately names the exact
bridge-prepared receipt and bridge source commit. The operator derives every
filename from these checked-in digests under fixed owner-private directories.
It requires no-follow stable descriptors, owner-only `0600` files, one link,
bounded size, and exact content digests. It compares the publish lane, verified
outcome, same-schema 86-to-86 policy, mutation flags, active state, canonical
target, source-release tuple, founder count, and evidence target before the
handoff module performs full canonical, freshness, ordering, Git-provenance,
and live-bridge validation. The operator's dependency-bearing, source-attested
phase parses the active evidence and deployed-module receipt as inert canonical
JSON and rechecks their complete release tuple before handing bytes to the
cryptographic handoff module.

Provision the 32-byte base64url handoff key once as mode `0600` at this fixed
path. Never put it or its path in argv, environment, output, logs, or artifacts:

`~/.warpkeep/private/production-admin-v1/notification-pages-private-handoffs-v1/notification-pages-private-handoff-key-v1.txt`

For generation zero, the operator encrypts a handoff in process for the exact
workflow run, attempt, Pages source, founder count, and input digests. It
durably journals only non-secret expectations. Ordinary later Pages releases
use only the checked-in permanent root: the receipt module writes a durable
predecessor claim and candidate authority, and the journal retains its digest
before deployment. The final activation-client candidate additionally names
the exact C6/Hermes-final predecessor through the production-player-canary
binding. Its private canary receipt must match that predecessor, its durable
Pages/Hermes authorities, and the normal admitted-owner exactly-once evidence;
the operator authenticates this source-bound authority before any live fetch or
deployment attempt.

Immediately before deployment, the workflow proves via GitHub API that `main`
is protected and still names the candidate, the exact Verify run/attempt
completed successfully for a main push, and the exact deploy workflow
run/attempt is in progress in the canonical repository. It reattests the
private handoff or durable candidate authority, repeats the protected-main/run
check, and writes the append-only `deploy-invoked` marker immediately before
the Pages action. After that marker, a different live build can be CDN lag or
an ambiguous successful deployment, so no retry may invoke Pages again. The
`always()` postflight polls the receipt module's exact semantic source
reconciler and installs generation zero or promotes the retained successor
digest. A final step refuses workflow success unless an attempted deployment
completed its durable postflight.

If a process dies after deployment, rerun the same verified source.
Exact-current skips deployment and replays the idempotent receipt operation.
Generation-zero recovery retains the original run-bound expectations and can
return an installed root even after handoff/key deletion or expiry. A stale or
ambiguous response after `deploy-invoked` is an adjudication stop, never
permission for a second deploy. If the process dies after the marker but before
the Pages action begins, a later private run may retire that marker only when
the attempt-specific GitHub Actions API authenticates the exact repository,
workflow, source, job, locally fsynced marker step, and immediately following
deploy step as `completed/skipped`. The marker step may itself end as success,
failure, or cancelled after that fsync; the local marker and skipped deploy are
both required. A missing step or a `cancelled`, `failure`, `timed_out`, running,
or otherwise uncertain deploy conclusion stays blocked.

Completed histories compact crash-safely to one immutable terminal. Proven
skips compact to one superseding abandonment checkpoint per operation, so
repeated recovery and receipt generation 255 remain reachable. Preserve the journal at
`~/.warpkeep/private/production-admin-v1/notification-pages-private-deploy-journal-v1`;
do not edit or delete its owner-only `0600` records, checkpoints, or terminals.

## Receipts and recovery

Publish, import, and relocation share one owner-only no-clobber lock and receipt directory at `~/.warpkeep/private/production-admin-v1/greater-realm-cutover-receipts` by default. The directory must be outside the repository, mode `0700`, dedicated to these receipts, and free of symlinks; receipts are mode `0600`, canonical, bounded to 64 KiB, and contain no actor, subject, FID, castle, cell, slot, node, secret, token, or credential field.

Do not delete data, edit a receipt, or rerun a write merely because the command returned an error. For a publish or reducer outcome marked ambiguous, stop all later lanes, run the relevant read-only inspection with a fresh credential, compare the schema/status digest, full immutable atlas-release tuple, module commit, and audit delta, and preserve both terminal output and the last receipt. Escalate any schema growth, phase drift, target mismatch, status disagreement, missing postflight, or unexpected aggregate change as a release blocker.
