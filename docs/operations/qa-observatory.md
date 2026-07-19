# Local visual QA

Warpkeep keeps a small set of synthetic browser fixtures for checking the Realm,
menu, Terms flow, and responsive layout without using production accounts or
player data. These fixtures are development tools. They are not routes into the
live game and are excluded from production builds.

## Automated browser check

Install the pinned repository dependencies, then run:

```sh
npm ci
npm run assets:fetch:castle:source-0.3.4
npm run qa:rendered-webgl
```

The command starts a temporary Vite server on numeric loopback, launches a fresh
headless Chrome profile, and exercises the real Realm renderer against local
fixture state. It covers the rendered WebGL cases, the synthetic menu-to-Realm
journey, responsive presentation, pointer and keyboard interactions, and the
castle LOD comparison lane. It exits non-zero if a case fails or the browser
leaves the local boundary.

The fetch step retrieves the hash-pinned historical castle source used only by
the LOD comparison lane and stores it in the ignored local asset cache. The QA
command deliberately fails closed when that exact source archive is absent or
does not match its recorded digest.

The current browser runner expects the signed Google Chrome application at:

```text
/Applications/Google Chrome.app
```

Screenshots are reduced in memory to aggregate visual measurements and are not
saved. The runner does not need a Farcaster session, an admin credential, a
SpacetimeDB token, or access to a live Warpkeep service.

## Manual fixture review

Start Vite on loopback:

```sh
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

The useful local pages are:

- `http://127.0.0.1:5173/dev/qa-journey.html` — synthetic menu, Terms,
  authentication presentation, admission, and Realm states.
- `http://127.0.0.1:5173/dev/realm-observer-qa.html` — deterministic read-only
  Realm fixture.
- `http://127.0.0.1:5173/dev/realm-rendered-webgl-qa.html` — the real Realm
  renderer with synthetic castles.

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

This repository does not install or schedule local QA jobs. Running a visual
check is an explicit developer action and creates only temporary runtime state.
