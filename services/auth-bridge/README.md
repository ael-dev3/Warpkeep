# Warpkeep Farcaster → OIDC bridge

This Cloudflare Worker verifies completed Farcaster SIWF proofs and issues ES256 OIDC JWTs for Warpkeep's SpacetimeDB connection. It is isolated from the static browser app: browser code never receives a signing key, admin secret, Optimism RPC URL, or auth-epoch resolver secret.

The checked-in Worker configuration reserves the intended production origin,
`https://auth.warpkeep.com`, but it is not a live deployment. The Worker still
fails closed until its managed secrets and private auth-epoch authority are
configured. This directory never activates frontend OIDC by itself.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/.well-known/openid-configuration` | Exact issuer and public JWKS URI. |
| `GET` | `/.well-known/jwks.json` | Public ES256/P-256 JWK; never serializes private `d`. |
| `GET` | `/healthz` | Basic health response. |
| `POST` | `/v1/farcaster/challenge` | Creates a five-minute SIWF challenge. |
| `POST` | `/v1/farcaster/exchange` | Verifies SIWF and returns a player JWT. |
| `POST` | `/v1/admin/token` | Server-only five-minute Hermes/admin JWT. |

Challenge and exchange allow only exact `ALLOWED_ORIGINS`, never wildcard CORS or credentials. They allow only `POST`, `OPTIONS`, and `content-type`; body size is limited to 16 KiB. The bridge rejects relay secrets such as `channelToken`, custody fields, verification lists, and relay metadata.

## Browser contract

The client calls `POST /v1/farcaster/challenge` with `{ "domain": "<configured domain>", "siweUri": "<configured SIWF URI>" }`. Domain and URI are only compared to server configuration; caller input never selects an arbitrary SIWF target.

The response is `{ "nonce", "requestId", "createdAt", "expiresAt", "domain", "siweUri", "expirationTime" }`, where timestamp fields are epoch milliseconds and `expirationTime` is the same expiry in ISO-8601 form.

The exchange body is `{ message, signature, nonce, fid, requestId, domain, siweUri, expirationTime, identity }`; `identity` is `{ fid, username?, displayName?, pfpUrl? }`. The response is `{ "token": "<JWT>", "tokenType": "spacetime-access", "expiresAt": 0 }`. The independently verified FID must match both supplied FID fields. Optional display fields are bounded/sanitized convenience claims, not ownership proof. Do not send the private Farcaster relay `channelToken`.

## Verification and replay boundary

`src/farcaster.ts` uses the official `@farcaster/auth-client` verifier with `acceptAuthAddress: true`. Before verification, the Worker checks exact configured domain, URI, nonce, request ID, and expiry in the parsed SIWE message. The official verifier validates the signature and Farcaster FID binding.

The challenge store has `put`, `get`, and atomic `consume`. Production uses one Cloudflare Durable Object per challenge rather than Workers KV, because KV get/delete cannot enforce one-time consumption under races. The bridge verifies first, then atomically consumes the challenge immediately before signing, so a replay cannot produce another token.

## OIDC claims and auth epoch

Player JWT claims include `iss`, `sub: farcaster:<verified decimal fid>`, `aud: ["warpkeep-spacetimedb"]`, `token_type: "spacetime-access"`, verified decimal `fid`, current `auth_epoch`, empty `roles`, `iat`, `nbf`, 30-day `exp`, and a random `jti`. Admin JWTs use `sub: "service:hermes"`, `roles: ["warpkeep-admin"]`, a five-minute expiry, and response metadata `tokenType: "spacetime-access"`.

`auth_epoch` is never a browser field and is not hardcoded. Before every player token, an `AuthEpochResolver` reads current authoritative `allowed_fid.authEpoch` for the verified FID. The default server-to-server contract is `GET <AUTH_EPOCH_RESOLVER_URL>?fid=<verified decimal fid>` with `Authorization: Bearer <AUTH_EPOCH_RESOLVER_TOKEN>`, returning exactly `{ "authEpoch": <unsigned 32-bit integer> }`.

That resolver must use trusted module/server credentials and must not trust browser input. The bridge rejects redirects, disables caching, bounds the response to 1 KiB, requires a JSON object containing only `authEpoch`, and aborts an unresolved lookup after five seconds. Missing, malformed, timed-out, or unavailable resolution causes `503 authorization_unavailable` and no player JWT is issued. This is the revocation boundary after an admin auth-epoch bump. A Service Binding or direct trusted server client may implement the same `AuthEpochResolver` interface.

> The 30-day browser-stored OIDC bearer token is a closed-alpha convenience. Production should use short-lived access tokens plus a trusted HttpOnly refresh/session flow.

## Required configuration

`wrangler.toml` declares `workers_dev = false`, the `auth.warpkeep.com` custom-domain route, and the stable non-secret production contract: `ENVIRONMENT`, `ISSUER`, `ALLOWED_ORIGINS`, `FARCASTER_DOMAIN`, `FARCASTER_SIWE_URI`, `OIDC_AUDIENCE`, and `OIDC_KEY_ID`. Configure `FARCASTER_RPC_URL`, `SIGNING_KEY_JWK` (managed private P-256 JWK including `d`), `ADMIN_TOKEN_SECRET`, `AUTH_EPOCH_RESOLVER_URL`, and `AUTH_EPOCH_RESOLVER_TOKEN` as managed secrets/variables before deployment. The `CHALLENGE_REPLAY_GUARD` Durable Object binding is declared in the config.

Copy `.dev.vars.example` to untracked `.dev.vars` only for local work and use separate development keys. Set real secrets through Cloudflare secret management, never Vite variables or committed config. Do not deploy/activate frontend OIDC until public discovery/JWKS, strict CORS, auth-epoch resolver, and module JWT validation all pass on the final issuer.

Generate a P-256 JWK outside the repository: `node --input-type=module -e 'const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]); console.log(JSON.stringify(await crypto.subtle.exportKey("jwk", pair.privateKey)))'`.

## Checks, logs, and admin boundary

Run `cd services/auth-bridge && pnpm install --frozen-lockfile && pnpm run check`. The isolated tests cover public-only JWKS, mocked valid SIWF exchange, invalid signature/FID mismatch, replay prevention, SIWF context, CORS, body limits, fail-closed auth-epoch lookup, admin authentication/expiry, and static safe log events.

Logs are closed static event names only. The Worker never logs a SIWF message, signature, nonce, request ID, JWT, private JWK, RPC URL, resolver credential, or admin secret. `/v1/admin/token` requires `Authorization: Bearer <ADMIN_TOKEN_SECRET>`, rejects browser `Origin` headers, emits no admin CORS headers, and is only for a server-side Hermes/admin process. Never expose its secret or returned JWT to frontend code or disk.
