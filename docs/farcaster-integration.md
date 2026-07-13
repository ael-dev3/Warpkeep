# Farcaster → OIDC integration

Warpkeep uses standard website Sign In with Farcaster (SIWF). It is not a Mini
App, Quick Auth, wallet connection, or a client-only permanent identity system.

> **Protocol-v2 backend staged; public entry remains paused.** The additive
> module and paused Worker contract described here have been published/deployed
> at their separately recorded production coordinates. The Worker includes the
> additive `SessionFamily` migration and independent managed session-cookie
> secret, but `PUBLIC_AUTH_ENABLED=false`; the v2 frontend is not yet deployed
> and its checked-in shared-alpha switch remains false. No admission, player,
> ownership, castle, allowlist, or world data was mutated.

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
it does not begin authentication. The unchecked acceptance and its continuation
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

The gate stores no identity, tracking record, or persistent acceptance and is
not represented in `localStorage`, `sessionStorage`, IndexedDB, URLs, cookies,
or analytics. It is a narrow authentication-start control, not a replacement
for the linked standalone Alpha Terms and Privacy Notice. Those project-authored
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

The only current authentication-related persistent browser write is a non-secret,
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
show the pending identity and a semantic **REQUEST ACCESS** link to
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

## Module protocol-v2 boundary

The original public `player` table remains frozen with its exact v1 shape,
including its opaque OIDC Identity column, and must remain empty. Protocol v2
does not read, write, or subscribe to it. The active data split is public
`player_v2` plus private `player_ownership_v2`; the browser subscribes only to
`world_tile`, `player_v2`, and `castle`, so no ownership Identity is present in
its query/subscription surface.

The legacy module wires `get_my_admission_status` and `bootstrap_player` remain
only for client/schema compatibility and immediately fail with
`PROTOCOL_RETIRED`, without lookup or mutation. The active player path uses the
exact `get_my_admission_status_v2` and `bootstrap_player_v2` wires. Bridge
resolution continues to use the exact
`auth_resolver_get_fid_admission_v2` procedure described above.

Hermes operators may read `admin_get_alpha_status_v2`, which returns only
privacy-safe aggregate counts for legacy rows, v2 player/ownership consistency,
world state, admission state, protocol version, and seed. It returns no FID,
Identity, token, proof, cookie, or profile payload. It refuses the aggregate with
`STATE_INTEGRITY` if canonical terrain or any castle/occupancy backlink is
inconsistent. The browser separately requires the exact generation name and
numeric seed.

## Public and server configuration

The static browser receives only public coordinates:

```dotenv
VITE_SPACETIMEDB_URI=https://maincloud.spacetimedb.com
VITE_SPACETIMEDB_DATABASE=warpkeep-89e4u
VITE_WARPKEEP_SHARED_ALPHA_ENABLED=false
VITE_WARPKEEP_AUTH_BRIDGE_URL=https://auth.warpkeep.com
VITE_WARPKEEP_OIDC_ISSUER=https://auth.warpkeep.com
VITE_WARPKEEP_OIDC_AUDIENCE=warpkeep-spacetimedb
```

The Worker configuration is documented in
[`services/auth-bridge/README.md`](../services/auth-bridge/README.md). Its
checked-in `PUBLIC_AUTH_ENABLED` remains false. Before any future enable, the
server-only v2 configuration attestation must match the reviewed issuer,
origins, SIWF coordinates, key ID, Maincloud coordinates, S256 binding,
600-second access TTL, 15-second resolver TTL, five-second resolver timeout,
five-minute challenge TTL, 30-day family ceiling, exact cookie attributes, and
public-auth state.

Production frontend activation and the Pages deployment validator require the
exact bridge and issuer `https://auth.warpkeep.com`, audience
`warpkeep-spacetimedb`, Maincloud origin `https://maincloud.spacetimedb.com`, and
database `warpkeep-89e4u`; matching lookalikes fail closed. Local development
may use the explicit localhost escape hatch. The Worker independently pins its
production resolver to that exact Maincloud origin/database pair, while an
explicit `ENVIRONMENT=development` bridge remains configurable for local tests.

## Rollout and approval gates

The v2 backend is staged and the rollout is intentionally stopped before the
frontend and public-entry gates. The module change is additive: it preserves the
exact legacy table prefix and public `player` shape, then appends `player_v2` and
private `player_ownership_v2`. The recorded guarded publication first ran
`npm run stdb:verify-additive-migration` against its disposable loopback-only
server and then bound that proof to the production artifact. The local proof
checks schema signatures, retained empty and synthetic non-empty legacy rows,
idempotent republish, v2 consistency, and guarded-v1 rollback refusal; it does
not itself inspect or mutate Maincloud.

The recorded production run obtained a fresh, bounded, read-only aggregate and
stopped unless the legacy player count and enabled epoch-zero admission count
were zero. The guarded publisher repeated that aggregate, pinned the reviewed
CLI and existing database identity, and published only the digest-attested
prebuilt artifact through `--js-path`, `--delete-data=never`, closed stdin, and
no compatibility override. Any future republish requires fresh approval and the
same evidence; historical counts never substitute for it.

The recorded checkpoint also completed the additive session-family Durable
Object migration, independent managed cookie-secret setup, paused Worker deploy,
exact v2 aggregate, resolver, discovery/JWKS, retired-v1, ownership-isolation,
and config-attestation checks. The remaining stages are the disabled v2
frontend deploy and then the separately ordered public-auth/shared-realm enable
and owner QA gates.

See the [activation and recovery runbook](./operations/alpha-activation.md).
Only the recorded exact current coordinates attest the backend checkpoint;
historical records and arbitrary local checkouts do not.

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
player data, privacy-safe v2 admin aggregation, single-use in-memory Alpha Terms
acceptance, dormant anonymous cookie refresh, direct-route normalization, and no
anonymous/unadmitted connection.

Clean-profile QA is allowed only after every deployment gate has separate
approval and exact-head verification. Never attach live QR screenshots, browser
network dumps, console dumps, or HAR files to a PR; they can retain active proof
or cookie material.
