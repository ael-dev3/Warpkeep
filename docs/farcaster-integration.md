# Farcaster authentication

Warpkeep supports two presentations of the same server-owned identity boundary:
ordinary browsers use Sign In with Farcaster (SIWF), while a verified Farcaster
Mini App host may use Quick Auth. Neither path is a wallet connection,
client-owned identity, admission grant, or Terms acceptance.

Alpha 0.3.43 keeps backend protocol 3 and authentication contract v2; admission
remains gated. Production configuration and founder identities belong in the
private operator record, not this guide.

## Authority boundary

```text
ordinary browser player intentionally selects ENTER REALM
  -> the same in-memory authorized FID session may reuse its recorded agreement
  -> otherwise the player accepts the in-memory Alpha Terms
  -> browser may restore one cookie session or creates a fresh private S256 verifier and bound SIWF challenge
  -> player approves a normal Farcaster SIWF request
  -> browser sends the completed proof envelope plus verifier to the bridge
  -> bridge verifies binding and SIWF, then consumes the one-time challenge
  -> exact resolver principal reads structured admission from SpacetimeDB
  -> bridge creates a pending or epoch-bound rotating session family
  -> pending: HttpOnly cookie only, no access token, no database connection
  -> enabled: 600-second auth_version 2 access token held in JS memory only
  -> module accepts this browser access token only for a current admitted player connection
```

```text
verified Mini App host
  -> host supplies a fresh Quick Auth bearer
  -> browser sends it without cookies to the exact Quick Auth exchange
  -> bridge verifies signature, issuer, expiry, and domain warpkeep.com
  -> verified numeric sub becomes the candidate FID
  -> the same admission and auth-epoch resolver decides access
  -> pending or disabled: the private access-request flow remains available, with no access token or Realm connection
  -> authorized: one short-lived memory-only SpacetimeDB access token
  -> SpacetimeDB confirms the exact current versioned Terms record for that FID
  -> current Terms plus the matching canonical keep: enter the Realm directly
  -> missing current Terms: require one explicit acceptance before Realm activation
```

The bridge, not the browser, establishes `sub: farcaster:<fid>`. Its exchange
accepts exactly `identity: { fid }`; usernames, display names, avatars, custody
addresses, verification addresses, and other profile fields are rejected at
that boundary and never enter the session family or player JWT. The bridge
accepts only the configured `FARCASTER_DOMAIN` and exact
`FARCASTER_SIWE_URI`.

Production proof verification uses two official Farcaster verifier instances
backed by distinct public HTTPS RPC origins. Both must succeed with the same
canonical FID. A provider outage, partial result, or disagreement fails closed
as temporarily unavailable. A single RPC endpoint is permitted only for an
explicit development profile and must be loopback-local.

The intended production coordinates remain:

```txt
domain: warpkeep.com
siweUri: https://warpkeep.com/
issuer: https://auth.warpkeep.com
```

Those public coordinates alone do not prove that an arbitrary checkout matches
the recorded deployment; exact source/version and service probes provide that
evidence. Localhost SIWF is accepted only by an explicitly configured
development bridge. A production bundle accepts only HTTPS bridge/issuer URLs
and never falls back to a local or anonymous database identity.

## Browser flow and privacy

In ordinary browsers, selecting **ENTER REALM** first checks whether the current
authenticated FID has already recorded the exact required Terms version. In a
verified Mini App, the same check runs automatically after Quick Auth: an admitted
player with a matching canonical keep and current acceptance enters the Realm
without crossing the title or ordinary menu. A missing or stale record opens the concise
**ALPHA PARTICIPATION TERMS** gate; only explicit agreement begins or completes
entry. A checkbox alone has no authority, and Quick Auth never accepts Terms.
Acceptance is an immutable private FID/version record rather than a mutable
browser checkbox. Changing the required version makes every older record
non-current and prompts one new explicit acceptance while preserving the audit
history.

Outside a verified Mini App host, title load, anonymous menu load,
focus/visibility/pageshow events, ordinary route rendering, and direct `#realm`
navigation perform no cookie refresh, Farcaster channel, QR/deep-link, or
SpacetimeDB connection. A verified Mini App host may begin bounded Quick Auth
after host readiness, but never accepts Terms implicitly. An unaccepted
`#realm` route is normalized to the menu. Desktop is QR-first; mobile/coarse
layouts are deep-link-first with optional QR fallback after acceptance.

The local gate stores no identity and is not represented in `localStorage`,
`sessionStorage`, IndexedDB, URLs, cookies, or analytics. In protocol 3, an
admitted player who authenticates and submits the exact current version receives
a separate private immutable SpacetimeDB FID/version/time acceptance record
before the public realm subscription opens. That record contains no checkbox
state, proof, QR payload, signature, token, cookie, or wallet data. The gate is a
narrow authentication-start control, not a replacement for the linked standalone
Alpha Terms and Privacy Notice. Those project-authored
documents are not substitutes for formal legal and privacy review.

Each attempt receives a new 32-byte verifier. Only its `S256` digest enters the
`POST /v2/farcaster/challenge` request and Durable Object record; the verifier
enters only the final `POST /v2/farcaster/exchange` body. Cancel, expiry, logout,
retry replacement, and provider unmount abort outstanding work and drop private
references. These values never enter persistent browser storage, analytics,
URLs, or logs:

- relay channel token and completed SIWF proof material;
- browser-binding verifier or digest;
- player/admin/resolver JWTs;
- signing keys, session-cookie key, RPC credential, or admin secret.

The private admin configuration attestation exposes only domain-separated
SHA-256 fingerprints of the normalized RPC URLs and the active signing public
key's RFC 7638 thumbprint. Those values make endpoint or key drift detectable
without returning an RPC URL, credential, or private scalar.

After a fresh signature and an exchange whose bridge-verified FID exactly
matches it, the browser may write a tab-scoped `sessionStorage` presentation
cache. It contains only the sanitized public FID, username, display name, and
HTTPS avatar URL. The cache never grants or restores authentication: it is read
only after a successful bridge refresh and merged only when its FID exactly
matches the refreshed FID. It expires no later than the server family (and
never after 30 days), and normally disappears when the tab closes. The next
validated refresh purges corruption, expiry, or FID mismatch; sign-out and
cross-tab logout clear it immediately. Storage denial leaves a safe FID-only
UI. It never contains a proof, token, JWT, cookie,
custody or verification address, or verification data.

The only current authentication-related `localStorage` write is a non-secret,
base-path-scoped logout-intent tombstone containing the exact `logout-v1:` marker
and a timestamp. It contains no FID, proof, token, cookie, family identifier, or
profile data and expires after 30 days, matching the maximum server-family
lifetime.

The public v1 challenge/exchange routes are retired and return `410`; a client
must never fall back from v2 to v1.

## Mini App Quick Auth

The browser loads `@farcaster/miniapp-sdk` only for the exact
`?miniApp=true` hint, then requires `sdk.isInMiniApp()` before enabling host
behavior. Host context, username, portrait, safe areas, and capabilities are
untrusted presentation input. The verified bridge FID remains authoritative.

Host initialization is bounded rather than trusted to settle. SDK import,
`isInMiniApp`, context, capability, `actions.ready`, Back registration, and
other host-shell calls retain a four-second default deadline. Quick Auth has a
separate ten-second deadline because it spans Farcaster authentication network
work plus a native-host approval round trip. Until
`actions.ready({ disableNativeGestures: true })` succeeds, no Mini App authority
or host-only styling is exposed. A timeout or malformed host enters the ordinary
web recovery presentation with no bearer, Realm connection, or retry loop.
Only a proven host receives the native Back integration; browser history remains
the fallback.

`sdk.quickAuth.getToken()` is requested only when a verified host needs an
authentication or refresh attempt. The adapter invokes the method on its SDK
receiver, converts missing, timed-out, rejected, malformed, and host-replaced
results into closed internal outcomes, and coalesces concurrent callers into
one acquisition flight. A hung SDK call cannot hold the Warpkeep UI open past
the deadline. Because the current SDK owns an internal promise that the browser
cannot cancel, a client whose host call never settles may still require a fresh
Mini App open; Retry remains bounded and the web entry path remains available.

The compact JWT is bounded to 8 KiB, kept in the current controller only, and sent as
`Authorization: Bearer <token>` to:

```txt
POST https://auth.warpkeep.com/v2/farcaster/quick-auth/exchange
Origin: https://warpkeep.com
Content-Type: application/json

{}
```

The request uses `credentials: "omit"`. The route allows only exact
non-credentialed CORS for `https://warpkeep.com`, accepts no query or
caller-supplied FID/profile/domain, and verifies through pinned
`@farcaster/quick-auth` with domain `warpkeep.com` and issuer
`https://auth.farcaster.xyz`. It then reuses the existing admission, auth epoch,
access-token claims, TTL, and pending/disabled rules. It creates no session
family and sets no cookie. A definitively invalid bearer returns the same
generic `401 quick_auth_invalid`. A verifier/JWKS/network outage returns
retryable `503 verification_unavailable`; neither response includes token,
claim, FID, or upstream detail.

Only a definitive bridge `401` may cause automatic bearer recovery. Warpkeep
asks the SDK for one documented forced-fresh token and exchanges it once. A
second rejection, or any `403`, `429`, `503`, timeout, network, CORS, or response
failure stops and waits for a deliberate player retry. Every acquisition and
exchange remains generation-bound so a stale completion cannot authorize a
remounted host or changed account. Static preconnects cover both Farcaster's
authentication origin and Warpkeep's bridge origin.

Failed Mini App entry offers a local, user-triggered diagnostic report. Its
closed fields are Alpha version, short build, allowlisted entry stage, host,
mobile/web class, bounded viewport, online hint, and a random session-only
support code. The formatter has no input for FID, username, profile, token,
token hash, claims, cookie, URL, IP, user agent, response body, request ID, or
raw exception. Clipboard failure leaves a manual-copy field and never changes
authentication state.

The current access-token parser intentionally applies issuer, audience, FID,
shape, lifetime, and exact local time-window checks after the bridge response.
A phone clock outside the token's strict ten-minute window can therefore still
fail closed as an invalid session. This repair does not relax that boundary or
change the bridge response contract; a future server-time design would require
a bridge-first compatibility rollout before any frontend adoption.

Quick Auth tokens and player access tokens are never stored in localStorage,
sessionStorage, IndexedDB, URLs, cookies, React host state, analytics, or logs.
Explicit sign-out blocks passive reacquisition for the browser scope. A host FID
change immediately clears the old in-memory bearer, private navigation, and
pending commands. Ordinary SIWF and its `SameSite=Strict` cookie are unchanged.

## Access token and session family

An authorized response supplies a maximum-600-second ES256 access token with
exact `auth_version: 2`, positive `auth_epoch`, empty roles, and matching custom
session timestamps. It carries the verified FID and no optional username,
display-name, or avatar claims. The provider keeps
`{ jwt, issuer, audience, expiresAt }` only in JavaScript memory and connects
only when issuer/audience/claims match. It never writes the bearer to
`localStorage`, `sessionStorage`, IndexedDB, a URL, or a readable cookie.

Longer continuity is a separate server-side family referenced by
`__Host-warpkeep_session`. The cookie is `Secure`, `HttpOnly`,
`SameSite=Strict`, `Path=/`, and has no `Domain`. A remembered family has a
maximum 30-day absolute lifetime. **Keep me signed in on this device** defaults
false; only an explicit opt-in adds the persistent cookie lifetime, while the
default uses a session cookie. The server-side family remains absolutely bounded
at 30 days in either case. The family persists only the verified FID as identity.
The browser cannot read the family ID, generation, or MAC.

Every refresh re-resolves admission and rotates the cookie generation. A bound
family revokes on missing/disabled admission, epoch mismatch, expiry, origin
mismatch, or stale replay. Only the immediately previous generation receives a
short lost-response recovery grace; older/out-of-grace replay revokes.
Successful logout confirms family revocation, expires the cookie, drops
memory-only bearer state, cancels pending work, and disconnects SpacetimeDB. If
durable revocation fails, the bridge returns generic `503` and still expires the
current browser cookie; a separately copied cookie may remain usable after
storage recovery until the bounded family expires.

Before the best-effort server call, sign-out also writes the non-secret 30-day
logout-intent tombstone and blocks every automatic, focus/timer, **CHECK AGAIN**,
and direct cookie refresh in that browser scope. Reloads and same-origin tabs
honor it; only a new explicit, Terms-gated auth activation clears it early, and
it becomes stale after the maximum family lifetime. Malformed or currently
unavailable storage fails closed for refresh. A denied tombstone write remains
a residual only when server revocation also fails: the current runtime stays
blocked, but a later
context where storage becomes available cannot recover a record that was never
written and could resume a still-valid copied cookie.

## Pending admission UX

A missing FID or a freshly verified disabled founder creates a pending family
tagged to that server-proven admission state and returns FID-only identity plus
`status: "pending-admission"`; it returns **no access token** and therefore opens
no SpacetimeDB connection or public-table subscription. The Hegemony menu may
show exact-FID cached presentation under the rules above, or the returned FID
alone, plus an in-app access-request status region, **BACK TO MENU**, and
**SIGN OUT**. The access action submits the server-verified FID to a private
SpacetimeDB review ledger; it does not grant admission, create a castle, expose
the request publicly, or confer gameplay authority. Duplicate submissions in
the same admission cycle are idempotent. A later revocation creates a distinct
request cycle while retaining the founder's existing realm state.

The browser offers **REQUEST ACCESS** only after one caller-private status read
confirms the action is available for the exact FID and auth generation. The
first accepted gesture synchronously seals that lifecycle before React state,
credentials, or network work begins. The interactive button leaves the input
lane in the same frame and is replaced by a stable, focused **SUBMITTING
REQUEST** status region. The browser then invokes one idempotent mutation and
never retries it automatically.

A valid mutation result settles into terminal **REQUEST RECEIVED** with the
authoritative first timestamp and a separate read-only **CHECK ADMISSION**
action. If the mutation response is interrupted, the browser performs exactly
one status reconciliation. A recorded row converges to **REQUEST RECEIVED**;
an unavailable or missing reconciliation remains sealed as **REQUEST STATUS
UNAVAILABLE** with read-only **CHECK STATUS**. Only a failure proven to occur
before the mutation client was invoked exposes a deliberate **TRY AGAIN**.
Menu changes, Mini App remounts, stale callbacks, timers, and status errors
cannot reopen a confirmed or ambiguous request. The complete request flow is
silent and emits no request sound or haptic.

After an authoritative **REQUEST RECEIVED** or restored existing request, a
verified Mini App host that advertises `actions.addMiniApp` may show one
optional admission-alert control. It calls the native Farcaster prompt with a
same-frame single-flight lock. Ordinary web surfaces and hosts without that
capability show nothing. The browser keeps only a boolean presentation hint
derived from whether host context contains `notificationDetails`; it never
retains or exposes the notification token or delivery URL. A completed prompt
is described as setup requested, not as proof that server registration or
future delivery succeeded.

Farcaster sends notification preference changes to the manifest's exact
server-only webhook as a signed JFS envelope. The bridge verifies the official
envelope format, requires two independent Hub views of the app key, verifies
its signed-key metadata and active on-chain state through both configured
Optimism RPCs, and accepts delivery only for the exact configured client FID
and URL. A valid disable/remove remains usable while outbound delivery is
paused so opt-out cannot be trapped behind a feature gate. Raw notification
tokens stay inside one private Cloudflare Durable Object per FID, never in
React, browser storage, logs, URLs, public state, or SpacetimeDB.

After Hermes has committed and verified founder admission, it invokes a
separate-secret operator endpoint. That endpoint resolves current admission
again; the Durable Object repeats the exact epoch check immediately before each
delivery attempt. Queue-before-webhook races are retained without a token for
at most 24 hours, signed opt-outs erase token material immediately, invalid
tokens are purged, retry attempts are bounded, and one epoch cannot notify
twice. `notify-admitted <fid> --confirm` is the idempotent recovery path if the
database commit succeeds but the notification side effect is interrupted.
Notification preference and delivery add no SpacetimeDB schema or browser
authority.

**CHECK AGAIN** calls credentialed `/v2/session/refresh`, not a new Farcaster
channel. A matching missing or disabled state stays pending/tokenless; enabled
transitions once to an epoch-bound family and returns a fresh 600-second token.
A bound family always revokes after disablement, and a pending family revokes
if its non-enabled admission state no longer matches the state proven at
creation. A resolver outage remains a generic temporary-unavailable state and
produces no token. Neither UI path reveals raw reducer, WebSocket, JWT, cookie,
or OIDC errors.

## Resolver contract

The Worker uses a fresh 15-second JWT with exact
`sub: "service:auth-epoch-resolver"` and exactly
`roles: ["warpkeep-auth-epoch-resolver"]`, plus exact `resolver_fid` equal to
the one verified FID being resolved. It has no admin role, is never
persisted/returned/logged, and the Worker sends it only to:

```txt
POST /v1/database/c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e/call/auth_resolver_get_fid_admission_v2
```

The HTTP SATS-JSON response is exactly
`["missing"|"disabled"|"enabled", authEpoch]`; missing/disabled require epoch
zero and enabled requires epoch at least one. The bridge normalizes that tuple
to its internal `{ state, authEpoch }` result and validates exact shape, HTTPS
origin/database/procedure, media type, byte bound, redirect policy, and a
maximum-five-second call. Any disagreement fails closed without a token. The
module retains a 60-second resolver-session rejection ceiling and requires the
signed `resolver_fid` to equal the positional argument before lookup, preventing
reuse as an admission oracle for other FIDs.

SpacetimeDB runs its lifecycle hook before HTTP procedures, so an exact fresh
resolver token must pass connection admission. The 15-second production window
bounds connection initiation, not an accepted WebSocket's lifetime: public-table
subscriptions opened while fresh may persist until transport disconnect. Static
`get_alpha_backend_info` is callable only while fresh, protected calls recheck
expiry, and the resolver cannot read private tables, bootstrap or mutate as a
player, or pass Hermes/admin guards.

`admin_get_fid_auth_epoch` is retained only as admin-authenticated rollback
compatibility. The v2 browser/session path never uses it.

## Module protocol-3 boundary

The original public `player` table remains frozen with its exact v1 shape,
including its opaque OIDC Identity column, and must remain empty. Protocol v2
introduced the active public `player_v2` plus private `player_ownership_v2`
split; protocol 3 preserves that pair and the complete deployed seven-table
prefix unchanged. It appends the Genesis realm, terrain metadata, permanent
slot/claim, trusted public profile, private Marks and Terms evidence, and frozen
private compatibility tables without widening browser identity authority. Generated browser
bindings expose only public shapes, and the active realm subscription reads
`world_tile`, `world_tile_meta_v1`, `player_v2`, `castle`, `realm_v1`, and
`realm_profile_v1`. It does not subscribe to the legacy `player` table, private
ownership, founding claims, Mark accounts, daily-grant receipts, retired
compatibility state, or Terms evidence. Current Marks authority does not read a
wallet or blockchain.

The legacy module wires `get_my_admission_status` and `bootstrap_player` remain
only for client/schema compatibility and immediately fail with
`PROTOCOL_RETIRED`, without lookup or mutation. The active player path uses the
exact `get_my_admission_status_v2` and `bootstrap_player_v2` wires. Bridge
resolution continues to use the exact
`auth_resolver_get_fid_admission_v2` procedure described above.

Hermes operators may read `admin_get_alpha_status_v3`, which returns only
privacy-safe aggregate counts for the preserved legacy/v2 rows and the
protocol-3 world, founding, profile, Terms, and private accounting invariants.
It returns no FID, Identity, token, proof, cookie, private receipt, or profile
payload. It refuses the aggregate with `STATE_INTEGRITY` when canonical terrain,
slot, claim, castle, occupancy, ownership, or accounting relationships drift.
The browser separately requires protocol 3 plus the exact generation name and
numeric seed.

## Public and server configuration

The static browser receives only public coordinates:

```dotenv
VITE_SPACETIMEDB_URI=https://maincloud.spacetimedb.com
VITE_SPACETIMEDB_DATABASE=c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e
VITE_WARPKEEP_SHARED_ALPHA_ENABLED=true
VITE_WARPKEEP_AUTH_BRIDGE_URL=https://auth.warpkeep.com
VITE_WARPKEEP_OIDC_ISSUER=https://auth.warpkeep.com
VITE_WARPKEEP_OIDC_AUDIENCE=warpkeep-spacetimedb
```

The Worker configuration is documented in
[`services/auth-bridge/README.md`](../services/auth-bridge/README.md). Its
checked-in `PUBLIC_AUTH_ENABLED` remains false, while the recorded production
override is true. Before any future enable, the server-only v2
configuration attestation must match the reviewed issuer, origins, SIWF
coordinates, Quick Auth issuer/domain/origin/path/verifier package/token bound,
key ID, Maincloud coordinates, S256 binding, 600-second access TTL, 15-second
resolver TTL, five-second resolver timeout, five-minute challenge TTL, 30-day
family ceiling, exact cookie attributes, and public-auth state.

Production frontend activation and the Pages deployment validator require the
exact bridge and issuer `https://auth.warpkeep.com`, audience
`warpkeep-spacetimedb`, Maincloud origin `https://maincloud.spacetimedb.com`, and
database identity
`c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e`;
matching lookalikes and former aliases fail closed. Local development
may use the explicit noncanonical localhost escape hatch. The Worker
independently pins its production resolver to that exact Maincloud
origin/database pair. Canonical Warpkeep issuer, domain, or origin coordinates
force production validation even if `ENVIRONMENT=development` is supplied.

## Deployment boundary

Authentication contract v2 remains unchanged under backend protocol 3. Schema
updates are additive, and browser, Worker, database, component activation, and
public-entry changes are deployed separately. The checked-in Worker and client
configuration remain disabled by default.

The Mini App is published through one reviewed static file at
`/.well-known/farcaster.json` on `https://warpkeep.com`. Its home URL is exactly
`https://warpkeep.com/?miniApp=true`, and the page carries one exact
`fc:miniapp` embed record. The manifest declares the exact server-only webhook
`https://auth.warpkeep.com/v1/farcaster/miniapp/webhook` for notification
subscription lifecycle events, and declares no chains or required host
capabilities. Notification credentials belong only behind that endpoint and
must never enter public tables, browser state, URLs, logs, or diagnostics. The
eight referenced PNGs have fixed dimensions, opacity, byte ceilings,
provenance, and repository digests; three portrait
screenshots use local synthetic fixtures and contain no real player or
production state. The current promotional feed embed is separately identified
as authored artwork and contains only its deliberately visible public
Farcaster-handle labels—never an FID, authentication material, or private Realm
record.

Only the reviewed owner FID `539854` may generate the public
`accountAssociation` with
Farcaster's [Manifest Tool](https://farcaster.xyz/~/developers/mini-apps/manifest?domain=warpkeep.com).
The repository verifier pins that FID and checks canonical shape, exact domain
payload, declared EVM key, and ERC-191 signature integrity. That local
cryptographic check does not prove that the declared key is still active for
the pinned FID; the official tool and a real Farcaster client remain the
authority for that relationship. Never commit a wallet key, seed phrase, login
credential, bearer, or private signing material.

Production builds permit only the reviewed `.well-known/farcaster.json` hidden
file. The release check rejects other hidden paths, symlinks, redirects,
duplicate or legacy embed tags, manifest drift, image geometry/opacity drift,
and bytes that differ from the reviewed source. The live verifier fetches the
same-origin manifest and all eight images with bounded no-redirect requests and
compares them with the exact checkout before a release is accepted.

Notification rollout is ordered: install the independent operator secret on
the current bridge first; publish the complete Hub/client/secret tuple plus the
additive Durable Object and Worker routes with outbound delivery paused; enable
and attest the Worker; publish the manifest alone as a production-domain canary;
prove one owner-controlled signed enable and disable cycle; then publish the
opt-in UI. Farcaster cannot deliver a real event before the production manifest
advertises the webhook, so automated fixtures are never accepted as that canary
proof. Rollback pauses outbound delivery first but keeps the manifest, verifier,
`v5` cleanup implementation, and signed opt-outs reachable.

Before a production change, use disposable migration tests and fresh bounded
aggregate inspection, then verify OIDC metadata, resolver behavior, retired
routes, configuration attestation, and the deployed source revision. Stop on
any mismatch without enabling public authentication. Historical approvals,
counts, or local test results are not reusable production authorization.

The maintained sequence is in the
[activation and recovery runbook](./operations/alpha-activation.md). Founder
identities and private operational records do not belong in this repository.

## Tests and manual QA

Automated tests use injected Farcaster authorities, Mini App hosts, and bridge
clients; they do
not call a real relay, publish a module, deploy a Worker, or use production
proofs. Coverage includes Quick Auth domain/issuer/expiry/subject validation,
bearer and CORS bounds, S256 binding, v1 retirement, exact v2 response unions,
memory-only bearer handling, pending-without-token behavior, refresh/logout,
FID-only bridge identity, default-off remember-device intent, 30-day logout
tombstones and storage denial, durable-logout failure, session-family rotation
and revocation, exact production coordinate pins, exact resolver claims/response,
profile-claim discard, private-ownership isolation, protocol compatibility,
local additive-migration proof, retired legacy module wires, v2-only browser
player data, privacy-safe protocol-3 admin aggregation, private Terms evidence,
complete founding invariants, single-use in-memory Alpha Terms acceptance,
dormant anonymous cookie refresh, direct-route normalization, and no
anonymous/unadmitted connection.

Clean-profile QA is allowed only after every deployment gate has separate
approval and exact-head verification. Never attach live QR screenshots, browser
network dumps, console dumps, or HAR files to a PR; they can retain active proof
or cookie material.
