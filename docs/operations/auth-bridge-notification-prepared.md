# Auth bridge notification preparation

This phase prepares notification delivery at `https://auth.warpkeep.com`
without enabling founder-admission execution or Pages presentation. It is a
short-lived evidence boundary, not authorization for either later phase.

## Closed receipt contract

`scripts/auth-bridge-notification-prepared-receipt.mjs` accepts one ordered JSON
object and no other shape:

```text
schemaVersion
kind
bridgeOrigin
bridgeSourceCommit
notificationDeliveryContractDigest
notificationClientCount
notificationDeliveryEnabled
notificationTransportConfigured
admissionNotificationStoreConfigured
publicAuthEnabledBefore
publicAuthEnabledAfter
accessExpectedFidRequiredBefore
accessExpectedFidRequiredAfter
hermesExecutionApproved
pagesPresentationEnabled
liveAttestationDigest
preparedAt
expiresAt
```

The kind is
`warpkeep-auth-bridge-notification-prepared-v1`, the origin is exactly
`https://auth.warpkeep.com`, the notification count is exactly one, and all
three bridge readiness booleans are true. `hermesExecutionApproved` and
`pagesPresentationEnabled` are always false. Public-auth and expected-FID modes
must each be identical before and after preparation. Times use canonical
millisecond UTC and expiry must be later than preparation but no more than 24
hours later.

The live attestation digest is SHA-256 over the exact compact canonical JSON of
the exported ten-field `/v1/release-attestation` object. The parser from
`scripts/auth-bridge-config-attestation.mjs` remains the authority for those ten
fields; this phase does not introduce a second endpoint, profile, or delivery
digest ABI. The v1 notification delivery contract digest is fixed to
`13429727ea5257946e3b659e07f912cf8cd81985fadecb03c63311994a01f7d9`.

## Private state and verification

Receipts are content-addressed below the OS account home returned by
`os.userInfo()`, never `$HOME`:

```text
~account/.warpkeep/private/production-admin-v1/
  bridge-prepared-receipts-v1/
    auth-bridge-notification-prepared-<receipt-sha256>.json
```

Every managed directory is owner-only `0700`; every receipt is a regular,
single-link, owner-only `0600` file. Repository overlap, symbolic aliases,
group/world-writable state, unrecognized directory entries, noncanonical bytes,
and filename/digest disagreement fail closed. The only non-receipt entries
admitted are bounded, canonical owner-only single-link publication temporaries;
they carry no receipt authority. Exact two-link crash pairs are revalidated by
inode, bytes, and digest, then repaired. Installation uses an exclusive
temporary file, `fsync`, and an atomic no-replace hard link.

Parsing an object does not authorize it for installation. The writer accepts
only an in-process, opaque preparation result. That result is created by this
module only after the canonical credentialed config verifier reads the private
PRE-deploy modes, the supplied deployment operation completes, the credentialed
POST-deploy config has notification delivery/transport/count ready with both
auth modes unchanged, and the fresh public attestation agrees with the expected
protected source commit and fixed delivery digest. The private
administrator credential is never passed to the deployment callback. A failed
deployment or either failed postflight produces no writable receipt.

Verification always performs a new credential-free `GET` to the exact HTTPS
host and path. It sends no query, body, Origin, cookie, or authorization header;
disables caching and redirects; rejects CORS, cache-age, redirect, and cookie
response evidence; requires the endpoint security headers and an origin `Date`
no more than five minutes old; parses exact canonical bytes; and rebinds source,
delivery digest, client count, readiness modes, both preserved auth modes, and
the response digest. Advertised and decoded bodies are independently bounded;
`Content-Length` must equal decoded bytes only for absent or identity content
coding, because Fetch exposes decoded gzip bytes while Cloudflare may retain
the compressed wire length. The receipt must also be active at verification
time.

The CLI keeps the private path out of argv and success output:

```sh
WARPKEEP_AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_PATH=/private/path/to/receipt.json \
  npm run verify:auth-bridge-notification-prepared
```

The path must still resolve to the canonical production-admin directory. The
environment entry is deleted before file or network inspection.

## Protected workflow status

`.github/workflows/notification-bridge-prepared.yml` is manual-only and uses the
protected `notification-bridge-prepared` environment. It binds the requested
commit, dispatch SHA, checkout, and every write permit to current protected
`main`; rejects assume-unchanged or skip-worktree index entries; compares the
index and worktree directly with `HEAD`; rechecks a clean detached checkout;
uses the lockfile-pinned auth-bridge toolchain; proves bridge-only intent; and
checks that the Hermes source gate and Pages repository variable remain false.
The production-admin job deliberately
does not execute the auth-bridge `pnpm check` scripts: CI performs that
credential-free quality gate, while the production job will execute no
installed package byte until the fixed installed-tree authority has passed.

The mutation job is eligible only for a runner carrying all five labels:

```text
self-hosted
macOS
ARM64
warpkeep-production-admin
warpkeep-repository-exclusive
```

That runner must be a persistent, repository-exclusive machine account. Its OS
account home retains the owner-only deploy journal and prepared-receipt
namespace across failed jobs and runner restarts. Do not use an ephemeral,
autoscaling, shared-repository, containerized, or GitHub-hosted runner for this
workflow, and do not point its account home at the checkout or an Actions
temporary directory.

The protected environment must supply these four independently managed values:

```text
WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID
WARPKEEP_AUTH_BRIDGE_ZONE_ID
WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN
WARPKEEP_PRODUCTION_ADMIN_TOKEN
```

The Cloudflare token and bridge administrator token are distinct credentials.
The read-only GitHub run credential comes only from `github.token`; it is not
reused as either production credential. The workflow exposes the four
environment values only to the guarded deployment and recovery steps. Missing,
empty, malformed, ambient generic Cloudflare, proxy, or Node injection values
fail before production I/O. Without the exact runner labels and all protected
environment values, the workflow cannot execute the deploy path.

`scripts/auth-bridge-notification-prepared-deploy.mjs` is the only deployment
entrypoint. It receives no argv values. The credentials exist in the
entrypoint process's step-scoped environment at startup; they are not a
late-open private-file boundary. Before reading or copying them, the entrypoint
loads only Node built-ins and the builtins-only A and B attestors, and it spawns
`git` with a replacement environment that contains no credential. It verifies
the complete source closure, verifies the fixed installed tree, re-verifies the
source closure, binds the two opaque authorities to the same manifest, and
checks the clean checkout. Only then does it copy and delete the credential
environment entries and dynamically import the rest of the reviewed runtime.
It freshly
re-attests protected `main`, the exact in-progress manual run, and the clean
checkout before each Cloudflare write, then:

1. reads the PRE-deploy private config attestation without disclosure;
2. preserves the exact live public-auth and expected-FID modes while enabling
   only bridge notification delivery with pinned Wrangler;
3. binds the Cloudflare account, Worker identity, uploaded source/version,
   route, variables, secret-binding names, durable-object bindings, migration,
   and 100% rollout;
4. journals every irreversible boundary in the persistent owner-only namespace;
5. reconciles a prior upload or release before retrying any effect, and always
   performs a fresh postflight after an invoked release; and
6. verifies fresh public/private endpoints before installing the content-
   addressed `0600` receipt in the private account-home sink.

The static policy verifier validates the canonical
`auth-bridge-notification-prepared-deploy-closure-v1.json` manifest before any
release-policy check. Its 300 sorted path/digest records cover both protected
production workflows, the
Pages and Hermes policy inputs, the policy verifier, and the complete
AST-derived local import graphs rooted at the guarded bridge entrypoint, full
Hermes CLI, Pages build validator, Pages lane classifier, and builtins-only
private launcher. It also covers every matching `.d.mts` ABI, all 168 generated
Spacetime module bindings reached by Hermes, all 22 reached Spacetime policy
modules, all 17 Worker source modules, every file executed by the CI `pnpm
check` gate, the Greater Realm production bootstrap, and the exact auth-bridge
package, pnpm lock/workspace, TypeScript, Vitest, workerd, and Wrangler
configuration bytes. The derived Worker graph must equal the complete
`services/auth-bridge/src/*.ts` namespace. Missing files,
unresolved or newly added local imports, unreferenced Worker modules, manifest
omissions/additions, noncanonical manifest bytes, and any member digest change
all fail closed. Any closure edit therefore requires explicit review and a
deliberate manifest refreeze.

The protected workflows are the external bootstrap authority for the mutable
checkout. Their reviewed server-side bytes contain four exact SHA-256 pins: the
builtins-only A verifier, A manifest, builtins-only B verifier, and B manifest.
The Pages workflow contains the same four pins plus the exact builtins-only
private launcher digest. Trusted `/usr/bin/shasum` checks the relevant raw
checkout files before installation, after installation, and—on the
credentialed Pages job—again before any private operator command. A then
requires both checked-out workflows' pin values to equal those same raw bytes.
To avoid a self-hash cycle, only those exact quoted values are replaced by a
fixed marker when each workflow member digest is calculated; every other
workflow byte remains covered. A pin, namespace, verifier, or manifest change
therefore requires an explicit protected-workflow and manifest refreeze rather
than blessing the bytes discovered on the persistent runner.

The source closure byte-pins the reviewed
`auth-bridge-notification-prepared-installed-toolchain-darwin-arm64-v1.json`
authority. That second manifest is generated only during review; the workflow
has no regeneration or write mode. It binds pnpm 11.7.0, Node 22.22.3 on
darwin-arm64, the checked lockfile, exact top-level Wrangler, TypeScript, and
YAML 2.9.0 resolver links, required Wrangler/esbuild/workerd/TypeScript
executable paths, and a deterministic SHA-256 over 18,153 entries and
305,064,486 canonical bytes
in the copy-only, lifecycle-script-free `.pnpm` tree. A second digest fixes all
24 entries in the complete top-level resolver namespace: root and scoped
directories, every package link and exact target, metadata files, and root
`.bin` shims. Missing, redirected, substituted, or extra resolver entries fail
closed even when their target bytes exist elsewhere in the attested store.
Only pnpm's nondeterministic validation timestamp, absolute cache-store path,
and absolute service-root metadata key are replaced with fixed markers before
hashing; no resolver name, link, executable path, package byte, or setting is
normalized away.
Each directory, regular file, and relative in-tree symbolic link contributes
its path, type, mode, and content or target; owner, hardlink, no-follow, size,
count, and tree bounds are also enforced. All 31 path-dependent store `.bin`
shims and all six root shims are included after replacing only the exact
install-root prefix with a fixed marker; their remaining bytes, mode, path, and
canonical size are pinned and any substitution still fails. The production job
does not execute those shims. The checked-in manifest, rather than the
persistent runner contents, is the byte authority.

The bootstrap trust boundary is the pinned `actions/setup-node` and
`pnpm/action-setup` action revisions plus the protected GitHub Actions runtime.
They select exact Node 22.22.3 and pnpm 11.7.0 before the credential-free
copy-only install. The repository does not claim that the Node distribution or
pnpm installer bytes are members of the installed-package tree; instead, no
production secret is supplied until their output exactly matches the reviewed
tree authority. The dedicated runner must not grant the production-admin
labels unless its Actions bootstrap and runner image are separately trusted.
The opaque B authority also returns a cross-job `runnerIdentityDigest` over the
stable host, account/home, repository and filesystem identity plus A/B and tree
digests. Random per-job staged Node paths and inodes are deliberately excluded
from that cross-job digest, while the exact canonical Node executable remains
bound inside the in-process WeakMap authority. Thus two staged copies on the
same runner compare equal without allowing a different runner or copied
JavaScript object to acquire authority.

Serialization before the deployment journal relies on the workflow's global,
non-cancelling GitHub concurrency group and the dedicated runner's operational
contract: its account and work directory are repository-exclusive and no local
process may install or execute this checkout while a job is active. The
crash-recoverable, process-identity-bound journal lock takes over before any
Cloudflare mutation. The byte attestation is repeated inside the deployment
process before credentials are copied from its step-only environment. A runner
that cannot enforce this exclusive-account contract is not eligible for the
required labels.

The primary step records only that the guarded entrypoint began and suppresses
its safe receipt-digest stdout. If it fails, an `always()` recovery step invokes
the same state machine and persistent journal. The job succeeds only when the
primary invocation or recovery completes verified. An ambiguous already-
invoked release that cannot be reconciled fails for explicit owner
adjudication; it is never retried blindly. Forced runner loss may prevent the
same job from reaching its recovery step, so the owner must rerun the exact
manual workflow on the same persistent runner and source commit. Concurrency is
non-cancelling and globally serialized.

No receipt, receipt path, administrator secret, or Cloudflare secret is placed
in argv, logs, step outputs, artifacts, the checkout, or `dist`. The workflow
contains no direct Wrangler mutation, `curl`, artifact upload, or receipt export.

The final Pages workflow additionally depends on a reviewed private handoff that
places the exact receipt in its account-home production-admin state without
argv, logs, artifacts, or `dist`; binds the Pages head to the prepared bridge
source under the approved ancestry rule; and cross-checks the active-v17 server
and actual deployed-module receipt before presentation can be enabled. Until
that consumer is complete and the later release authorities are checked in,
all application presentation and Hermes execution flags remain false.
