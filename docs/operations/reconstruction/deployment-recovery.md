# Deployment and recovery

> **Local auth-v2 draft — not deployed.** Recovery starts with Worker public
> auth and Pages shared-alpha access false. Module publish, `SessionFamily`
> Durable Object migration, managed-secret configuration, Worker deploy,
> frontend deploy, and either auth enable are separate external mutations and
> each requires explicit approval. No command below implies that approval.

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
the signing/admin secrets and contain no reused material. Record only secret
names and platform versions, never values.

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
```

Read-only publish preflight:

```sh
WARPKEEP_OIDC_ISSUER=https://auth.warpkeep.com \
  npm run stdb:publish:dev -- --dry-run
```

The local v2 module removes opaque OIDC Identity from public `player` rows and
adds private `player_ownership`. Treat this as a breaking schema rollout: first
obtain explicit approval for read-only aggregate inspection and review a
migration/client-compatibility plan for every existing player row without
exposing identities. A generic additive module-publish approval does not cover
this change.

Only if that breaking-schema plan was separately approved, the database was
inspected, and a non-destructive module-publish approval was recorded:

```sh
WARPKEEP_OIDC_ISSUER=https://auth.warpkeep.com \
WARPKEEP_PUBLISH_CONFIRM=warpkeep-89e4u \
  npm run stdb:publish:dev
```

Never use `--delete-data=always`, `--break-clients`, database recreation, or broad auto-confirmation. A timed-out publish is indeterminate: inspect before retrying.

If the approved read-only preflight reports that the privacy schema cannot be
applied while the current publisher forbids `--break-clients`, stop. Changing
the migration mechanism or publish guard is a separate implementation, review,
and approval boundary; recovery authorization does not imply it.

The auth-v2 target is backend protocol `2`, requires 600-second
`auth_version: 2`/positive-epoch player JWTs, and adds the exact structured
`auth_resolver_get_fid_admission_v2` procedure for the maximum-60-second
`service:auth-epoch-resolver`/sole-role principal. Verify the generated binding
wire name after publish, confirm that public player bindings have no opaque OIDC
Identity, and confirm that no private ownership-table accessor was generated.
`admin_get_fid_auth_epoch` is rollback compatibility only and must not be
configured as the v2 issuance/refresh path.

## Production proof and rollback

```sh
WARPKEEP_EXPECTED_DEPLOYED_SHA=<full-pages-sha> \
  npm run verify:alpha-production -- --require-protected-aggregate
```

The approved secret handoff supplies the operator credential without logging it.

Rollback order:

1. Keep or restore Worker `PUBLIC_AUTH_ENABLED=false` through an explicitly
   approved Worker deployment.
2. Set `WARPKEEP_SHARED_ALPHA_ENABLED=false`, redeploy Pages only with approval,
   and verify the exact rollback SHA.
3. Roll back Worker source only when implicated; never silently restore v1
   public routes or raw-epoch minting.
4. Treat `SESSION_COOKIE_KEY` rotation as family-wide revocation and require its
   own incident/rotation approval.
5. Never roll Maincloud back by deleting data; publish only an explicitly
   compatible reviewed module with separate approval.
