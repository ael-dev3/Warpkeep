# Service inventory

> **Local auth-v2 target, not a deployment claim.** Recovery manifests must
> record observed deployed versions separately from this target. Start with
> Worker public auth and frontend shared-alpha access false; every module
> publish, Durable Object migration, secret configuration, deploy, and enable
> requires explicit approval.

## Repositories and workflows

| Repository | Purpose | Boundary |
| --- | --- | --- |
| [`ael-dev3/Warpkeep`](https://github.com/ael-dev3/Warpkeep) | application, Worker, module, tests, docs, runtime assets | public; default branch `main` |
| [`ael-dev3/Warpkeep-Assets`](https://github.com/ael-dev3/Warpkeep-Assets) | lightweight provenance index and immutable source/master attachments | public; default branch `main`; no Pages |

Key workflows:

- `.github/workflows/verify.yml`: root, Worker, module, binding, build, audit, license, and asset gates.
- `.github/workflows/codeql.yml`: JavaScript/TypeScript CodeQL.
- `.github/workflows/deploy-pages.yml`: exact `${{ github.sha }}` build and Pages deployment from `main`.

Verified `main` protection requires pull requests including for administrators;
strict current-head `verify`, `auth-bridge`, `spacetimedb-module`, `analyze`, and
`CodeQL` checks; stale-review dismissal; resolved conversations; and linear
history. Force pushes and deletion are disabled, and repository policy requires
Actions to be full-SHA pinned. Required commit signatures remain disabled.
Dependabot security updates remain intentionally disabled because automated
security PRs in a public repository could disclose an unpatched issue; use a
private, disclosure-safe remediation path.

The `github-pages` environment should permit only the intended release branch.
Record live repository rules, required checks, and environment policy in each
recovery manifest rather than assuming a prior observation still applies.

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

Recovery always starts with shared alpha disabled, even if the pre-incident value was `true`. Inspect the reviewed `.github/workflows/deploy-pages.yml`, restore the variables using [`deployment-recovery.md`](deployment-recovery.md), and deploy only with explicit approval. Keep the switch false through the v2 frontend deploy. A later enable requires a separate final approval after Worker/Maincloud/session/config-attestation gates. Repository variables are public configuration; Worker secrets never belong in this table or in GitHub Actions variables.

When shared alpha is enabled, the production frontend gate and Pages validator
accept only the exact bridge/issuer, audience, Maincloud origin, and database in
the table above. Matching lookalikes fail closed; alternate localhost values are
development-only.

## Cloudflare Worker

- Worker: `warpkeep-auth-bridge`
- Source: `services/auth-bridge/`
- Origin: `https://auth.warpkeep.com`
- Compatibility date: `2026-07-11`
- Compatibility flag: `nodejs_compat`
- `workers_dev = false`
- Local target: `PUBLIC_AUTH_ENABLED=false`

Durable Objects:

- `CHALLENGE_REPLAY_GUARD` → `ChallengeReplayGuard` (migration `v1`)
- `AUTH_RATE_LIMITER` → `AuthRateLimiter` (migration `v2`)
- `SESSION_FAMILIES` → `SessionFamily` (additive migration `v3`; explicit
  migration approval required before deploy)

Unauthenticated metadata endpoints are `/healthz`,
`/.well-known/openid-configuration`, and `/.well-known/jwks.json`. The local
credentialed browser protocol uses `/v2/farcaster/challenge`,
`/v2/farcaster/exchange`, `/v2/session/refresh`, and `/v2/session/logout`.
Public v1 challenge/exchange are retired with `410`; admin `/v1` routes are a
separate server-only namespace. Secret names are `SIGNING_KEY_JWK`,
`ADMIN_TOKEN_SECRET`, `SESSION_COOKIE_KEY`, and `FARCASTER_RPC_URL`; see
[`credential-rotation.md`](credential-rotation.md). Never record their values.

The server-only config attestation target is profile `warpkeep-auth-v2` with
`publicAuthEnabled: false`. It covers issuer/origins/SIWF coordinates, key and
Maincloud coordinates, S256, the 600-second access TTL, maximum-30-day family,
and exact `__Host-` cookie attributes. Record only the reviewed digest and
observed deployment version.

Production Worker configuration pins resolver calls to exact
`https://maincloud.spacetimedb.com` and `warpkeep-89e4u`. Alternate resolver
coordinates are permitted only under explicit `ENVIRONMENT=development` for
local/test use and must never be treated as a production recovery profile.

Browser continuity defaults **Keep me signed in on this device** to false.
Sign-out writes only a non-secret, base-path-scoped `logout-v1:<timestamp>`
tombstone with a 30-day maximum; it contains no identity or credential material
and blocks every cookie refresh across reloads/tabs until explicit SIWF clears it
early. A denied tombstone write combined with failed server revocation remains a
bounded residual because a later storage-enabled context cannot recover a marker
never written.

## SpacetimeDB

- Server: `maincloud`
- URI: `https://maincloud.spacetimedb.com`
- Database: `warpkeep-89e4u`
- CLI/module: `2.6.1`
- OIDC issuer: `https://auth.warpkeep.com`
- Audience: `warpkeep-spacetimedb`
- Local target backend protocol: `2` (record the deployed observed value; do not
  infer it from the repository)

The local resolver target is
`auth_resolver_get_fid_admission_v2`, authorized only by a maximum-60-second JWT
with exact `service:auth-epoch-resolver` subject and sole
`warpkeep-auth-epoch-resolver` role. It returns structured
missing/disabled/enabled state with epoch zero only for non-enabled results.
`admin_get_fid_auth_epoch` is retained only for rollback compatibility.

Expected closed-admission aggregate:

```text
61 world tiles / 0 allowlist rows / 0 enabled FIDs / 0 players / 0 castles
```

The local v2 schema's private tables include `allowed_fid`, `player_ownership`,
and `admin_audit`. Public projections include `world_tile`, `player`, and
`castle`; public `player` rows contain no opaque SpacetimeDB OIDC Identity.
Private ownership accessors must be absent from generated browser bindings.
Bootstrap ignores optional profile-shaped JWT fields and explicitly inserts
undefined `username`, `displayName`, and `pfpUrl`; profile changes require a
separately reviewed mutation path.

This public/private split removes the historical public player identity field
and is a breaking schema rollout. Before any publish, require explicit approval
for read-only state inspection and a reviewed migration/client-compatibility
plan; generic additive publish approval is insufficient. Never dump private rows
or identities into a recovery report.
