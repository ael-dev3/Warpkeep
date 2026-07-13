# Deployment and recovery

## Pages

1. Restore the repository and GitHub Actions.
2. Configure Pages to use GitHub Actions, restore `warpkeep.com`, HTTPS, and the intended `github-pages` environment policy.
3. Restore public variables with shared alpha disabled.
4. Merge the exact reviewed commit to `main`; the workflow embeds `${{ github.sha }}`.
5. Verify the public build reports that full SHA.
6. Enable shared alpha only after Worker and Maincloud gates pass.

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

Restore values through managed secret prompts or an approved non-logging secret-manager pipe, never command-line arguments:

```sh
pnpm --dir services/auth-bridge exec wrangler secret put SIGNING_KEY_JWK
pnpm --dir services/auth-bridge exec wrangler secret put ADMIN_TOKEN_SECRET
pnpm --dir services/auth-bridge exec wrangler secret put FARCASTER_RPC_URL
```

Deploy only reviewed source, then verify health, discovery, a public-only JWKS, exact CORS, the synthetic auth-epoch probe, and the protected aggregate. Record the Cloudflare deployment version for rollback. If Worker source did not change, do not redeploy merely to align frontend SHAs.

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

Only if module source/schema changed and the database was inspected:

```sh
WARPKEEP_OIDC_ISSUER=https://auth.warpkeep.com \
WARPKEEP_PUBLISH_CONFIRM=warpkeep-89e4u \
  npm run stdb:publish:dev
```

Never use `--delete-data=always`, `--break-clients`, database recreation, or broad auto-confirmation. A timed-out publish is indeterminate: inspect before retrying.

## Production proof and rollback

```sh
WARPKEEP_EXPECTED_DEPLOYED_SHA=<full-pages-sha> \
  npm run verify:alpha-production -- --require-protected-aggregate
```

The approved secret handoff supplies the operator credential without logging it.

Rollback order:

1. Set `WARPKEEP_SHARED_ALPHA_ENABLED=false`.
2. Redeploy Pages and verify the exact rollback SHA.
3. Roll back the Worker only when its source/version is implicated.
4. Never roll Maincloud back by deleting data; publish only an explicitly compatible reviewed module.
