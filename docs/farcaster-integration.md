# Farcaster → OIDC integration

Warpkeep uses standard website Sign In with Farcaster (SIWF). It is not a Mini
App, Quick Auth, wallet connection, or a client-only permanent identity system.

Alpha 0.3.11 uses backend protocol 3 and authentication contract v2; admission
remains gated. Production configuration and founder identities belong in the
private operator record, not this guide. This document describes the contract
but does not authorize admission or a production change.

## Authority boundary

```text
player intentionally selects ENTER REALM and accepts the in-memory Alpha Terms
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

The bridge, not the browser, establishes `sub: farcaster:<fid>`. Its exchange
accepts exactly `identity: { fid }`; usernames, display names, avatars, custody
addresses, verification addresses, and other profile fields are rejected at
that boundary and never enter the session family or player JWT. The bridge
accepts only the configured `FARCASTER_DOMAIN` and exact
`FARCASTER_SIWE_URI`.

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

Selecting **ENTER REALM** opens the concise **ALPHA PARTICIPATION TERMS** gate;
it does not begin authentication. The unchecked checkbox state and its continuation
exist only in component memory. Only checking the explicit agreement and
selecting **CONTINUE TO SIGN-IN** starts one auth activation. That activation
may first restore a valid HttpOnly cookie session; otherwise it creates a fresh
SIWF request. Cancel, close, Escape, browser Back, unmount, retry, and completion
discard acceptance. A retry or later entry attempt starts unchecked again.

Title load, anonymous menu load, focus/visibility/pageshow events, ordinary
route rendering, and direct `#realm` navigation perform no cookie refresh,
Farcaster channel, QR/deep-link, or SpacetimeDB connection. An unaccepted
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

A missing FID creates a pending family and returns FID-only identity plus
`status: "pending-admission"`; it returns **no access token** and therefore opens
no SpacetimeDB connection or public-table subscription. The Hegemony menu may
show exact-FID cached presentation under the rules above, or the returned FID
alone, plus a semantic **REQUEST ACCESS** link to
`https://farcaster.xyz/0xael.eth`, **CHECK AGAIN**, and **SIGN OUT**.

**CHECK AGAIN** calls credentialed `/v2/session/refresh`, not a new Farcaster
channel. Missing stays pending/tokenless; enabled transitions once to an
epoch-bound family and returns a fresh 600-second token; disabled revokes. A
resolver outage remains a generic temporary-unavailable state and produces no
token. Neither UI path reveals raw reducer, WebSocket, JWT, cookie, or OIDC
errors.

## Resolver contract

The Worker uses a fresh 15-second JWT with exact
`sub: "service:auth-epoch-resolver"` and exactly
`roles: ["warpkeep-auth-epoch-resolver"]`, plus exact `resolver_fid` equal to
the one verified FID being resolved. It has no admin role, is never
persisted/returned/logged, and the Worker sends it only to:

```txt
POST /v1/database/warpkeep-89e4u/call/auth_resolver_get_fid_admission_v2
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
slot/claim, trusted public profile, private Marks/wallet/scan, and private Terms
evidence tables without widening browser identity authority. Generated browser
bindings expose only public shapes, and the active realm subscription reads
`world_tile`, `world_tile_meta_v1`, `player_v2`, `castle`, `realm_v1`, and
`realm_profile_v1`. It does not subscribe to the legacy `player` table, private
ownership, founding claims, wallet records, Mark accounts, burn receipts, scan
state, or Terms evidence.

The legacy module wires `get_my_admission_status` and `bootstrap_player` remain
only for client/schema compatibility and immediately fail with
`PROTOCOL_RETIRED`, without lookup or mutation. The active player path uses the
exact `get_my_admission_status_v2` and `bootstrap_player_v2` wires. Bridge
resolution continues to use the exact
`auth_resolver_get_fid_admission_v2` procedure described above.

Hermes operators may read `admin_get_alpha_status_v3`, which returns only
privacy-safe aggregate counts for the preserved legacy/v2 rows and the
protocol-3 world, founding, profile, Terms, and private accounting invariants.
It returns no FID, Identity, token, proof, cookie, wallet, receipt, or profile
payload. It refuses the aggregate with `STATE_INTEGRITY` when canonical terrain,
slot, claim, castle, occupancy, ownership, or accounting relationships drift.
The browser separately requires protocol 3 plus the exact generation name and
numeric seed.

## Public and server configuration

The static browser receives only public coordinates:

```dotenv
VITE_SPACETIMEDB_URI=https://maincloud.spacetimedb.com
VITE_SPACETIMEDB_DATABASE=warpkeep-89e4u
VITE_WARPKEEP_SHARED_ALPHA_ENABLED=true
VITE_WARPKEEP_AUTH_BRIDGE_URL=https://auth.warpkeep.com
VITE_WARPKEEP_OIDC_ISSUER=https://auth.warpkeep.com
VITE_WARPKEEP_OIDC_AUDIENCE=warpkeep-spacetimedb
```

The Worker configuration is documented in
[`services/auth-bridge/README.md`](../services/auth-bridge/README.md). Its
checked-in `PUBLIC_AUTH_ENABLED` remains false, while the recorded Alpha 0.3.11
production override is true. Before any future enable, the server-only v2
configuration attestation must match the reviewed issuer, origins, SIWF
coordinates, key ID, Maincloud coordinates, S256 binding, 600-second access
TTL, 15-second resolver TTL, five-second resolver timeout, five-minute
challenge TTL, 30-day family ceiling, exact cookie attributes, and public-auth
state.

Production frontend activation and the Pages deployment validator require the
exact bridge and issuer `https://auth.warpkeep.com`, audience
`warpkeep-spacetimedb`, Maincloud origin `https://maincloud.spacetimedb.com`, and
database `warpkeep-89e4u`; matching lookalikes fail closed. Local development
may use the explicit localhost escape hatch. The Worker independently pins its
production resolver to that exact Maincloud origin/database pair, while an
explicit `ENVIRONMENT=development` bridge remains configurable for local tests.

## Deployment boundary

Authentication contract v2 remains unchanged under backend protocol 3. Schema
updates are additive, and browser, Worker, database, component activation, and
public-entry changes are deployed separately. The checked-in Worker and client
configuration remain disabled by default.

Before a production change, use disposable migration tests and fresh bounded
aggregate inspection, then verify OIDC metadata, resolver behavior, retired
routes, configuration attestation, and the deployed source revision. Stop on
any mismatch without enabling public authentication. Historical approvals,
counts, or local test results are not reusable production authorization.

The maintained sequence is in the
[activation and recovery runbook](./operations/alpha-activation.md). Founder
identities and private operational records do not belong in this repository.

## Tests and manual QA

Automated tests use injected Farcaster authorities and bridge clients; they do
not call a real relay, publish a module, deploy a Worker, or use production
proofs. Coverage includes S256 binding, v1 retirement, exact v2 response unions,
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
