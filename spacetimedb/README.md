# Warpkeep SpacetimeDB module

This directory is the server-authoritative closed-alpha module for Warpkeep.
It is intentionally independent of the GitHub Pages client: title and menu
visitors must not create a SpacetimeDB identity, and this module accepts only a
bridge-issued OIDC token once the frontend has a verified Farcaster session.

## Version compatibility

- Installed CLI: `spacetimedb 2.6.1` (commit `052c83fe984a4c4eb7bb4f9afa5c6b1903891d87`)
- Server package: `spacetimedb 2.6.1`
- Module TypeScript: `5.6.3`

Run locally after installing the directory dependencies:

```sh
pnpm install
pnpm run verify
```

`pnpm run stdb:build` invokes the installed `spacetime build --module-path .`.
The pure tests cover the strict JWT-claim contract and the deterministic
radius-four Lowlands map. They do not require, connect to, or publish a
database.

## Fail-closed deployment handoff

`src/config.ts` intentionally pins the impossible issuer
`https://auth.warpkeep.invalid`. This prevents a prematurely published module
from accepting a browser-created or unrelated bearer token. **Do not publish
this module until that literal is replaced with the exact stable public OIDC
issuer that serves discovery and JWKS over HTTPS.**

The included `pnpm run stdb:publish:dev` command refuses to publish while the
placeholder is present. It is a guard, not a deployment command. A deployment
operator must then inspect `warpkeep-89e4u`, use only a non-destructive publish
command, and never use `--delete-data`, `--break-clients`, or `--yes=all`.
The initial real `allowed_fid` table must remain empty.

## Authority and tables

The expected chain is:

```txt
verified Farcaster SIWF
  -> trusted Warpkeep bridge
  -> OIDC JWT (sub = farcaster:<fid>)
  -> SpacetimeDB identity
  -> private allowed_fid + auth epoch
  -> public player/castle/world_tile state
```

Private tables:

- `allowed_fid`: manual admission, enabled flag, and per-FID auth epoch.
- `admin_audit`: administrative action trace.

Public tables:

- `world_tile`: exactly the 61 canonical radius-four Lowlands gameplay cells;
  the 30-cell visual apron remains client-only.
- `player`: a stable Farcaster FID mapped to SpacetimeDB's OIDC-derived
  identity.
- `castle`: one level-one keep per admitted FID and one occupant per tile.

## Auth and admission

`onConnect` rejects no-token or malformed/wrong issuer, audience, token type,
FID, subject, or malformed auth-epoch claims. It admits the equivalent strict
Hermes admin-token contract only for `sub: "service:hermes"` with exactly
`roles: ["warpkeep-admin"]`. It intentionally permits a valid but
unadmitted Farcaster identity to connect, so the client can call the narrow
`get_my_admission_status` procedure and render a clean denial without exposing
the private whitelist.

Player reducers derive FID solely from the signed bridge claim, require an
enabled private `allowed_fid` row, and require the token's `auth_epoch` to
match. They also recheck the bridge's signed, maximum-30-day absolute player
session deadline against module time, even after SpacetimeDB exchanges the
browser bearer for a temporary connection token. `bootstrap_player` is
idempotent and atomically creates the player, castle, and tile occupancy; the
first admitted fixture receives `0,0`.

Admin reducers require that same separate bridge-issued Hermes token:

- `admin_seed_world`
- `admin_allow_fid`
- `admin_disable_fid`
- `admin_bump_auth_epoch`

No real FID is seeded here or by any script. `admin_disable_fid` immediately
blocks player reducers; `admin_bump_auth_epoch` makes old player tokens fail
authorization.

The same admin token is required for two narrow Hermes procedures:

- `admin_get_alpha_status` returns aggregate table counts only.
- `admin_get_fid_auth_epoch({ fid })` returns the matching auth epoch, or
  baseline `0` when no allowlist row exists.

The external bridge must resolve that epoch before minting each player token.
After `admin_bump_auth_epoch`, continuing to mint a hard-coded `auth_epoch: 0`
correctly leaves that player denied; the resolver is the bridge's revocation
handoff, not a client-side convenience.

## Backend compatibility metadata

`WARPKEEP_BACKEND_PROTOCOL_VERSION` is the internal backend wire contract and
currently equals `1`. It is intentionally separate from the player-facing
release version and the `GENESIS 001` Lowlands label.
`get_alpha_backend_info` is available to any valid Warpkeep JWT connection,
including an unadmitted player, and returns only static compatibility metadata:
protocol version, the internal `HEGEMONY_GENESIS_001` seed label, and its
deterministic unsigned world seed. The browser compares that information before
admission, bootstrap, or public-table subscription. It exposes no whitelist,
identity, audit, or live aggregate state.

## Closed-alpha token warning

The 30-day browser-stored OIDC bearer token is a closed-alpha convenience. Its
signed absolute deadline is enforced on every player call; copied tokens remain
usable until that deadline unless an auth epoch is bumped. Production should use
short-lived access tokens plus a trusted HttpOnly refresh/session flow. This module deliberately does not store SIWF proofs,
channel tokens, QR payloads, private keys, or admin credentials.
