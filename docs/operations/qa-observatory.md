# Warpkeep QA Observatory

The QA Observatory includes a read-only, machine-bound production presentation
path, a separate synthetic local journey lab, and a local rendered-WebGL
fixture. None is a player, administrator, Farcaster, admission, or Terms
bypass. The normal Warpkeep product flow remains unchanged.

The observer browser page uses a deterministic, synthetic FID-free fixture. No
browser QA page receives a production snapshot, Secure Enclave key, player
session, administrator secret, SpacetimeDB credential, or Farcaster proof.
Separately, an owner-private
Unix-domain-socket broker may ask the native helper for one bounded sanitized
snapshot during an explicitly approved local runner probe. The bridge uses a
fresh internal 15-second snapshot-resolver credential only to call one fixed
read-only procedure, validates its exact response, and discards the credential
before returning sanitized JSON.

The journey lab must use one internal synthetic renderer key because the player
presentation validates ownership consistency. That key is generated from the
fixed local fixture, is never a real identity, and never leaves React memory.
The lab has no channel URL, decodable QR payload, auth provider, backend client,
browser credential, persistence, or production authority.

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
  Pages artifact. The browser observer is fixture-only. The optional broker
  listens only on `~/Library/Application Support/Warpkeep/qa-observatory/broker.sock`,
  whose directory is mode `0700` and socket is mode `0600`; it has no TCP
  listener, CORS policy, or browser route. It writes no snapshot to disk and
  clears its bounded in-memory snapshot cache after 30 seconds.

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

Start the owner-private broker only after the separately approved enrollment and
activation. It exists for a local runner probe, not for browser access:

```sh
npm run qa:observer:broker
```

For browser QA, run the local dev server and open
`http://127.0.0.1:5173/dev/realm-observer-qa.html`. This observer route uses
only a deterministic local fixture, visibly identifies itself as read-only, and
cannot expose player-owned controls.

For the complete synthetic presentation matrix, bind Vite explicitly to
loopback and open the journey lab:

```sh
npm run dev -- --host 127.0.0.1
```

```text
http://127.0.0.1:5173/dev/qa-journey.html
```

The lab is compiled active only for the Vite serve command and rejects every
hostname except exact loopback (`localhost`, `127.0.0.1`, or IPv6 loopback).
This is local transport confinement, not hardware identity or device
attestation; its safety comes from having no production authority or data.
The production build has one explicit HTML input (`index.html`), then scans the
artifact for every journey/observer entry and marker. The old standalone player
fixture was removed; the journey lab supersedes it without a live PFP or remote
asset URL.

The default `journey` view walks through the real menu and Terms component, then
uses controls to advance a non-scannable synthetic auth presentation through
verification and pending admission. Checking admission changes only local React
state. The authenticated entry requires the Terms checkbox again before the
synthetic canonical Realm mounts. Direct scenario selection is available for
visual isolation, and `?autocycle=1&interval=6000` cycles the presentation-only
views every six seconds. The interval is bounded to 2–30 seconds. This is a QA
fixture shortcut, not a credential or route into the deployed game.
The modal remains above and blocks every lab control, auto-cycle excludes the
interactive journey and Terms fixture, direct authenticated views are
presentation-only, and external-origin link clicks are suppressed inside the
lab. A real WebGL run may still fetch ordinary same-origin game assets from the
loopback Vite server so the Realm renderer can be visually tested.

## Rendered WebGL fixture

The rendered-WebGL page is a separate local visual check for the real Realm
renderer. It always uses 100 deterministic synthetic castles at every
canonical slot. Its owners, keep names, usernames, and portrait flags are
fixture data only: no real identity, FID, PFP URL, player profile, wallet,
Terms record, auth state, production snapshot, or remote profile host is read
or accepted.

Bind Vite to loopback explicitly, then have the small contract helper print the
exact local URL for one reviewed quality mode:

```sh
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
node scripts/qa-observer/rendered-webgl-qa-contract.mjs --url high 5173
```

The helper only formats the URL; it does not start a server or browser, make a
network request, read browser state, or write a report. Open the printed URL in
a local browser for interactive visual review. The page accepts exactly one
reviewed `quality` value:
`?quality=high`, `balanced`, or `reduced`. Duplicate or unrelated query
parameters and any other value fail closed to the reviewed `balanced` default.
The selected value is passed directly to the actual Realm quality override, so
each reviewed query exercises its corresponding castle LOD and render budget.
If the reviewed loopback port is busy, choose an unused local port explicitly
in both commands rather than allowing Vite to select one implicitly.

A rendered pass is valid only when the map root exposes
`.realm-map-screen[data-renderer="webgl"]` and the local overlay exposes
`data-rendered-webgl-status="ready"`. `fallback`, `error`, `closed`, or a
permanent `loading` state is a failed/unfinished check; the fallback is visibly
labeled “not a render pass.” The overlay exposes only fixture ID, selected
quality, castle count, renderer result, and a bounded local-ready duration. It
does not retain or transport those values.

This page is compiled only for Vite serve mode and rejects every non-loopback
hostname. Its page code has no browser-automation dependency. Run the separate
machine-local rendered probe with:

```sh
npm run qa:rendered-webgl
```

The probe uses the installed
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` in new headless
mode. It atomically binds an in-process Vite middleware server to a numeric
`127.0.0.1` port selected by the kernel, creates a fresh owner-private temporary
Chrome profile, and begins at `about:blank`. Extensions, saved browser state,
Keychain access, first-run/default-app behavior, sync, updates, metrics, and
background networking are disabled. A deny-by-default host resolver plus Chrome
DevTools request interception blocks every page request and navigation outside
the selected numeric loopback origin. Same-origin Vite WebSocket and renderer
Blob URLs are allowed; alternate ports, `localhost`, HTTPS, data URLs, and
foreign origins fail the run.

Chrome runs seven fixed cases: every quality at 1440×900, one invalid query that
must fail closed to `balanced`, balanced and reduced presentation at 390×844,
an opened mobile castle inspector, and an opened 667×375 short-landscape
Explore surface. Every baseline must expose `renderer=webgl`, `status=ready`,
fixture `synthetic-canonical-100`, castle count `100`, the expected effective
quality, and a ready duration within the 120-second fixture bound. The responsive
contract additionally checks exact viewport dimensions, horizontal overflow,
map coverage, text-bearing in-bounds castle labels, label collisions, visible
UI exclusion regions, displaced-label roof connectors, 44px primary controls,
inspector/Explore state, and page warnings/errors.

For each accepted state Chrome captures one transient PNG in memory. A strict,
bounded decoder immediately reduces it to opaque-sample, colour-bucket, and
luminance-range evidence so a blank/black or implausibly uniform frame cannot
pass on DOM metadata alone. Pixel buffers and encoded PNG bytes are discarded
inside the case; no screenshot, DOM, console message, network payload, identity,
or per-case timing is written to disk or included in a QA report. Fallback,
error, timeout, an unexpected target, foreign network activity, page diagnostic,
layout violation, or implausible pixels fails closed. Chrome, Vite, and the
temporary profile are torn down in a `finally` path. The parent QA report records
only the aggregate check identifier, pass/fail/timeout status, and total duration.

The exact browser probe runs in quick, standard, and deep QA cycles. Unit tests
exercise its URL, process-spawn, endpoint, network-boundary, DOM-attestation,
and bounded PNG-decoder contracts without launching Chrome. If an owner chooses
to retain a separate interactive screenshot, save it manually outside the
worktree as an owner-only (`0600`) private artifact after review; the automated
fixture retains no screenshot or standalone report.

## Approval-gated activation

Local tests and helper compilation do not authorize production changes. These
remain separate one-time checkpoints:

1. review the exact module diff and non-destructive aggregate preflight;
2. approve publishing the additive procedure/claim policy with data deletion forbidden;
3. approve the new QA challenge Durable Object binding and migration;
4. establish a stable macOS signing identity, access-group design, and a
   separate restricted QA account; do not enroll a key while the helper is only
   ad-hoc signed;
5. generate the Secure Enclave key and privately review its public thumbprint;
6. rebuild the signed helper and pass a supervised, output-suppressed
   key-continuity self-test before relying on unattended rebuilds;
7. approve registering only that public JWK plus its fixed canonical
   registration and expiry timestamps as managed Worker values;
8. deploy with the QA gate still disabled and verify configuration attestation;
9. explicitly enable the QA gate, request one sanitized snapshot, and confirm
   zero game-state and private-data changes;
10. install a reviewed non-root LaunchAgent only after the supervised local run passes.

Daily operation after activation needs no QR scan or human input, but it does not
replace periodic human testing of genuine Farcaster and Terms consent.

## Autonomous local QA cycles

The cycle runner invokes an exact, attested package-script contract, the exact
headless rendered-WebGL probe described above, and a version-pinned local
SpacetimeDB CLI for local-only module checks. The synthetic test-file list and
browser-probe path are hard-coded in the reviewed runner. No check contains a
deploy, publish, enrollment, administrator, player-authentication, Terms bypass,
or production URL command. It supplies an isolated runtime home,
temporary directory, and npm cache; disables npm debug-log retention and user
npm configuration; and discards child stdout and stderr. A report contains only
the tier, overall status, check identifiers, and durations.

The runner is deliberately not described as an operating-system sandbox.
On this Mac, every reviewed non-browser child check now runs under the checked-in,
exact-content-attested `sandbox-exec` profile
`scripts/qa-observer/qa-cycle-network.sb`. The complete child process tree may
use only loopback IP plus owner-private QA and temporary Unix sockets; all other
network operations are denied by the operating system. The rendered-WebGL check
is the one explicit exception because Chrome cannot start safely inside a
second macOS sandbox without disabling Chrome's own sandbox. It retains its
fresh profile, deny-by-default host resolver, DevTools request interception,
exact numeric-loopback origin, and foreign-network fail-closed contract.
`sandbox-exec` is deprecated and is only a network containment layer: reviewed
repository code and the signed-in macOS account remain trust boundaries, and a
malicious test or compiler process could still try to use that user's ordinary
filesystem or Keychain authority.
Package-script and sandbox-profile attestation prevent simple command
redirection or policy drift but cannot make arbitrary repository code harmless.
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

`--broker=health` adds one bounded `GET /healthz` through the exact owner-private
Unix socket. It does not request a snapshot, contact the bridge, or cause the
native helper to use its device key. Broker probing is fail-closed and does not
use TCP, CORS, a browser, redirects, or credentials.

`--broker=snapshot` instead exercises the activated machine-bound read model by
issuing one bounded `GET /snapshot` through the same owner-private Unix socket.
The broker may then ask the native helper for its single sanitized read-only snapshot. The
runner never receives the device key, helper proof, resolver credential, or any
unsanitized response. It caps the body at 256 KiB, validates the complete
FID-free schema again, discards the data, and records only pass/fail/duration.
This mode is appropriate only after the separately approved broker, stable
signing/caller-bound design, and remote read gate are active. It never supplies
data to browser JavaScript.

The tiers intentionally trade coverage for hourly cost:

- `quick` runs the focused observer/security tests, an explicit synthetic app
  state lane, the seven-case responsive rendered-WebGL browser probe, and root typecheck.
  The synthetic lane covers Terms, every
  Farcaster and backend-admission presentation phase, title/menu transitions,
  settings, credits, patch notes, menu-to-Realm orchestration, canonical
  readiness, Realm HUD/accessibility/inspection/interaction, and both
  player/observer Realm fixtures. The journey harness test fails on `fetch`,
  XHR, WebSocket, EventSource, cookie, IndexedDB, or any Storage operation.
  Other selected lifecycle tests deliberately exercise isolated jsdom storage
  fixtures; none can reach a user's browser store or production service.
- `standard` runs all root unit tests, typecheck, the rendered-WebGL browser
  probe, runtime-asset verification, and file-size policy.
- `deep` adds a production build, repeats the rendered-WebGL browser probe,
  every auth-bridge typecheck/test, and the
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
Private QA audit notes live outside any Git worktree under
`~/Library/Application Support/Warpkeep/qa-observatory/audit`, also mode `0700`
with mode-`0600` files.

The checked-in
`scripts/qa-observer/launchd/com.warpkeep.qa-cycle.plist.template` is deliberately
inert. It describes twelve hourly local-time triggers from 08:00 through 19:00,
and each scheduled cycle keeps the broker disabled, but no repository command
installs or loads it. It still references a mutable checkout and is not
an immutable execution boundary. Keep it uninstalled until its absolute paths,
source revision or installed-copy attestation, local time window, local broker,
machine enrollment, and remote read-only gate have been reviewed and separately
approved. Do not run `launchctl` as part of repository validation.

This workstation instead uses the private Codex desktop automation
`warpkeep-12-hour-local-qa` for those twelve hourly cycles. Its prompt runs the
exact broker-off runner, including its fresh-profile loopback rendered probe,
may open only the loopback synthetic journey lab for additional visual review,
and forbids real Terms/authentication, production mutation, deployment, key
work, commits, pushes, and LaunchAgent installation. The automation is not
stored in this repository and grants no production authority. Disable or edit
it through Codex automation controls; do not add a second operating-system
scheduler.

## Residual risk and revocation

Secure Enclave makes the key non-exportable and device-bound, but unattended use
means malware running as the signed-in user may still ask the installed helper
to perform its one fixed snapshot operation. A Unix socket excludes other local
accounts and browser-origin spoofing, but it cannot distinguish malicious code
already executing as the same macOS user. The narrow output and lack of any
mutation capability limit that risk; stable signing, XPC/code-identity controls,
and a restricted QA account remain required before enrollment. Keep QA
screenshots and reports private, mode `0600`, with short retention.

The checked-in helper is locally ad-hoc signed. Long-term Keychain access across
binary rebuilds must be proven by the supervised continuity checkpoint above;
if it fails, stop and establish a stable local signing identity/access-group
design before registration rather than regenerating or weakening the key.

Revoke remotely by disabling the QA gate or atomically removing the complete
registered key/timestamp tuple. Unload and delete the LaunchAgent separately.
Deleting the Secure Enclave key is destructive and must remain an explicit owner
action; no repository command does it.
