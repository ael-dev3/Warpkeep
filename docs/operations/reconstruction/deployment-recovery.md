# Deployment and recovery

Alpha 0.3.13 uses backend protocol 3, schema generation 11, and the 10,000-cell
Genesis 001 world. Recovery starts by observing the existing services; it never
assumes that a local checkout describes production.

This guide does not authorize a deployment, secret change, database publish,
seed, admission, or public-auth change. Keep identities, mutable counts,
credentials, and private platform evidence in the owner-controlled recovery
record, not in the repository or shell history.

## Start from a clean checkout

Use a recorded tag or full commit SHA and verify it before restoring local
configuration:

```sh
npm ci
npm run check
pnpm --dir services/auth-bridge install --frozen-lockfile
pnpm --dir services/auth-bridge run check
pnpm --dir spacetimedb install --frozen-lockfile
pnpm --dir spacetimedb run verify
npm run stdb:verify-bindings
```

Compare the current platform coordinates with
[`service-inventory.md`](service-inventory.md). A mismatch is an investigation,
not a reason to overwrite the platform.

## Restore Pages safely

1. Restore repository protection, required checks, the `github-pages`
   environment policy, custom domain, and HTTPS.
2. Set `WARPKEEP_SHARED_ALPHA_ENABLED=false` before the first recovery deploy.
3. Restore the public bridge, issuer, audience, Maincloud URI, and database
   variables from the service inventory.
4. Deploy only a reviewed `main` commit and confirm the public build reports
   that full SHA.

Repository variables are public configuration. Worker secrets never belong in
GitHub Actions variables, issues, logs, screenshots, or a recovery manifest.

Local configuration validation:

```sh
DEPLOY_BASE=/ \
VITE_WARPKEEP_RELEASE_CHANNEL=alpha \
VITE_WARPKEEP_BUILD_SHA=<full-sha> \
VITE_WARPKEEP_REPOSITORY_URL=https://github.com/ael-dev3/Warpkeep \
VITE_WARPKEEP_CANONICAL_ORIGIN=https://warpkeep.com \
VITE_WARPKEEP_SHARED_ALPHA_ENABLED=false \
npm run validate:pages-config
```

## Restore the auth bridge

Run the bridge checks and a local deployment preview first:

```sh
pnpm --dir services/auth-bridge run check
pnpm --dir services/auth-bridge exec wrangler deploy --dry-run
```

Restore secret values only through managed secret prompts or an approved
non-logging secret-manager pipe. The required names are `SIGNING_KEY_JWK`,
`ADMIN_TOKEN_SECRET`, `SESSION_COOKIE_KEY`, `FARCASTER_RPC_URL`, and
`FARCASTER_RPC_URL_SECONDARY`; never record their values. The two production RPC
endpoints must use distinct public HTTPS origins. The signing, admin, and
session secrets must be distinct.

Recovery begins with `PUBLIC_AUTH_ENABLED=false`. Deploy the Worker only when
its reviewed source or required binding changed. Any Durable Object migration
or secret rotation needs separate approval. Before enabling auth, verify
health, discovery, public-only JWKS, exact CORS, retired v1 routes, the private
configuration attestation, and the read-only resolver probe.

## Recover SpacetimeDB

Never recreate the database because a workstation was lost. The production
target is the existing immutable Maincloud database identity recorded
privately; the public service inventory contains its stable name and URI.

Local module verification is mandatory but does not inspect or authorize
production:

```sh
spacetime --version
pnpm --dir spacetimedb run verify
npm run stdb:verify-bindings
npm run stdb:verify-additive-migration
```

The additive proof uses disposable loopback databases and `--delete-data=never`.
It preserves refs 0–46, exercises the generation-two-to-three transition,
Water and Water-revision activation, resource authority, and a real scheduled Gold arrival, and
refuses guarded rollbacks before schema change.

For an approved forward publication, follow
[`../alpha-activation.md`](../alpha-activation.md). The guarded publisher
requires:

- the pinned CLI binary and prebuilt artifact;
- the fixed Maincloud/database/issuer coordinates;
- fresh private founder, player, Terms, world, and resource aggregates;
- explicit world and resource rollout stages;
- `--delete-data=never`; and
- matching post-publication protocol-v3, resource-v4, component-v8, and
  Alpha-v10 reads.

If a publish times out or a post-publish inspection fails, the result is
indeterminate. Perform a fresh, read-only aggregate inspection before any
retry, seed, or further publication decision.

## Re-enable service

Restore access only after all changed components are healthy:

1. confirm the protected database aggregates and component catalogs;
2. confirm the paused Worker source, binding, and config attestation;
3. confirm the disabled Pages build and exact commit;
4. enable Worker public auth with separate approval and verify it read-only;
5. enable shared Alpha entry with separate approval; and
6. complete one bounded owner QA flow without retaining proof data.

## Rollback and incident boundaries

- Disable Pages entry and Worker public auth before investigating an auth or
  authority incident.
- Roll back frontend or Worker source only to a known compatible version.
- Treat a session-cookie-key rotation as family-wide session revocation.
- Never re-enable retired v1 auth routes.
- Never delete Maincloud data, use `--break-clients`, recreate the database, or
  republish an older schema. Repair database defects through a reviewed,
  additive forward fix.

Use [`verification-checklist.md`](verification-checklist.md) for final checks
and [`incident-command.md`](incident-command.md) when coordinating an incident.
