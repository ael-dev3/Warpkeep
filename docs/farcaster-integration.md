# Farcaster → OIDC integration

Warpkeep uses standard website Sign In with Farcaster (SIWF). It is not a Mini App, Quick Auth, wallet connection, or a client-only permanent identity system.

## Authority boundary

```text
browser creates a normal Farcaster SIWF channel
  -> player approves in Farcaster
  -> browser verifies the completed proof for UI consistency
  -> browser sends only the completed proof envelope to Warpkeep's bridge
  -> bridge independently verifies SIWF and consumes its one-time challenge
  -> bridge resolves authoritative auth_epoch through a private documented SpacetimeDB procedure call
  -> bridge returns an ES256 OIDC player token
  -> browser connects to SpacetimeDB with that token
```

The bridge, not the browser, establishes `sub: farcaster:<fid>`. Usernames, display names, avatars, custody addresses, and verification addresses are display metadata; they never decide account ownership.

The bridge only accepts the configured `FARCASTER_DOMAIN` and exact `FARCASTER_SIWE_URI`. The intended production values are:

```txt
domain: warpkeep.com
siweUri: https://warpkeep.com/
```

Localhost SIWF values are accepted only for an explicitly configured development bridge. A production Pages bundle accepts only HTTPS bridge/issuer URLs; it does not fall back to a local or anonymous database identity. The legacy `ael-dev3.github.io/Warpkeep/` origin has separate browser storage, so its remembered records cannot become authority on `warpkeep.com`.

## Browser flow and privacy

Selecting **ENTER REALM** is the only action that begins SIWF. Title load, anonymous menu load, and ordinary route rendering create neither a Farcaster channel nor a SpacetimeDB connection. Desktop remains QR-first; mobile/coarse layouts remain deep-link-first with an optional QR fallback.

The private controller may hold a short-lived channel token and proof only while completing the current sign-in. The following are never placed in React view state, DOM, local storage, analytics, URLs, or logs:

- channel token or channel URL outside the required QR/deep link presentation;
- SIWF message, signature, nonce, request ID, custody address, verification list, or auth method;
- bridge/admin JWTs, signing keys, resolver credentials, or admin secrets.

On successful bridge exchange, the user-facing view state has the assurance `bridge-oidc-alpha`; its bearer material is held separately as `{ jwt, issuer, audience, expiresAt }`. The provider creates a database connection only when that session is valid and exactly matches the configured issuer/audience.

## Remembered device record

The v2 record is origin/base-path bound and holds only:

```txt
version, kind, origin, basePath
public identity subset
OIDC JWT, issuer, audience, verifiedAt, rememberedAt, expiresAt
```

It restores a valid bridge session after reload, then rechecks private admission before mounting the realm. A prior v1 `remembered-device-prototype` identity-only record is removed; it cannot authorize a shared realm. Sign-out clears the OIDC record, Farcaster UI state, pending realm route, and active database connection.

> The 30-day browser-stored OIDC bearer token is a closed-alpha convenience. Production should use short-lived access tokens plus a trusted HttpOnly refresh/session flow.

Browser-readable bearer material remains vulnerable to XSS. The alpha mitigation boundary is server-side allowlist disable/auth-epoch enforcement, not an assertion that local storage is safe.

## Admission UX

A valid token may connect only far enough to read the caller's narrow admission status. The client never subscribes to `allowed_fid` or `admin_audit`.

For a valid but unadmitted identity, the Hegemony menu remains visible and the rail shows:

> This Farcaster identity is not yet admitted to the Hegemony frontier.

It names the active FID and offers a semantic **REQUEST ACCESS** link to `https://farcaster.xyz/0xael.eth`, **CHECK AGAIN**, and **SIGN OUT**. Check Again uses the still-valid OIDC session and does not create a new Farcaster channel, QR, or deep link. A backend outage instead says: “The Hegemony records are temporarily unreachable.” Neither path reveals raw reducer, WebSocket, JWT, or OIDC errors.

## Required deployment configuration

The static browser only receives public values:

```dotenv
VITE_SPACETIMEDB_URI=https://maincloud.spacetimedb.com
VITE_SPACETIMEDB_DATABASE=warpkeep-89e4u
VITE_WARPKEEP_SHARED_ALPHA_ENABLED=false
VITE_WARPKEEP_AUTH_BRIDGE_URL=https://auth.example.com
VITE_WARPKEEP_OIDC_ISSUER=https://auth.example.com
VITE_WARPKEEP_OIDC_AUDIENCE=warpkeep-spacetimedb
```

The Worker receives secrets and server-only configuration described in [`services/auth-bridge/README.md`](../services/auth-bridge/README.md). For each verified proof it mints an ephemeral, approximately 60-second Hermes admin OIDC JWT and calls the fixed documented endpoint `POST /v1/database/warpkeep-89e4u/call/admin_get_fid_auth_epoch` on Maincloud with JSON `[fid]`. The raw `u32` epoch result is private Worker state, never browser authority. `VITE_WARPKEEP_SHARED_ALPHA_ENABLED` is an explicit default-false kill switch: until the direct procedure call, public discovery/JWKS, and the corresponding SpacetimeDB issuer are deployed and verified, it remains off and the frontend never creates a SIWF channel for shared admission.

## Tests and manual QA

Automated tests use injected Farcaster authorities and bridge clients; they never call a real relay or publish proof data. They cover proof envelope minimization, v2 storage/legacy purge/expiry, bridge exchange validation, direct-realm gating, denied rendering, secure access-link attributes, same-session Check Again, sign-out disconnect, and no anonymous connection.

When infrastructure is live, perform a user-controlled manual check:

1. After canonical deployment, open `https://warpkeep.com/#menu` and confirm no relay or database connection occurs before **ENTER REALM**.
2. Complete Farcaster approval and confirm the displayed FID is the approving identity.
3. With the intentionally empty whitelist, confirm the exact Hegemony denial panel, request-access link, and no RealmMapScreen mount.
4. Confirm Check Again does not open a new QR/deep link, and Sign Out removes the remembered v2 session and closes the database connection.

Do not attach live QR screenshots, browser network dumps, console dumps, or HAR files to a PR; they can retain active proof material.
