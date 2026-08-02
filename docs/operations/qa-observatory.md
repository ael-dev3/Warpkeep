# Local visual QA

Warpkeep keeps a small set of synthetic browser fixtures for checking the Realm,
menu, Terms flow, and responsive layout without using production accounts or
player data. These fixtures are development tools. They are not routes into the
live game and are excluded from production builds.

## Automated browser check

Install the pinned repository dependencies, then run:

```sh
npm ci
npm run qa:fullstack:local
```

`qa:fullstack:local` creates a private, disposable runtime on numeric loopback.
It builds and publishes a temporary copy of the real module to an in-memory
SpacetimeDB, seeds one synthetic founder and the canonical Realm, and drives the
real browser UI through sign-in, bootstrap, local Terms, a four-worker
dispatch, and recall. Its signing key, player credential, database instance,
and loopback issuer exist for one run only. The audience string matches the
module protocol, but the ephemeral issuer key cannot authenticate to Maincloud.
The browser is stopped if it attempts any network destination outside the two
runtime-owned loopback origins. One exact synthetic profile-image URL is
intercepted and fulfilled from a repository-owned PNG in memory; Chrome's host
resolver remains offline, so that URL never reaches the public network.

The command requires the repository-pinned SpacetimeDB CLI and the signed Google
Chrome application at `/Applications/Google Chrome.app`. It does not read a
Farcaster account, production token, operator credential, Keychain item,
`.env` file, or browser profile. The temporary database, keys, token, browser
profile, and Vite cache are deleted on success, failure, or a handled
termination signal. Screenshots are reduced in memory to aggregate visual
measurements and are never saved.

The broader rendered-fixture lane remains available separately:

```sh
npm run assets:fetch:castle:source-0.3.4
npm run qa:rendered-webgl
```

That command starts a temporary Vite server on numeric loopback, launches a fresh
headless Chrome profile, and exercises the real Realm renderer against local
fixture state. It covers the rendered WebGL cases, the synthetic menu-to-Realm
journey, responsive presentation, pointer and keyboard interactions, and the
castle LOD comparison lane. It exits non-zero if a case fails or the browser
leaves the local boundary.

The fetch step retrieves the hash-pinned historical castle source used only by
the LOD comparison lane and stores it in the ignored local asset cache. The QA
command deliberately fails closed when that exact source archive is absent or
does not match its recorded digest.

Neither browser lane needs access to a live Warpkeep service.

## Change-aware agent check

Run the repository checks relevant to every change since an exact Git base:

```sh
npm run qa:agent -- --base origin/main
```

The runner resolves the base and merge-base without a shell, includes committed,
staged, unstaged, and untracked files, and executes matching lanes serially under
a local lock. Cross-cutting or unrecognized changes select the full local
matrix. Its child processes receive a small environment allowlist, and its
receipt contains only commit, path-count, lane, status, and duration aggregates.
Each lane receives a private disposable home and temporary directory.
Non-browser lanes run under an OS network sandbox that permits only numeric
loopback. The final browser lane does not nest that deprecated macOS sandbox
around Chrome because doing so prevents Chrome's own renderer, GPU, and network
sandboxes from starting. Instead, its fixed orchestrator combines offline
Chrome DNS, CDP request denial, fresh browser state, and exact numeric-loopback
Vite and database origins. SpacetimeDB lanes see only an attested, write-denied
snapshot of the repository-pinned CLI and its standalone companion, not the
owner's CLI configuration. The snapshot is re-attested around every consuming
lane. It never publishes to a remote SpacetimeDB.

This command verifies owner-reviewed local source; it is not a hostile-code
sandbox for unreviewed external contributions. Review third-party changes
before running them on a developer workstation.

## Manual fixture review

Start Vite on loopback:

```sh
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

The useful local pages are:

- `http://127.0.0.1:5173/dev/qa-journey.html` — synthetic menu, Terms,
  authentication presentation, admission, and Realm states. Its direct pending
  state holds **Check Admission** for a visible local interval and exposes a
  still-pending result without contacting an external authority.
- `http://127.0.0.1:5173/dev/realm-observer-qa.html` — deterministic read-only
  Realm fixture.
- `http://127.0.0.1:5173/dev/realm-rendered-webgl-qa.html` — the real Realm
  renderer with synthetic castles.

The connected full-stack entry is intentionally unavailable from this manual
server. Its one-run credential is supplied only by `qa:fullstack:local` through
an in-memory Vite module.

For an exact rendered-fixture URL, use the checked-in formatter:

```sh
node scripts/qa-observer/rendered-webgl-qa-contract.mjs --url high 5173
node scripts/qa-observer/rendered-webgl-qa-contract.mjs --url balanced 5173 player
```

Accepted quality values are `high`, `balanced`, and `reduced`. Presentation mode
is either `observer` or `player`; it defaults to `observer`.

All fixture identities, portraits, castle names, resource values, QR data, and
admission states are synthetic. Do not add real tokens, proofs, FIDs, profile
URLs, QR payloads, or private logs to these fixtures or their test output.

## Production boundary

The development pages require Vite serve mode and an exact loopback hostname.
The production build has only `index.html` as its HTML entry. After building,
`scripts/verify-production-dist-exclusions.mjs` scans `dist` and fails if local
QA entries or markers are present.

Keep both checks in normal verification:

```sh
npm test
npm run build
```

The test suite covers the fixture contracts and browser-probe policies. The
build check proves the local pages are absent from the deployable frontend. The
full headless browser command remains an explicit local visual check rather
than part of the standard CI workflow.

This repository does not install or schedule local QA jobs. Running either QA
command is an explicit developer action and creates only temporary runtime
state.
