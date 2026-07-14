# Warpkeep QA Observatory

The QA Observatory is a read-only, machine-bound production presentation path.
It is not a player, administrator, Farcaster, admission, or Terms bypass. The
normal Warpkeep product flow remains unchanged.

The browser receives only a bounded, FID-free Realm presentation snapshot from
a loopback broker. The browser never receives the Secure Enclave key, a player
session, an administrator secret, a SpacetimeDB credential, or a Farcaster proof.
The bridge uses a fresh internal 15-second snapshot-resolver credential only to
call one fixed read-only procedure, validates its exact response, and discards
the credential before returning sanitized JSON.

## Authority boundaries

- The macOS key is P-256, non-exportable, Secure Enclave backed, and stored with
  `AfterFirstUnlockThisDeviceOnly` accessibility under the dedicated Keychain
  application tag `com.warpkeep.qa-observatory.device-key.v1`.
- A one-minute, atomically consumed challenge binds the exact issuer, route,
  `realm.snapshot` scope, registered RFC 7638 thumbprint, nonce, and expiry.
- Registration is a fixed canonical `registeredAt`/`expiresAt` pair. It
  must outlive the challenge and span at most 366 days from its registration
  timestamp, forcing annual owner-reviewed reauthorization without daily human
  interaction. A too-long expiry remains rejected; it cannot become valid as
  time passes.
- The Worker gate is independent of public Farcaster authentication and remains
  checked in as disabled. Disabling the gate or atomically removing the complete
  registered key/timestamp tuple revokes this Mac without changing player
  sessions.
- The internal snapshot resolver has no FID and is rejected by every player,
  administrator, and auth-epoch resolver guard. Its credential is never returned.
- The snapshot contains 1–100 castles and excludes FIDs, identities, admission,
  ownership, Terms, wallets, receipts, private Marks state, tokens, sessions,
  audit data, and PFP URLs.
- The development observer page and native helper are absent from the public
  Pages artifact. The loopback broker binds only `127.0.0.1`, writes no snapshot
  to disk, and clears its bounded in-memory snapshot cache after 30 seconds.

## Bridge wire contract

The helper calls `POST https://auth.warpkeep.com/v1/qa/challenge` with a
zero-byte body and no `Origin`. It reconstructs this exact UTF-8 ASCII value
using LF separators and no trailing newline:

```text
warpkeep-qa-observer-v1
issuer=https://auth.warpkeep.com
endpoint=/v1/qa/realm-snapshot
scope=realm.snapshot
requestId=<base64url request ID>
challenge=<base64url challenge>
keyThumbprint=<RFC 7638 P-256 JWK thumbprint>
expiresAt=<decimal epoch milliseconds>
```

It signs with P-256 ECDSA/SHA-256, converts Secure Enclave's DER result to one
64-byte IEEE-P1363 `r || s` signature, base64url-encodes it without padding,
and sends exactly `{ "requestId": "...", "signature": "..." }` to
`POST /v1/qa/realm-snapshot`. Neither route accepts query parameters, browser
origins, CORS, credentials in URLs, or additional fields.

## Local commands

Build and ad-hoc sign the native helper into the owner-only application support
directory:

```sh
npm run qa:observer:build-helper
```

Create the Secure Enclave key only during the separately approved enrollment:

```sh
"$HOME/Library/Application Support/Warpkeep/qa-observatory/bin/warpkeep-qa-device" generate
```

`generate` reports only whether the key is present; routine status and build
output never print its public thumbprint. The private key is not exportable.
`enrollment-jwk` emits only the public JWK for a direct, owner-reviewed pipe into
the Worker secret command; never put it in a file, argument, ticket, or chat.
The registration workflow derives and privately checks the RFC 7638 thumbprint
without adding it to routine logs. `snapshot` prints only the sanitized
presentation document.

Start the loopback broker after enrollment and production activation:

```sh
npm run qa:observer:broker
npm run dev -- --host 127.0.0.1
```

Then open `http://127.0.0.1:5173/dev/realm-observer-qa.html`. The observer route
must visibly identify itself as read-only and cannot expose player-owned controls.

## Approval-gated activation

Local tests and helper compilation do not authorize production changes. These
remain separate one-time checkpoints:

1. review the exact module diff and non-destructive aggregate preflight;
2. approve publishing the additive procedure/claim policy with data deletion forbidden;
3. approve the new QA challenge Durable Object binding and migration;
4. generate the Secure Enclave key and privately review its public thumbprint;
5. rebuild the locally signed helper and pass a supervised, output-suppressed
   key-continuity self-test before relying on unattended rebuilds;
6. approve registering only that public JWK plus its fixed canonical
   registration and expiry timestamps as managed Worker values;
7. deploy with the QA gate still disabled and verify configuration attestation;
8. explicitly enable the QA gate, request one sanitized snapshot, and confirm
   zero game-state and private-data changes;
9. install a reviewed non-root LaunchAgent only after the supervised local run passes.

Daily operation after activation needs no QR scan or human input, but it does not
replace periodic human testing of genuine Farcaster and Terms consent.

## Autonomous local QA cycles

The cycle runner invokes an exact, attested allowlist of repository validation
scripts and a version-pinned local SpacetimeDB CLI for the local-only module
checks. That allowlist contains no deploy, publish, enrollment, administrator,
player-authentication, or browser command. It supplies an isolated runtime home,
temporary directory, and npm cache; disables npm debug-log retention and user
npm configuration; and discards child stdout and stderr. A report contains only
the tier, overall status, check identifiers, and durations.

The runner is deliberately not described as an operating-system sandbox.
Reviewed repository code and the signed-in macOS account remain trust boundaries:
a malicious test or compiler process could try to use that user's ordinary
filesystem, Keychain, or network authority. Package-script attestation prevents
simple command redirection but cannot make arbitrary repository code harmless.
Run this only from a reviewed Warpkeep checkout; use a separate restricted macOS
account or stronger OS isolation before treating untrusted changes as executable.
The machine-bound QA credential remains narrower: repository checks never receive
it, and even same-user code can ask the native helper only for its fixed sanitized
snapshot operation. The runner retains its isolated `HOME`; it does not reopen
the signed-in user's SpacetimeDB config directory.

Run a single local cycle manually:

```sh
npm run qa:observer:cycle -- --tier=quick --broker=off
```

`--broker=health` adds one bounded `GET` to the exact loopback health endpoint
`http://127.0.0.1:41731/healthz`. It does not request a snapshot, contact the
bridge, or cause the native helper to use its device key. Broker probing is
fail-closed and never follows redirects or sends credentials.

`--broker=snapshot` instead exercises the activated machine-bound read model by
issuing one bounded `GET` to exactly `http://127.0.0.1:41731/snapshot`, with the
fixed allowed browser Origin `http://127.0.0.1:5173`. The loopback broker may
then ask the native helper for its single sanitized read-only snapshot. The
runner never receives the device key, helper proof, resolver credential, or any
unsanitized response. It caps the body at 256 KiB, validates the complete
FID-free schema again, discards the data, and records only pass/fail/duration.
This mode is appropriate only after the separately approved broker and remote
read gate are active.

The tiers intentionally trade coverage for hourly cost:

- `quick` runs the focused observer/security tests and root typecheck.
- `standard` runs all root unit tests, typecheck, runtime-asset verification,
  and file-size policy.
- `deep` adds a production build, every auth-bridge typecheck/test, and the
  SpacetimeDB typecheck, pure tests, local module build, committed-binding
  verification, and non-destructive additive-migration proof.
- `auto` selects deep on local hours divisible by six, standard on other local
  hours divisible by three, and quick otherwise.

Every command has a fixed timeout, the entire cycle is capped below one hour,
and an owner-only lock prevents runner overlap. The runner passes a small
environment allowlist and routes child stdout and stderr to `/dev/null`; its
private JSON report never contains either stream. Any timeout, failed check,
invalid response, unsafe filesystem state, command-contract mismatch, or
malformed report makes the cycle fail.

Terse JSON reports are atomically created with mode `0600` under
`~/Library/Application Support/Warpkeep/qa-observatory/reports`. Directories use
mode `0700`; only recognized report names are eligible for retention cleanup.
Reports older than 14 days are removed, with an additional cap of 200 files.

The checked-in
`scripts/qa-observer/launchd/com.warpkeep.qa-cycle.plist.template` is deliberately
inert. It describes twelve hourly local-time triggers from 08:00 through 19:00,
and each scheduled cycle requests the fixed snapshot probe, but no repository
command installs or loads it. It still references a mutable checkout and is not
an immutable execution boundary. Keep it uninstalled until its absolute paths,
source revision or installed-copy attestation, local time window, local broker,
machine enrollment, and remote read-only gate have been reviewed and separately
approved. Do not run `launchctl` as part of repository validation.

## Residual risk and revocation

Secure Enclave makes the key non-exportable and device-bound, but unattended use
means malware running as the signed-in user may still ask the installed helper
to perform its one fixed snapshot operation. The narrow output and lack of any
mutation capability limit that risk. Keep QA screenshots and reports private,
mode `0600`, with short retention.

The checked-in helper is locally ad-hoc signed. Long-term Keychain access across
binary rebuilds must be proven by the supervised continuity checkpoint above;
if it fails, stop and establish a stable local signing identity/access-group
design before registration rather than regenerating or weakening the key.

Revoke remotely by disabling the QA gate or atomically removing the complete
registered key/timestamp tuple. Unload and delete the LaunchAgent separately.
Deleting the Secure Enclave key is destructive and must remain an explicit owner
action; no repository command does it.
