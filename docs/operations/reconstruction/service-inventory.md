# Service inventory

> **Alpha 0.3.2 is live on backend protocol 3; recovery remains fail-closed.**
> The 1,261-cell Genesis world and 100 close-outward castle slots are seeded,
> deliberately admitted founders hold their permanent castles, and Worker public
> auth plus shared-alpha realm entry are enabled at their separately recorded production
> coordinates. Exact founder counts and identities remain private. Recovery
> manifests must bind every observation to its exact deployed source/version;
> every future republish, binding change, secret change, deploy, or enable
> requires its own authority and verification.

The checked-in Alpha 0.3.11 candidate is not part of that deployed inventory.
It retains the separately approval-gated 10,000-cell generation-three target
and its 2,000 resource-capable anchors, appends private
`resource_account_v1` at schema ref 19, appends five Gold-expedition tables at
refs 20–24, two decorative forest tables at refs 25–26, and five independent
Food-expedition tables at refs 27–31, then five independent Wood-expedition
tables at refs 32–36. Those tables define public site and identity-minimized
occupation projections plus private expedition/idempotency authority and
public-safe scheduler projections. Neither source presence nor local proof
attests a production module publication, world transition, resource backfill,
Gold/forest/Food/Wood setup, or deployment. Alpha 0.3.6 remains the verified
public release.

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
- Checked-in/recovery default: `PUBLIC_AUTH_ENABLED=false`
- Current Alpha 0.3.2 production state: `PUBLIC_AUTH_ENABLED=true`

Durable Objects:

- `CHALLENGE_REPLAY_GUARD` → `ChallengeReplayGuard` (migration `v1`)
- `AUTH_RATE_LIMITER` → `AuthRateLimiter` (migration `v2`)
- `SESSION_FAMILIES` → `SessionFamily` (additive migration `v3`; deployed at the
  recorded paused checkpoint and retained through enablement; any future
  binding/migration change requires separate approval)

Unauthenticated metadata endpoints are `/healthz`,
`/.well-known/openid-configuration`, and `/.well-known/jwks.json`. The deployed
credentialed browser protocol uses `/v2/farcaster/challenge`,
`/v2/farcaster/exchange`, `/v2/session/refresh`, and `/v2/session/logout`.
Those public routes are active only while `PUBLIC_AUTH_ENABLED=true` and return
the paused profile when it is false.
Public v1 challenge/exchange are retired with `410`; admin `/v1` routes are a
separate server-only namespace. Secret names are `SIGNING_KEY_JWK`,
`ADMIN_TOKEN_SECRET`, `SESSION_COOKIE_KEY`, and `FARCASTER_RPC_URL`; see
[`credential-rotation.md`](credential-rotation.md). Never record their values.

The server-only config attestation profile is `warpkeep-auth-v2`. Its
fail-closed recovery target has `publicAuthEnabled: false`; the current Alpha
0.3.2 active target has `publicAuthEnabled: true`. It covers
issuer/origins/SIWF coordinates, gameplay key/Maincloud coordinates, the
observer URI/database/audience tuple and gate, S256, the 600-second access TTL,
15-second resolver TTL, five-second resolver timeout, five-minute challenge TTL,
maximum-30-day family, and exact `__Host-` cookie attributes. Record only the
reviewed digest and observed deployment version.

Production Worker configuration pins both resolver origins to exact
`https://maincloud.spacetimedb.com` and pins the gameplay database to
`warpkeep-89e4u`. Any production observer tuple must use that origin plus a
separately reviewed database and audience that both differ from gameplay; the
tuple itself does not attest an identity-free schema. Alternate origins are
permitted only under explicit `ENVIRONMENT=development` for local/test use and
must never be treated as a production recovery profile.

Browser continuity defaults **Keep me signed in on this device** to false.
Sign-out writes only a non-secret, base-path-scoped `logout-v1:<timestamp>`
tombstone that is active for at most 30 days; it contains no identity or
credential material and blocks every cookie refresh across reloads/tabs until
explicit SIWF clears it early. A stale marker is ignored and removed when later
read only when storage permits. Cleanup is best effort: storage denial may leave
the physical key, and a later reload can continue treating an unexpired leftover
marker as logout intent even though the current explicit activation proceeded.
A denied tombstone write combined with failed server revocation remains a
bounded residual because a later storage-enabled context cannot recover a marker
never written.

## SpacetimeDB

- Server: `maincloud`
- URI: `https://maincloud.spacetimedb.com`
- Database: `warpkeep-89e4u`
- CLI/module: `2.6.1`
- OIDC issuer: `https://auth.warpkeep.com`
- Audience: `warpkeep-spacetimedb`
- Recorded production backend protocol: `3` (verify the deployed observed value; do
  not infer it from the repository)

The recorded deployed resolver target is
`auth_resolver_get_fid_admission_v2`. The Worker mints a 15-second JWT with exact
`service:auth-epoch-resolver` subject and sole `warpkeep-auth-epoch-resolver`
role, plus exact `resolver_fid` equal to the positional argument; the module
retains a 60-second rejection ceiling. The HTTP SATS-JSON response is the exact
`[state, authEpoch]` tuple, with epoch zero only for non-enabled results.
Because SpacetimeDB runs its lifecycle hook before HTTP procedures, a resolver
token presented while fresh can establish public subscriptions that may persist
until transport disconnect and read static backend metadata while fresh.
Protected calls recheck expiry, and private/player-mutation/admin authority is
still denied; see the resolver residual in
[`threat-model.md`](../../security/threat-model.md).
`admin_get_fid_auth_epoch` is retained only for rollback compatibility.

Historical additive-v2 closed-admission aggregate recorded before the
protocol-3 seed and founding rollout:

```text
61 world tiles
0 legacy players / 0 v2 players / 0 private v2 ownerships
0 consistent v2 player/ownership pairs
0 orphaned v2 player rows / 0 orphaned v2 ownership rows
0 allowlist rows / 0 enabled FIDs / 0 castles
backend protocol 2 / world seed 3445214658 / HEGEMONY_GENESIS_001
```

Current Alpha 0.3.2 production instead has the complete 1,261-cell world,
1,261 metadata rows, one realm, 100 immutable slots, and deliberately admitted
founders with matching founding graphs. A recovery verifier must obtain the
fresh privacy-safe aggregate and compare it with the private current-state
record; it must not reuse the historical zero-admission values above.

The local module preserves the original five-table prefix exactly, in this
order: private `allowed_fid`, public `world_tile`, public legacy `player`, public
`castle`, private `admin_audit`. The legacy `player` schema remains byte-for-byte
compatible, including its opaque `identity` field. Its protocol-v1 status and
bootstrap wires fail closed, protocol v2 never reads or writes it, the official
browser never subscribes to it, and its required production count is zero.

The deployed v2 schema appended two tables: public `player_v2`, which excludes
opaque identity, and private `player_ownership_v2`, which contains the
authorization binding. Protocol 3 later appended the 12 frozen tables at refs
7–18. The checked-in Alpha 0.3.10 precursor appends private
`resource_account_v1` at exact ref 19, then `gold_site_v1`,
`gold_node_occupation_v1`, `gold_expedition_v1`,
`gold_expedition_idempotency_v1`, and `gold_expedition_schedule_v_1` at refs
20–24 without changing any deployed declaration, then forest refs 25–26 and
the Food equivalents `food_site_v1`, `food_node_occupation_v1`,
`food_expedition_v1`, `food_expedition_idempotency_v1`, and
`food_expedition_schedule_v_1` at refs 27–31. Only the site catalog,
occupation, and deliberately public-safe schedule projection are browser-table
shapes; FID-bound expedition, retry, accrual, and balance state remain private.
The Alpha 0.3.11 candidate then appends the Wood equivalents `wood_site_v1`,
`wood_node_occupation_v1`, `wood_expedition_v1`,
`wood_expedition_idempotency_v1`, and `wood_expedition_schedule_v_1` at refs
32–36. Wood uses the same public-site/private-authority boundary; its scheduler
projection is public-safe only and its reducer remains internal-only. The private
resource settlement adapter derives Food and Wood's remaining awards together,
so neither passive capacity reservation becomes observable or browser-controlled.
The private ownership table must have no generated browser table accessor.
Bootstrap ignores optional profile-shaped JWT fields and explicitly inserts
undefined `username`, `displayName`, and `pfpUrl`; profile changes require a
separately reviewed mutation path.

`admin_get_alpha_status_v2` is admin-only and read-only. It returns aggregate
legacy/v2/ownership counts, consistent-pair and both orphan counts, safe world
and admission totals, protocol/seed constants, and the audit-entry count. It
returns no FID, Identity, profile, note, audit row, token, or credential. Because
the preserved legacy table is public, an arbitrary old client can technically
request it; the retired writer plus mandatory zero-row invariant is the
compatibility safety boundary.

The live `admin_get_alpha_status_v3` procedure covers the complete founded
protocol-3 graph without exposing row identities. Candidate
`admin_get_alpha_status_v4` is a separate closed counts-only resource contract:
founder/castle/Mark coverage, resource coverage and invariant counts, protocol,
and policy version. It is not evidence of the Alpha 0.3.10 Gold/Food or Alpha
0.3.11 Wood catalog, occupation, private expedition, or paired Food/Wood
reservation state. Gold, Food, and Wood rollouts each need their own reviewed
aggregate contract and explicit owner approval. The generation-two and
generation-three world gates remain separate exact contracts; a mixed tuple
fails closed.

`npm run stdb:verify-additive-migration` proves the exact prefix, append-only
refs 0–36, empty and synthetic nonempty fixture preservation, idempotence,
partial-state detection, guarded v8/v7/v6/v5/v4/v3/v2 rollback refusal, the
populated exact generation-two-to-three world transition, the private resource
lifecycle, and Gold/Food/Wood table visibility/order against disposable
loopback databases with the pinned CLI. It does not seed, dispatch, or settle a
Food/Wood expedition; focused authority, policy, and reducer-contract tests
separately cover paired Food/Wood reservation preservation and concurrent Gold
settlement. This local proof grants no production authority.
If post-publish verification finds a mismatch, keep auth disabled and use a
separately reviewed forward-compatible fix; never delete data, recreate the
database, or roll the schema backward.
