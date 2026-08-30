# Genesis 002 sealed-launch runbook

Status: **preparation only; production operations require later reviewed code,
the exact protected source, live fail-closed checks, and one-time confirmations**

This runbook defines the 0.4.0 production chronology. Genesis 001 continues to
serve only its already admitted players at exact 0.3.43. Genesis 002 receives
the selected Greater Realm atlas but no players. PTR receives its separate
atlas and one configured owner only. New admissions remain suspended.

The earlier C7 cutover and direct package-script commands are non-runnable
historical context. Never publish future repository source to Genesis 001 and
never rerun the completed G001 freeze publisher or B0 bridge workflow.

This runbook is not executable from any Task 6B-6E preparation commit. Task 6B
changes two current raw closure members without refreeze and starts the stale-
pin interval. Task 6C's surface intersects 21 current raw members total,
including those same two, and adds 19 newly distinct members; the union through
Task 6C is 21. Task 6C continues the interval, and Tasks 6D and 6E continue it.
The protected prepared workflow and every sealed-realms/
live production workflow must fail closed at all four intermediate commits;
focused task-specific source/module/static tests do not constitute full-green
closure verification. Task 7 alone atomically refreezes the closure manifest,
workflow pins, and downstream consumers. Its completely green first run and
zero-diff second run are required before Phase 0 may begin.

## Immutable identities and provenance

- Maincloud URI: `https://maincloud.spacetimedb.com`
- Genesis 001 identity:
  `c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e`
- Genesis 001 release: `0.3.43`
- Frozen source baseline: `2ae51984e1fa6ce5b0028c1a250359fed79d819b`
- Completed freeze-operation source:
  `d945256b217fa13ade944b9ed9880e8463b46123`
- Baseline ABI SHA-256:
  `cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03`
- Freeze nonce:
  `3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00`
- Historical dependency lock SHA-256:
  `7bbf5d888143d6342219dbba9f501d15bcc9627a7bb6f2be07ea197760d4e234`
- Historical freeze build Node: standalone `v24.19.0`, SHA-256
  `27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1`
- Historical freeze CLI: SpacetimeDB `2.6.1`, commit
  `052c83fe984a4c4eb7bb4f9afa5c6b1903891d87`, CLI SHA-256
  `2e737ddbbd7d337bb19c8fc22da9de44be4b7b2062146e7f65aa3f298d7994d6`,
  companion SHA-256
  `15a0965f1deec6b79f67fc04b616fd1a6b8f633301b0cfd2ebb7f961b919a8fa`
- Historical dependency installer: exact 16-package
  `warpkeep-genesis-001-historical-root-dependency-closure-v1`
- Genesis 002 alias/module/atlas: `warpkeep-genesis-002`,
  `warpkeep-genesis-002-sealed-v1`, `GENESIS_002_GREATER_REALM`
- PTR alias/module/atlas/release: `warpkeep-ptr`,
  `warpkeep-ptr-owner-view-v1`, `PTR_GREATER_REALM`, `0.4.0-ptr.1`
- G002 and PTR delete policy: `never`

G002 and PTR identities are fresh lowercase 64-hex values created during
publication. All three identities must differ; aliases are never binding
authority.

## Source modes and exact dispatcher surface

`S` requires checkout `HEAD`, protected remote `main`, workflow input commit,
the inert preparation binding, and the successful Verify SHA to be identical.
All 20 operation names are permitted in `S`:

```text
preflight
g001-policy-observe
g001-census-first
g001-census-second-inspect
g001-census-second-suspend
g001-current-state
g002-publish-inspect
g002-publish-apply
g002-import-inspect
g002-import-apply
g002-live-inspect
ptr-publish-inspect
ptr-publish-apply
ptr-import-inspect
ptr-import-apply
ptr-owner-provision-inspect
ptr-owner-provision
ptr-live-inspect
activation-evidence-inspect
activation-evidence-generate
```

`A` requires the exact activated binding, exactly one parent `S`, successful
Verify at `A`, binding/history verification, and a raw NUL-safe diff containing
exactly these regular mode-`100644` paths in both trees:

```text
config/releases/0.4.0-sealed-launch.json
package-lock.json
package.json
```

Outside `S`, only `A` is permitted. In `A`, only `preflight`,
`g001-current-state`, `g002-live-inspect`, and `ptr-live-inspect` may run. The
other 16 names are S-only. CLI postflight, bridge deploy/reconcile, G001 launch
cleanup, admitted-player collection, public artifact verification, and
post-activation reads are internal/external steps owned by existing operations
or workflows, never additional operation names.

## Deterministic runtime and private state

Production performs no npm, pnpm, tsx, root-node-modules, bootstrap download,
or package installation. Fixed signed dispatcher Node
`/private/var/db/warpkeep/runtime/node-v22.22.3-darwin-arm64/bin/node`, exact
`v22.22.3`, SHA-256
`5d9d3872911e2340a43b707962e68143de8a4e8d54628845c0c4f2de1fb7cd5c`,
Team ID `HX7739G8FX`, runs the builtins dispatcher and authenticated checked-in
G001, G002, PTR, and activation ESM bundles. Each bundle has only `node:`
imports, no source map/absolute path/self-main execution, byte-identical double
builds, and Node 22 load-hook attestation. `globalThis.WebSocket` is required
before an admin secret is read or network work starts. G002/PTR module builds
retain their separate pinned 16-package private closure.

The sole production shell child is the frozen authenticated G001 envelope.
The dispatcher uses `shell:false` and exact argv `/usr/bin/env`, `-i`,
`/bin/sh`, `-c`, exact authenticated envelope bytes, `warpkeep-production`,
then only fixed receipt-derived arguments. It does not pre-attest or derive
authority from the candidate G001 runtime. The envelope alone validates at run
time `/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node`, exact
`v24.19.0`, SHA-256
`714024e01b43d82baacc136f44770a75017e9c7858542bad6746f19e7f15635d`,
Team ID `2DC432GLL2`. The older standalone digest above remains historical
freeze provenance.

These three subsystem-owned roots must already exist below the account home,
be owner-owned mode `0700`, and have no symlink component:

```text
~/Library/Application Support/Warpkeep/operations/audit/private
~/Library/Application Support/Warpkeep/operations/runtime
~/Library/Application Support/Warpkeep/operations/cache
```

The dispatcher does not create or repair them. It creates only
`sealed-realms-v1` children; state is canonical, bounded, no-clobber,
owner-owned regular single-link mode `0600`, with directory fsync. No absolute
path, private receipt body, CLI config, token, FID, epoch, census count, or raw
digest becomes public.

One-time confirmations are consumed before mutation authority is released. An
ambiguous result writes permanent reconciliation state and cannot reactivate a
confirmation. The corresponding existing inspect operation alone may prove
adoption, resume, or no effect. Never replay a possibly submitted publication
or reducer. With exact permissions `actions: read` and `contents: read`, the
fixed workflow runs on `[self-hosted, macOS, ARM64,
warpkeep-production-admin, warpkeep-repository-exclusive]` in protected
environment `notification-bridge-prepared` and emits exactly one bounded public
line prefixed `WARPKEEP_OPERATION_RESULT `.

## Phase 0: inert preparation and preflight

Preparation remains exact `0.3.43`. The checked-in release binding has null
operational fields, `pagesDeploymentApproved: false`, and every activation,
presentation, deployment, notification, G002, and PTR gate false. Any npm test
or verification command in the preparation plan is CI/developer work, never a
production runtime step.

After protected Verify establishes exact `S`, dispatch `preflight`. Require
source/tool/config/root/G001 identity and reconciliation attestations. Because
PTR is not yet published or bound and the prepared bridge is not yet deployed,
this preflight must not be treated as the authoritative live suspension gate.

## Phase 1: publish G002 and PTR independently of the bridge

Dispatch `g002-publish-inspect`, then consume its confirmation once with
`g002-publish-apply`. Publication uses only pinned authenticated Spacetime CLI
authority. Its internal authenticated read-only CLI list/identity postflight
must reconcile the exact identity. A stale ambiguous marker may be adopted only
for that exact fresh identity; otherwise inspection must prove the alias absent
before issuing a fresh confirmation.

The publisher/CLI constructs, validates, and canonically serializes only the
pure marker profile
`warpkeep-sealed-realms-publication-possibly-submitted-v1` with ordered fields
`schemaVersion`, `profile`, `lane`, `sourceCommit`, `databaseUri`, `alias`,
`moduleIdentity`, `release`, `artifactDigest`, `toolchainDigest`,
`publishPlanDigest`, `confirmationDigest`, `attemptNonce`, `markedAt`, and
`submissionState=possibly-submitted`. It has no database identity or private
field and is never a confirmation, receipt, or activation input. Task 6C
exports its pure constructor/parser/digest plus marker-to-receipt reconciliation
constructor. Publish inspect binds the exact plan and one-time confirmation,
writes those bytes no-clobber mode 0600, and fsyncs before returning the
confirmation or permitting apply; apply reopens it before the CLI callback. A
crash or ambiguity blocks a new
confirmation until this same inspect operation authenticates CLI state and
appends adoption or alias-absent/no-effect reconciliation. Task 6C's pure value
alone does not provide durable restart safety.

Repeat through `ptr-publish-inspect` and `ptr-publish-apply`. Require distinct
identities, exact module/release, zero state, no public/admission ABI, and
canonical publication receipts. Neither publisher contacts the auth bridge or
uses an owner token. Publication output/receipts contain no owner FID/epoch.

Install the exact public PTR identity in protected bridge binding and repository
variable `WARPKEEP_PTR_SPACETIMEDB_DATABASE` now. Do not wait for owner
provisioning and do not place private owner data in any variable.

## Phase 2: deploy the prepared bridge

Authenticate the immutable B0 predecessor receipt; never rerun B0. Dispatch the
existing prepared-bridge workflow from `S` with the fresh PTR identity. Require
predecessor-bound `keep_bindings`, exact latest version, and verified deploy or
read-only recovery. An ambiguous bridge result uses only its existing protected
reconciliation path.

The ordinary top-level prepared receipt writer always invokes its deploy
callback and is not expiry recovery. The workflow's separately implemented
internal `recover-expired-authority-read-only` action calls
`runAuthBridgeNotificationPreparedReadOnlyRecovery` and returns exact outcome
`verified-read-only-recovery`. It is available only after a receipt expires,
performs no new upload/release/deploy/publish/import/reducer, and supplies
mutation callbacks that fail if invoked.
Its new read-only Cloudflare resolver enumerates deployment and deployable/
latest-upload state, inspects the exact version in the expired completed head,
requires it to remain the unique latest deployed version, and performs fresh
control-plane/public/private/PTR-binding attestations. Read-only reconcile and
inspect callbacks may run; the deploy adapter executor does not.

Require the sole eligible content-addressed receipt at
`~/.warpkeep/private/production-admin-v1/bridge-prepared-receipts-v1/auth-bridge-notification-prepared-<receiptDigest>.json`.
It supplies only protected prepared source/expiry authority. The completed
journal and fresh deployment/binding attestations independently supply the
deploy/recovery result. Neither workflow input nor a caller-selected path/
digest may identify any source. Any direct probes performed in this phase are
diagnostic; the first authoritative lane gate is owned by
`g002-import-inspect` in the next phase.

## Phase 3: import and seal G002

Dispatch `g002-import-inspect`. It deterministically locates exactly one
eligible protected bridge receipt and authenticates only its canonical body/
digest, `S`, prepared/expiry times, and expiry. A strictly read-only scan of the
existing completed journal below
`~/.warpkeep/private/production-admin-v1/bridge-prepared-deploy-journal-v3/`
derives run/attempt and deploy-or-recovery/predecessor chain. Fresh private/
public deployment attestation derives deployment ID/latest Worker version/
source commit, while fresh credentialed private attestation derives PTR
identity/binding digest. These facts never come from the prepared receipt or
caller. It then performs authoritative POST and browser OPTIONS
`/v2/access/request` probes after appending/authenticating immutable
`deploymentAuthority`. Both must return exact HTTP 503
`admission_requests_suspended` before auth, rate limiting, database access, or
notification work. The inspect operation appends bounded private `g002Gate`
below
`~/Library/Application Support/Warpkeep/operations/runtime/sealed-realms-v1/bridge/`
under profile `warpkeep-sealed-realms-auth-bridge-import-authority-v1` and
issues its one-shot confirmation bound to that gate. The gate must be no more
than five minutes old at apply; the prepared receipt must remain unexpired and
the completed attempt uniquely latest.
Read-only `/v2/access/status` preflight remains available.

Then dispatch `g002-import-apply` with the consumed confirmation. The immutable
G002 import receipt ABI remains unchanged; dispatcher-owned authority state
appends `g002ImportAuthorityCrossLink` from consumed `g002Gate` to its receipt digest.
It is not a mutable activation wrapper. All identity/module/tree/dependency/
toolchain/atlas/release arguments are receipt-derived. Require exact
`GENESIS_002_GREATER_REALM`,
release `0.4.0`, ready/finalized state, writers closed, private ABI, and zero
allowed FIDs, requests, players, founders, castles, profiles, accounts, claims,
occupancy, activation, Worker, and public roots.

Dispatch `g002-live-inspect`; require exact sealed live receipt and all G002
presentation/admission/notification booleans false.

## Phase 4: import ownerless PTR, then provision owner

After the G002 cross-link, dispatch `ptr-import-inspect`. This separate atlas
lane authenticates the publication receipt, reopens the same immutable
`deploymentAuthority`, freshly reattests unchanged deployment/source/PTR
binding, performs both fresh POST and OPTIONS probes, and appends independent
`ptrGate`. Then dispatch `ptr-import-apply` with its gate-bound confirmation no
more than five minutes old. The lane carries no owner FID, auth epoch,
entropy, proof, or owner-bearing token, and proves zero owner anchors before
and after import. Require `PTR_GREATER_REALM`, `0.4.0-ptr.1`, finalized atlas,
closed writers, zero gameplay/admission population, zero public roots, and no
activation mutation surface. Its immutable receipt remains unchanged;
dispatcher-owned state appends `ptrImportAuthorityCrossLink` from `ptrGate` to
that receipt digest. It never substitutes or reuses `g002Gate`.

An expired unused or ambiguous lane confirmation is permanently unusable. Only
the same existing inspect operation may append a superseding same-lane gate,
and only after read-only reconciliation proves no effect; exact adoption
appends the submitted realm receipt cross-link without replay. No gate may be
appended after prepared-receipt expiry. A completed realm may be authenticated
for adoption but cannot authorize a missing later lane. Dispatch the protected
workflow's exact internal expiry-recovery action, not a sealed-realms operation.
It first proves the old receipt/head/authority chain is terminal and no fresh
eligible pair exists. Fresh protected-run/`S`, Cloudflare control-plane, public
Worker, credentialed private Worker, and PTR-binding attestations must all bind
the exact unchanged deployment ID, latest Worker version/source commit, PTR
identity, and binding. The action writes one fresh content-addressed prepared
receipt and one new append-only completed recovery journal/head binding the old
receipt/head digests, new receipt digest, run/attempt, all fresh attestation
digests, completion time, no-deploy assertion, and outcome
`verified-read-only-recovery`.
The completed head uses exact profile
`warpkeep-auth-bridge-notification-prepared-read-only-recovery-v1` and ordered
fields `schemaVersion=1`, `profile`, `sourceCommit`, `runId`, `runAttempt`,
`priorPreparedReceiptDigest`, `priorCompletedJournalHeadDigest`,
`preparedReceiptDigest`, `deploymentId`, `workerVersionId`,
`bridgeSourceCommit`, `ptrDatabaseIdentity`, `ptrBindingDigest`, the four exact
fields `controlPlaneAttestationDigest`, `publicAttestationDigest`,
`privateAttestationDigest`, `ptrBindingAttestationDigest`, `completedAt`,
`noDeploy=true`, and `outcome=verified-read-only-recovery`; extra, missing, or
noncanonical fields fail.

The dispatcher derives the new authority filename as
`auth-bridge-import-authority-<authorityChainDigest>.jsonl` from the canonical
profile/`S`/new receipt/new head/deployment/version/PTR-binding tuple. A caller
cannot select it. Old bytes remain unchanged and terminal; orphan/incomplete
records are ineligible, and zero/multiple eligible pairs, duplicate heads,
revival, overwrite, or drift stops release. On the new chain, rerun existing
`g002-import-inspect` and `g002-import-apply`: fresh gate authority adopts the
already-completed immutable G002 receipt through a new Task 6D dispatcher
adoption branch that authenticates the durable receipt, freshly verifies
inspect/live state, and appends only its cross-link; it never calls the G002
import core or reducer. Only then rerun PTR inspect/apply. A completed PTR uses
the equivalent dispatcher branch, never its already-applied-rejecting core; an
exact no-effect result permits its missing import core/reducer once under the
fresh gate. A completed recovery rerun adopts the sole pair without another
write. Records are never overwritten or replaced. The exact
physical grammar is one `deploymentAuthority`, zero-or-more abandoned
`g002Gate` records, one final consumed `g002Gate`, one
`g002ImportAuthorityCrossLink`, zero-or-more abandoned `ptrGate` records, one
final consumed `ptrGate`, then one `ptrImportAuthorityCrossLink`. Each new gate
names exactly its immediately superseded same-lane predecessor; the old gate is
never modified. Only the final gate is cross-linked. Forks, cycles, skipped
predecessors, or a gate after its lane cross-link fail closed.

Next dispatch `ptr-owner-provision-inspect`. It reopens and authenticates the
exact atlas-import receipt. Only `ptr-owner-provision` may consume its one-time
confirmation, resolve the live enabled G001 owner, obtain the fresh owner-
bearing Task 4 token, bind the signed FID/auth epoch to reducer arguments,
derive the private opaque owner proof, and write provision/live receipts.

Dispatch `ptr-live-inspect`; require one enabled human owner, Hermes as a
non-player operations principal, no other player/admission state, and a private
opaque proof cross-link. This distinct read-only live receipt is not a fourth
mutation-authority receipt. Owner FID, epoch, proof, and receipt body never
appear in output or public binding.

## Phase 5: collect both G001 evidence pairs immediately before activation

These operations occur only after both realm imports and PTR owner provisioning.
Dispatch `g001-policy-observe`; it internally owns existing frozen-envelope
launch-run inspect, confirmed cleanup, and adoption without another operation
name.

`g001-census-first` collects pass one of two separate mandatory pairs:

1. the unchanged applicant census and its separately private human-readable
   export; and
2. the admitted-player census proving the complete enabled `allowed_fid` set
   and stable auth epochs.

The admitted-player preferred query is exactly
`SELECT fid, enabled, auth_epoch FROM allowed_fid`. It is bounded and
machine-parseable, requires unique canonical FIDs/epochs and every row enabled,
and checks `allowedFids === enabledAllowedFids` before and after. The only
unchanged-ABI fallback enumerates `player_v2`, uses the existing per-FID
administrator status procedure, and requires the reconstructed enabled set to
equal aggregate `allowedFids`; any mismatch blocks release.

After 60-300 seconds, `g001-census-second-inspect` collects pass two of both
pairs, requires distinct timestamps/nonces and private stability within each
pair, and issues the one-time suspension confirmation. Applicant and admitted-
player proofs do not substitute for one another. No admitted-player identity,
epoch, count, or raw/private digest enters the applicant TXT.

`g001-census-second-suspend` consumes that confirmation before monitor mutation
and only while both pairs remain stable. Require `disabled=true`,
`loaded=false` and no change to admitted players. An ambiguous mutation keeps
the monitor loaded/blocked from release until read-only reconciliation and can
never reuse the old confirmation. Then dispatch `g001-current-state` and
require a fresh disabled/unloaded receipt immediately before generation.

The admitted-player public profile is exactly
`warpkeep-genesis-001-admitted-player-census-privacy-safe-v1`; only its opaque,
domain-separated commitment becomes public. Normalized set digest/count, FIDs,
epochs, and nonces remain private.

## Phase 6: exact 19-key activation envelope and 17 commitments

Dispatch `activation-evidence-inspect`. It reopens the exact authenticated
`deploymentAuthority` plus both lane gates and receipt cross-links, requires
them to share unchanged `S`, PTR binding, and latest deployed Worker version,
refreshes private/public deployment and
credentialed PTR-binding attestations, and always performs fresh POST and
OPTIONS suspension probes with distinct canonical timestamps and nonces. It persists
profile `warpkeep-sealed-realms-auth-bridge-suspension-private-v1` and issues
its one-time confirmation only while generation can begin within five minutes.
A missing/stale/swapped proof, zero/multiple eligible receipts, incomplete or
ambiguous journal, failed/stale run attempt, expiry before G002 apply or between
imports, abandoned-confirmation revival, partial refresh, failed no-effect/
adoption, missing/wrong cross-link, wrong predecessor/order, fork/cycle/skipped
predecessor, cross-lane gate
substitution, POST-only/OPTIONS-only success, replay, changed deploy/binding
after confirmation, source/PTR mismatch, private leakage, orphan/duplicate
recovery authority, old-chain mutation/revival, a second deploy/publish/reducer
callback, or ambiguous probe/deployment result invalidates the confirmation
permanently. The expiry-between-imports positive path must show new receipt/
head bytes, G002 adoption, PTR no-effect/import, zero mutation callbacks during
adoption, and crash/restart safety. Deployment
ambiguity is
reconciled only by the existing protected bridge workflow.

Consume the confirmation with `activation-evidence-generate`. The activation
bundle accepts no evidence or bridge field from workflow input and assembles
this exact 19-key private envelope in order:

1. `schemaVersion`;
2. `profile`;
3. `bindingCandidate`;
4. `g001FreezePublishReceipt`;
5. `g001PolicyObservationBootstrapReceipt`;
6. `g001CensusPrivacySafePrivateReceipt`;
7. `g001AdmittedPlayerCensusPrivateReceipt`;
8. `g001AdmissionMonitorSuspensionReceipt`;
9. `g001AdmissionMonitorCurrentStateReceipt`;
10. `authBridgeSuspensionPrivateReceipt`;
11. `g002PublishReceipt`;
12. `g002AtlasImportReceipt`;
13. `g002SealedLiveReceipt`;
14. `g002SealedLiveReceiptDigest`;
15. `ptrPublishReceipt`;
16. `ptrAtlasImportReceipt`;
17. `ptrOwnerProvisionReceipt`;
18. `ptrSealedLiveReceipt`;
19. `ptrSealedLiveReceiptDigest`.

The generator validates source ancestry, exact identity/receipt links, both
G001 evidence pairs, 60-300 second separation, monitor chronology/freshness,
the bridge member's prepared receipt canonical body/digest, `S`, and expiry;
completed journal digest/head, run/attempt, and deploy-or-recovery chain; fresh
private/public deployment and credentialed binding attestations; deployment ID/
Worker version/source commit; PTR identity/binding digest; independent G002/PTR
gates and immutable receipt cross-links; fresh activation POST/OPTIONS evidence;
timestamps, nonces, predecessor digests and freshness
links, G002 zero state, PTR ownerless import, singleton-owner provisioning, and
identity collisions. The public binding grows to exactly 17 opaque
commitments. The generator rejects caller-provided bridge fields and requires
candidate `authBridgeSourceCommit` and
`admissionRequestSuspensionReceiptDigest` to be exactly null. It derives
existing `authBridgeSourceCommit`,
`admissionRequestSuspensionReceiptDigest`, and its opaque commitment only from
the private member; it adds no public commitment. It exposes no
applicant/admitted FID or epoch, player or applicant count,
normalized/raw/private census digest, owner proof, token, CLI
config, private receipt body, or absolute path.

The dispatcher writes the public candidate only at exact fixed path
`~/Library/Application Support/Warpkeep/operations/runtime/sealed-realms-v1/public/0.4.0-sealed-launch.json`.
Only that path may be read by the independent builtins-only
schema/privacy/digest verifier, and upload uses only its verified bytes. The
production workflow runs no npm generator and cannot edit, commit, push, tag,
deploy, or open a PR.

## Phase 7: exact three-file `A`

Create one reviewed successor of `S` changing only the three exact mode-100644
activation files. Require a raw NUL-safe diff, one parent `S`, exact activated
binding, successful Verify at `A`, and binding/history verification. Any extra
path, mode drift, symlink, submodule, merge, or attack-and-revert history fails.

After merge, no publish/import/provision/policy/census/suspension/generation
operation is authorized. Only `preflight`, `g001-current-state`,
`g002-live-inspect`, and `ptr-live-inspect` may provide post-activation reads.

Pages independently repeats binding/history checks and live suspension, uses
the exact public PTR identity, deploys exact `A`, and performs live realm
acceptance. Only after those gates succeed may exact `A` be tagged `v0.4.0` and
released. Archive private evidence outside Git. The public binding coordinates
the release; it is never future admission or G002 activation authority.

## Residual fail-closed live gates

This preparation runbook does not claim that the production runner, signed
Nodes, live WebSocket capability, preferred/fallback query shape, fresh realm
identities, CLI postflights, bridge deployment, suspension probe, receipts,
Pages deployment, or tag exists or has passed. Each is verified only in its
ordered production step. Failure, ambiguity, missing evidence, stale evidence,
or privacy leakage stops release without weakening the boundary.
