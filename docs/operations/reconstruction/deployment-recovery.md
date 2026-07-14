# Deployment and recovery

> **Protocol-v2 Alpha 0.3.1 is active; recovery remains fail-closed.** The
> existing Maincloud database has the guarded additive v2 schema, and the
> reviewed Worker with the additive `SessionFamily` migration and independent
> managed session-cookie secret is live with the exact-main Pages frontend.
> Public auth and shared-alpha entry were enabled in Worker-first order after
> paused verification and one owner canary. No FID is admitted, and no player,
> ownership, castle, allowlist, or world row was mutated. The recovery commands
> below deliberately restore a disabled posture and never imply approval for a
> republish, secret change, deploy, or later enable.

## Pages

1. Restore the repository and GitHub Actions.
2. Configure Pages to use GitHub Actions, restore `warpkeep.com`, HTTPS, and the intended `github-pages` environment policy.
3. Restore public variables with shared alpha disabled.
4. Merge the exact reviewed commit to `main`; the workflow embeds `${{ github.sha }}`.
5. Verify the public build reports that full SHA.
6. Keep shared alpha false through the v2 frontend deployment. Enable only after
   the module, Durable Object, secret, paused Worker, attestation, frontend, and
   owner-QA gates pass and a final enable approval is recorded.

After authenticating GitHub CLI as the repository owner, restore the public repository variables explicitly:

```sh
gh auth status
gh variable set WARPKEEP_SHARED_ALPHA_ENABLED --repo ael-dev3/Warpkeep --body 'false'
gh variable set WARPKEEP_AUTH_BRIDGE_URL --repo ael-dev3/Warpkeep --body 'https://auth.warpkeep.com'
gh variable set WARPKEEP_OIDC_ISSUER --repo ael-dev3/Warpkeep --body 'https://auth.warpkeep.com'
gh variable set WARPKEEP_OIDC_AUDIENCE --repo ael-dev3/Warpkeep --body 'warpkeep-spacetimedb'
gh variable set WARPKEEP_SPACETIMEDB_URI --repo ael-dev3/Warpkeep --body 'https://maincloud.spacetimedb.com'
gh variable set WARPKEEP_SPACETIMEDB_DATABASE --repo ael-dev3/Warpkeep --body 'warpkeep-89e4u'
gh variable list --repo ael-dev3/Warpkeep
```

Compare the listed names and values with [`service-inventory.md`](service-inventory.md). Record the observed rulesets, required checks, `github-pages` environment branch policy, and variable map in the private recovery manifest. Do not copy Worker secrets into repository variables.

When shared alpha is enabled, both the production runtime gate and Pages
validator require the exact bridge/issuer `https://auth.warpkeep.com`, audience
`warpkeep-spacetimedb`, Maincloud origin `https://maincloud.spacetimedb.com`, and
database `warpkeep-89e4u`; matching lookalikes fail closed. Development-only
localhost/configurable values are never a production recovery fallback.

Local deployment-equivalent configuration validation:

```sh
DEPLOY_BASE=/ \
VITE_WARPKEEP_RELEASE_CHANNEL=alpha \
VITE_WARPKEEP_BUILD_SHA=<full-sha> \
VITE_WARPKEEP_REPOSITORY_URL=https://github.com/ael-dev3/Warpkeep \
VITE_WARPKEEP_CANONICAL_ORIGIN=https://warpkeep.com \
VITE_WARPKEEP_SHARED_ALPHA_ENABLED=false \
npm run validate:pages-config
```

## Worker

```sh
pnpm --dir services/auth-bridge install --frozen-lockfile
pnpm --dir services/auth-bridge run check
pnpm --dir services/auth-bridge exec wrangler deploy --dry-run
```

The dry run is local verification, not approval to deploy. Before any real
Worker deployment, separately approve the additive `SESSION_FAMILIES` →
`SessionFamily` SQLite Durable Object migration. Do not remove the existing
challenge or rate-limit classes/storage.

Restore values through managed secret prompts or an approved non-logging secret-manager pipe, never command-line arguments:

```sh
pnpm --dir services/auth-bridge exec wrangler secret put SIGNING_KEY_JWK
pnpm --dir services/auth-bridge exec wrangler secret put ADMIN_TOKEN_SECRET
pnpm --dir services/auth-bridge exec wrangler secret put SESSION_COOKIE_KEY
pnpm --dir services/auth-bridge exec wrangler secret put FARCASTER_RPC_URL
```

Each secret command requires explicit secret-configuration approval and an
approved non-logging prompt/pipe. `SESSION_COOKIE_KEY` must be independent of
the signing/admin secrets and contain no reused material. The admin secret and
the signing JWK private `d` scalar must also differ; the three trust boundaries
are pairwise distinct. Record only secret names and platform versions, never
values.

Deploy only reviewed source after separate Worker-deploy approval, and retain
`PUBLIC_AUTH_ENABLED=false`. Verify health, discovery, public-only JWKS, exact
CORS, `410` retirement of public v1 challenge/exchange, the structured v2
auth-epoch probe, protected aggregate, and the server-only configuration
attestation with `publicAuthEnabled: false`. Record the Cloudflare deployment
version for rollback. If Worker source did not change, do not redeploy merely
to align frontend SHAs.

The production Worker resolver also refuses any SpacetimeDB origin/database
other than exact `https://maincloud.spacetimedb.com` / `warpkeep-89e4u`. Only an
explicit `ENVIRONMENT=development` bridge may configure alternate local/test
resolver coordinates. Verify this fail-closed distinction locally before any
approved Worker deploy.

## SpacetimeDB

Never create a replacement database because a workstation was lost.

```sh
pnpm --dir spacetimedb install --frozen-lockfile
spacetime --version
pnpm --dir spacetimedb run verify
npm run stdb:verify-bindings
npm run stdb:verify-additive-migration
```

The additive-migration check is a local proof, not a production inspection or
publish. With the pinned SpacetimeDB 2.6.1 CLI it starts a disposable,
loopback-only, in-memory server and proves that:

- the five-table production prefix remains exactly `allowed_fid`,
  `world_tile`, `player`, `castle`, `admin_audit`, in that order and with the
  original schema metadata unchanged;
- both an empty legacy-player fixture and a synthetic nonempty legacy-player
  fixture survive the forward publish unchanged;
- only public `player_v2` and private `player_ownership_v2` are appended;
- a second forward publish is idempotent, partial v2 state remains detectable,
  uniqueness constraints hold, and guarded v1 rollback is refused before any
  schema change or compatibility override.

The legacy public `player` table therefore retains its exact protocol-v1 shape,
including `identity`. Protocol v2 never reads, writes, or subscribes to it, and
production publish requires a freshly inspected deployed-v1 `players: 0`
invariant. After publication, the v2 aggregate reports the same count as
`legacyPlayers`.
The public `player_v2` projection contains no opaque identity;
`player_ownership_v2` is private and must have no generated browser table
accessor.

Read-only publish preflight:

```sh
WARPKEEP_OIDC_ISSUER=https://auth.warpkeep.com \
  npm run stdb:publish:dev -- --dry-run
```

Before the first v2 publish, obtain explicit approval for the bounded, read-only
aggregate already present in the deployed v1 module. In the approved private
operator environment, run `npm run stdb:inspect-alpha -- --json`; record only
its aggregate result, never its credential or child-process output. It must be
exactly 61 world tiles and zero legacy players (`players`), castles, allowlist
rows, and enabled FIDs. The unpublished `inspect-alpha-v2` procedure cannot be
used as pre-publication evidence.

Only if the local proof passes, the protected aggregate was freshly inspected,
the deployed-v1 `players` field was exactly zero, and the owner recorded the
exact separate approval `approve additive protocol-v2 module publication`:

```sh
WARPKEEP_OIDC_ISSUER=https://auth.warpkeep.com \
WARPKEEP_PUBLISH_CONFIRM=warpkeep-89e4u \
npm run stdb:publish:dev
```

Use the private Keychain wrapper so the Hermes credential is loaded only into
bounded publisher memory and forwarded to the protected inspection child over
stdin; it is excluded from the child environment and every other child process.
For the historical first v2 publication, the publisher performed the deployed
v1 aggregate inspection itself. The current protocol-v3 candidate instead
requires the exact deployed protocol-v2 aggregate, including v2 ownership and
orphan counters, before it can publish. It does so after attesting the pinned
CLI binary, current loopback migration proof, and canonical database
name-to-identity mapping. It never
accepts a hand-entered legacy-player count. The proof's single SHA-256 receipt
is bound to the exact prebuilt `bundle.js`; the publisher rechecks those bytes
and uses `--js-path`, so it cannot silently rebuild a different module between
proof and publication.

Immediately after an approved publish, use
`npm run stdb:inspect-alpha-v2 -- --json`. Require 61 world tiles and zero legacy
players, v2 players, v2 ownerships, consistent v2 pairs, either orphan class,
castles, allowlist rows, and enabled FIDs; protocol `2`; world seed `3445214658`;
and seed name `HEGEMONY_GENESIS_001`. `auditEntries` is an observed nonnegative
count, not row content.

Never use `--delete-data=always`, `--break-clients`, database recreation, or broad auto-confirmation. A timed-out publish is indeterminate: inspect before retrying.

If the CLI asks for a compatibility override, reports a mismatch, or cannot
apply the append-only change under `--delete-data=never`, stop. Do not use
`--break-clients`, rewrite the five-table prefix, or approve a prompt manually.
Correct the module as a reviewed additive forward fix, rerun the disposable
proof and protected inspection, and obtain fresh publish approval.

The auth-v2 target is backend protocol `2`, requires 600-second
`auth_version: 2`/positive-epoch player JWTs, and adds the exact structured
`auth_resolver_get_fid_admission_v2` procedure for the Worker-minted 15-second
`service:auth-epoch-resolver`/sole-role principal; the module retains a
60-second rejection ceiling and requires exact `resolver_fid` equality with the
positional argument. Verify the exact HTTP SATS-JSON `[state, authEpoch]`
response, generated binding wire names, that the official client
subscribes only to `player_v2`, and that no private `player_ownership_v2` table
accessor was generated. The retained legacy `player` binding necessarily
preserves its v1 `identity` field but must remain unused and empty.
`admin_get_fid_auth_epoch` is rollback compatibility only and must not be
configured as the v2 issuance/refresh path.

Recovery review must retain the resolver lifecycle residual: a token presented
while fresh can establish public subscriptions that may persist until transport
disconnect and read static backend metadata while fresh. Protected calls recheck
expiry, and private/player-mutation/admin authority remains denied; see
[`threat-model.md`](../../security/threat-model.md).

## Production proof and rollback

```sh
WARPKEEP_EXPECTED_DEPLOYED_SHA=<full-pages-sha> \
  npm run verify:alpha-production -- \
    --require-auth-v2 \
    --require-additive-v2-aggregate
```

This command is the staging/recovery paused-profile verifier and the recovery
gate for any later exact deployment. A successful run attests only the
configured source and service coordinates supplied for that run; it is not
authority to publish, deploy, enable, or mutate data. The approved secret
handoff supplies the operator credential without logging it. Verification
accepts the exact aggregate field set only, requires both orphan counts to be
zero, and never mirrors Hermes child output.

After an approved Worker enable, replace the paused-profile flag with the
read-only enabled-profile flag:

```sh
WARPKEEP_EXPECTED_DEPLOYED_SHA=<full-pages-sha> \
  npm run verify:alpha-production -- \
    --require-auth-v2-enabled \
    --require-additive-v2-aggregate
```

The two auth-v2 flags are mutually exclusive. `--require-auth-v2` retains its
paused-only semantics. `--require-auth-v2-enabled` requires
`publicAuthEnabled: true` and exercises only bounded, no-store `GET`/`OPTIONS`
metadata and browser-preflight contracts. Its HTTP checks send no authorization,
cookie, request body, proof, QR payload, token, or FID and create no
challenge/session state. The retained additive aggregate flag still uses the
isolated approved-secret child described above; it does not alter the enabled
HTTP mode or expose child output. The enabled check does not attest the private
config digest or Cloudflare source/version coordinate and does not exercise
exchange, resolver, refresh, revocation, or a player connection. Keep the
separate exact-source/config checks and immediate clean-profile owner QA
mandatory.

Rollback order:

1. Keep or restore Worker `PUBLIC_AUTH_ENABLED=false` through an explicitly
   approved Worker deployment.
2. Set `WARPKEEP_SHARED_ALPHA_ENABLED=false`, redeploy Pages only with approval,
   and verify the exact rollback SHA.
3. Roll back Worker source only when implicated; never silently restore v1
   public routes or raw-epoch minting.
4. Treat `SESSION_COOKIE_KEY` rotation as family-wide revocation and require its
   own incident/rotation approval.
5. Never roll Maincloud back by deleting data or by republishing the v1 schema.
   If v2 is implicated, keep public auth disabled, inspect aggregate pair/orphan
   counts, and publish only a compatible reviewed forward fix with separate
   approval.
