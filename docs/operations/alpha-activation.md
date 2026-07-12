# Warpkeep Alpha 0.2.0 activation runbook

This runbook activates the closed alpha without weakening its admission boundary. It is intentionally sequential: do not enable the browser before every server-side gate is healthy.

## Safety invariants

- Preserve `_github-pages-challenge-ael-dev3.warpkeep.com` exactly as supplied by GitHub.
- Never use `--delete-data`, `--break-clients`, database recreation, or a real/synthetic FID during activation.
- Keep final aggregate state at **61 world tiles / 0 allowlist rows / 0 enabled allowlist rows / 0 players / 0 castles**.
- Keep secrets out of the repository, `VITE_` variables, shell history, logs, and support screenshots.
- Leave `VITE_WARPKEEP_SHARED_ALPHA_ENABLED=false` until the bridge, its direct private Maincloud auth-epoch procedure call, and the module prove healthy.

## 1. Domain and GitHub Pages

Confirm the GitHub verification TXT from at least two independent resolvers. In Cloudflare, use DNS-only records:

```txt
A      @      185.199.108.153
A      @      185.199.109.153
A      @      185.199.110.153
A      @      185.199.111.153
CNAME  www    ael-dev3.github.io
```

Do not add a wildcard or proxy the apex. Remove only a documented conflicting placeholder. The repository Pages custom domain is already `warpkeep.com`, its certificate is ready, and HTTPS is enforced; do not change its DNS, custom-domain, or proxy settings during this activation. Verify apex, `www` redirect, and the legacy GitHub URL.

## 2. Bridge deployment

`services/auth-bridge/wrangler.toml` defines the intended custom domain and safe public production settings. Deploy only from an authenticated scoped Cloudflare credential with:

- Workers Scripts: Edit
- Workers Routes/Custom Domains: Edit
- Zone DNS: Edit
- Zone: Read

Required Worker secret names are:

```txt
SIGNING_KEY_JWK
ADMIN_TOKEN_SECRET
FARCASTER_RPC_URL
```

The Worker also receives these public, non-secret values: `SPACETIMEDB_URI=https://maincloud.spacetimedb.com` and `SPACETIMEDB_DATABASE=warpkeep-89e4u`. Generate ES256 P-256 key material and the Hermes secret with a secure local mechanism; do not print them. Keep the recoverable Hermes secret in the owner Mac’s Keychain under a private operations service name. The Worker secret store may hold the signing key because rotation is supported. Configure no browser CORS on `/v1/admin/token`.

Verify these public endpoints before continuing:

```txt
https://auth.warpkeep.com/healthz
https://auth.warpkeep.com/.well-known/openid-configuration
https://auth.warpkeep.com/.well-known/jwks.json
```

Discovery must name `https://auth.warpkeep.com` exactly; JWKS must contain one public ES256/P-256 key with no `d` member.

## 3. Private auth-epoch procedure call

For each successful Farcaster proof exchange, the Worker mints one in-memory, approximately 60-second Hermes admin OIDC JWT. Its claims are the configured issuer, `sub: service:hermes`, `aud: ["warpkeep-spacetimedb"]`, `token_type: "spacetime-access"`, and `roles: ["warpkeep-admin"]`. It is never persisted, returned, or logged.

The Worker then uses the documented low-frequency SpacetimeDB HTTP API:

```txt
POST https://maincloud.spacetimedb.com/v1/database/warpkeep-89e4u/call/admin_get_fid_auth_epoch
Authorization: Bearer <ephemeral Hermes JWT>
Content-Type: application/json
Accept: application/json
body: ["<verified decimal fid>"]
```

The fixed procedure returns the raw unsigned 32-bit epoch (`0` for a missing whitelist row). The Worker validates that raw result as a non-negative `u32`, caps the response, rejects redirects and malformed/non-2xx responses, uses a timeout no greater than five seconds, and fails closed with `503 authorization_unavailable`. There is no separate resolver hostname, resolver URL, resolver token, browser lookup, anonymous SpacetimeDB call, or public allowlist access.

## 4. Non-destructive module publish and seed

After discovery/JWKS is public, update the module issuer to the exact bridge issuer, regenerate bindings with CLI `2.6.1`, and review the output. Inspect Maincloud before mutating it. Publish only with the guarded command:

```sh
WARPKEEP_OIDC_ISSUER=https://auth.warpkeep.com \
WARPKEEP_PUBLISH_CONFIRM=warpkeep-89e4u \
npm run stdb:publish:dev
```

Then, with local Hermes authority configured, seed exactly once and inspect only aggregate-safe counts:

```sh
npm run stdb:seed-world -- --confirm
npm run stdb:inspect-alpha
```

If a confirmed mutation times out, treat its outcome as indeterminate: inspect
the aggregate state before retrying. The local deadline cannot cancel a reducer
that Maincloud has already accepted, and blindly retrying an auth-epoch bump can
advance the epoch twice.

Stop if any unexpected state exists. Do not call `allow-fid` during activation.

## 5. Browser activation and rollback

Set GitHub repository variables only after the previous steps pass:

```txt
WARPKEEP_SHARED_ALPHA_ENABLED=true
WARPKEEP_AUTH_BRIDGE_URL=https://auth.warpkeep.com
WARPKEEP_OIDC_ISSUER=https://auth.warpkeep.com
WARPKEEP_OIDC_AUDIENCE=warpkeep-spacetimedb
WARPKEEP_SPACETIMEDB_URI=https://maincloud.spacetimedb.com
WARPKEEP_SPACETIMEDB_DATABASE=warpkeep-89e4u
```

The Pages workflow validates the root deployment base, canonical origin, build SHA, and issuer/bridge equality before it builds. To rollback, set `WARPKEEP_SHARED_ALPHA_ENABLED=false` and redeploy; this leaves title, menu, and Credits intact while preventing new bridge/database work. It deletes no world data or secrets.

## 6. Verification and owner QA

Run public verification after DNS/cert propagation:

```sh
npm run verify:alpha-production
```

If the local Hermes secret is available, the script also runs the protected aggregate inspection without printing a token. The one owner-only Farcaster check, after deployment, is:

1. Open `https://warpkeep.com/#menu`.
2. Select **ENTER REALM** and approve through Farcaster.
3. Confirm **ENTRY NOT YET GRANTED**, the exact denial sentence, identity/FID, and the `@0xael.eth` link.
4. Confirm **CHECK AGAIN** does not create a new SIWF request.
5. Reopen the browser and confirm a remembered valid session returns to denial without creating gameplay state.

## 7. First admission, release, and rotation

Only after the owner approves the empty-whitelist test may an externally supplied FID be admitted:

```sh
npm run stdb:allow-fid -- 12345 "invited through Farcaster DM" --confirm
```

Use `npm run stdb:disable-fid` and `npm run stdb:bump-auth-epoch` for revocation. Rotate the ES256 key by publishing a new JWKS `kid`, updating the module issuer trust only if the issuer changes, and allowing old tokens to expire; rotate the Hermes secret separately. Create annotated `v0.2.0` and the matching GitHub Release only after merge and deployed-build verification.
