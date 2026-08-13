# Greater Realm production cutover

This runbook describes the guarded tooling for the additive v14-to-v17 cutover. It does not authorize a release. The checked-in entry agreement is review-only and the publisher, import, activation, browser, server-presentation, and notification gates remain false. The commands therefore fail before a production read or write until separate reviewed release changes approve the relevant lane.

## Immutable boundary

- Maincloud URI: `https://maincloud.spacetimedb.com`
- Database identity: `c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e`
- Publish deletion policy: `never`
- Predecessor: exact active v14, 56 tables
- Candidate: exact additive v17, 84 tables; all 56 predecessor signatures unchanged
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
| `append-inert-v17` | v14/56 → v17/84, `-- → FF` | no v17 release |
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
candidate-approved inert append, exact import-only `TF`, exact activation-only
`FT`, client presentation, and then a three-step notification release. The first
notification step is Pages-only (`Pages=true`, `Hermes=false`) and requires the
short-lived prepared bridge receipt. Only after its live postflight installs a
durable chain root may a second, Hermes-inert source clear prepared/private
bindings and populate that root. This `notification-pages-rooted-inert` phase
retains `Pages=true`, `Hermes=false`. A third projection-only source may then
change Hermes `false` to `true` without changing the root; that durable-final
phase forbids prepared authority and requires the checked-in live root.
`TT`, partial approval pairs, Hermes-before-live-Pages, notification-before-
client, and every unenumerated combination fail. Client activation remains a
separate release and must not be coupled to server publication.

### Private Pages authority and recovery

Before installed packages or private files can load, a low-privilege job on
that runner installs the frozen, script-disabled auth-bridge resolver tree.
The privileged job must land on the same runner identity and performs the
builtins-only source-closure attestation, complete resolver/toolchain
attestation, then source-closure attestation again before dynamically importing
the operator. A runner mismatch, source change, resolver extra/missing byte, or
dangerous Node/shell override stops before private input or network access.

The one-time activation source names three exact owner-private inputs: the
active-v17 evidence digest, the forward-activation publish-receipt digest, and
the reviewed founder count. The prepared binding separately names the exact
bridge-prepared receipt and bridge source commit. The operator derives every
filename from these checked-in digests under fixed owner-private directories.
It requires no-follow stable descriptors, owner-only `0600` files, one link,
bounded size, and exact content digests. It compares the publish lane, verified
outcome, same-schema 84-to-84 policy, mutation flags, active state, canonical
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
before deployment.

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
workflow, source, job, successful marker step, and immediately following deploy
step as `completed/skipped`. A missing step or a `cancelled`, `failure`,
`timed_out`, running, or otherwise uncertain deploy conclusion stays blocked.

Completed histories compact crash-safely to one immutable terminal. Proven
skips compact to one superseding abandonment checkpoint per operation, so
repeated recovery and receipt generation 255 remain reachable. Preserve the journal at
`~/.warpkeep/private/production-admin-v1/notification-pages-private-deploy-journal-v1`;
do not edit or delete its owner-only `0600` records, checkpoints, or terminals.

## Receipts and recovery

Publish, import, and relocation share one owner-only no-clobber lock and receipt directory at `~/.warpkeep/private/greater-realm-cutover-receipts` by default. The directory must be outside the repository, mode `0700`, dedicated to these receipts, and free of symlinks; receipts are mode `0600`, canonical, bounded to 64 KiB, and contain no actor, subject, FID, castle, cell, slot, node, secret, token, or credential field.

Do not delete data, edit a receipt, or rerun a write merely because the command returned an error. For a publish or reducer outcome marked ambiguous, stop all later lanes, run the relevant read-only inspection with a fresh credential, compare the schema/status digest, full immutable atlas-release tuple, module commit, and audit delta, and preserve both terminal output and the last receipt. Escalate any schema growth, phase drift, target mismatch, status disagreement, missing postflight, or unexpected aggregate change as a release blocker.
