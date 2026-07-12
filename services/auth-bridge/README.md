# Warpkeep Farcaster → OIDC bridge

This Cloudflare Worker verifies completed Farcaster SIWF proofs and issues ES256 OIDC JWTs for Warpkeep's SpacetimeDB connection. It is isolated from the static browser app: browser code never receives a signing key, admin secret, Optimism RPC URL, private Hermes JWT, or Maincloud credential.

The checked-in Worker configuration and live deployment use
`https://auth.warpkeep.com`. Health, discovery/JWKS, exact CORS, distributed
rate control, the direct private Maincloud procedure path, and the corresponding
module issuer have been verified. This directory never activates frontend OIDC
by itself; that remains an exact-head Pages workflow decision.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/.well-known/openid-configuration` | Exact issuer and public JWKS URI. |
| `GET` | `/.well-known/jwks.json` | Public ES256/P-256 JWK; never serializes private `d`. |
| `GET` | `/healthz` | Basic health response. |
| `POST` | `/v1/farcaster/challenge` | Creates a five-minute SIWF challenge. |
| `POST` | `/v1/farcaster/exchange` | Verifies SIWF and returns a player JWT. |
| `POST` | `/v1/admin/token` | Server-only five-minute Hermes/admin JWT. |
| `POST` | `/v1/admin/auth-epoch-probe` | Server-only, input-free synthetic auth-epoch resolver check. |

Challenge and exchange allow only exact `ALLOWED_ORIGINS`, never wildcard CORS or credentials. They allow only `POST`, `OPTIONS`, and `content-type`; body size is limited to 16 KiB. Both admin routes accept only a completed zero-byte stream, validate every present `Content-Length`, and cancel on the first body byte. The bridge rejects relay secrets such as `channelToken`, custody fields, verification lists, and relay metadata.

The four authentication POST routes also use distributed Durable Object
rolling windows: challenge `12/5m`, exchange `20/5m`, and both server-only admin
routes share the rollback-compatible admin `6/5m` window.
Browser Origin/no-Origin trust gates run before quota consumption, while the
limiter still runs before body parsing, proof verification, credential checks,
or Maincloud work. IPv4 is bucketed per address and IPv6 per routed `/64`; only
a versioned SHA-256 bucket name is retained. Denials return `429` with a bounded
`Retry-After`, limiter failures return `503`, and expired objects use
`deleteAll()` to remove SQLite metadata and alarms. Edge/global monitoring is
still required because per-client controls do not cap aggregate traffic.

## Browser contract

The client calls `POST /v1/farcaster/challenge` with `{ "domain": "<configured domain>", "siweUri": "<configured SIWF URI>" }`. Domain and URI are only compared to server configuration; caller input never selects an arbitrary SIWF target.

The response is `{ "nonce", "requestId", "createdAt", "expiresAt", "domain", "siweUri", "expirationTime" }`, where timestamp fields are epoch milliseconds and `expirationTime` is the same expiry in ISO-8601 form.

The exchange body is `{ message, signature, nonce, fid, requestId, domain, siweUri, expirationTime, identity }`; `identity` is `{ fid, username?, displayName?, pfpUrl? }`. The response is `{ "token": "<JWT>", "tokenType": "spacetime-access", "expiresAt": <epoch milliseconds> }`. The independently verified FID must match both supplied FID fields. Optional display fields are bounded/sanitized convenience claims, not ownership proof. Do not send the private Farcaster relay `channelToken`.

## Verification and replay boundary

`src/farcaster.ts` uses the official `@farcaster/auth-client` verifier with `acceptAuthAddress: true`. Before verification, the Worker checks exact configured domain, URI, nonce, request ID, and expiry in the parsed SIWE message. Signatures are bounded hexadecimal byte strings rather than hard-coded EOA length so the official verifier can handle supported smart-account signatures. The official verifier validates the signature and Farcaster FID binding.

The challenge store has `put`, `get`, and atomic `consume`. Production uses one Cloudflare Durable Object per challenge rather than Workers KV, because KV get/delete cannot enforce one-time consumption under races. After local context parsing, the bridge atomically claims the challenge before Farcaster RPC, Maincloud lookup, or signing work. Definitively invalid proof/FID results remain consumed; an explicitly retryable verifier outage, Maincloud lookup failure, or signing failure restores only a still-live challenge. Every object schedules an expiry alarm and uses SQLite `deleteAll()` on consumption or expiry so abandoned challenge storage is fully deallocated. The bridge rechecks the absolute challenge deadline after upstream work and again after signing, so no completed token crosses that boundary. A replay cannot produce another token or amplify concurrent upstream work.

## OIDC claims and auth epoch

Player JWT claims include `iss`, `sub: farcaster:<verified decimal fid>`, `aud: ["warpkeep-spacetimedb"]`, `token_type: "spacetime-access"`, verified decimal `fid`, current `auth_epoch`, empty `roles`, `iat`, `nbf`, 30-day `exp`, matching `session_iat`/`session_exp`, and a random `jti`. The custom session window survives SpacetimeDB's connection-token exchange so the module can enforce the original absolute 30-day deadline on every call. The external server-only admin endpoint issues a five-minute Hermes token with `sub: "service:hermes"`, `roles: ["warpkeep-admin"]`, and response metadata `tokenType: "spacetime-access"`.

`auth_epoch` is never a browser field and is not hardcoded. Before every player token, the Worker mints a fresh in-memory Hermes admin OIDC JWT with an approximately 60-second expiry. Its claims are the configured issuer, `sub: "service:hermes"`, `aud: ["warpkeep-spacetimedb"]`, `token_type: "spacetime-access"`, and `roles: ["warpkeep-admin"]`. It is neither persisted, returned, nor logged.

The Worker calls the fixed documented Maincloud endpoint `POST https://maincloud.spacetimedb.com/v1/database/warpkeep-89e4u/call/admin_get_fid_auth_epoch` with `Authorization: Bearer <ephemeral Hermes JWT>`, JSON content and accept headers, and the numeric SATS-JSON argument array `[<verified safe-integer fid>]`. The protected procedure returns the raw unsigned 32-bit epoch; `0` means the FID has no whitelist row. The Worker validates the fixed HTTPS origin/database/procedure, rejects redirects, disables caching, caps the response, aborts within five seconds, and accepts only a raw `u32`. Missing, malformed, timed-out, redirected, non-2xx, or unavailable results cause `503 authorization_unavailable` and no player JWT is issued. This is the revocation boundary after an admin auth-epoch bump; there is no separate resolver service, URL, token, anonymous request, or browser authority.

The synthetic probe invokes that exact resolver with one fixed safe-integer FID; it accepts no body, query, browser `Origin`, or caller-selected FID. A completed authenticated resolver check returns only `{ "ok": true }`, or `{ "ok": false, "stage": "<closed-stage>" }` with one of `signing`, `fetch_request`, `fetch_body`, `timeout`, `upstream_status`, or `response_validation`; unexpected bugs remain a generic error with no fabricated stage. The probe never returns the epoch, FID, JWT, upstream status code/body, URL, or raw error. The public exchange response remains the generic `503 authorization_unavailable` for every resolver stage.

> The 30-day browser-stored OIDC bearer token is a closed-alpha convenience. Production should use short-lived access tokens plus a trusted HttpOnly refresh/session flow.

## Required configuration

`wrangler.toml` declares `workers_dev = false`, the `auth.warpkeep.com` custom-domain route, and the stable non-secret production contract: `ENVIRONMENT`, `ISSUER`, `ALLOWED_ORIGINS`, `FARCASTER_DOMAIN`, `FARCASTER_SIWE_URI`, `OIDC_AUDIENCE`, `OIDC_KEY_ID`, `SPACETIMEDB_URI`, and `SPACETIMEDB_DATABASE`. Configure only `FARCASTER_RPC_URL`, `SIGNING_KEY_JWK` (managed private P-256 JWK including `d`), and `ADMIN_TOKEN_SECRET` as managed Worker secrets. The admin secret must contain at least 32 random bytes. The config declares separate `CHALLENGE_REPLAY_GUARD` and `AUTH_RATE_LIMITER` SQLite Durable Object bindings and migrations.

Copy `.dev.vars.example` to untracked `.dev.vars` only for local work and use separate development keys. Set real secrets through Cloudflare secret management, never Vite variables or committed config. Do not deploy/activate frontend OIDC until public discovery/JWKS, strict CORS, the direct private procedure call, and module JWT validation all pass on the final issuer.

From the repository root, generate and hand off the production P-256 JWK only
from an approved local activation terminal. Feed it directly to the managed-secret command so the
private `d` value is never printed, copied, or written to disk; do not run this
under shell tracing or captured CI logs:

```sh
set +x
node --input-type=module -e 'const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]); process.stdout.write(JSON.stringify(await crypto.subtle.exportKey("jwk", pair.privateKey)))' \
  | pnpm --dir services/auth-bridge exec wrangler secret put SIGNING_KEY_JWK
```

## Checks, logs, and admin boundary

Run `cd services/auth-bridge && pnpm install --frozen-lockfile && pnpm run check`. The isolated tests cover public-only JWKS, mocked valid SIWF exchange, invalid signature/FID mismatch, replay prevention, post-upstream/signing expiry, SIWF context, CORS, raw-byte/framing body guards, distributed rate envelopes/concurrency/cleanup, fail-closed direct auth-epoch lookup, admin authentication/expiry, and static safe log events.

Logs are closed static event names only. The Worker never logs a SIWF message, signature, nonce, request ID, JWT, private JWK, RPC URL, procedure request/response, or admin secret. Both `/v1/admin/token` and `/v1/admin/auth-epoch-probe` require `Authorization: Bearer <ADMIN_TOKEN_SECRET>`, reject browser `Origin` headers, emit no admin CORS headers, and are only for a server-side Hermes/admin process. Never expose the secret, returned JWT, or authenticated probe result to frontend code, and never persist the secret or returned JWT.
