# Warpkeep QA Observatory

The QA Observatory includes a read-only, machine-bound production attestation
path, a separate synthetic local journey lab, and a local rendered-WebGL
fixture. None is a player, administrator, Farcaster, admission, or Terms
bypass. The normal Warpkeep product flow remains unchanged.

The observer browser page uses a deterministic, synthetic FID-free fixture. No
browser QA page receives a production attestation, Secure Enclave key, player
session, administrator secret, SpacetimeDB credential, or Farcaster proof.
Separately, an owner-private
Unix-domain-socket broker may ask the native helper for one bounded aggregate
attestation during an explicitly approved local runner probe. The bridge uses a
fresh internal 15-second snapshot-resolver credential only to call the fixed
read-only `qa_observer_get_realm_attestation_v2` procedure, validates its exact
response, and discards the credential before returning closed-shape JSON.

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
  checked in as disabled. Repository attestation requires the two exact disabled
  gate values and rejects any checked-in observer registration tuple. This is a
  source-control assertion only; this review does not claim to have queried the
  live deployed values. Disabling the gate or atomically removing the complete
  registered key/timestamp tuple revokes this Mac without changing player sessions.
- The internal snapshot resolver has no FID and is rejected by every player,
  administrator, and auth-epoch resolver guard. Its credential is never returned.
- The v2 attestation contains only canonical world/realm fields plus
  `castleCount`, `profileCount`, `foundedCount`, and `activeCount`. It requires
  1–100 castles, exact castle/profile count equality, and founded/active count
  equality. No per-castle collection, castle ID, coordinate, keep or player
  name, username, display name, bio, portrait signal, FID, Identity, admission,
  ownership, Terms, wallet, receipt, Marks, token, session, or audit data leaves
  the server.
- The development observer page and native helper are absent from the public
  Pages artifact. The browser observer is fixture-only. The optional broker
  listens only on `~/Library/Application Support/Warpkeep/qa-observatory/broker.sock`,
  whose directory is mode `0700` and socket is mode `0600`; it has no TCP
  listener, CORS policy, or browser route. It writes no attestation to disk and
  clears its bounded in-memory attestation cache after 30 seconds. The broker
  caps its connection count, accepts one request per socket, rejects request
  bodies and upgrade semantics, and re-attests both the socket inode and helper
  executable identity across each operation. Helper stdout and each bridge
  response are capped at 16 KiB.

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

The `/v1/qa/realm-snapshot` path and `realm.snapshot` scope are retained as
compatibility names for the device proof protocol; they do not describe a
per-player Realm snapshot. After proof, the Worker calls only
`qa_observer_get_realm_attestation_v2`. The deployed-schema-compatible
`qa_observer_get_realm_snapshot_v1` procedure immediately fails with
`QA_OBSERVER_V1_DISABLED` before authentication, transaction entry, or any
database read. The successful v2 response has exactly this closed shape:

```text
{
  version: 2,
  protocolVersion: 3,
  worldSeed: 3445214658,
  worldSeedName: "HEGEMONY_GENESIS_001",
  worldTileCount: 1261,
  worldTileMetaCount: 1261,
  realm: {
    realmId: "GENESIS_001",
    numericSeed: 3445214658,
    generationVersion: 2,
    authoritativeRadius: 20,
    renderRadius: 22,
    playerCapacity: 100
  },
  aggregates: {
    castleCount: u32,
    profileCount: u32,
    foundedCount: u32,
    activeCount: u32
  }
}
```

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
without adding it to routine logs. The compatibility-named `snapshot` command
prints only the aggregate v2 attestation.

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
Any process on this Mac can in principle request the loopback fixture while its
development server is running. That is intentional: hardware-gating synthetic
pixels would add fragility without protecting player authority. Only the
optional aggregate production observer uses the Secure Enclave device key, and
that gate remains disabled until the approval checkpoints below are satisfied.
The production build has one explicit HTML input (`index.html`), then scans the
artifact for every journey/observer entry and marker. The old standalone player
fixture was removed; the journey lab supersedes it without a live PFP or remote
asset URL.

The default `journey` view walks through the real menu and Terms component, then
uses controls to advance a non-scannable synthetic auth presentation through
verification and pending admission. Checking admission changes only local React
state. The authenticated entry requires the Terms checkbox again before the
synthetic canonical Realm mounts. The exact scenario list and expected
accessible landmark for every direct state live in one data-only manifest shared
by the React lab and the headless journey probe, preventing the two matrices from
silently drifting. Direct scenario selection is available for visual isolation,
and `?autocycle=1&interval=6000` cycles the presentation-only views every six
seconds. The interval is bounded to 2–30 seconds. This is a QA fixture shortcut,
not a credential or route into the deployed game.
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
Terms record, auth state, production attestation, or remote profile host is read
or accepted.

Castle-model availability is deliberately independent of two-dimensional label
placement. Every canonical castle candidate remains available to the scene's
own frustum and LOD presentation, with the same set available for raycasting.
Every founded castle whose conservative direct-control box fits inside the viewport
must expose one username rail at its exact projected foundation base. Camera
distance and LOD may not move or aggregate it. Fully clipped edge controls stay
out of the interactive world layer, while Explore retains complete castle
coverage. The identity-keyed React control survives camera and LOD changes.
Exactly one visible rail is tabbable; arrow keys move spatially, Home/End follow
deterministic reading order, and focus recovers to the nearest surviving rail
when projection removes the active one.

Automatic keeper clusters, group connectors, and overflow identities remain
forbidden. A rail conservatively obstructed by visible Realm UI stays available
in Explore instead of entering the world layer. The probe rejects any visible
rail that leaves the viewport, overlaps reserved UI, is obstructed by non-label
content, lacks accessible text, or falls below the 44-by-44-pixel hit target.
It records bounded label-on-label contention as collision telemetry because
exact foundation attachment takes precedence over displacement or identity
loss. Opening Explore or the inspector must preserve valid world-label
accounting.

Bind Vite to loopback explicitly, then have the small contract helper print the
exact local URL for one reviewed quality and presentation mode:

```sh
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
node scripts/qa-observer/rendered-webgl-qa-contract.mjs --url high 5173
# Optional synthetic player presentation:
node scripts/qa-observer/rendered-webgl-qa-contract.mjs --url balanced 5173 player
```

The helper only formats the URL; it does not start a server or browser, make a
network request, read browser state, or write a report. Open the printed URL in
a local browser for interactive visual review. The page accepts exactly one
reviewed `quality` value (`high`, `balanced`, or `reduced`) and one optional
`mode` value (`observer` or `player`). The read-only observer is the default.
Duplicate, unrelated, or invalid query parameters fail closed to the reviewed
balanced observer fixture.
The selected value is passed directly to the actual Realm quality override, so
each reviewed query exercises its corresponding castle LOD and render budget.
If the reviewed loopback port is busy, choose an unused local port explicitly
in both commands rather than allowing Vite to select one implicitly.

A rendered pass is valid only when the map root exposes
`.realm-map-screen[data-renderer="webgl"]` and the local overlay exposes
`data-rendered-webgl-status="ready"`. `fallback`, `error`, `closed`, or a
permanent `loading` state is a failed/unfinished check; the fallback is visibly
labeled “not a render pass.” The overlay exposes only fixture ID, selected
quality, castle count, renderer result, and a bounded time-to-first-ready
duration. Once accepted, that first-ready attestation remains stable through
ordinary long-session DOM mutations; a real renderer transition, invalid
marker, or sustained map loss still fails closed. The page does not retain or
transport those values.

This page is compiled only for Vite serve mode and rejects every non-loopback
hostname. Its page code has no browser-automation dependency. Run the separate
machine-local rendered probe with:

```sh
npm run qa:rendered-webgl
```

The probe uses the installed
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` in new headless
mode. Before launch it requires whole-app code-signature verification,
the exact `com.google.Chrome` identifier, and Google team identifier
`EQHXZ8M8AV`. The executable's device, inode, owner, mode, link count, size,
and nanosecond change/modify timestamps must remain identical before and after
signature verification, immediately before launch, and immediately after
spawn; any drift fails closed. It atomically binds an in-process Vite
middleware server to a numeric
`127.0.0.1` port selected by the kernel, creates a fresh owner-private temporary
Chrome profile, and begins at `about:blank`. Extensions, saved browser state,
Keychain access, first-run/default-app behavior, sync, updates, metrics, and
background networking are disabled. DevTools uses only Chrome's private inherited
file descriptors: commands and events are strict, bounded, NUL-framed JSON over
fd 3/4, with no TCP debugging listener or discovery endpoint. A deny-by-default
host resolver plus the CDP Fetch-domain request gate blocks every page request
and navigation outside the selected numeric loopback origin. Same-origin Vite
WebSocket and renderer Blob URLs are allowed. The one exact, pinned,
non-scannable journey-fixture QR data URL is the sole data-URL exception;
alternate ports, `localhost`, HTTPS, every other data URL, and foreign origins
fail the run. Branded macOS Chrome initializes a Crashpad handler even when the
generic crash-reporter switches are disabled; Chromium's
`disable-crashpad-for-testing` guard explicitly excludes macOS, so this lane
does not claim that ineffective suppression. Instead, the handler is confined
to the fresh owner-private `crash-dumps` database under the disposable profile,
and exits when the disposable browser is torn down. A bounded manual OS
observation on 2026-07-15 found no TCP socket on either the fresh-profile
handler or Chrome, but the probe does not enforce that process/socket inspection
on every run. Crashpad uses its own process group on this macOS build, so the
Chrome group sweep is not misrepresented as direct ownership of that helper.
The branded handler can still carry its vendor report URL in process arguments,
so a browser build with Crashpad compiled out is the stronger long-term
boundary.

The probe does not load the checkout's `vite.config.ts` or `.env` files. It uses
an inline configuration with the one reviewed React plugin, an explicit local-QA
compile gate and package version, strict repository-root file serving, and a
Vite cache inside the disposable Chrome profile. This prevents an earlier test
from redirecting the later host-side browser through mutable Vite configuration
or cache state.

The same attested Chrome, disposable profile, exact-loopback server, private CDP
pipe, and Fetch-domain request gate also run the real-browser synthetic journey
lane before the process is torn down. It mounts every entry in the shared 22-state scenario
manifest, validating only closed-shape counts, enumerated state, viewport, and
accessible-landmark evidence. It then drives the actual local path from menu to
unchecked Terms, fixed non-scannable synthetic QR, approval, verification,
pending admission, admitted presentation, a freshly unchecked authenticated
Terms gate, and player Realm. The QR assertion is exact equality with the one
shared fixture data URL; a different SVG or merely matching MIME prefix fails.
The lane also opens and closes the Alpha build stamp's patch notes, Settings,
and Credits, checking initial/restored focus, bounded placement, horizontal
overflow, visible-button sizing, and Credits' manual-reading control. It never
clicks an external link.

Only the desktop menu, mobile Terms, and short-landscape menu are captured as
in-memory PNGs. Each is immediately reduced to anonymous colour/luminance counts,
then its byte buffer is zeroed; no screenshot, DOM text, QR payload, identity,
or private browser log is written or returned. The title gateway is not mounted
by the journey lab, so this lane does not claim title-screen interaction
coverage; title presentation remains covered by its focused component and visual
contract tests until a separate authority-free browser fixture is justified.

Chrome runs fourteen fixed cases: every quality at 1440×900, a 1920×1080 balanced
presentation, a 1024×768 tablet inspector, one invalid query that must fail
closed to `balanced`, balanced and reduced presentation in a 390×844 narrow
responsive viewport, a second narrow-layout persistent-label baseline,
an opened narrow-layout castle inspector, and an opened 667×375 short-landscape
Explore surface. Four additional balanced cases use the same synthetic fixture
in player presentation: default states at 1440×900 and 390×844, an explicit
castle inspector at 1024×768, and an opened Explore surface at 667×375. Each
requires Recenter Keep and Return to Menu while rejecting the observer badge and
Close QA Observer control. The narrow player cases exercise the real compact
Menu/Home rail, tablet inspector, short-landscape Explorer, and touch-target
contract; the two interactive player cases additionally require that Menu/Home
remain visible after their surface opens. These browser
cases prove responsive layout, not mobile-device
or touch emulation; scene-level pointer tests separately exercise the shared
canvas/rail gesture lane, first-attempt threshold crossing, exact ground-plane
pan, anchored wheel and pinch, rail tap-versus-drag behavior, and cancellation
cleanup. The desktop player browser lane additionally performs a real
incremental rail drag and rail-origin wheel gesture, requires clean released
input state, and waits for the camera motion to settle. Every baseline
must expose `renderer=webgl`, `status=ready`,
fixture `synthetic-canonical-100`, castle count `100`, the expected effective
quality, and a ready duration within the 120-second fixture bound. The responsive
fixture gives every synthetic profile a long display name and long public
biography, so any inspector case exercises bounded profile presentation
without introducing a real identity. Near-limit username truncation remains a
focused component/CSS contract because using it in the shared density fixture
would change the canonical label-density workload.
Focused record regressions additionally require the responsive drawer to use
only sanitized public Farcaster and existing public castle/visibility-gated
Marks fields, keep a failed or rejected PFP on the initial/W fallback, and load
the same-origin decorative castle art through the exact integrity-pinned Pages
path. The artwork is accessibility-hidden and cannot supply fixture identity,
state, or an external request. The component contract rejects invented
durability, alliance, combat-status, and destructive-action presentation.
The responsive
contract additionally checks exact viewport dimensions, horizontal overflow,
map coverage, text-bearing castle labels, visible UI regions, aggregate
projection-eligible/placed/unplaced label coverage, and one-to-one
placed-label/direct-control accounting. The map's privacy-safe exact
set-membership accounting flag must also be true; no identity keys are
exported. Eligible count must equal placed plus unplaced, every unplaced label
must be accounted for by one bounded `reserved-ui` cull aggregate, and placed
count must equal the direct-control count. Clustered, overflow, cluster-member,
cluster-control, and connector counts must all be zero, and each direct control
must have valid accessible text and a 44-by-44-pixel minimum hit target.
Reserved-UI overlap, edge clipping, and non-label hit obstruction are release
failures. Label-pair collisions remain bounded aggregate telemetry, not a
universal rejection condition, because every rendered rail retains its exact
foundation anchor, reports no displacement, and has no connector. Opening
Explore or the inspector must preserve valid direct-label accounting.

The desktop balanced case also derives one bounded point above a foundation-attached
label, proves that point and a five-move path are genuinely on the WebGL canvas,
then requires a normal press/release to open that castle's inspector. It rejects
any drag, label selection, inspector, or Explore churn before the press, so a
DOM label or terrain fallback cannot satisfy the instanced-keep activation lane.

A separate local-only source-versus-runtime lane compares the authorized,
hash-pinned source keep against the high, balanced, and compact runtime keeps
at a fixed 384×384 WebGL target using the same scene preparation. The source
archive is an owner-provided local prerequisite: a missing, unsafe, or
hash-mismatched archive fails the entire probe closed. It is read only into
memory behind one exact no-store loopback route, zeroed during teardown, and is
never included in a build. The lane emits only bounded aggregate coverage,
colour, and silhouette metrics; it retains or reports no source bytes,
screenshots, raw pixels, archive paths, hashes, identities, or browser logs.

Failed label-coverage checks include only bounded closed-shape counts. Cull
reasons must be empty or contain one exact `reserved-ui:N` aggregate matching
the unplaced count; capacity, collision, identity, or arbitrary reasons fail
closed. The probe never includes castle IDs, usernames, profile text,
coordinates, or browser logs.

World-model telemetry is checked independently from label density: presented
model count must be at least the projection-eligible label count and no greater
than the canonical castle count, while raycast-target count must equal presented
model count. Every projection-eligible identity has a direct label or one
explicit reserved-UI cull and can never outnumber available castle models. The
remaining contract checks 44px primary controls,
inspector/Explore state, and page warnings/errors.

For each accepted state Chrome captures one transient PNG in memory. A strict,
bounded decoder immediately reduces it to opaque-sample, colour-bucket, and
luminance-range evidence so a blank/black or implausibly uniform frame cannot
pass on DOM metadata alone. Pixel buffers and encoded PNG bytes are discarded
inside the case; no screenshot, DOM, console message, network payload, identity,
or per-case timing is written to disk or included in a QA report. Fallback,
error, timeout, an unexpected target, foreign network activity, page diagnostic,
layout violation, or implausible pixels fails closed. Chrome, Vite, and the
temporary profile are torn down in a `finally` path, and the original Chrome
process group is swept with `SIGTERM` and `SIGKILL` even when its leader has
already exited. A helper that deliberately creates a different process group is
outside that lifecycle guarantee and remains bounded only by Chrome's network
controls and disposable profile. The parent QA report records only the aggregate
check identifier, pass/fail/timeout status, and total duration.

The exact browser probe runs in quick, standard, and deep QA cycles. Unit tests
exercise its URL, process-spawn, private-pipe transport, target/session routing,
network-boundary, DOM-attestation,
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
4. move the observer principal to an isolated observer module/database or
   identity-free replica that has no subscription path to public player/profile
   tables; the aggregate-only procedure is insufficient while the same
   principal can open identity-bearing public subscriptions;
5. establish a stable macOS signing identity, access-group design, and a
   separate restricted QA account; do not enroll a key while the helper is only
   ad-hoc signed;
6. generate the Secure Enclave key and privately review its public thumbprint;
7. rebuild the signed helper and pass a supervised, output-suppressed
   key-continuity self-test before relying on unattended rebuilds;
8. approve registering only that public JWK plus its fixed canonical
   registration and expiry timestamps as managed Worker values;
9. deploy with the QA gate still disabled and verify configuration attestation;
10. explicitly enable the QA gate, request one aggregate v2 attestation, and
   confirm zero game-state and private-data changes;
11. install a reviewed non-root LaunchAgent only after the supervised local run passes.

The bridge-side fallback described by checkpoint 4 is now removed: an enabled
gate requires a complete dedicated URI/database/audience tuple, and both the
database and audience must differ from gameplay. The checked-in tuple remains
absent because no identity-free target has been reviewed or deployed, so
checkpoint 4 is not yet satisfied. Checkpoint 5 is also unsatisfied because the
helper is ad-hoc signed. Accordingly the checked-in production gate remains
disabled. No live gate query or key enrollment was performed.

Daily operation after activation needs no QR scan or human input, but it does not
replace periodic human testing of genuine Farcaster and Terms consent.

## Autonomous local QA cycles

The cycle runner invokes an exact, attested package-script contract, the exact
headless rendered-WebGL probe described above, and a version-pinned local
SpacetimeDB CLI for local-only module checks. The synthetic test-file list and
browser-probe path are hard-coded in the reviewed runner. The browser probe is
always first in every tier. Immediately afterward, a parent-level boundary
preflight enters the actual macOS sandbox outside nested Vitest and must prove
that checkout writes, private report/audit/helper reads and writes, and an
unrelated live Unix socket are denied while one fresh private QA file/socket
namespace remains usable. Only then may repository-owned tests write an approved
cache or build output; failure or timeout stops the cycle at that boundary. No
check contains a deploy, publish, enrollment, administrator,
player-authentication, Terms bypass, or production URL command. It supplies an
isolated runtime home,
temporary directory, and npm cache; disables npm debug-log retention and user
npm configuration; and discards child stdout and stderr. A report contains only
the tier, overall status, check identifiers, durations, and bounded attempt
counts.

The runner is deliberately not described as a complete operating-system sandbox.
On this Mac, every reviewed non-browser child check runs under the checked-in,
exact-content-attested `sandbox-exec` profile
`scripts/qa-observer/qa-cycle-network.sb`. The complete child process tree may
use only loopback IP and one fresh owner-private Unix-socket directory; shared
`/private/tmp` sockets and the production-observer socket are denied. Checkout
source, scripts, dependencies, reports, audit notes, and the installed helper
are read-only. File writes are limited to the isolated runtime home/temp/npm
cache and exact root build, TypeScript/Vite cache, auth-bridge Vite cache, and
four SpacetimeDB build-output directories. Binding verification stages in the
isolated runtime temp rather than beside committed bindings. Reads from the
signed-in user's home and shared `/private/tmp` are denied except for the
checkout, isolated runtime/socket roots, and exact version-pinned SpacetimeDB
CLI. Git user/system configuration is disabled. A check that exits successfully
still has its original detached process group terminated. Repository code can
deliberately create another detached process group; that residual requires a
restricted account, container, or operating-system job boundary for complete
descendant-tree ownership. Any such escaped child retains the same macOS sandbox
profile, but process cleanup alone must not be treated as full containment.
The profile also denies executing anything from the observatory directory,
including the installed native helper, and blocks the macOS Keychain,
AppleScript, application-launch, and LaunchAgent command surfaces plus direct
`securityd` lookup from repository child processes.

The rendered-WebGL check is the one explicit exception because Chrome cannot
start safely inside a second macOS sandbox without disabling Chrome's own
sandbox. It retains its fresh profile, deny-by-default host resolver, inherited
NUL-framed CDP pipe with no TCP listener, Fetch-domain request gate, exact
numeric-loopback origin, and foreign-network fail-closed contract. The current
Chrome bundle is user-owned and group-writable;
executable metadata and whole-app signature checks narrow but do not eliminate a
same-user or same-group bundle race. A pinned root-owned, non-group-writable
browser under a restricted QA account or container is the long-term boundary.
The unavoidable branded-macOS Crashpad helper is a second residual: its fresh
private database defaults to uploads disabled. A bounded manual OS observation
on 2026-07-15 found no TCP listener, but that is not an automated per-run
invariant; the helper binary and embedded report destination still exist until
browser teardown.
`sandbox-exec` is deprecated, does not isolate process
execution, and does not make mutable repository code trusted. The browser lane
also remains outside its filesystem boundary. A dedicated low-privilege macOS
account/container and a clean pinned reviewed worktree remain the required
long-term boundary before treating untrusted changes as unattended input.
Package-script and sandbox-profile attestation prevent simple command
redirection or policy drift but cannot make arbitrary repository code harmless.
Run this only from a reviewed Warpkeep checkout; use a separate restricted macOS
account or stronger OS isolation before treating untrusted changes as executable.
The machine-bound QA credential remains narrower: repository checks never
receive it and sandboxed child checks cannot reach its broker socket. Other
same-user processes could still ask the native helper for its fixed aggregate
attestation operation, which is why the gate stays inactive until separate-account
or authenticated-XPC isolation exists. Independently, the bridge now requires
a distinct observer database and audience and has no gameplay fallback, but the
gate must stay inactive until the configured target is an audited identity-free
module/database or replica with no player/profile subscription surface. The
runner retains its isolated `HOME`;
it does not reopen the signed-in user's SpacetimeDB config directory.

Run a single local cycle manually:

```sh
npm run qa:observer:cycle -- --tier=quick --broker=off
```

`--broker=health` adds one bounded `GET /healthz` through the exact owner-private
Unix socket. It does not request an attestation, contact the bridge, or cause the
native helper to use its device key. Broker probing is fail-closed and does not
use TCP, CORS, a browser, redirects, or credentials.

`--broker=snapshot` instead exercises the activated machine-bound read model by
issuing one bounded `GET /snapshot` through the same owner-private Unix socket.
The broker may then ask the native helper for its single aggregate-only v2
attestation. The runner never receives the device key, helper proof, resolver
credential, or any identity-bearing response. It requires an exact JSON,
`no-store`, `nosniff`, fixed-length response capped at 16 KiB; rechecks that the
Unix-socket identity did not change during the response; validates the complete
aggregate-only schema again, discards the data, and records only pass/fail/duration.
This mode is appropriate only after the separately approved broker, stable
signing/caller-bound design, and remote read gate are active. It never supplies
data to browser JavaScript.

The tiers intentionally trade coverage for hourly cost:

- `quick` runs the fourteen-case responsive rendered-WebGL browser probe plus its
  shared-envelope real-browser journey lane, the real
  parent-level sandbox boundary preflight, focused observer/security tests, an
  explicit synthetic app state lane, and root typecheck.
  The synthetic lane has one manifest-backed assertion for all 22 supported
  local scenarios and covers Terms, every
  Farcaster and backend-admission presentation phase, title/menu transitions,
  settings, credits, patch notes, menu-to-Realm orchestration, canonical
  readiness, Realm HUD/accessibility/inspection/interaction, and both
  player/observer Realm fixtures. The journey harness test fails on `fetch`,
  XHR, WebSocket, EventSource, cookie, IndexedDB, or any Storage operation.
  Other selected lifecycle tests deliberately exercise isolated jsdom storage
  fixtures; none can reach a user's browser store or production service.
- `standard` runs all root unit tests, typecheck, the rendered-WebGL browser
  probe, runtime-asset verification, and file-size policy.
- `deep` adds a production build,
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

The rendered-browser and synthetic-state lanes may make at most two attempts.
They share the original per-check deadline, so a timed-out first attempt cannot
extend the check or the cycle; only a fast transient failure can receive a fresh
retry. Each browser attempt owns a new disposable Chrome profile and performs
its normal `finally` teardown before returning. The sandbox boundary and every
build, typecheck, asset, bridge, and SpacetimeDB check remain single-attempt.
A retry success is recorded as `attempts: 2` in the privacy-safe aggregate
report rather than being silently flattened into a first-pass result.

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
to perform its one fixed aggregate-attestation operation. A Unix socket excludes
other local accounts and browser-origin spoofing, but it cannot distinguish malicious code
already executing as the same macOS user. The narrow output and lack of any
mutation capability limit that risk; stable signing, XPC/code-identity controls,
and a restricted QA account remain required before enrollment. Those controls
do not prove the future observer target is identity-free; isolated infrastructure
with no player/profile subscription surface is also required before activation.
Keep QA
screenshots and reports private, mode `0600`, with short retention.

The checked-in helper is locally ad-hoc signed. Long-term Keychain access across
binary rebuilds must be proven by the supervised continuity checkpoint above;
if it fails, stop and establish a stable local signing identity/access-group
design before registration rather than regenerating or weakening the key.

Revoke remotely by disabling the QA gate or atomically removing the complete
registered key/timestamp tuple. Unload and delete the LaunchAgent separately.
Deleting the Secure Enclave key is destructive and must remain an explicit owner
action; no repository command does it.
