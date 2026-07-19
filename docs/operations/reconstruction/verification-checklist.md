# Verification checklist

Run checks from a clean checkout of the intended release commit. A local pass
is evidence about that checkout only; it does not authorize production changes.

## Application

```sh
npm ci
npm run check
GITHUB_PAGES=true npm run build
GITHUB_PAGES=true DEPLOY_BASE=/ npm run build
npm audit
npm audit signatures
git diff --check
```

## Auth bridge

```sh
pnpm --dir services/auth-bridge install --frozen-lockfile
pnpm --dir services/auth-bridge run check
pnpm --dir services/auth-bridge audit --audit-level high
pnpm --dir services/auth-bridge exec wrangler deploy --dry-run
```

## SpacetimeDB

```sh
pnpm --dir spacetimedb install --frozen-lockfile
pnpm --dir spacetimedb run verify
npm run stdb:verify-bindings
npm run stdb:verify-additive-migration
pnpm --dir spacetimedb audit --audit-level high
```

Confirm SpacetimeDB CLI 2.6.1. The disposable migration proof must preserve the
deployed refs 0–45 and fixture rows, reject guarded v10-through-v2 rollback,
prove the 1,261-to-10,000-cell transition, exercise Water activation and private
resource authority, and complete a real scheduled Gold arrival and collection.
The publisher must use the same prebuilt artifact through `--js-path`; it must
not rebuild between proof and publication.

## Assets

- Verify immutable attachment bytes and SHA-256 after a fresh download.
- Reject archive traversal, absolute paths, duplicate entries, and symlinks.
- Check manifest parity, internal hashes, GLB headers, and model validation.
- Run `verify:runtime-assets`, `verify:file-sizes`, and `verify:licenses`.
- Confirm no protected source/master archive is tracked or deployed.

## Hosted checks

Required checks are Pages, Verify, and CodeQL for the current pull-request head
and final `main` commit. Inspect failures rather than rerunning blindly. Resolve
review threads before merge.

## Production

- `warpkeep.com`, `www`, and the legacy Pages redirect resolve as documented.
- The menu build stamp equals the deployed full `main` SHA.
- Worker health, discovery, and JWKS are healthy; JWKS exposes no private key
  member.
- Browser CORS is exact; admin and synthetic endpoints remain server-only.
- The private config attestation matches the reviewed Worker deployment.
- The read-only production verifier confirms the intended paused or enabled
  auth profile without creating challenge or session state.
- Protected protocol-v3 and resource-v4 aggregates match the private current
  founder, player, Terms, world, and resource expectations with every orphan,
  drift, ambiguity, and invariant counter at zero.
- Component-v8 status matches the reviewed Gold, forest, Food, and Wood policy,
  digest, and catalog counts.
- Alpha-v10 status matches the Water and Stone policies, digests, and canonical
  counts; Water is active and the Stone catalog is complete.
- The legacy public `player` table remains unused and empty; the browser uses
  `player_v2` and has no accessor for private ownership rows.
- A clean browser completes sign-in, admission, Realm entry, reconnect, and
  sign-out without retaining proof data.
- Title, menu, Settings, Terms, Credits, and Realm pass desktop, tablet, phone,
  keyboard, touch, reduced-motion, fallback, and graphics-profile checks.
- Browser console has no new uncaught error, WebGL error, or failed runtime
  asset request.

Do not tag a release until protected `main`, deployed Pages, and the reported
build SHA match. If a compatibility or aggregate check fails, keep public entry
disabled and repair through a reviewed additive forward change. Never delete
production data, recreate the database, use `--break-clients`, or roll the
schema backward.
