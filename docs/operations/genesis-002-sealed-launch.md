# Genesis 002 sealed-launch runbook

Status: **preparation only; production operations require the final reviewed
source and exact confirmations**

This runbook implements the owner-approved 0.4.0 release shape: Genesis 001
continues serving its already admitted players on exact 0.3.43, Genesis 002
holds the selected Greater Realm atlas but has no admitted users, and all new
admission requests and admission operators are suspended.

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
- Genesis 001 baseline ABI SHA-256:
  `cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03`
- Genesis 001 freeze nonce:
  `3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00`
- Genesis 002 alias: `warpkeep-genesis-002` (must be absent before publish)
- Genesis 002 module identity: `warpkeep-genesis-002-sealed-v1`
- Genesis 002 atlas ID: `GENESIS_002_GREATER_REALM`
- Delete policy for both same-schema G001 freeze and fresh G002 publish:
  `never`

The G002 full database identity does not exist until the one fresh publication.
Record the returned 64-hex identity and require it to differ from Genesis 001.
No alias or environment override may substitute for either identity.

## Phase 0: preparation main remains inert

Before any production operation, the checked-in root package and lock remain
`0.3.43`. `config/releases/0.4.0-sealed-launch.json` has
`pagesDeploymentApproved: false`, null operational fields, and false G002,
legacy-presentation, and notification gates.

Require:

```sh
npm run verify:sealed-launch:preparation
```

The Pages classifier must emit `sealed-launch-blocked`. Its build and deploy
jobs must not start, so no install, build, artifact upload, Pages environment,
credential, or deployment action happens from preparation main.

## Phase 1: freeze Genesis 001 without changing its world

Publish only the exact same-schema module materialized from baseline
`2ae51984...`, with the pinned baseline ABI, freeze nonce, full G001 identity,
and `--delete-data=never`. The repository's current/future 86-table module is
not eligible source for this step.

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

Retain the owner-private final receipt and externally record only its approved
privacy-safe digest/commitment fields. Existing G001 players must still connect;
every request/admit/allow/re-enable/disable/revoke/reset/auth-epoch mutation
must fail before state or audit writes.

## Phase 2: export applicants privately, then suspend the monitor

Do not stop the monitor before the census boundary. Use the reviewed,
no-argument private census/export lane twice and compare the private results for
a stable boundary. Copy the owner-requested human-readable applicant TXT only
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

Only after the second stable export, reversibly suspend the retained
`com.warpkeep.hermes-admission-monitor` LaunchAgent: disable its service target,
boot it out, and keep the plist installed. The suspension receipt must prove
both `disabled=true` and `loaded=false`. Do not delete the plist or its private
state, and do not run any admit/allow mutation.

## Phase 3: deploy and prove the auth-bridge request kill switch

Deploy the reviewed auth-bridge source whose production-default kill switch is
true. Then run the direct live probe:

```sh
npm run verify:admission-request-suspension
```

It must observe both `POST` and browser `OPTIONS` on
`https://auth.warpkeep.com/v2/access/request` returning exact 503 JSON with
code `admission_requests_suspended`, no redirect, and the expected CORS/content
type. Read-only `/v2/access/status` preflight must remain 204. Bind the probe's
privacy-safe receipt digest and exact auth-bridge source commit.

## Phase 4: publish a fresh, private Genesis 002 module

Use the existing secure wrapper so `WARPKEEP_ADMIN_TOKEN_SECRET` is injected
only into the operator process:

```text
/Users/marko/Library/Application Support/Warpkeep/operations/bin/warpkeep-secrets run-admin -- <reviewed command>
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

Also require the full focused/adversarial test set, generated G002 binding diff
check, source-built locked-cache exercise, exact G001 frozen receipt inspection,
second stable census proof, monitor suspension receipt, live auth suspension
probe, G002 fresh publish receipt, G002 import receipt, and final sealed live
receipt. Receipts committed to the release binding must contain no applicant
data, raw census digest, applicant count, administrator secret, CLI config
contents, token, or private filesystem path.

## Phase 7: atomic 0.4.0 activation successor

Only after every prior operation and review gate is green, create one small
reviewed successor that atomically:

1. changes root package/lock/release identity from 0.3.43 to exact 0.4.0;
2. preserves truthful copy: Genesis 001 at 0.3.43, Genesis 002 sealed at 0.4.0,
   and new admissions suspended;
3. fills every exact non-null privacy-safe operational binding and its
   domain-separated commitment;
4. proves the preparation commit and frozen G001 baseline are ancestors;
5. retains all G002, legacy presentation, and notification gates false; and
6. sets `pagesDeploymentApproved: true`.

Require `npm run verify:sealed-launch:activation` on the exact activation
commit. Pages must repeat that verifier and the direct live auth-bridge probe
before build and again before deployment. Missing, partial, extra, swapped,
random, stale, populated, open, or wrong-target receipts must block deployment.

Archive the private operational evidence outside the repository. The checked-in
binding is a privacy-safe coordination record, not authority to admit users or
activate Genesis 002 later.
