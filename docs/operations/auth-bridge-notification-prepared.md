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
group/world-writable state, extra directory entries, noncanonical bytes, and
filename/digest disagreement fail closed. Installation uses an exclusive
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
the response digest. The receipt must also be active at verification time.

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
commit to current protected `main`, rechecks a clean detached checkout, uses the
lockfile-pinned auth-bridge toolchain, proves bridge-only intent, checks that the
Hermes source gate and Pages repository variable remain false, and then stops.

The stop is deliberate:

```text
AUTH_BRIDGE_PREPARED_DEPLOY_ADAPTER_AND_PRIVATE_SINK_UNAVAILABLE
```

The repository currently has no reviewed production adapter that can, as one
cancellation-safe operation:

1. read the PRE-deploy private config attestation without disclosure;
2. preserve the exact live public-auth and expected-FID modes while enabling
   only bridge notification delivery with pinned Wrangler;
3. bind the Cloudflare account, Worker identity, uploaded source/version, route,
   variables, durable-object binding, migration, and 100% rollout;
4. verify both the control plane and fresh public/private endpoints; and
5. durably export the `0600` receipt to a protected private sink.

The workflow therefore fails before loading administrator or Cloudflare
credentials and contains no direct deploy command or artifact upload. Adding a
raw Wrangler invocation or storing the receipt in an Actions artifact would not
close this dependency.

The final Pages workflow additionally depends on a reviewed private handoff that
places the exact receipt in its account-home production-admin state without
argv, logs, artifacts, or `dist`; binds the Pages head to the prepared bridge
source under the approved ancestry rule; and cross-checks the active-v17 server
and actual deployed-module receipt before presentation can be enabled. Until
that consumer and the deployment adapter exist, all checked-in application
flags remain false.
