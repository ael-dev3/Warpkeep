# Verification checklist

## Root application

```sh
npm ci
npm run verify:licenses
npm run verify:runtime-assets
npm run verify:file-sizes
npm test
npm run typecheck
npm run build
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
pnpm --dir spacetimedb audit --audit-level high
```

Confirm `spacetime --version` is 2.6.1. Run real CLI build/generation verification without publishing unless module source genuinely changed.

## Assets

- Verify release attachment bytes and SHA-256 after a fresh download.
- Reject ZIP traversal, absolute/backslash paths, duplicates, and symlinks.
- Check manifest/archive entry parity and internal file hashes.
- Validate GLB headers and run glTF-Transform 4.4.1 validation.
- Run `verify:runtime-assets` and `verify:file-sizes`.
- Confirm no source/master archive blob exists in current Warpkeep HEAD.
- Confirm unresolved-rights inputs were not uploaded publicly.

## Hosted checks

Required final source checks are Pages, Verify, and CodeQL for the exact candidate/main commit. Inspect failures rather than rerunning blindly. Resolve actionable review threads before merge.

## Production

- Canonical `warpkeep.com`, `www`, and legacy redirects behave as documented.
- The menu build stamp equals the final full main SHA.
- Worker `/healthz`, discovery, and JWKS are healthy; JWKS has public P-256 data and no `d` member.
- Browser CORS is exact and admin/synthetic endpoints remain server only.
- The synthetic resolver probe succeeds without state mutation.
- Protected aggregate is `61/0/0/0/0` unless an explicitly approved admission changed the release invariant.
- Clean-browser SIWF denial and remembered-session phases pass without retaining proof data.
- Title, menu, Settings, Credits, and Realm pass desktop/tablet/phone, keyboard, touch, reduced-motion, failure-fallback, and graphics-profile checks.
- Browser console has no new uncaught error, WebGL error, or failed runtime asset request.

Do not tag a release until final main, deployed Pages, and the reported build SHA match exactly.
