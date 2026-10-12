# 0.4 owner journey evidence

## Production prerequisite readback — 12 October 2026

Atlas finalization, read-only reconciliation and reviewed-owner provisioning
passed on operator source `32b9311f9038840c558c1beb54f8968666bc76a6` and installed
module `2891aee281c6c77be638635a0aecb5e688194320`. The atlas is ready and owner
access is enabled. The [operation record](../../agent-notes/0.4.0/2026-10-11-atlas43-token-activation.md)
retains exact timestamps and source/receipt/preservation references.

The real Farcaster host preview of `https://warpkeep.com/ptr/?miniApp=true`
reached its separate **Confirm it's you** browser-wallet prompt. Until Continue
and Farcaster Mobile approval finish, Quick Auth remains incomplete. This is
observed host identity gating, not player admission evidence or an unprovisioned
atlas. No owner gameplay, normal-timer production journey, phone performance or
release acceptance is claimed. Follow the entry procedure below after that gate;
retain the distinction between administrator provisioning and real player play.

Recorded 2026-09-09 from the Windows development checkout. This record is an
evidence boundary, not a claim that the live owner journey is complete.

## Production PTR launch procedure — 2026-10-01

This is a source-backed procedure for the next authenticated visit, not a
completed owner-session receipt.

1. Complete [M1, exact-M1 native preparation/check and generated M2](../../operations/0.4.0-local-release-preparation.md#source-only-m1-before-native-release-preparation),
   the existing-realm sealed operations and retained adoption evidence. Obtain
   supported source-bound PTR bridge/realm readbacks on accepted preparation
   source `S` before the [direct `S` → activation `A` commit](../../operations/genesis-002-sealed-launch.md).
   Require exact-`A` Verify and binding/history checks, then the
   [signed `/ptr/` publication and live PTR/Alpha postflight](../../operations/0.4.0-infra-access.md#existing-alpha-frontend-restored)
   before starting this visit. Keep the existing owner, realm identities and
   preserved Alpha root.
2. In the logged-in Farcaster Mini App Debug Tool, preview exactly
   `https://warpkeep.com/ptr/?miniApp=true`, using the existing
   [Mini App host-launch mechanism](../../operations/owner-player-canary.md#approved-mini-app-reachability).
   PTR uses the standard game entry below; keep that reference's canary URL and
   signed packet stages with their existing G001 scope. The PTR preview URL is
   derived from the published `/ptr/` base and exact launch-hint parser; its
   host reachability still needs an observed result. No app ID/slug or universal
   deep link is inferred here.
   Verify the canonical apex/subpath and exactly one literal `miniApp=true`
   query value. The [PTR provider](../../../src/ptr/PtrRealmProvider.tsx) requires
   a verified Mini App host and Quick Auth `getToken`; the URL hint alone and
   desktop Alpha QR sign-in do not establish PTR access. The current published
   [Mini App home URL](../../../public/.well-known/farcaster.json) opens the Alpha
   root, so use this explicit PTR subpath for the PTR visit.
3. Reach the main menu. On the automatic Mini App entry gate, choose **BACK TO
   MENU** when offered, or use the host Back control (desktop **Escape**).
   If Terms is open, the first Back/Escape dismisses it; the next returns to the
   menu. This keeps the verified host and disables automatic Alpha entry for
   the visit. If Alpha already opened, use its **MAIN MENU** control.
   Choose **ENTER REALM**, **Public Test Realm**, then
   **ENTER SELECTED REALM**. When access is unknown, the first activation checks
   it; wait for server-verified **Admitted**, then activate **ENTER SELECTED
   REALM** again. Record an unavailable/not-admitted result and resolve its
   existing bridge/realm boundary before continuing. The [actual menu caller](../../../src/components/menu/WarpkeepMainMenu.tsx)
   controls this two-step check and entry.
4. Record the activated source/tree, published commit, UTC timing, host and
   device/browser/viewport/quality, and observed outcomes without tokens,
   private owner identifiers or player rows. Verify the actual atlas journey
   **gather → choose → build → benefit → return**, including the first building
   and improved return within ten minutes, persistence, reconnect and
   background/resume. Keep synthetic and authenticated results separate.
5. Follow the [production R06 profiles and workload](performance.md#workload-and-method)
   for cold loading, actual world/keep rendering, transfer, repeated switches
   and resource disposal. A successful login or menu capture is not full R06;
   physical-phone and real-owner results remain separately required.

## Scope clarified — 2026-09-30

Earlier qa:fullstack:local browser runs use a disposable spacetimedb/src/ copy
and legacy Inner Keep/G001 with synthetic identity, balances and accelerated
clocks. They establish preservation integration. The new qa:ptr:local runner
instead uses the real PTR module, generated client, capability and controller
with a synthetic atlas/owner and normal server travel/gather/construction timers.
It reproduces the actual module-error envelope and verified first-use repair.

Session 64935 passed at signed 98a561db in 321,215ms (5m21s), exit 0, with all
nine outcomes true and verified cleanup. This covers natural credited gathering,
construction and improved return, stale quote, single deduction/exact retry,
authority renewal and fresh-client state readback in the running in-memory
database. No server restart was exercised. The identical native/Windows ignored
receipt is artifacts/qa/ptr-gameplay04-local-smoke.json and explicitly records
productionPtrVerified:false. Production owner-atlas pacing, authenticated browser
play and phone performance remain unverified. Read [local operations](local-operations.md)
for exact receipt, failure and repair details.

## 2026-09-29 local PTR mobile render review

The exact-source `/ptr/` production build at `d89a1acfe51237f709f63fe03b1a5e19dbd584d0`
was loaded in a local static preview with a 390×844 viewport. The Verdant
Citadel menu and realm directory rendered with no horizontal overflow or
browser-console errors. The selector showed the real access state as
`ACCESS UNKNOWN`; activating its check without an owner session displayed the
server-verification requirement and did not connect to a realm.

This confirms responsive menu/entry presentation only. It is a local preview,
not a production PTR visit, an authenticated owner journey, real route timing,
or physical-device/performance acceptance.

## 2026-09-29 Windows candidate G001 full-stack rerun

Exact candidate `4e3d7cd30fd094183c5511ca569ef2cecf9d09fe` passed
`scripts/qa-observer/local-fullstack-browser-probe.mjs` on the attested
Windows Node 22.23.2 runtime and SpacetimeDB CLI 2.6.1. The disposable in-memory
database and isolated Chrome run covered six responsive menu profiles, the
exact-current server Terms continuity skip, City Mill construction/completion,
discounted Lumber Camp construction with one Builder, hard-reload persistence,
fresh-browser Worker re-entry, delayed and failing private reads, timeout and
visibility seams, the canonical local realm fixture, four resource
dispatch/return paths, recalls, automatic settlement, and released-node reuse.
The probe completed successfully and removed its temporary database, CLI
attestation, and browser profiles.

This remains synthetic G001 preservation integration evidence. The current Terms
fixture caused one continuity subcase to be skipped; the run does not establish real identity,
the owner's atlas-route timing, production persistence, a physical-phone result,
or live PTR acceptance. The checked-in sealed-launch verifier at this source
still reports `pagesDeploymentApproved: false`, package `0.3.43`, no G001/G002/
PTR database identities, and PTR presentation disabled.

## What is covered

- `tests/fullstackLocalQaSecurity.test.ts`: 49/49 tests passed after the
  browser-runtime adapter and Windows path normalization were applied.
- `npm run typecheck -- --pretty false`: passed.
- `npm run verify:visual-foundation`: 3/3 tests passed.
- `npm run qa:inner-keep`: 18/18 synthetic Inner Keep browser cases passed on
  Windows after the platform-aware Chrome adapter was wired into the standard
  probe. This covers construction, completion, fallback, reduced motion and
  responsive presentation without a Mac runner or SpacetimeDB. It remains
  renderer evidence, not owner/device/performance acceptance.
- `npm run qa:fullstack:local`: reached the disposable runtime and failed
  closed at `cli-attestation` before any database, browser, owner, or player
  state was created. At the time of this run, the repository's pinned
  SpacetimeDB attestation had reviewed binaries for `darwin-arm64` and
  `linux-x64`, but no Windows binary record. The manifest has since gained
  `win32-x64` CLI and standalone digests; this historical failure is not a
  current Windows-platform conclusion.
- The Windows synthetic Keep04 browser lane then captured run
  `windows-run-q9Jo7j`: 36 bounded cases, 36 exact server-policy document
  guards, a valid installed Chrome identity, and verified owned-process cleanup.
  Desktop and 390px portrait outputs were spot-checked, including empty and
  completed-keep states. This is rendered evidence of the current page, not
  owner/device acceptance: the checkout had unrelated substantive changes, so
  the report correctly marks `stableSource: false`, and sustained performance
  was not measured.

The first rerun failed because Vite watched the disposable Chrome profile's
locked SQLite files and Windows raised `EBUSY`. `vite.config.ts` now excludes
the generated `.cache` profile surface from the source watcher; the exact
policy response and this regression are covered by
`tests/keep04DocumentPolicy.test.ts`. Generated capture output is ignored by
the repository and remains available locally for review.

The local browser lane now has a platform boundary for both supported browser
hosts. macOS continues to use the signed Chrome application contract. Windows
uses the fixed Chrome installation path, an isolated profile, offline resolver
flags, numeric loopback CDP checks, and a bounded process-tree teardown. This
removes the browser host mismatch without weakening the database attestation.

## 2026-09-28 Windows candidate G001 full-stack rerun

Candidate `12f7ba60` passed `npm run qa:fullstack:local` on the attested Windows
toolchain. The current 0.4 client enters directly on the main menu, so the
probe now checks six desktop/mobile menu profiles instead of waiting for the
retired title gateway. It continued through synthetic sign-in and Terms, Inner
Keep City Mill start/completion and reload persistence, Lumber Camp start,
fresh-browser Worker reconnect/private-read recovery, four resource dispatches,
recall, settlement and return. This is disposable local synthetic evidence;
it does not establish real identity-provider behavior, physical-device comfort,
live backend state, or owner/PTR acceptance. See the
[execution handoff](../../agent-notes/0.4.0/execution-handoff.md) for the exact
candidate and release gates.

## 2026-09-27 WSL rerun

On main `786c0b2`, the disposable full-stack probe used pinned Node 22.22.3,
SpacetimeDB CLI 2.6.1, and installed Chrome stable 154 in WSL `WarpkeepRunner`.
`WARPKEEP_QA_CHROME=/opt/google/chrome/google-chrome` selected the regular-file
executable rather than a package symlink. The probe reached the Chrome title
gateway, then failed closed in `desktop-keyboard` after repeated WSLg OpenGL
`GPU stall due` driver warnings. No owner/browser journey pass or application
failure can be inferred. The current candidate source still needs a clean
disposable browser pass and live owner/PTR acceptance.

## What remains unverified

The following require an owner-approved PTR environment and are intentionally
not inferred from synthetic checks:

- the real owner authentication and admission route;
- dispatch, return, placement, construction, and the improved next return on
  the actual atlas;
- the ten-minute first-building and improved-return target;
- live-device mobile rendering and integrated performance acceptance.

The release checklist keeps R02 and R07 open until those authenticated owner-session artifacts are
captured. No owner token, FID, private profile, or production credential was
written to this repository or this record.
