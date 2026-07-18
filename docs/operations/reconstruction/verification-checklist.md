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
npm run stdb:verify-additive-migration
pnpm --dir spacetimedb audit --audit-level high
```

Confirm `spacetime --version` is 2.6.1. The local additive-migration proof must
pass against its disposable loopback server: deployed refs 0–18 and all rows
unchanged, private `resource_account_v1` appended at exact ref 19, empty and
synthetic nonempty fixtures preserved, second publish idempotent, populated
deployed-prefix state retained, guarded v3/v2 rollback refused before schema
change, and the actual module founder/Terms/private-read/collection/backfill
lifecycle proven before one artifact SHA-256 receipt is emitted. The guarded
publisher must recheck that same prebuilt artifact and use `--js-path`; it must
not rebuild after the proof.
Run real CLI build/generation verification without publishing; a passing proof is not
production approval.

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
- While auth is paused, `verify:alpha-production -- --require-auth-v2` proves the
  exact paused profile. After an approved enable,
  `verify:alpha-production -- --require-auth-v2-enabled` proves only the
  tokenless read-only enabled health/metadata/preflight surface. The latter
  never creates challenge/session state and does not replace the private config
  digest, exact Cloudflare source/deployment coordinate, resolver probe, or
  immediate owner QA.
- The synthetic resolver probe succeeds without state mutation.
- For a legacy recovery or any future pre-v2 checkpoint, the legacy protected
  aggregate remains `61/0/0/0/0`; do not infer deployment from local source.
- At the recorded protocol-v2 checkpoint and after any separately approved
  republish, the exact v2 aggregate has
  61 world tiles; zero legacy players, v2 players, private v2 ownerships,
  consistent v2 pairs, either orphan class, castles, allowlist rows, and enabled
  FIDs; protocol `2`; seed `3445214658`; and seed name
  `HEGEMONY_GENESIS_001`. `auditEntries` may be any nonnegative aggregate count.
- For the current protocol-3 realm, use the protected founded aggregate with
  exact private expected founder, activated-player, and Terms-acceptance counts.
  Require 1,261 world/meta rows, one realm, 100 slots, matching founder-owned
  occupied/claim/castle/profile/Mark/admission counts, matching player/ownership
  counts, and zero orphan, drift, reconciliation, ambiguity, and invariant
  counters. Current enabled production uses `--require-auth-v2-enabled`; the
  paused flag is never auto-detected or substituted.
- The official browser subscribes to `player_v2`, never legacy `player`; the
  private `player_ownership_v2` table has no generated browser accessor.
- Clean-browser SIWF denial and remembered-session phases pass without retaining proof data.
- Title, menu, Settings, Credits, and Realm pass desktop/tablet/phone, keyboard, touch, reduced-motion, failure-fallback, and graphics-profile checks.
- Browser console has no new uncaught error, WebGL error, or failed runtime asset request.

Do not tag a release until final main, deployed Pages, and the reported build SHA match exactly.

If any protocol-3 invariant, v2 pair/orphan, schema-prefix, or compatibility check fails, keep public
authentication and shared alpha disabled. Repair through a reviewed additive
forward publish with separate approval; never delete production data, recreate
the database, use `--break-clients`, or roll back to the v1 schema.
