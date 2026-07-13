# Warpkeep closed-alpha activation and recovery runbook

This runbook preserves the Alpha 0.2 recovery record and defines the approval
gates for a future protocol-v2 rollout.

> **Local v2 draft — no rollout executed.** The current v2 code has not been
> published to Maincloud, migrated in Cloudflare, configured with production
> secrets, deployed as a Worker/frontend, or enabled. This documentation pass
> performs no external mutation. `PUBLIC_AUTH_ENABLED=false` and the frontend
> shared-alpha switch must remain false until the final, separately approved
> enable gate.

## Historical activation record

Recorded Alpha 0.2 coordinates previously passed discovery/JWKS, distributed
rate control, the raw admin epoch lookup, non-destructive module publish, and
protected aggregate inspection at 61 world tiles with empty admission/player/
castle state. Those observations apply only to their recorded deployed heads.
They are not evidence that the local v2 module, Worker, session-family Durable
Object, cookie secret, or frontend is live.

## Safety invariants

- Preserve `_github-pages-challenge-ael-dev3.warpkeep.com` exactly as supplied
  by GitHub; do not change DNS during an auth-only rollout without separate
  approval.
- Never permit data deletion. A module publish must use `--delete-data=never`;
  never use `--delete-data=always`, `--break-clients`, database recreation, or
  an activation FID.
- Inspect aggregate state read-only before and after any approved publish. Stop
  on unexpected state; do not erase or auto-repair it.
- Keep secrets out of the repository, `VITE_` variables, command arguments,
  shell history, logs, screenshots, HAR files, and support bundles.
- Keep Worker public auth and frontend shared-alpha access false through module,
  migration, secret, Worker, and frontend staging.
- Treat every approval below as single-purpose. Approval to publish does not
  approve a migration, secret change, deploy, or enable.

## Mandatory v2 rollout order and approval gates

The rollout is staged and sequential. The SpacetimeDB player/ownership split is
a breaking schema change; only the later Durable Object migration is additive:

1. **Local verification only:** verify module/Worker/browser tests, generated
   bindings, dependency locks, and documentation. No cloud login or mutation.
2. **Module gate:** obtain explicit approval for read-only Maincloud inspection;
   then obtain a separate approval for the reviewed breaking-schema
   migration/compatibility plan and guarded non-destructive protocol-v2 module
   publish. A generic additive publish approval is insufficient. Verify protocol
   2, private ownership isolation, and the structured resolver before moving on.
3. **Durable Object gate:** obtain separate approval for the additive
   `SessionFamily` SQLite Durable Object binding/migration. Never delete or
   rename existing challenge/rate-limit classes as part of this step.
4. **Secret gate:** obtain separate approval to configure an independent,
   high-entropy `SESSION_COOKIE_KEY` and any other required managed secrets.
   Never reuse `ADMIN_TOKEN_SECRET` or `SIGNING_KEY_JWK` material.
5. **Worker gate:** obtain separate approval to deploy the exact v2 Worker with
   `PUBLIC_AUTH_ENABLED=false`. Verify discovery/JWKS, retired public v1 routes,
   structured resolver probe, cookie attributes, and config attestation.
6. **Frontend gate:** obtain separate approval to deploy the exact v2 frontend
   while `VITE_WARPKEEP_SHARED_ALPHA_ENABLED=false`.
7. **Enable gate:** only after exact-head hosted verification and owner QA,
   obtain a final explicit approval for changing Worker public auth and a
   separate explicit approval for changing frontend shared-alpha access. This
   runbook records no such approval.

If any stage fails or disagrees, stop. Keep both switches false and roll back
only the most recent approved stage using its reviewed rollback plan.

## 1. Domain and public coordinates

The historical public coordinates are:

```txt
frontend: https://warpkeep.com/
issuer: https://auth.warpkeep.com
database service: https://maincloud.spacetimedb.com
database: warpkeep-89e4u
audience: warpkeep-spacetimedb
```

Confirm DNS/TLS and GitHub Pages source only through read-only checks unless a
separate DNS/Pages approval exists. Do not infer the deployed source SHA from a
healthy hostname.

## 2. Protocol-v2 module gate

Before any publish, run local module/binding verification and inspect Maincloud
read-only with approved operator tooling. Review existing allowlist epochs: v2
starts first admission at epoch `1`, and an enabled epoch-zero row fails closed
and requires a deliberate migration decision. Also record aggregate `player`
state without exposing identities. The local schema removes opaque OIDC Identity
from public `player` rows and adds private `player_ownership`; every existing
player row must have a reviewed reconciliation plan before publish.

That public/private split is a breaking schema change. Stop unless an explicit
approval names this migration and its client-compatibility consequences. Do not
interpret a prior generic or additive module-publish approval as authorization,
and do not use `--break-clients`, delete data, or auto-repair rows.

The current guarded publisher intentionally rejects `--break-clients`. If the
approved read-only preflight says the privacy split cannot be applied without
that flag or another migration mechanism, stop. A separately implemented,
reviewed, and explicitly approved migration path is required before continuing;
do not weaken the guard during an activation session.

Only after explicit publish approval may the guarded command be used:

```sh
WARPKEEP_OIDC_ISSUER=https://auth.warpkeep.com \
WARPKEEP_PUBLISH_CONFIRM=warpkeep-89e4u \
npm run stdb:publish:dev
```

The publish must remain non-destructive (`--delete-data=never`). If the command
times out, the outcome is indeterminate: inspect read-only before any retry.
Never seed, admit, disable, or bump an epoch as part of the publish gate.

Verify the exact local contract after an approved publish:

- backend protocol is `2`;
- player JWTs require `auth_version: 2`, `auth_epoch >= 1`, and a maximum
  600-second custom session, with FID but no optional profile claims;
- connections admit only current players or fresh exact Hermes admins;
- public `player` rows contain no opaque OIDC Identity; private
  `player_ownership` has no browser query/subscription accessor, and
  partial/mismatched ownership state fails closed;
- bootstrap ignores optional profile-shaped JWT claims and inserts undefined
  `username`, `displayName`, and `pfpUrl` fields;
- `auth_resolver_get_fid_admission_v2` returns exact structured
  missing/disabled/enabled state and epoch rules;
- resolver authority is exact `sub: service:auth-epoch-resolver`, sole role
  `warpkeep-auth-epoch-resolver`, and at most 60 seconds.

`admin_get_fid_auth_epoch` remains admin-only rollback compatibility. Do not
configure new v2 issuance or refresh to use it.

## 3. Durable Object migration and secret gate

The v2 Worker requires three SQLite Durable Object bindings:

```txt
CHALLENGE_REPLAY_GUARD -> ChallengeReplayGuard
AUTH_RATE_LIMITER      -> AuthRateLimiter
SESSION_FAMILIES       -> SessionFamily
```

The `SessionFamily` class is an additive migration and requires its own explicit
approval. Confirm migration tag/order and recovery manifest before deployment.
Do not remove existing classes or storage.

Required managed Worker secrets are:

```txt
SIGNING_KEY_JWK
ADMIN_TOKEN_SECRET
SESSION_COOKIE_KEY
FARCASTER_RPC_URL
```

`SESSION_COOKIE_KEY` is a separate high-entropy HMAC secret. Do not derive it
from, rotate it implicitly with, or reuse the signing/admin secrets. Configure
or rotate any secret only with explicit approval and non-logging handoff. This
runbook contains no secret value and records no completed configuration.

## 4. Worker staging with public auth false

An approved Worker deployment must retain:

```txt
PUBLIC_AUTH_ENABLED=false
```

The local v2 public routes are `/v2/farcaster/challenge`,
`/v2/farcaster/exchange`, `/v2/session/refresh`, and `/v2/session/logout`.
Legacy public `/v1/farcaster/challenge` and `/v1/farcaster/exchange` must return
`410 legacy_auth_retired` and never mint a token. Admin `/v1` paths are a
separate server-only namespace and are not public-v1 fallback.

For each admission resolution the Worker uses:

```txt
POST https://maincloud.spacetimedb.com/v1/database/warpkeep-89e4u/call/auth_resolver_get_fid_admission_v2
Authorization: Bearer <maximum-60-second resolver-only JWT>
Content-Type: application/json
Accept: application/json
body: [<verified safe-integer fid>]
```

The resolver JWT must have exact `sub: service:auth-epoch-resolver` and exactly
`roles: [warpkeep-auth-epoch-resolver]`. The response must be exactly
`{ state, authEpoch }`, with epoch zero only for missing/disabled and a positive
epoch for enabled. Redirect, timeout, status, media, size, JSON, or invariant
failure is `503 authorization_unavailable` and yields no access token.

In production the Worker refuses any resolver target other than exact
`https://maincloud.spacetimedb.com` and database `warpkeep-89e4u`. Only an
explicit `ENVIRONMENT=development` profile may configure a different local/test
origin or database; development flexibility is not a production fallback.

## 5. Session and cookie checks

An enabled result may yield only a maximum-600-second access token with exact
`auth_version: 2` and positive epoch. The browser keeps it in JavaScript memory
only. The exchange request, session-family record, response identity, and JWT
carry the verified FID only; optional profile fields are rejected. Missing
admission creates a pending session with no access token and no SpacetimeDB
connection. Disabled admission creates neither.

The continuity cookie must be exactly host-only
`__Host-warpkeep_session; Secure; HttpOnly; SameSite=Strict; Path=/`. A
remembered family has a maximum 30-day absolute lifetime. **Keep me signed in on
this device** defaults false, so the cookie is non-persistent unless the user
opts in; the server family remains absolutely bounded at 30 days either way.
Refresh rotates the generation. Bound epoch mismatch/missing/disabled,
expiry/origin disagreement, and stale replay revoke the family; only the
immediately previous generation has a bounded lost-response recovery grace.

Successful logout confirms server-side revocation, expires the cookie, clears
browser bearer state, and closes the database connection. If durable revocation
fails, the bridge returns generic `503` and still expires the current browser
cookie. Do not report that family as revoked: a separately copied cookie may
remain usable after storage recovery until the bounded family expires.

Sign-out first records a non-secret, base-path-scoped `logout-v1:<timestamp>`
tombstone with a 30-day maximum. It contains no FID, token, proof, cookie,
family identifier, or profile data and blocks every cookie-refresh entry point
across reloads/tabs until explicit SIWF clears it early. Malformed or unavailable
storage fails closed. If the tombstone write is denied and server revocation also
fails, a later storage-enabled context cannot discover the missing marker and may
resume a copied cookie; record that combined condition as residual risk.

## 6. Configuration attestation

After an explicitly approved paused Worker deploy, an authorized operator may
call the server-only, zero-body `/v1/admin/config-attestation`. It must return:

```json
{
  "profile": "warpkeep-auth-v2",
  "digest": "<reviewed SHA-256 digest>",
  "publicAuthEnabled": false
}
```

Compare the digest with the reviewed expected issuer, origin/SIWF coordinates,
audience, key ID, Maincloud coordinates, S256 binding, access/family lifetimes,
cookie attributes, environment, and false public-auth state. Never print the
admin credential. A mismatch blocks frontend deployment and all enablement.

The protected resolver probe must exercise the structured v2 resolver without
returning an epoch/FID/JWT/upstream body. Discovery must advertise
`auth_version`; JWKS must expose only the public key.

## 7. Frontend staging and activation

An approved v2 frontend deployment must retain:

```txt
VITE_WARPKEEP_SHARED_ALPHA_ENABLED=false
VITE_WARPKEEP_AUTH_BRIDGE_URL=https://auth.warpkeep.com
VITE_WARPKEEP_OIDC_ISSUER=https://auth.warpkeep.com
VITE_WARPKEEP_OIDC_AUDIENCE=warpkeep-spacetimedb
VITE_SPACETIMEDB_URI=https://maincloud.spacetimedb.com
VITE_SPACETIMEDB_DATABASE=warpkeep-89e4u
```

The production frontend activation gate and Pages validator require those exact
bridge/issuer, audience, Maincloud, and database values whenever shared alpha is
enabled; matching lookalikes fail closed. The localhost/configurable escape hatch
is development-only.

Only a final explicit enable approval may change Worker public auth from false;
only a separate final explicit enable approval may change frontend shared-alpha
access from false. Enable Worker first, verify exact-head v2 behavior, then
enable the frontend. Never enable a v2 frontend against a v1 Worker/module.

## 8. Owner QA after approved enablement

No owner QA was performed by this documentation task. After all preceding gates
are approved and verified, a clean profile should confirm:

1. no relay or database work before **ENTER REALM**;
2. a missing FID receives pending identity but no access token/database
   connection;
3. **CHECK AGAIN** uses cookie refresh without a new SIWF request;
4. disabling or epoch-changing a bound FID revokes refresh and disconnects;
5. successful logout revokes the family, expires the cookie, clears memory token
   state, and closes the database connection; an injected/local revocation-store
   failure returns `503`, expires the current cookie, emits only the static safe
   event, and is recorded as an unresolved bounded family risk;
6. a local fixture confirms the non-secret logout tombstone blocks startup,
   focus/timer, **CHECK AGAIN**, and direct refresh until explicit SIWF; a denied
   tombstone write plus failed server revocation remains explicitly unresolved;
7. no secret/proof/token/cookie is captured in screenshots, console, network
   exports, or logs.

Admission of any real FID requires another explicit approval after tokenless
pending QA. First admission begins at epoch `1`; do not preserve the historical
epoch-zero policy.

## Recovery

The safest immediate rollback is to keep or restore both auth switches to false
through separately approved deployments. That stops new public auth/realm work
without deleting Maincloud or Durable Object data. Do not silently restore v1
public routes or raw-epoch issuance. The legacy admin epoch procedure may assist
an approved server-only rollback investigation, but it is not browser authority.

Secret rotation, Durable Object rollback, Worker rollback, frontend rollback,
and module rollback are distinct actions with distinct blast radii. Follow the
[reconstruction documentation](./reconstruction/deployment-recovery.md), inspect
state before retrying an indeterminate mutation, and obtain explicit approval
for every external change.
