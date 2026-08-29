# Genesis 002 sealed-launch runbook

Status: **preparation only; production operations require the final reviewed
source and exact confirmations**

This runbook implements the owner-approved 0.4.0 release shape: Genesis 001
continues serving its already admitted players on exact 0.3.43, Genesis 002
holds the selected Greater Realm atlas but has no admitted users, and all new
admission requests and admission operators are suspended. A distinct PTR holds
the same canonical atlas ABI for short-lived owner-only patch testing; it has
no player admission or access-request surface.

This release shape supersedes the earlier C7 active-Greater-Realm plan. Never
publish the repository's 86-table future module to Genesis 001 and never use
the legacy Greater Realm publisher/import/cutover aliases for Genesis 002.
Those legacy G001 mutation aliases, direct CLI entrypoints, recovery paths, and
historical launch-envelope rows are source-refused before credentials or
network access; explicitly read-only inspection is the only retained lane.
Future G002 admission, founding, activation, player presentation, or admission
notification work requires a new reviewed release plan.

## Immutable identities

- Maincloud URI: `https://maincloud.spacetimedb.com`
- Genesis 001 full identity:
  `c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e`
- Genesis 001 release: `0.3.43`
- Genesis 001 frozen source baseline:
  `2ae51984e1fa6ce5b0028c1a250359fed79d819b`
- Genesis 001 completed freeze-operation source:
  `d945256b217fa13ade944b9ed9880e8463b46123`
- Genesis 001 baseline ABI SHA-256:
  `cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03`
- Genesis 001 freeze nonce:
  `3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00`
- Genesis 001 historical dependency lock SHA-256:
  `7bbf5d888143d6342219dbba9f501d15bcc9627a7bb6f2be07ea197760d4e234`
- Genesis 001 build Node: standalone `v24.19.0`, SHA-256
  `27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1`
- Genesis 001 SpacetimeDB CLI: `2.6.1`, commit
  `052c83fe984a4c4eb7bb4f9afa5c6b1903891d87`, CLI SHA-256
  `2e737ddbbd7d337bb19c8fc22da9de44be4b7b2062146e7f65aa3f298d7994d6`,
  standalone companion SHA-256
  `15a0965f1deec6b79f67fc04b616fd1a6b8f633301b0cfd2ebb7f961b919a8fa`
- Genesis 001 dependency installer:
  `warpkeep-genesis-001-historical-root-dependency-closure-v1`, exactly 16
  Darwin/ARM64 integrity-addressed archives and no package-manager execution
- Genesis 002 alias: `warpkeep-genesis-002` (must be absent before publish)
- Genesis 002 module identity: `warpkeep-genesis-002-sealed-v1`
- Genesis 002 atlas ID: `GENESIS_002_GREATER_REALM`
- PTR alias: `warpkeep-ptr` (must be absent before publish)
- PTR module identity: `warpkeep-ptr-owner-view-v1`
- PTR atlas ID: `PTR_GREATER_REALM`
- PTR release: `0.4.0-ptr.1`
- Delete policy for both same-schema G001 freeze and fresh G002 publish:
  `never`

The G002 and PTR full database identities do not exist until their fresh
publications. Record both returned lowercase 64-hex identities and require all
three realm identities to differ. No alias or environment override may
substitute for an identity.

## Phase 0: preparation main remains inert

Before any production operation, the checked-in root package and lock remain
`0.3.43`. `config/releases/0.4.0-sealed-launch.json` has
`pagesDeploymentApproved: false`, null operational fields, and false G002,
PTR-presentation, legacy-presentation, and notification gates. Every PTR
receipt, identity, module, atlas, owner-state, and zero-population evidence
field is null during preparation.

Require:

```sh
npm run verify:sealed-launch:preparation
```

The Pages classifier must emit `sealed-launch-blocked`. Its build and deploy
jobs must not start, so no install, build, artifact upload, Pages environment,
credential, or deployment action happens from preparation main.

## Phase 1: adopt the completed one-time Genesis 001 freeze

The one-time same-schema freeze was already published successfully from the
reviewed historical freeze source. **Do not publish it again.** The activation
generator adopts only the exact retained owner-private final receipt whose
source, canonical-file digest, target, policy, build provenance, baseline ABI,
freeze nonce, and successful outcome match the independently pinned release
authority. A structurally valid alternate receipt is not eligible.

The repository's current/future 86-table module is never eligible for Genesis
001. The instructions below describe the evidence that was produced and must
be revalidated; they are historical recovery context, not authorization to
rerun the publisher.

Supply exact absolute `WKG001_NODE_EXECUTABLE_PATH` and
`WKG001_PRODUCTION_DEPENDENCY_CACHE_ROOT` inputs. The publisher must stage and
re-attest the reviewed standalone Node, safely construct the historical root
dependency closure directly from the private verified archive cache, build both
the exact baseline and frozen source from identical dependency provenance, and
re-attest the private CLI/companion snapshot around every build, proof, read,
and supervised release boundary. The exact CLI version, commit, and both binary
digests must be present in build provenance. Fail before credentials if any
identity differs. `WKG001_PNPM_EXECUTABLE_PATH` and
`WKG001_PNPM_STORE_PATH` are not accepted release inputs. Retain the strict v2
recovery/final receipt, which binds the build provenance and its canonical
digest without recording private paths.

Postflight must exact-match the administrator-only read receipt:

```text
realmId=GENESIS_001
releaseVersion=0.3.43
playerAccessEnabled=true
admissionStateMutationsEnabled=false
accessRequestSubmissionsEnabled=false
sourceBaselineCommit=2ae51984e1fa6ce5b0028c1a250359fed79d819b
freezeReleaseNonce=3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00
```

Retain the owner-private final receipt and expose only its approved
privacy-safe digest/commitment fields. Existing G001 players must still connect;
every request/admit/allow/re-enable/disable/revoke/reset/auth-epoch mutation
must fail before state or audit writes.

## Phase 2: export applicants privately, then suspend the monitor

From exact clean protected preparation source `S`, use the dedicated reviewed
[G001 policy-observation launch envelope](./genesis-001-policy-observation-launch-envelope.sh.txt)—not
the sealed legacy Greater Realm launch envelope—with the fixed command
`g001-policy-observe` and no additional operator arguments. The bootstrap maps
that command only to
`scripts/genesis001-policy-observation-receipt.mjs` with exact child arguments
`['observe']`, requires the owner-private administrator-secret file, and does
not permit private stdin. Do not invoke the observer directly.

Run those exact reviewed envelope bytes only while `S` remains the protected
remote `main` tip. The observer's sanitized final receipt is eligible for the
activation evidence only after the enclosing bootstrap reports success,
completes its exact postflight, and confirms cleanup; child success by itself is
not eligible evidence. If a launch is interrupted, use only the envelope's
credential-free `launch-run-inspect [RUN_ID]` and confirmed
`launch-run-cleanup RUN_ID CONFIRMATION_DIGEST` rows to inspect or recover its
local lifecycle state before attempting a new observation.

The observer attests protected `S` before opening the secret, removes the
bootstrap path/commit/secret bindings from its environment, opens one fixed
production transport session, refreshes it, and performs exactly one read-only
`genesis_001_access_policy_v1` inspection. It submits no reducer, always closes
the session, clears its local secret binding, rejects network failure or any
reopened/wrong/partial policy, and writes one canonical sanitized policy receipt
into bootstrap-owned bounded private stdout while keeping stderr empty. Neither
child stream is inherited by the terminal. Only after operator success,
postflight source attestation, runtime/npm re-attestation, a complete launch
record, and successful lifecycle cleanup does the bootstrap emit its final JSON,
containing the nested `policyObservationReceipt` and a domain-separated
`policyObservationReceiptLinkSha256`. Retain the complete final bootstrap
receipt for the activation envelope, including its protected commit, module
tree/blob/archive identities, exact command, cleaned lifecycle outcome, nested
observation, and recomputable link. A naked nested observer receipt is never
eligible or displayed.

Do not stop the monitor before the census boundary. Use the reviewed,
no-argument private census/export lane twice at the exact preparation source
and retain two distinct private opaque-proof receipts. The two receipts must
have distinct canonical timestamps and nonces but exact-equal private
count/size/raw-SHA references; only the later opaque digest enters the public
binding. Copy the owner-requested human-readable applicant TXT only
to the owner-private Desktop location. Preserve the private JSON/TXT with owner
mode and do not print or copy applicant FIDs, usernames, timestamps, raw file
digests, or applicant counts into Git, CI, Pages, receipts, issue comments, or
operator logs.

The public activation binding contains only:

- profile `warpkeep-genesis-001-census-export-privacy-safe-v1`;
- the digest of a privacy-safe receipt/opaque, domain-separated census
  commitment; and
- the release-wide commitment over that privacy-safe digest.

Create the opaque proof only with:

```sh
npm run g001:census:privacy-safe-proof -- --source-commit=<exact-preparation-commit>
```

The process receives the absolute mode-0600 canonical Desktop TXT and the
Hermes-written raw reference under canonical
`Library/Application Support/Warpkeep/operations/audit/private` through
`WARPKEEP_G001_PRIVATE_CENSUS_TXT_PATH` and
`WARPKEEP_G001_PRIVATE_CENSUS_EXPORT_RECEIPT_PATH`, plus an existing canonical
mode-0700 directory through
`WARPKEEP_G001_PRIVATE_CENSUS_PROOF_DIRECTORY`. It re-reads the actual TXT with
no-follow identity checks, validates the full canonical G001 0.3.43 report,
recomputes count/size/SHA/basename, and exact-matches the private exporter
reference. It generates the 32-byte blinding nonce internally, writes one
non-overwritable mode-0600 private receipt containing the raw reference and
nonce, and prints only `{profile,opaqueProofDigest,privateReceiptBasename}`.

The raw JSON/TXT SHA-256, applicant count, and nonce remain private; using any
of them as `g001CensusPrivacySafeReceiptDigest` is prohibited because it would
provide a public offline-guess verifier. The binding uses only the emitted
`opaqueProofDigest`.

The live-policy observation timestamp must be no later than the first census,
at most five minutes before it, and at most ten minutes old at activation
generation. The first census must precede the second by at least 60 seconds and
at most five minutes; the second census must be no later than the
monitor-suspension timestamp. The exact current-state observation must be no
earlier than suspension, no later than activation generation, and at most five
minutes old when the generator validates it. Impossible calendar timestamps,
reordered or weakly separated proofs, a zero nonce, a stale policy wrapper, and
a mismatched private reference fail closed.

Only after the second stable export, reversibly suspend the retained
`com.warpkeep.hermes-admission-monitor` LaunchAgent: disable its service target,
boot it out, and keep the plist installed. The suspension receipt must prove
both `disabled=true` and `loaded=false`. Run a fresh read-only state check in
the same protected operator session immediately before activation generation;
an old valid suspension receipt must not be treated as proof that a subsequently
re-enabled monitor is still suspended. The inspect result must be the exact
canonical `warpkeep-genesis001-admission-monitor-current-state-v1` receipt,
bound to `S`, the G001 0.3.43 target, the fixed label and program/plist hashes,
and its production-generated observation time. Do not delete the plist or its
private state, and do not run any admit/allow mutation.

## Phase 3: deploy and prove the auth-bridge request kill switch

Deploy the reviewed auth-bridge source whose production-default kill switch is
true. Before the activation binding exists, run the implementation's direct
live probe without a binding argument:

```sh
node scripts/verify-admission-request-suspension.mjs --bridge=https://auth.warpkeep.com
```

It must observe both `POST` and browser `OPTIONS` on
`https://auth.warpkeep.com/v2/access/request` returning exact 503 JSON with
code `admission_requests_suspended`, no redirect, and the expected CORS/content
type. Read-only `/v2/access/status` preflight must remain 204. Bind the probe's
privacy-safe receipt digest and exact auth-bridge source commit. The
`npm run verify:admission-request-suspension` alias also verifies the checked-in
binding, so use that alias only after the activation binding has been generated.

## Phase 4: publish a fresh, private Genesis 002 module

Use the existing secure wrapper so `WARPKEEP_ADMIN_TOKEN_SECRET` is injected
only into the operator process. Resolve `<operator-private-support-root>`
locally to the reviewed owner-private operations directory; never commit a
literal user-home path:

```text
<operator-private-support-root>/bin/warpkeep-secrets run-admin -- <reviewed command>
```

The concrete publisher additionally requires absolute paths for
`WKGR_PRODUCTION_DEPENDENCY_CACHE_ROOT` and
`WARPKEEP_SPACETIME_CLI_CONFIG_PATH`; optional
`WK_G002_MATERIALIZATION_PARENT` and `WARPKEEP_SPACETIME_EXECUTABLE` must also
resolve through the reviewed local boundary. Never place a raw token in a
command argument or ambient `HOME`, and never set database, server, or auth
bridge overrides.

First run the reviewed equivalent of:

```sh
npm run stdb:genesis002:publish:inspect
```

Review the exact protected-main commit, module SHA/tree, dependency closure,
Spacetime executable/config digests, private ABI (23 private, zero public),
absent alias, and confirmation digest. Only then run the same exact source with:

```sh
npm run stdb:genesis002:publish:apply -- --confirm=<reviewed-64-hex-digest>
```

Publication is one-shot. Require the returned full G002 identity, identity-bound
fresh zero status, no atlas, no activation/public roots/Worker rows, and false
player presentation. If the process reports a possibly submitted error, stop
and perform fresh read-only manual reconciliation; never rerun publish.

The successful apply result emits `publishReceiptDigest`. Bind that exact field
as `g002PublishReceiptDigest`; it is derived from the strict canonical publish
receipt under the domain (including its trailing newline)
`warpkeep.genesis-002.production-publish-receipt.v1\n`. Never hash or otherwise
derive a binding from the publisher's pretty-printed CLI stdout.

## Phase 5: import and finalize the exact G002 atlas

Regenerate the selected runtime-release package after the final atlas source
and ensure every producer says `GENESIS_002_GREATER_REALM`. Any package created
with `GENESIS_001_GREATER_REALM`, another atlas ID, an earlier generator, or
stale source/digests is ineligible.

The import operator additionally uses the absolute
`WARPKEEP_GREATER_REALM_WORKSPACE` and the same locked dependency/materialized
source boundary. Run its `inspect` form with all eight exact bindings:

```text
--database-identity=<fresh-g002-identity>
--module-source-commit=<protected-main-commit>
--module-sha256=<publisher-module-sha256>
--module-tree-id=<publisher-module-tree-id>
--dependency-closure-digest=<publisher-closure-sha256>
--spacetime-executable-sha256=<publisher-cli-sha256>
--atlas-source-commit=<selected-atlas-commit>
--release-sha256=<selected-runtime-release-sha256>
```

Review the emitted confirmation digest, exact G002 identity, source ancestry,
release tuple, zero boundary, and mutation surface `atlas-import-only`. Then
invoke the same operator's `apply` form with the reviewed confirmation digest.
Do not use the G001 Greater Realm import operator.

The driver may submit only stage, component import, region import, chunk import,
begin verification, verification batch, and finalize. Every mutation must have
zero population/claims/occupancy/activation/Worker/public roots before and
after it. The final receipt must prove:

- exact atlas and release/header/verification digests;
- atlas state ready and finalized;
- every atlas writer closed by finalization;
- 23 private and zero public table descriptors;
- zero allowed FIDs, requests, players, founders, castles, profiles, accounts,
  claims, occupancy, activation, Worker, and public-root rows; and
- activation, player access, admissions, G002 presentation, legacy Greater
  Realm presentation, and notifications all false.

As with publish, a possibly submitted error stops the operation and requires
fresh read-only reconciliation. Do not blindly retry or manually advance a
cursor.

The successful apply result emits `importReceiptDigest`. Bind that exact field
as `g002AtlasImportReceiptDigest`; it is derived from the strict canonical
import receipt under the domain (including its trailing newline)
`warpkeep.genesis-002.production-import-receipt.v1\n`. Never hash or otherwise
derive a binding from the import operator's pretty-printed CLI stdout.

## Phase 5b: publish, finalize, and provision owner-only PTR

Publish `warpkeep-ptr` exactly once from protected preparation source. Its
lowercase 64-hex identity must differ from both Genesis identities. The module
receipt must bind module identity `warpkeep-ptr-owner-view-v1`, fresh-database
status, module/tree/dependency/toolchain digests, `--delete-data=never`, and
zero admission and access-request ABI surfaces.

Export and import the dedicated `PTR_GREATER_REALM` runtime release at exact
`0.4.0-ptr.1`. Bind `ptrAtlasSourceCommit` to the manifest source commit,
`ptrReleaseManifestSha256` to the canonical manifest bytes,
`ptrExpectedReleaseSha256` to the manifest's `releaseSha256`, and retain the
header and verification digests. Final status must prove exact imports, ready
and finalized atlas state, writes closed by finalization, zero gameplay and
admission population, zero public atlas roots, and no activation mutation
surface.

Provision the singleton owner anchor only after the zero boundary and final
atlas state are proven. The private operator must emit a privacy-safe provision
receipt with one enabled owner anchor and an opaque owner proof shared with the
final live receipt. Never place the owner FID, auth epoch, token, raw status DTO,
or opaque owner proof in Git, Pages variables, logs, or the public binding. Only
the provision receipt digest, its release-wide commitment, and the public
booleans `ptrOwnerProvisioned=true`, `ptrOwnerEnabled=true`, and
`ptrOwnerAnchorRows=1` may leave the private evidence envelope.

## Phase 6: final local and live gates

From exact clean protected main, require all of the following before changing
the release binding:

```sh
pnpm --dir services/auth-bridge run check
pnpm --dir spacetimedb/genesis002 run verify
npm run stdb:genesis002:verify-private-loopback
npm run typecheck
npm run verify:sealed-launch:preparation
git diff --check
```

Also require the full focused/adversarial test set, generated activation binding
diff check, source-built locked-cache exercise, exact historical G001 freeze
receipt inspection, a fresh sanitized live-policy observation, both stable
census proofs, a fresh monitor suspension/state check, live auth suspension
probe, G002 fresh publish receipt, G002 import receipt, and final sealed live
receipt. Receipts committed to the release binding must contain no applicant
data, raw census digest, applicant count, administrator secret, CLI config
contents, token, or private filesystem path.

The public receipt commitments prove deterministic consistency and detect
tampering or receipt swaps; they do not cryptographically prove that a private
operator ran. Release authority is the protected-main review plus the protected
production environment/operator that performs these live checks. A stronger
claim would require a separately reviewed signing or remote-attestation key.

## Phase 7: atomic 0.4.0 activation successor

Only after every prior operation and review gate is green, create one small
reviewed successor that atomically:

1. changes root package/lock/release identity from 0.3.43 to exact 0.4.0;
2. preserves truthful copy: Genesis 001 at 0.3.43, Genesis 002 sealed at 0.4.0,
   PTR owner-only at 0.4.0-ptr.1, and new admissions suspended;
3. fills every exact non-null privacy-safe operational binding and its
   domain-separated commitment;
4. proves the preparation commit and frozen G001 baseline are ancestors;
5. retains all G002, legacy presentation, and notification gates false;
6. sets only the receipt-proven PTR presentation gate true; and
7. sets `pagesDeploymentApproved: true`.

Construct one private activation evidence envelope in this exact key order:

1. `schemaVersion` with exact value `1`;
2. `profile` with exact value
   `warpkeep-0.4.0-sealed-launch-activation-evidence-v1`;
3. `bindingCandidate` in the exact checked-in binding key order. Every
   G001-derived field and commitment, every monitor-derived field and
   commitment, the admission-request suspension commitment, and every
   G002/PTR-derived field and commitment (including PTR presentation) must
   still be `null`; caller-supplied values are rejected;
4. `g001FreezePublishReceipt`, the exact retained private receipt wrapper with
   its pinned basename, canonical-file digest, and full historical receipt;
5. `g001PolicyObservationBootstrapReceipt`, the complete exact successful
   bootstrap result. It must have profile
   `warpkeep-greater-realm-production-bootstrap-v1`, protected commit `S`,
   valid module tree/bootstrap blob/bootstrap SHA identities, exactly 16 module
   archives, command `g001-policy-observe`, an exact `cleaned` launch cleanup
   result with run ID and both hashes, the nested sanitized live read-only
   policy observation, and the recomputed length-framed observation link;
6. `g001CensusPrivacySafePrivateReceipt`, an exact ordered `{first,second}`
   pair of private proofs from the stable census boundary;
7. `g001AdmissionMonitorSuspensionReceipt`, the exact basename/digest/full
   suspension receipt from the fresh final monitor gate;
8. `g001AdmissionMonitorCurrentStateReceipt`, the exact fresh canonical
   `inspect` receipt proving `disabled=true`, `loaded=false`, fixed target
   hashes, source `S`, and an observation no more than five minutes before the
   trusted generator time;
9. `g002PublishReceipt`, copied from the successful publisher CLI result's
   exact nested `publishReceipt` object, including its final
   `publishReceiptDigest` field; require that nested digest to equal the
   result's top-level `publishReceiptDigest` and do not include the flattened
   compatibility or operational-extra fields;
10. `g002AtlasImportReceipt`, the exact nested import receipt including its
   final `importReceiptDigest` field (which must equal the operator result's
   top-level `importReceiptDigest`);
11. `g002SealedLiveReceipt`, the exact final sealed-live receipt;
12. `g002SealedLiveReceiptDigest`, the digest emitted alongside that receipt;
13. `ptrPublishReceipt`, the exact fresh PTR module receipt with its nested
    `publishReceiptDigest`;
14. `ptrAtlasImportReceipt`, the exact finalized PTR import receipt with its
    nested `importReceiptDigest`;
15. `ptrOwnerProvisionReceipt`, the privacy-safe singleton-owner receipt with
    its nested `provisionReceiptDigest` and private opaque owner proof;
16. `ptrSealedLiveReceipt`, the exact sanitized final PTR live receipt. It may
    contain the same private opaque owner proof for cross-linking but no FID or
    auth epoch; and
17. `ptrSealedLiveReceiptDigest`, the exact digest of that live receipt.

Do not prefill a derived G1, G2, or PTR binding value and do not hash pretty CLI
output. The generator validates the exact historical freeze authority,
independently recomputes the bootstrap's length-framed nested-observation link,
hashes the complete wrapper and fresh current monitor receipt in distinct
public digest domains, verifies the stable census pair and complete
policy/census/suspension/current-state chronology, then cross-links the G2 database/module/
artifact/atlas/release/zero-state/readiness/mutation/presentation/notification
evidence. It also recomputes and cross-links PTR module, atlas, live, and
owner-provision receipts, rejects Genesis identity collisions, and strips the
private owner proof. It derives all public fields and all sixteen commitments
only after the whole envelope passes. Missing, extra, reordered, swapped, stale, or
individually valid but mutually inconsistent receipts are rejected.

Store the envelope as canonical pretty JSON with one trailing newline in a
regular, owner-owned, single-link file with mode 0600 (and no more than 32 KiB).
Generate the public binding only through the reviewed generator:

```sh
chmod 0600 "$WK_ACTIVATION_EVIDENCE"
npm run generate:sealed-launch:activation \
  < "$WK_ACTIVATION_EVIDENCE" \
  > "$WK_ACTIVATION_BINDING"
```

The generator emits only the canonical public binding; it never emits the
private evidence envelope. Review the generated binding, then place that exact
output at `config/releases/0.4.0-sealed-launch.json`. The activation successor
must change only that binding plus `package.json` and `package-lock.json`; any
other changed path blocks activation review.

Let `F` be the independently pinned historical G001 freeze source, `S` the
preparation commit recorded by every fresh receipt, and `A` the activation
successor. The verifier requires the frozen baseline to be an ancestor of `F`,
`F` to be an ancestor of `S`, and `A` to have exactly one parent equal to `S`.
No commit in the full `F..S` history may touch the closed G001 operational
projection (including the complete `spacetimedb/src` and `spacetimedb/scripts`
trees and legacy mutation-refusal entrypoints). The current protected bootstrap,
which gains the read-only policy-observer route after the historical freeze, is
excluded from that historical projection but remains an exact sealed-source and
closure input. The raw Git tree projection
including modes and object identities must be identical at both endpoints.
The raw NUL-delimited `S..A` delta must contain exactly the three reviewed
activation paths, and all three must be regular mode-100644 blobs in both `S`
and `A`. Merge commits, attack-and-revert history, newline paths, symlinks,
submodules, executable-bit drift, or an extra path fail closed.

Require `npm run verify:sealed-launch:activation` on the exact activation
commit. Pages must repeat that verifier and the direct live auth-bridge probe
before build and again before deployment. Before install/build, Pages must set
`VITE_WARPKEEP_PTR_ENABLED` to exact `true`, source
`VITE_PTR_SPACETIMEDB_DATABASE` only from repository variable
`WARPKEEP_PTR_SPACETIMEDB_DATABASE`, and prove exact equality to the activated
PTR database identity. PTR URI overrides, aliases, missing variables, uppercase
or noncanonical identities, and collisions must fail closed. Missing, partial, extra, swapped,
random, stale, populated, open, or wrong-target receipts must block deployment.

Archive the private operational evidence outside the repository. The checked-in
binding is a privacy-safe coordination record, not authority to admit users or
activate Genesis 002 later.
