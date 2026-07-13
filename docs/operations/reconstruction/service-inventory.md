# Service inventory

## Repositories and workflows

| Repository | Purpose | Boundary |
| --- | --- | --- |
| [`ael-dev3/Warpkeep`](https://github.com/ael-dev3/Warpkeep) | application, Worker, module, tests, docs, runtime assets | public; default branch `main` |
| [`ael-dev3/Warpkeep-Assets`](https://github.com/ael-dev3/Warpkeep-Assets) | lightweight provenance index and immutable source/master attachments | public; default branch `main`; no Pages |

Key workflows:

- `.github/workflows/verify.yml`: root, Worker, module, binding, build, audit, license, and asset gates.
- `.github/workflows/codeql.yml`: JavaScript/TypeScript CodeQL.
- `.github/workflows/deploy-pages.yml`: exact `${{ github.sha }}` build and Pages deployment from `main`.

The `github-pages` environment should permit only the intended release branch. Record live repository rules, required checks, and environment policy in each recovery manifest rather than assuming they exist.

## GitHub Pages

- Canonical origin: `https://warpkeep.com`
- `www`: redirect to canonical origin
- Legacy compatibility origin: `https://ael-dev3.github.io/Warpkeep/`
- Custom domain: `warpkeep.com`
- Canonical build base: `/`

Public Actions variables and safe recovery values:

| Variable | Recovery value |
| --- | --- |
| `WARPKEEP_SHARED_ALPHA_ENABLED` | `false` |
| `WARPKEEP_AUTH_BRIDGE_URL` | `https://auth.warpkeep.com` |
| `WARPKEEP_OIDC_ISSUER` | `https://auth.warpkeep.com` |
| `WARPKEEP_OIDC_AUDIENCE` | `warpkeep-spacetimedb` |
| `WARPKEEP_SPACETIMEDB_URI` | `https://maincloud.spacetimedb.com` |
| `WARPKEEP_SPACETIMEDB_DATABASE` | `warpkeep-89e4u` |

Recovery always starts with shared alpha disabled, even if the pre-incident value was `true`. Inspect the reviewed `.github/workflows/deploy-pages.yml`, restore the variables using [`deployment-recovery.md`](deployment-recovery.md), deploy and verify the exact build, then set the switch to `true` only after Worker and Maincloud gates pass. Repository variables are public configuration; Worker secrets never belong in this table or in GitHub Actions variables.

## Cloudflare Worker

- Worker: `warpkeep-auth-bridge`
- Source: `services/auth-bridge/`
- Origin: `https://auth.warpkeep.com`
- Compatibility date: `2026-07-11`
- Compatibility flag: `nodejs_compat`
- `workers_dev = false`

Durable Objects:

- `CHALLENGE_REPLAY_GUARD` → `ChallengeReplayGuard` (migration `v1`)
- `AUTH_RATE_LIMITER` → `AuthRateLimiter` (migration `v2`)

Public endpoints are `/healthz`, `/.well-known/openid-configuration`, and `/.well-known/jwks.json`. Secret names are `SIGNING_KEY_JWK`, `ADMIN_TOKEN_SECRET`, and `FARCASTER_RPC_URL`; see [`credential-rotation.md`](credential-rotation.md).

## SpacetimeDB

- Server: `maincloud`
- URI: `https://maincloud.spacetimedb.com`
- Database: `warpkeep-89e4u`
- CLI/module: `2.6.1`
- OIDC issuer: `https://auth.warpkeep.com`
- Audience: `warpkeep-spacetimedb`
- Backend protocol: `1`

Expected closed-admission aggregate:

```text
61 world tiles / 0 allowlist rows / 0 enabled FIDs / 0 players / 0 castles
```

Private tables include `allowed_fid` and `admin_audit`. Public projections include `world_tile`, `player`, and `castle`. Never dump private rows or identities into a recovery report.
