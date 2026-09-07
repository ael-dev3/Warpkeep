# Required dependency audit — 2026-09-07

Source inspected: `321940caf0af038f869af78c8b3fc2db695b2e45`.
This is an unresolved R14 integration gate, not an added product requirement.
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
