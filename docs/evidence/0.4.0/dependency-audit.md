# Required dependency audit — 2026-09-07

## 2026-09-09 remediation checkpoint

Published source: `0ce25c8f2602aaa65149b46af53fb12345eb8cc9`.

The previously failing audit gate was repaired with compatible, bounded pins:
the root lock now resolves `sharp@0.35.4` and `vitest@4.1.11`; the auth-bridge
and release-recovery workspaces resolve `vitest@4.1.11`; and both service
lockfiles override Miniflare's vulnerable `sharp@0.35.3` pin to `0.35.4`.
The service workspace build-policy files retain the existing `allowBuilds`
and dependency overrides; no audit threshold was relaxed and no advisory was
suppressed.

Local validation at this source passed with zero known vulnerabilities for the
root npm tree and both service pnpm trees. Root `npm audit signatures` also
passed. Auth-bridge `pnpm run check` passed its type, unit (477 tests) and
workerd (18 tests) lanes; release-recovery passed its type, Wrangler, unit
(1,092 tests) and workerd (53 tests) lanes. The expected negative-path error
prints remain diagnostic output from passing tests, not an exit failure.

This repairs the dependency portion of R14 locally. The new GitHub Verify and
CodeQL runs for `a3cde3a` remain authoritative and must complete before R14 is
called passing; local audits do not prove the assembled Linux, native-contract,
deployment or live-owner requirements.

The first post-remediation Verify run exposed a separate lock completeness
issue before tests began: npm 10 required the optional
`@solana/web3.js`-scoped `utf-8-validate@5.0.10` peer, which was absent from
the root lock. Commit `1486b57` adds that exact registry entry and passes the
repository-pinned npm 10.9.8 clean-install dry run. The next Verify run must
confirm the actual clean install and downstream lanes.

The runtime image verifier now follows the patched root image toolchain:
`sharp@0.35.4` reports `libvips@8.18.6` in the hosted Linux runner. The
verifier's explicit tuple was updated in `05103e3`, and the private Greater
Realm Sharp/libvips lock and WebP contracts were refreshed in `ce54d6e`; the
remaining PNG and WebP decoder expectations are unchanged.

Source inspected: `321940caf0af038f869af78c8b3fc2db695b2e45`.
The initial failing checkpoint below is retained; see the tested repair below.
This is an existing R14 integration gate, not an added product requirement.
The existing Pages workflow requires `npm audit` and `npm audit signatures`.

Authenticated GitHub alert 2 is open for root `package-lock.json`:
[GHSA-528h-pc64-c93x](https://github.com/advisories/GHSA-528h-pc64-c93x).
The root lock contains `jayson@4.3.0` requiring `stream-json@^1.9.1`, resolved
to `stream-json@1.9.1`. `@solana/web3.js@1.98.4` requires `jayson@^4.1.1`.

Commands executed with the local pinned Node 22.22.3 and bundled npm:

```powershell
& .git/ci-node-22.22.3/node.exe .git/ci-node-22.22.3/node_modules/npm/bin/npm-cli.js audit --json
& .git/ci-node-22.22.3/node.exe .git/ci-node-22.22.3/node_modules/npm/bin/npm-cli.js audit fix --dry-run --package-lock-only --ignore-scripts --json
& .git/ci-node-22.22.3/node.exe .git/ci-node-22.22.3/node_modules/npm/bin/npm-cli.js view jayson version dependencies --json
& .git/ci-node-22.22.3/node.exe .git/ci-node-22.22.3/node_modules/npm/bin/npm-cli.js view stream-json@3.5.0 type exports --json
```

Audit exited 1: two moderate entries (`stream-json` and its dependent `jayson`),
zero high/critical entries. These are not two independent vulnerabilities.
Dry-run fix also exited 1, reporting zero additions, removals or changes and
the same findings. Neither package manifest nor lockfile changed. The shared
root dependency directory was not installed into or modified.

Registry metadata still identifies `jayson@4.3.0` as latest with the same
`^1.9.1` dependency. Patched `stream-json@3.5.0` declares ESM and maps subpath
exports to `./src/*`; installed Jayson uses CommonJS imports with the older
`stream-json/streamers/StreamValues` and `stream-json/utils/Verifier` paths.
Consequently, a major-version override is not a verified drop-in repair.
No override, advisory suppression, or relaxed audit threshold was applied.

The advisory specifically concerns path filters and explicitly excludes
StreamValues. The observed Jayson imports do not prove the affected filters
are used by Warpkeep; this inspection is not an exhaustive reachability audit.
It does establish that the required unmodified dependency audit currently fails.

Next action: evaluate a compatible dependency-chain repair in a disposable
installation, verify the actual wallet/client imports and frontend build, and
rerun both dependency gates. Do not replace the current dependency tree or
claim resolution merely because a proposed lockfile no longer lists the alert.

Separately, the Pages workflow still has no `deploy-recovery` job; its required
claim bundle is not tracked at the expected installed path. Runner proxy smoke
success therefore does not make the production workflow executable. Those
existing R11/R12 integration requirements remain open.

## Tested compatible pin

The root override now pins only `@solana/web3.js`'s `jayson` to `4.1.3`, within
its declared `^4.1.1` range. This deliberately selects the previous compatible
release, not a patched version of `stream-json`. Its dependency tree uses
`JSONStream@1.3.5` instead; `stream-json` and `stream-chain` leave the root lock.
The latest Jayson release still requires the affected stream-json major.
Revisit the pin when upstream supplies a compatible repaired release.

The [upstream comparison](https://github.com/tedeh/jayson/compare/v4.1.3...v4.3.0)
was inspected: browser-client changes concern callback return handling; the
stream parser replacement concerns the Node stream transport. The installed
Solana browser entry imports `jayson/lib/client/browser`. No Jayson server or
TCP/TLS transport was added or exposed by this change. No advisory was dismissed
or audit threshold changed.

Candidate base: `c8dbbec7e1017daa5b42e119563ed670c9504091`; isolated checkout:
`/tmp/warpkeep-dependency-repair.3WwbRCjc/repo`. A fresh root installation used
Node 22.22.3/npm 10.9.8, `npm install --ignore-scripts --no-fund`.
All testing below used these actual newly installed root dependencies, not the
Windows shared dependency junction. That junction remains unchanged; local
testing against it still resolves the old Jayson until separately reinstalled.

- Installation audit: zero vulnerabilities, exit 0.
- Subsequent clean `npm ci --ignore-scripts --no-fund`: exit 0, zero
  vulnerabilities; all five native compatibility checks passed again.
- `npm audit signatures`: 250 verified registry signatures and 74 verified
  attestations, exit 0. This is the Linux installed package set.
- `node --test tests/fixtures/solana-rpc-dependency-compatibility.mjs`: 5 passed.
  Actual SDK/Solana/browser-client imports; synthetic transport only. Checks the
  resolved pin, SDK availability, RPC request/response, malformed JSON, and
  server-error correlation. No real account or network operation is performed.
- Vitest: 86 passed across the new compatibility wrapper and existing
  `miniAppRuntime`, `miniAppHostProvider`, `farcasterQuickAuthLifecycle`,
  `farcasterMiniAppContract`, and `farcasterMiniAppEntryGate` tests. Existing
  React act warnings remain visible; mocked contract output is not live proof.
- Full `npm run build`: exit 0, including TypeScript, asset checks, Vite,
  production exclusions, atlas public boundary and Mini App manifest checks.
  Existing >600 kB chunk warnings remain; this is not device-performance proof.

Fresh-checkout setup failures were corrected before claiming build success:
the first build lacked bridge TypeScript dependencies; `npm ci --prefix
services/auth-bridge` cannot install its pnpm-managed lock. The build therefore
used the existing bridge dependency cache via a symlink, without modifying it.
The first new Vitest wrapper used an incompatible jsdom URL assumption; fixed
to resolve the repository fixture path, then the complete focused set passed.

Candidate and worktree package files were compared byte-for-byte by SHA-256:

```text
package.json       22dc783771328ee489fe4a5d4e3d5d4b2050418da4405448a82058ac8ef0c0b7
package-lock.json  5f8b6a8c7f7279ae60fe8f46e24d3e9c90d301b290d1efb2ef116ea563668fc6
```

This resolves the locally observed dependency finding subject to final required
CI and final-family verification; it does not close R14 or claim a live release.
