# Warpkeep Farcaster → OIDC bridge

This Cloudflare Worker verifies completed Farcaster SIWF proofs and issues ES256
OIDC access JWTs for Warpkeep's SpacetimeDB connection. It is isolated from the
static browser app: browser code never receives a signing key, admin secret,
Optimism RPC URL, resolver JWT, private Hermes JWT, or Maincloud credential.

> **Alpha 0.3.2 is live on backend protocol 3; the checked-in default fails
> closed.** The v2 access/session and resolver contract described below remains
> active at its privately recorded production source, deployment,
> configuration, and canary coordinates. The 1,261-cell Genesis world is
> seeded, deliberately admitted founders hold their permanent castles, and
> public shared auth and realm entry are enabled. `wrangler.toml` deliberately keeps
> `PUBLIC_AUTH_ENABLED = "false"`; the recorded production override is true.

The checked-in Alpha 0.3.11 candidate is separately approval-gated and remains
undeployed. It inherits the 10,000-cell generation-three / 2,000
resource-capable-anchor world target, then stacks a 24-site Tier-I Gold Mine
wagon candidate, a separate 96-site Tier-I Wheat Farm Food candidate, and a
separate 96-site Tier-I Logging Camp Wood candidate. It does not attest a module
publication, world transition, resource backfill, Gold/forest/Food/Wood setup,
or Pages deployment; Alpha 0.3.6 remains the verified public release. The QA
aggregate parser supports only the two exact **world** rollout tuples and never
infers a world stage, Gold/Food/Wood-site state, paired resource-reservation
state, or economy state from partial counts.

`https://auth.warpkeep.com` is the canonical bridge coordinate, but its
existence is not evidence that an arbitrary local v2 source is deployed. Every
future rollout step requires exact-head verification and recorded authority.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/.well-known/openid-configuration` | Exact issuer, claims, and public JWKS URI. |
| `GET` | `/.well-known/jwks.json` | Public ES256/P-256 JWK; never serializes private `d`. |
| `GET` | `/healthz` | Basic health response. |
| `POST` | `/v2/farcaster/challenge` | Creates a five-minute, S256-bound SIWF challenge. |
| `POST` | `/v2/farcaster/exchange` | Verifies SIWF and creates a rotating server-side session family. |
| `POST` | `/v2/session/refresh` | Rotates the session reference and returns a fresh access token only for an authorized family. |
| `POST` | `/v2/session/logout` | Revokes the server-side family and expires the cookie; fails closed if durable revocation cannot be confirmed. |
| `POST` | `/v1/qa/challenge` | Server-only, zero-body 60-second challenge for the one registered read-only QA device. Disabled by default. |
| `POST` | `/v1/qa/realm-snapshot` | Server-only proof exchange returning one bounded aggregate Realm attestation; the v1 path is a compatibility name. |
| `POST` | `/v1/admin/token` | Server-only five-minute Hermes/admin JWT. |
| `POST` | `/v1/admin/auth-epoch-probe` | Server-only, input-free structured resolver check. |
| `POST` | `/v1/admin/config-attestation` | Server-only digest of security-relevant runtime configuration. |

The legacy public `/v1/farcaster/challenge` and `/v1/farcaster/exchange` routes
are retired in the local contract and return `410 legacy_auth_retired`; they do
not fall through to authentication work. The v2 browser routes allow only exact
`ALLOWED_ORIGINS`, credentialed CORS, and strict request shapes. They never use
wildcard CORS. JSON bodies are limited to 16 KiB. Server-only admin routes
accept only a completed zero-byte stream, validate every present
`Content-Length`, and cancel on the first body byte. The bridge rejects relay
secrets such as `channelToken`, custody fields, verification lists, and relay
metadata.

The QA routes are a separate service boundary, not browser/player
authentication. They reject every request carrying an `Origin`, emit no CORS
headers, reject query parameters and unknown JSON fields, and remain unavailable
unless `QA_OBSERVER_ENABLED` is exactly `true` with one all-or-none dedicated
SpacetimeDB URI/database/audience tuple plus one all-or-none registered public
P-256 JWK, canonical RFC 3339 registration timestamp, and canonical expiry.
The observer database and audience must both differ from the gameplay values;
partial tuples and any fallback to gameplay coordinates fail closed. The
production observer origin is additionally pinned to exact
`https://maincloud.spacetimedb.com`, so a configured credential cannot be sent
to another HTTPS origin. The checked-in gate is `false` and the dedicated tuple
is absent, independent of `PUBLIC_AUTH_ENABLED`.
The key must remain valid beyond the one-minute challenge window and its expiry
may be no more than 366 days after the fixed registration timestamp; the
boundary is checked again on every QA request so annual owner review cannot be
bypassed by a stale deployment.

Challenge, exchange, refresh, and server-only credential routes use distributed
Durable Object rolling windows.
Browser Origin/no-Origin trust gates run before quota consumption, while the
limiter still runs before body parsing, proof verification, credential checks,
or Maincloud work. IPv4 is bucketed per address and IPv6 per routed `/64`;
only a versioned SHA-256 bucket name is retained. Denials return `429` with a
bounded `Retry-After`, limiter failures return `503`, and expired objects use
`deleteAll()` to remove SQLite metadata and alarms. Edge/global monitoring is
still required because per-client controls do not cap aggregate traffic.

## Machine-bound read-only QA contract

`POST /v1/qa/challenge` accepts no body. Its exact response is
`{ version: 1, requestId, challenge, expiresAt, keyThumbprint, scope:
"realm.snapshot", signingInput }`. `requestId` and `challenge` are random
base64url values, `keyThumbprint` is the RFC 7638 SHA-256 thumbprint of the one
registered JWK, and `expiresAt` is epoch milliseconds at most 60 seconds after
creation. The dedicated `QA_CHALLENGE_REPLAY_GUARD` Durable Object provides the
atomic one-attempt boundary and fully deallocates abandoned records at expiry.

The helper must reconstruct rather than trust the echoed canonical UTF-8 ASCII
input. It has exact LF separators and no trailing newline:

```text
warpkeep-qa-observer-v1
issuer=<exact configured issuer>
endpoint=/v1/qa/realm-snapshot
scope=realm.snapshot
requestId=<requestId>
challenge=<challenge>
keyThumbprint=<RFC 7638 thumbprint>
expiresAt=<decimal epoch milliseconds>
```

`POST /v1/qa/realm-snapshot` accepts exactly `{ requestId, signature }`, where
`signature` is an unpadded base64url 64-byte IEEE-P1363 P-256 ECDSA signature
(`r || s`) over the canonical input. A submitted challenge is consumed before
signature verification, so a wrong signature cannot be retried. After proof,
the Worker mints a fresh 15-second token with exact subject
`service:qa-snapshot-resolver`, sole role
`warpkeep-qa-snapshot-resolver`, and `device_thumbprint`. It calls only the
fixed `qa_observer_get_realm_attestation_v2` procedure on the configured
dedicated observer database with `[]`. Its JWT uses only the dedicated observer
audience, which the canonical game module rejects. The Worker never returns
that token, rejects redirects and malformed/oversized responses, and returns
only the strict aggregate attestation. The retained
`qa_observer_get_realm_snapshot_v1` schema wire immediately fails with
`QA_OBSERVER_V1_DISABLED`; it performs no authentication, transaction, or
database read and can no longer return its former response.

The `/v1/qa/realm-snapshot` route and `realm.snapshot` scope remain unchanged as
device-proof compatibility names. They do not authorize or return per-player
Realm data. The successful Worker response keeps exactly this closed shape.
During the bounded world rollout it accepts either the complete live
generation-two tuple (`1261 / 1261 / 2 / 20 / 22`) or the complete candidate
tuple shown below; every mixed tuple is rejected:

```text
{
  version: 2,
  protocolVersion: 3,
  worldSeed: 3445214658,
  worldSeedName: "HEGEMONY_GENESIS_001",
  worldTileCount: 10000,
  worldTileMetaCount: 10000,
  realm: {
    realmId: "GENESIS_001",
    numericSeed: 3445214658,
    generationVersion: 3,
    authoritativeRadius: 58,
    renderRadius: 60,
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

Validation requires 1–100 castles, equal castle/profile counts, and
`foundedCount + activeCount === castleCount`. No per-castle collection, castle
ID, coordinate, keep or player name, username, display name, bio, portrait
signal, FID, Identity, PFP URL, auth/session material, admission, Terms, wallet,
receipt, Marks, audit, or mutation surface leaves the server.

This closed Worker response is not by itself a complete aggregate-only
principal boundary. The bridge now refuses to mint or send the observer token
without a different database and audience and never falls back to the gameplay
target. Configuration separation does not prove that a future target's schema
is identity-free. `QA_OBSERVER_ENABLED` must remain `false` until an isolated
module/database or identity-free replica with no player/profile subscription
surface is reviewed and deployed, in addition to the local caller-binding
prerequisites.

## Browser proof contract

For every sign-in attempt, the browser generates a fresh 32-byte random
verifier, derives its RFC 7636 `S256` challenge, and keeps the verifier only in
the private controller for that generation. The client calls
`POST /v2/farcaster/challenge` with
`{ domain, siweUri, bindingChallenge, bindingMethod: "S256" }`. Domain and URI
are compared only with server configuration; caller input never selects an
arbitrary SIWF target. The Worker stores only the digest in an exact version-2
Durable Object record and does not echo it in the response.

The exchange body is
`{ message, signature, nonce, fid, requestId, domain, siweUri, expirationTime, expiresAt, bindingVerifier, rememberDevice, identity }`;
`identity` is exactly `{ fid }`; additional profile fields are rejected rather
than persisted or copied into a token. The Worker recomputes
`S256(bindingVerifier)` and requires an exact match before signed-proof parsing,
atomic consumption, RPC, admission resolution, session creation, or signing.
The independently verified FID must match both supplied FID fields. Do not send
profile metadata or the private Farcaster relay `channelToken`.

The v2 exchange and refresh response is an exact union:

- an enabled FID returns `status: "authorized"`, a maximum-600-second
  `accessToken`, its `accessExpiresAt`, FID-only identity, and the absolute
  `sessionExpiresAt`;
- a missing FID returns `status: "pending-admission"`, FID-only identity,
  and `sessionExpiresAt` **without any access token**;
- a disabled FID is rejected and no session family or access token is created.

The browser holds an authorized access token only in JavaScript memory. It is
never written to `localStorage`, `sessionStorage`, IndexedDB, a URL, or a
browser-readable cookie. Each controller generation owns a separate abort
signal. Cancel, expiry, logout, retry replacement, and provider unmount abort
outstanding work and drop private verifier/proof references. Server-side
one-time use and expiry remain authoritative if bytes have already arrived.

## Verification and replay boundary

`src/farcaster.ts` uses the official `@farcaster/auth-client` verifier with
`acceptAuthAddress: true`. Before verification, the Worker checks exact domain,
URI, nonce, request ID, and expiry in the parsed SIWE message. Signatures are
bounded hexadecimal byte strings so supported smart-account signatures remain
possible. The challenge is atomically claimed before Farcaster RPC, Maincloud
resolution, or signing. Definitive failures consume it; only an explicitly
retryable verifier outage, Maincloud failure, or signing failure may restore the
same still-live challenge. The Worker awaits Farcaster verification for at most
eight seconds; that deadline becomes the same generic retryable outage and can
restore only a still-live record. Browser JSON and server-only admin request
bodies must also finish streaming within eight seconds in addition to their byte
bounds. Expiry alarms fully deallocate abandoned storage.

## Session family and rotation

The browser receives only an HMAC-authenticated reference in
`__Host-warpkeep_session`. The cookie is always `Secure`, `HttpOnly`,
`SameSite=Strict`, and `Path=/`, with no `Domain` attribute. A remembered family
has an absolute maximum of 30 days; without `rememberDevice`, the same bounded
server-side family is referenced by a non-persistent session cookie. The browser
preference defaults false, so persistence is explicit opt-in. The Durable Object
record binds origin, verified FID only, pending/bound state,
positive epoch when bound, absolute expiry, and current generation.

Every successful refresh rotates the current generation. The immediately
previous generation has only a bounded recovery grace for a lost response; an
older or out-of-grace generation is a stale replay and revokes the family. A
bound family also revokes when authoritative admission becomes missing or
disabled, or when its positive epoch no longer matches. A pending family stays
tokenless while admission is missing, transitions once to a bound positive
epoch when enabled, and revokes if disabled. A successful logout confirms
server-side revocation, expires the current browser cookie, and returns `204`.
If Durable Object revocation fails, the endpoint returns generic `503`, still
expires the current browser cookie, and does not claim that the family was
revoked. A separately copied cookie can remain usable after storage recovery
until the bounded family expires; treat `session_revoke_failed` as an incident
signal without logging the cookie or family identifier.

The browser additionally writes a non-secret, base-path-scoped logout-intent
tombstone containing only a marker and timestamp. For its 30-day lifetime it
blocks every cookie refresh across reloads/tabs until an explicit new SIWF attempt
clears it early. If that storage write is denied, the current runtime remains
blocked and unavailable storage fails closed, but a later storage-enabled context
cannot recover the missing tombstone. Combined with failed server revocation,
that is a residual risk for a still-valid copied cookie.

## OIDC claims and resolver boundary

Player access JWT claims include exact `auth_version: 2`,
`sub: farcaster:<verified decimal fid>`, `token_type: "spacetime-access"`, a
positive `auth_epoch` (`1..u32::MAX`), empty `roles`, standard time claims,
matching `session_iat`/`session_exp`, and a random `jti`. `exp - iat` and the
custom session window are both at most 600 seconds. The module rechecks that
custom deadline after SpacetimeDB connection-token exchange. Player tokens have
no username, display-name, avatar, or other optional profile claims. The separate
server-only admin endpoint still issues a maximum-five-minute Hermes token with
exact `sub: "service:hermes"` and `roles: ["warpkeep-admin"]`.

The module does not treat optional profile-shaped JWT fields as a public write
channel. Even if such fields are present, `bootstrap_player_v2` ignores them and
inserts `username`, `displayName`, and `pfpUrl` as undefined in `player_v2`;
profile mutations require a separately reviewed path.

`auth_epoch` is never a browser request field and is not hardcoded. For each
resolution the Worker mints a fresh, non-persisted 15-second resolver JWT with
exact `sub: "service:auth-epoch-resolver"` and exactly one role:
`roles: ["warpkeep-auth-epoch-resolver"]`, plus exact `resolver_fid` equal to the
one verified FID being resolved. The module retains a 60-second rejection
ceiling. The token has no admin role and is never returned or logged.

The Worker calls the fixed documented Maincloud endpoint
`POST https://maincloud.spacetimedb.com/v1/database/warpkeep-89e4u/call/auth_resolver_get_fid_admission_v2`
with `Authorization: Bearer <ephemeral resolver JWT>` and SATS-JSON argument
`[<verified safe-integer fid>]`. The exact HTTP SATS-JSON product response is
`["missing"|"disabled"|"enabled", <u32>]`: missing/disabled require epoch `0`,
while enabled requires epoch `>= 1`. The Worker normalizes that tuple to its
internal `{ state, authEpoch }` result and rejects redirects, caching,
oversized/wrong-media/malformed bodies, inconsistent state/epoch pairs,
non-2xx responses, and calls exceeding five seconds. Failure returns generic
`503 authorization_unavailable` and no access token.

The module requires the signed `resolver_fid` to equal the positional procedure
argument before reading admission state. A captured token necessarily reveals
its one bound FID and may resolve only that FID's admission projection while
fresh; it cannot be reused as an oracle for other FIDs.

SpacetimeDB invokes `clientConnected` before authenticated HTTP procedures, so
the exact fresh resolver must also pass lifecycle admission. The 15 seconds bound
when the credential can initiate a connection, not the lifetime of an accepted
WebSocket: public-table subscriptions opened while fresh may persist until
transport disconnect. Static `get_alpha_backend_info` is callable only while
fresh, protected calls recheck expiry, and the resolver cannot read private
tables, bootstrap or mutate as a player, or pass Hermes/admin guards. The Worker
sends it only to the fixed resolver endpoint.

Production configuration enforces that exact Maincloud origin and database
before constructing the resolver. Matching lookalikes fail configuration closed.
Only an explicit `ENVIRONMENT=development` bridge may use configurable local/test
resolver coordinates.

`admin_get_fid_auth_epoch` remains documented only as an admin-authenticated,
raw-epoch rollback compatibility procedure. New v2 issuance and refresh must
not use it. The synthetic probe invokes only the structured resolver with one
fixed safe FID and never returns an epoch, FID, JWT, upstream body/status, URL,
or raw error.

The module preserves the exact public legacy `player` schema, including its
opaque OIDC Identity column, and requires that table to remain empty. Protocol
v2 never reads, writes, or subscribes to it. The active split is public
`player_v2` plus private `player_ownership_v2`; the browser subscribes only to
`world_tile`, `player_v2`, and `castle`. Legacy `get_my_admission_status` and
`bootstrap_player` immediately fail `PROTOCOL_RETIRED`, while the active player
wires are exactly `get_my_admission_status_v2` and `bootstrap_player_v2`.

The admin-only `admin_get_alpha_status_v2` procedure returns privacy-safe
aggregate counts for legacy rows, v2 player/ownership consistency, world and
admission state, protocol version, and seed. It returns no FID, Identity, token,
proof, cookie, or profile payload.

## Required configuration and attestation

`wrangler.toml` declares `workers_dev = false`, the `auth.warpkeep.com`
custom-domain route, `PUBLIC_AUTH_ENABLED = "false"`, and the non-secret
issuer/origin/database contract. `FARCASTER_RPC_URL`, `SIGNING_KEY_JWK`,
`ADMIN_TOKEN_SECRET`, and the independent `SESSION_COOKIE_KEY` are managed
Worker secrets. Both symmetric secrets require at least 32 random bytes and
all three secret materials must be pairwise distinct, including the private
`d` scalar inside `SIGNING_KEY_JWK`. `CHALLENGE_REPLAY_GUARD`,
`AUTH_RATE_LIMITER`, and `SESSION_FAMILIES` are separate SQLite Durable Object
bindings. `QA_CHALLENGE_REPLAY_GUARD` is a fourth isolated SQLite binding; its
additive `QaChallengeReplayGuard` migration requires explicit operator approval
before any Worker deployment. `QA_OBSERVER_SPACETIMEDB_URI`,
`QA_OBSERVER_SPACETIMEDB_DATABASE`, and `QA_OBSERVER_OIDC_AUDIENCE` are one
all-or-none tuple and have no gameplay fallback; the database and audience must
both differ from the player/auth resolver target, and production pins the tuple's
origin to exact `https://maincloud.spacetimedb.com`. `QA_OBSERVER_PUBLIC_JWK`,
`QA_OBSERVER_KEY_REGISTERED_AT`, and `QA_OBSERVER_KEY_EXPIRES_AT` are required
as one exact tuple only when the independent QA gate is enabled. Registration
and expiry are canonical RFC 3339 timestamps; their interval may not exceed 366
days, so an old excessive expiry cannot become valid merely as time passes.
Keep the registered public key in managed Worker configuration so the machine
fingerprint does not become public repository metadata.

The production browser and Pages activation gate separately pin the exact bridge
and issuer `https://auth.warpkeep.com`, audience `warpkeep-spacetimedb`, and the
same Maincloud/database pair. Development remains explicitly configurable and is
not accepted as a production activation profile.

The server-only `POST /v1/admin/config-attestation` route additionally returns
the independent QA gate, observer URI/database/audience tuple, registered
public-key fingerprint, canonical registration/expiry timestamps, and maximum
registration lifetime after admin-secret authentication. The SHA-256 digest
covers issuer, origins, SIWF coordinates, gameplay audience/key/Maincloud
coordinates, observer URI/database/audience coordinates, environment, S256
binding, player/resolver lifetimes, QA scope/procedure/lifetimes, both gates,
the registered QA fingerprint/registration/expiry/lifetime, the 30-day family
ceiling, and exact cookie attributes. Operators must compare it with the
reviewed expected configuration; it is not a deployment action and reveals no
secret material.

Copy `.dev.vars.example` to untracked `.dev.vars` only for local work and use
separate development keys. Set real secrets only through approved Cloudflare
secret management, never Vite variables or committed config.

## Approval-gated staged rollout

Alpha 0.3.1 completed the following recorded sequence. Every future redeploy or
recovery must remain staged and fail closed in the same order. The zero check in
this historical sequence applies only to the frozen legacy `player` table; it
does not describe the current admission/founder count. A protocol-3 recovery
must separately match the fresh privacy-safe aggregate to the reviewed private
current-state record:

1. keep both Worker public auth and the frontend shared-alpha switch false;
2. run `npm run stdb:verify-additive-migration` from the repository root; its
   disposable loopback-only proof verifies the frozen legacy shapes, retained
   empty and synthetic non-empty rows, real resolver HTTP lifecycle and tuple
   parsing without aggregate mutation, idempotent republish, v2 consistency,
   and guarded v1 rollback refusal before schema change without contacting
   Maincloud;
3. obtain approval for a fresh, bounded, read-only Maincloud inspection and stop
   unless the deployed-v1 `players` field (the legacy count) equals zero; any
   enabled epoch-zero admission is also a hard stop, with no automatic migration
   or deletion;
4. obtain separate explicit owner approval for the guarded production module
   publish; its same-run protected v1 aggregate must independently reproduce the
   fresh legacy-player-zero result, while the publisher pins the reviewed CLI
   binary and canonical existing database identity, uses `--delete-data=never`, never uses
   `--break-clients`, and closes stdin so compatibility prompts fail closed;
5. verify `admin_get_alpha_status_v2`, the exact v2 resolver/player wires,
   legacy-wire retirement, private ownership isolation, and active-browser
   `player_v2` use;
6. obtain separate approval for the additive `SessionFamily` Durable Object
   migration;
7. obtain separate approval to configure `SESSION_COOKIE_KEY` and any other
   required managed secrets without printing or reusing them;
8. obtain separate approval to deploy the Worker with public auth still false,
   then verify discovery/JWKS, the structured resolver probe, legacy-route
   retirement, and the configuration attestation;
9. obtain separate approval to deploy the v2 frontend while its realm switch
   remains false;
10. after exact-head hosted paused verification, obtain final authority and
    proceed strictly: enable Worker public auth, pass its enabled public/private
    gates, enable/deploy the exact frontend, then perform immediate owner QA.
    The Alpha 0.3.1 authority is not reusable for a future change.

If any stage disagrees, stop and leave public auth false. The legacy admin epoch
procedure is rollback compatibility only, not permission to mint v1 tokens.

## Checks, logs, and admin boundary

Run `cd services/auth-bridge && pnpm install --frozen-lockfile && pnpm run check`
locally. Run the separate repository-root
`npm run stdb:verify-additive-migration` command for the loopback-only additive
module proof; neither check contacts or mutates production. Coverage includes
S256 binding, challenge replay, structured admission
validation, FID-only exchange/storage/response/JWT identity, exact v2 claims,
pending-without-token responses, cookie integrity and attributes, session-family
rotation and replay revocation, epoch-change revocation, durable-logout failure,
default-off persistence intent, logout-tombstone suppression/storage denial,
profile-claim discard, production resolver-coordinate pins, route retirement,
retired legacy module wires, v2-only browser player data, privacy-safe v2 admin
aggregation, configuration attestation, limits, admin separation, and static
safe log events. Stalled verifier and body-stream fixtures prove the Worker
returns within its fixed deadlines without recording caller material.

Logs are closed static event names only. The Worker never logs a SIWF message,
signature, nonce, request ID, JWT, cookie, private JWK, RPC URL, procedure
request/response, or symmetric secret. `/v1/admin/token`,
`/v1/admin/auth-epoch-probe`, and `/v1/admin/config-attestation` require
`Authorization: Bearer <ADMIN_TOKEN_SECRET>`, reject browser `Origin` headers,
emit no admin CORS headers, and are only for a server-side operator process.
Never expose their credential or response to frontend code.
