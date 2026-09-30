# Local operations evidence

Dated local and authenticated inventory. **Not deployment evidence.**

## Confirmation and destination focus repair — 30 September 2026, 10:10 CEST (08:10 UTC)

Independent review of d1474f11a7e7aa8d87267f3f078dce6fc311d094 found two
reachable UI defects. In the real gameplay04 hook, window focus could begin
a held read before React disabled a rendered confirmation button. A native
click was declined by the busy controller but permanently marked the panel
sent; a same-revision successful read offered neither confirmation nor updated
cost review. The regression failed before repair. Keep04Screen now checks the
current controller snapshot; a declined callback releases the panel's guard.
Accepted commands retain immediate duplicate and reentrant-click protection.

Switching between world and keep removed the activated control and left
keyboard focus on BODY. The actual PTR host now focuses the named destination
container on world/keep transitions, including browser Back/Forward, without
stealing focus on initial restoration, healthy reads, panel changes or renewal
notice rendering. Three navigation regressions failed before repair.

Pinned Windows Node 22.22.3 passed 180/180 across seven Keep/controller/host
suites for the confirmation repair and 65/65 across three focus suites.
Independent cross-review passed 93/93 confirmation/controller tests and
151/151 focus/navigation/outer-experience tests. An in-memory BuildingPanel
probe also verified reentrant rejection, guard release and later acceptance.
App and Vite-config noEmit typechecks passed. These overlapping runs are not
one aggregate count. SDK/GPU boundaries are synthetic; neither repair claims
physical-device or authenticated owner acceptance. A second authority and
reconnect audit found no further demonstrated defect; renewed keep entry's
explicit Return to world freshness gate remains intentional.

Signed repair 485e4ca6b7b83926a50ad599f6d7854a434873f7 was pushed after the
entire outgoing one-commit range passed pinned Gitleaks 8.30.1 (nonzero scan).
All 3,351 native tracked files matched raw Git blobs before deriving the full
prepared family. Its 16 outputs reproduced in a fresh process; the native
UID-1000 policy verifier passed for 1,250 members and manifest SHA-256
c47d7d096ff500aeafc5b27a4bc8122002d3c287b0b9800f7dfcded9c4162dd7.
Only the manifest and four generated workflow commitments changed. The final
signed candidate and exact-source test/build/payload/mirror receipts are to
be recorded on PR #374 after execution. No Actions workflow was used.

## Full native suite artifact-ownership recovery — 30 September 2026, 10:07 CEST (08:07 UTC)

At clean d1474f11, native UID 1000 ran the full root suite with Node 22.22.3,
the pinned SpacetimeDB 2.6.1 CLI and exact offline YAML archive. It exited 1
after 995.83 seconds: 691 files passed, one failed, one skipped; 12,591 tests
passed, six failed, 97 skipped. Every failure was activationToolingSecurity's
fixture write to spacetimedb/dist/bundle.js, before the intended assertion.
The retained report is artifacts/qa/root-suite-last.json in the native checkout.

The ignored bundle was a regular file owned by UID/GID 0 with mode 0644 and
mtime 2026-09-30T06:18:42.609Z. Its parents were UID 1000; no build was running.
Root ownership explains EACCES for the UID-1000 fixture writer. Only the
verified exact file's owner/group was restored to warpkeep; bytes and mode
were preserved (6,054,338 bytes, SHA-256
bda5412a572574483ed12029e8c391fbe50704098660dfc572558d2fae98710e).
The unchanged activation suite then passed 199/199, exit 0, in 1.98 seconds.
Its separate report is artifacts/qa/activation-artifact-owner-recheck.json.
No source test was weakened, recursive ownership change made or suite run as
root. This focused repair is not a full-suite pass. The next full run must
use the final reviewed candidate; its exact result belongs on PR #374.

## Evidence scope correction — 30 September 2026

qa:fullstack:local invokes local-fullstack-browser-probe.mjs and a disposable
copy of spacetimedb/src/, then drives legacy Inner Keep/G001 construction,
discounts, Worker dispatch, persistence and recovery with synthetic balances,
clocks and identity. It is G001 preservation evidence, not the gameplay04/PTR
Keep04 browser journey. Existing gameplay04KeepModules tests cover gather,
persisted Mill completion, improved dispatch and credited return with a
controlled clock; they do not establish owner-atlas travel or real pacing.
The authenticated owner journey and physical-phone/performance acceptance
remain open. Keep these distinct scopes in README, handoff and release notes.

## Mobile gesture repair — 30 September 2026, 09:27 CEST (07:27 UTC)

Independent source reviews at signed candidate
268495f067e155ab76f56977797553de7194a63f found two reachable input defects.
Greater Realm reset accumulated drag travel on every finger down and treated
the final release as a tap. A drag followed by a second finger, an unmoved
two-finger gesture, secondary-button/Shift input and release-only travel could
select a returned target and recenter the camera. Lost capture also left the
gesture active. Six regression cases failed before the repair. Gesture-wide
tap eligibility now excludes those inputs, counts final-release travel, and
retires lost capture without cancelling a normally released peer.

Keep04 discarded all pointers on any capture loss and failed to rebase the
remaining finger after a pinch. Both lifted-finger variants failed before
the repair. Pointer release now retains the surviving finger's latest
coordinates with tapping suppressed. Pointer cancellation, backgrounding and
disposal still cancel interaction. Six regression cases cover continuation,
tap suppression and lifecycle interruption.

On the repaired source, pinned Windows Node 22.22.3 / Vitest 4.1.11 passed
36/36 Greater Realm host tests and 107/107 across Keep04SceneHost,
Keep04SceneVisualPoll, keep04SceneLifecycle and PtrGameplay04SurfaceHost.
App and Vite-config noEmit typechecks passed. Independent reviewers repeated
the Greater Realm host 36/36 and Keep04 host 56/56 and found no concrete
regression. The separate server review passed 85/85 construction, Worker,
journey, policy and Keep-module tests at the unchanged authority source.

The rendered loopback fixture retained desktop panning without selection;
a secondary click left selection clear. Its 390 × 844 layout kept controls
available. These are synthetic desktop/browser checks, not physical touch
acceptance. The prior full native root-suite result remains historical;
do not reuse an older retained total for the later run whose counts were lost.
Current source and exact build/payload/mirror receipts belong on PR #374.
No GitHub Actions, provider deployment or public-mirror write was performed.

The signed repair checkpoint is b696c3b7fad97de28632aac0085344ddb985ce5b.
All 3,351 native tracked files matched its raw Git blobs. The complete
prepared-closure family was rederived: 1,250 members, 16 outputs, manifest
SHA-256 9a28bb82a32e4f7af2aa212285245e65b30ec8145c42f552b09751bfd5b1d8d0.
A fresh process reproduced all outputs and the UID-1000 Linux policy verifier
passed. Only the manifest and four generated workflow commitments changed;
no workflow was run. This refresh is candidate verification, not M1/M2 or
production acceptance.

## September 30 local verification bundle — 30 September 2026

At candidate head ac437ea35c708026f2a42b6785110fa6940d5202,
npm audit --package-lock-only reported zero known root-lockfile vulnerabilities.
Corepack pnpm 11.7.0 audit reported no known vulnerabilities in either
services/auth-bridge or services/release-recovery. GitHub's three open
moderate Undici alerts are attached to the default main lockfiles, which still
resolve affected Undici 7.29.0; the candidate resolves 7.30.0 in root jsdom
and 7.29.1 in both service lockfiles. The fixed candidate versions are beyond
the vulnerable range; default-main alerts persist pending merge and rescan.

At signed candidate 9a24d455e3405308ce32e24ef01c9c600eb718a8, the root
game/test sources are code-equivalent to 0269ef201c26e312fa0ec55c0548074ebb0ee905.
The native WarpkeepRunner SpacetimeDB module typecheck passed and test:pure
passed 598/598 (0 failed, 0 skipped; 782.03 seconds) as UID 1000 warpkeep,
using Node 22.22.3 and pnpm 11.7.0. At the same code/test state, auth-bridge
passed 484 Node and 18 workerd tests (502 total), and release-recovery passed
1,499 Node and 68 workerd tests (1,567 total). Their TypeScript and workerd
typechecks passed; Wrangler's release-recovery generated-type check was current.
Genesis 002 and PTR module typechecks passed. Windows SpacetimeDB CLI 2.6.1
builds passed for the root module, Genesis 002 and PTR. The PTR package-local
Windows dependencies were installed from its frozen lock with the isolated
command documented in development sync; this removed the earlier PTR CLI
tsc-not-found warning. No source files changed during this environment repair.

The full native root Vitest suite passed at code/test head
198377c6569c08dfe97a8613f8ed098e561784b4 (exit 0; final counts were not
retained). These root, module and service suites have distinct scopes and are
not represented as one aggregate test count. The build's persistent
RealmMapScreen warning is 677.80 kB raw / 188.23 kB gzip.

At exact source 9a24d455e3405308ce32e24ef01c9c600eb718a8, the native /ptr/
production build, production exclusions, public-boundary scan, Farcaster,
license, file-size and sealed-launch preflight checks passed. The payload
contains 446 files / 138,997,364 bytes; Git source-tree ID
94fc12bd2194ef502a7d7918b40d73975f0d0536; payload manifest SHA-256
ab117c3f878b6af926407012063f30c3acb20a718494946de74a8c8ba09a2dc1; content
manifest SHA-256
1757e47922badceb7b69611b48ba1c74ed573bfbb99d88433c196fdec4371f99; root
HTML SHA-256
b9af2b46acab114e8ac002ced2d72acf36c6c77c51200419a2583e9c01867d74.
Read-only mirror plan SHA-256
73028928899dbc4b1e68034d4d0082ec4937b23b1ee89b8bedd1a83d0592ccb2 against
Warpkeep-Live main@b6afe92e7b09197b1578d992103ac3c8f916d8ad preserves 341
Alpha entries, targets 800 files and removes zero obsolete generated files.
The payload and independent mirror recheck passed; the public checkout stayed
untouched. These receipts are for 9a24d455; regenerate them after this
documentation refresh at the final pushed head.

## SpacetimeDB module suite and build — 30 September 2026

At code/test head `0269ef201c26e312fa0ec55c0548074ebb0ee905`, native
WarpkeepRunner ran the module TypeScript check and pure-test suite as UID 1000
`warpkeep`, with Node 22.22.3 and pnpm 11.7.0. `typecheck` exited 0;
`test:pure` passed all 598 tests, with 0 failures, 0 skipped and a reported
duration of 782,026.786905 ms (13m 2.027s).

SpacetimeDB CLI 2.6.1 ran `spacetime build --module-path .` and printed
`Build finished successfully`, while also warning `tsc not found in
node_modules`. The Linux module has `node_modules/.bin/tsc`, and its independent
typecheck passed. The CLI was invoked as a Windows executable from WSL, so its
own TypeScript discovery remains unverified; do not treat the warning as a
TypeScript failure or claim that this discovery path was verified. No module
was published.

The root Vitest suite is separate: its full native rerun exited 0 at
`198377c6569c08dfe97a8613f8ed098e561784b4`, without retained final counts.
Neither suite invokes GitHub Actions.

## WSL mirror-plan check against the Windows public checkout — 30 September 2026

The `Warpkeep-live-pages` checkout is clean on Windows at `main` commit
`b6afe92e7b09197b1578d992103ac3c8f916d8ad`, tree
`746fbd4facb0ad520c9dac1276d27d7a168f53d0`. WSL initially rejected the
checkout because it saw the Windows `CNAME` line endings as a local edit and
refused the NTFS checkout as dubious ownership. Recheck from WSL using a
per-process Git config: `safe.directory` set to the exact `/mnt/c/.../Warpkeep-live-pages`
path and `core.autocrlf=true`. This keeps the public checkout read-only, keeps
the status and index guards active, and does not alter global or repository
Git config. The corrected mirror-plan write and independent recheck passed at
source head `70f42c22e571cb34ddd2962d3e1e97aadd94d283`; the source-root artifact
is ignored and no public mirror files were changed.

## Full native Linux root Vitest rerun — 30 September 2026, 07:51 CEST

At code/test head `198377c6569c08dfe97a8613f8ed098e561784b4`, native
WarpkeepRunner (UID 1000 `warpkeep`) ran `npm test -- --reporter=dot` with
Node 22.22.3, npm 10.9.8, Vitest 4.1.11 and SpacetimeDB CLI 2.6.1. The pinned
`.git/yaml-2.9.0.tgz` fixture matched SHA-256
`008fa204cb1ba700e0272ba045abbf09a6ffe63456e8146ba97cac6c2ad1ef91`.
The full root `tests/**` suite exited 0, closing the post-cadence-fix
full-suite verification gap. Module and service runners are separate. The
terminal stream did not retain final test totals, so no count is asserted here.
The exact notes-inclusive `/ptr/` build and read-only mirror-plan receipt are
tracked on PR #374.

## Exact notes-inclusive candidate build and read-only mirror plan — 30 September 2026, 07:17 CEST

At source `e86230ac70de5aa34f206d7d6c0cf65561d4274e`, native WarpkeepRunner
ran the full production build with Node 22.22.3 / npm 10.9.8,
`DEPLOY_BASE=/ptr/` and `VITE_WARPKEEP_BUILD_SHA` bound to that commit. Type,
build, runtime-asset/catalog integrity, production exclusions, Greater Realm
public-boundary scan (3,351 tracked paths / 1,908 entries), and Farcaster
integrity passed. The RealmMapScreen warning remains 677.80 kB raw / 188.23 kB
gzip.

Payload: 446 files / 138,997,364 bytes; source tree
`0774f9eae7edd6838deec54170d47b890eff691a`; manifest SHA-256
`3500461d6373e6079ccf96e4d4be662a9026d20c702a48ba499fabdc47b8a5ba`; content
manifest SHA-256
`6a3cc4d20e17487a5b1c73f8d8b201f43cacd82761eaba92264bc340f2780f63`; root
HTML SHA-256
`0fee6bac0b65afedb914fcb6df6ba2c4f57c423857d8ac1fbfdffe0726623f5d`. Payload
write and immediate check passed.

Read-only mirror plan SHA-256
`8ba1d5c3aee8454475a379bdf3bf6bd03bc97205af3e5c0a47ea387c888d1535` against
Warpkeep-Live `main@b6afe92e7b09197b1578d992103ac3c8f916d8ad`, tree
`746fbd4facb0ad520c9dac1276d27d7a168f53d0`: preserves 341 Alpha-root entries,
targets 800 files and removes zero obsolete generated files. Independent
read-only recheck passed; the public checkout was not modified. This receipt is
bound to source `e86230ac`; the documentation-only head refresh that follows
requires a final exact-head build, recorded on PR #374.

## Keep04 cadence recorder regression — 30 September 2026, 06:50 CEST

Signed source `45d569db` fixes a DEV-only measurement defect in
`summarizeKeep04FrameIntervals`. A visible local Chrome capture initially
recorded five event-driven fixture redraws; the old collector treated an idle
gap of about 30.8 seconds between user actions as a rendered-frame interval.
The corrected collector continues a cadence series only when the preceding
frame reports a pending successor RAF. Loading/fallback/disposal and malformed
records still break the series.

`npm test -- tests/keep04QaContract.test.ts` passed 19 tests / 1 skipped and
`npm run typecheck` passed. A second visible Chrome check produced two isolated
redraws and correctly reported `sampleCount: 0` with null p50/p95/p99. This is
synthetic instrumentation verification only; it is not a production workload,
device measurement, input-feedback result or 0.4 performance pass. The full
native suite result predates this change and is retained separately below.

## Current-candidate G001 full-stack browser QA — 30 September 2026, 06:02 CEST

Signed source `566d27286080424c6da235630e36723720f7f2a5` passed
`scripts/qa-observer/local-fullstack-browser-probe.mjs` on Windows Node 22.23.2
with the pinned SpacetimeDB CLI 2.6.1 and isolated headless Chrome profiles.
The probe exited 0 and cleaned its disposable database, Vite server, browser
processes and temporary profiles. No production database, credential or
external service was used. Source review on 30 September confirmed that this
probe publishes the preserved `spacetimedb/` module and uses the legacy
Inner Keep/G001 caller. It does not exercise `spacetimedb/ptr`, gameplay04,
Keep04 or the new PTR surface. Treat it as G001 preservation evidence.

The run covered the six direct-menu viewport profiles; restored server Terms
continuity; authoritative City Mill construction/completion and discounted
Lumber Camp construction with one Builder; hard-reload persistence and retained
camera/Worker presentation; synthetic cold auth/bootstrap/Terms; fresh-browser
four-phase Worker re-entry; delayed/failing private reads and timeout/missing/
torn/visibility recovery seams; four-resource dispatch, recall, settlement and
return completion. The visual aggregate passed its clipping and palette guards.
Authentication and advanced state were synthetic. This is local integration
evidence for G001, not gameplay04/PTR integration, a production PTR journey,
actual-owner acceptance, or phone
performance measurement.

## Exact candidate build and read-only mirror plan — 30 September 2026, 05:39 CEST

At signed candidate
`d800c468339cf1d3048c2f08f2270d5ef84700b8`, native WarpkeepRunner ran the
full `/ptr/` build with `VITE_WARPKEEP_BUILD_SHA` bound to that commit.
TypeScript, runtime asset catalogs, production exclusions, public-boundary scan
(3,351 tracked paths / 1,908 scanned entries), and Farcaster integrity passed.
License policy, tracked file-size policy, and sealed-launch preparation passed.
The build retained the RealmMapScreen warning at 677.80 kB raw / 188.23 kB gzip.

The exact payload contains 446 files / 138,997,364 bytes; source tree
`24bdf4f4813cacbddbcec303bcc195cbd606361e`; payload manifest SHA-256
`df4ed201f1140253342eb4305df7b3e1384d5fdffd9669279d352f20afc49b6f`;
content manifest SHA-256
`b8d47f765484503e289d2d90ab4c51b37f12be1d55ed8742cc761a6c1a87edfb`; root
HTML SHA-256
`f45ed3ed4e4b6111f4ef66fa9aaf895b07c16c9ec9d72a2139aead5146fa1330`.

The read-only mirror plan against Warpkeep-Live main
`b6afe92e7b09197b1578d992103ac3c8f916d8ad` (tree
`746fbd4facb0ad520c9dac1276d27d7a168f53d0`) preserves 341 Alpha entries,
targets 800 total files, and removes zero obsolete files. Its SHA-256 is
`bfe4e4a7355f1a0d9bffb7970db840896712e02bbd0eadf3fc749c3b43bb3c72`;
preserved-root manifest SHA-256 is
`7699d03b70c901e4fb8453b8b515af03376d398bf79e9eabea1c85f6e303c3ef`. The
writer re-read and verified the plan inputs; the public checkout was not
modified.

At 06:02 CEST the public Alpha root returned HTTP 200 and `/ptr/` returned HTTP
404. Sealed launch remains disabled (package 0.3.43, Pages approval false, live
G001/G002/PTR identities unset, PTR presentation disabled). No provider, merge,
or public Pages write occurred. No GitHub Actions workflow, run, check, or
status was queried or used during September. This receipt is bound to
`d800c468`; later tracked changes require a fresh exact-head build and receipt.

## Exact candidate build and read-only mirror plan — 30 September 2026, 05:28 CEST

At signed candidate
c48e2d9478f46d18c0a2187f9318e62bc30c57e3, native WarpkeepRunner ran the full
/ptr/ build with VITE_WARPKEEP_BUILD_SHA bound to that commit. TypeScript,
runtime asset catalogs, production exclusions, public-boundary scan (3,351
tracked paths / 1,908 scanned entries), and Farcaster integrity passed. License
policy, tracked file-size policy, and sealed-launch preparation passed. The
build retained the RealmMapScreen warning at 677.80 kB raw / 188.23 kB gzip.

The exact payload contains 446 files / 138,997,364 bytes; source tree
c0b4e1787d670668fbfa0abb10cf065d5ef76185; payload manifest SHA-256
036f849ad775b46e21ea3783dc5349024e8dee043f994741f1899e138008f2df;
content manifest SHA-256
2421d7c62e4cbdc5d8d5c0d8c0dcf70b735a112e350f3de8c8fb5e5abf5f5a21; root
HTML SHA-256
bcd82bf55b9f20b46407b7dc6c0fb5696845fb2f38ee179ed92b725a4d1d165b.

The read-only mirror plan against Warpkeep-Live main
b6afe92e7b09197b1578d992103ac3c8f916d8ad (tree
746fbd4facb0ad520c9dac1276d27d7a168f53d0) preserves 341 Alpha entries,
targets 800 total files, and removes zero obsolete files. Its SHA-256 is
02336041d32169baebd84febad756a9d497bb3234cf789572c840f2617915eea;
preserved-root manifest SHA-256 is
7699d03b70c901e4fb8453b8b515af03376d398bf79e9eabea1c85f6e303c3ef. Payload
and plan were checked against their exact-source inputs; the public checkout
was not modified.

At 05:27 CEST the public Alpha root returned HTTP 200 and /ptr/ returned HTTP
404. Sealed launch remains disabled (package 0.3.43, Pages approval false, live
G001/G002/PTR identities unset, PTR presentation disabled). No provider,
merge, or public Pages write occurred. No GitHub Actions workflow, run, check,
or status was queried or used during September. This receipt is bound to
c48e2d94; later tracked changes require a fresh exact-head build and receipt.

## Exact candidate full-suite rerun — 30 September 2026, 05:05 CEST

On signed code/test source
`4350ae7a7c190bf65c5515cbb229e5b5485778b4`, the pinned native Linux run
`npm test -- --reporter=dot` passed 692 test files / 1 skipped and 12,582
tests / 97 skipped; exit 0 in 847.76 seconds. Environment: Node 22.22.3, npm
10.9.8, SpacetimeDB 2.6.1, offline YAML fixture SHA-256
`008fa204cb1ba700e0272ba045abbf09a6ffe63456e8146ba97cac6c2ad1ef91`, and
`umask 0022`.

The first full run on the preceding source had one intermittent failure in
`greaterRealmProductionBootstrap.test.ts`. That fixture spawned a real shell,
recorded its now-dead PID, and immediately passed that PID/PGID to cleanup; a
parallel test worker could reuse it before the assertion. The lifecycle test
passed alone (52/52), and the full file passed alone (52/52). Commit `4350ae7a`
replaces the fixture with `pid_max + 1`, outside Linux's allocatable PID range;
the isolated full file then passed 52/52 and the repository-wide run passed.
This is a deterministic test-fixture fix, not a production behavior change.
The passing run emitted existing `context canceled` diagnostics but no test
failures. No GitHub Actions workflow or status was used.

## Exact native rerun and environment correction — 30 September 2026, 03:08 CEST

At signed candidate
1b333d0e56629266223dc090f37d87ea880672ce, Windows, GitHub and the native
release checkout matched the same branch head. The exact native Linux full
suite passed with Node 22.22.3, npm 10.9.8, SpacetimeDB 2.6.1 and the offline
YAML fixture SHA-256
008fa204cb1ba700e0272ba045abbf09a6ffe63456e8146ba97cac6c2ad1ef91: 692 files
passed / 1 skipped, 12,582 tests passed / 97 skipped, exit 0 in 849.11
seconds. A first attempt used umask 077; that changed intentionally wrong-mode
0644 receipts into 0600, causing 62 file-mode test failures across 11 files.
The focused production canary authority suite passed 25/25 under umask 0022,
followed by the full 0022 suite passing. This was a local test invocation
error, not a source defect. Negative-path tests emitted corrupt-object
diagnostics from their temporary Git fixtures. Post-run fsck of the actual
candidate exited 0; it reported dangling commits but no object errors.

An initial Linux build attempt through the Windows-mounted development
checkout stopped before Vite because its shared node_modules exposed only
esbuild win32-x64. No source or dependency tree was changed by the failed
attempt. The documented native build checkout is
/home/warpkeep/Warpkeep-0.4, with its Linux dependencies. At exact source
1b333d0e there, the /ptr/ production build, typecheck, runtime and
production-asset integrity, exclusions, public-boundary scan (3,350 tracked
paths / 1,907 entries), Farcaster integrity, sealed-launch preparation,
license policy and tracked file-size policy passed.

The payload covers 446 files / 138,994,282 bytes: manifest SHA-256
d75d95af2f4f717834fe1338ecfe62edfe277cc97cdd7ecbbc8d98e9f084e26e, content
manifest SHA-256 fb040b483ab42a982801c6735f08b96dd0e491db2f4d36f1d957e1acd08189b
and root HTML SHA-256
1a4fab449bea72b777630cc12ab304f7b167036eca2604183e032d3c0ad81539. The
read-only plan against clean Warpkeep-Live main
b6afe92e7b09197b1578d992103ac3c8f916d8ad preserves 341 Alpha-root entries,
targets 800 /ptr/ files, removes zero obsolete generated paths, and hashes to
76415981696deb8e1cc74297625c1fcb857986208fc0b40313f7f5ee781b931f.

Sealed-launch preparation still reports package 0.3.43, Pages approval false,
live identities unset and PTR presentation disabled. The public root is HTTP
200; /ptr/ is HTTP 404. The 677.80 kB RealmMapScreen chunk warning remains,
and physical-device performance is unverified. No Actions, provider/public
write, merge or deployment occurred. These notes alter only documentation;
rebuild and refresh ignored receipts at the notes-inclusive pushed head.

## Pre-refresh exact candidate receipt — 30 September 2026, 02:25 CEST

Windows, GitHub and native WarpkeepRunner matched signed candidate
0fc189cf2126b0f283f01f042ed5ab41549b6b81 on
fix/g001-census-admission-proxy. The exact-source /ptr/ production build,
typecheck, runtime and production-asset integrity, production exclusions,
public-boundary scan (3,350 tracked paths / 1,907 scanned entries), Farcaster
integrity and sealed-launch preflight passed. The ignored payload receipt
covers 446 files / 138,994,282 bytes: manifest SHA-256
fb22fa1a356e6704bfac1850b4ab95b58599cffa551f2c924595fd25759b58e6, content
manifest SHA-256 36d7e2cb950665e0259f68ebc0e311a946cf4a131f52bdfa3dca46ed2276c02e
and root HTML SHA-256
dd60c63d2ddcb77be4058ddb13a2210114960db1d3124aa246bc3391b82862b0. The
read-only mirror plan against Warpkeep-Live main at
b6afe92e7b09197b1578d992103ac3c8f916d8ad preserves 341 Alpha entries,
targets 800 /ptr/ files, removes zero obsolete paths and hashes to
5aef11f8fbcd36338914dabb7b821a711375d0c71e08a5104bd9df2c7cfbdb49.

The tested full-suite code identity remains 11b2ccbf (12,580 passed / 97
skipped); the later QA-controller source change 570112ad passed its focused
tests 5/5. Commits through 0fc after that source change contain documentation
only. No new screenshot or physical-device run was taken. The 677.80 kB
RealmMapScreen warning remains; the root is HTTP 200 and /ptr/ HTTP 404.
Sealed-launch preflight still reports package 0.3.43, Pages approval false,
live identities unset and PTR presentation disabled. No provider/public write,
merge or deployment occurred. GitHub Actions remain out of the September
workflow.
The documentation-only changes recorded above this evidence are not part of
that build identity; rebuild and refresh the ignored receipts at their pushed
head.

## Exact-source QA framing and PTR build — 30 September 2026

Signed candidate commit
[`570112ade8b95c3bccb50f87fc2fe06a2121caf0`](https://github.com/ael-dev3/Warpkeep/commit/570112ade8b95c3bccb50f87fc2fe06a2121caf0)
fixes synthetic mobile evidence framing. The browser probe now collapses only
the QA controller disclosure after verifying the requested local origin,
document URL, scenario and quality profile; it fails closed if the controls are
missing. The game schematic disclosure is left alone. The report records that
the controller was collapsed before each screenshot. The focused browser-probe
suite passed 5/5 under native Linux Node 22.22.3 / npm 10.9.8, including all 36
planned case captures through the mocked browser transport. No new screenshot
run was taken, so this proves the capture ordering and guard, not the rendered
appearance of a fresh capture or physical-device comfort.

At that exact source commit, the `/ptr/` production build passed TypeScript,
runtime asset checks, production exclusions, public-boundary verification
(3,350 tracked paths / 1,907 scanned entries) and Farcaster integrity. The
existing `RealmMapScreen` chunk warning remains 677.80 kB / 188.23 kB gzip.
The payload manifest covers 446 files / 138,994,282 bytes: manifest SHA-256
`91744f95c5d6b8d567ecad1f236f9630ca4ee505480d2d4f9aaf46bc76f45c28`, content
manifest SHA-256
`6dd14e8c11c3a857d5427f41e6399285b3359c65728d80908313d68a881f8cf5` and root
HTML SHA-256
`87c5cf9db7b65cd2e1b97443fdc1f77a7f5fcc047d7455e23a40fa0dcdda07df`. The
independent plan against clean
[`Warpkeep-Live@b6afe92`](https://github.com/ael-dev3/Warpkeep-Live/commit/b6afe92e7b09197b1578d992103ac3c8f916d8ad)
preserves 341 Alpha-root entries, targets 800 `/ptr/` files, removes zero
obsolete generated paths and hashes to
`4050afe1a4bb081421decd4aa69e415ce5b2e684820745b0c9f56dac4e66ddd2`.
The generated manifest and plan are ignored local receipts. The outgoing source
commit passed Gitleaks 8.30.1 with one commit / about 7.20 KB scanned and no
leaks. GitHub Actions were skipped for September. No public write, merge,
provider mutation or deployment occurred; `/ptr/` remains unshipped.

The `WarpkeepRunner` WSL distro defaults to `root`. An initial preparation
check invoked that way failed with `SEALED_LAUNCH_CHECKOUT_INVALID`: the
verifier clears global Git configuration and correctly rejected the executor
against the `warpkeep`-owned checkout. No release configuration or provider
state changed. Use `wsl -d WarpkeepRunner -u warpkeep -e bash -lc ...` and verify
UID 1000 before native operations. The root invocation in this session had
created root-owned Git metadata, the five updated tracked files, 146 build
entries and two ignored receipts; those exact outputs were restored to
`warpkeep`. The preparation check then passed at source
`72d9e3eef386f83b95610085b2a6267303a71a04`, reporting package `0.3.43`, Pages
approval false, G001/G002/PTR identities unset and PTR presentation disabled.

## Authenticated provider identity and PTR schema recheck — 30 September 2026, 01:40 CEST (23:40 UTC)

Read-only checks were performed from the maintained candidate at signed head
`cff791d8a8dd1e3e031f941b0e7e5e5df3a2b666`. No GitHub Actions, database,
Cloudflare configuration, frontend publication, or production mutation was
used.

Cloudflare: pinned Node 22.22.3 and repository Wrangler 4.110.0 completed the
existing `warpkeep-production` profile's identity and deployment reads. The
profile remains bound to the existing `C:/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep`
checkout; its selected account is the expected production account
`c647739b4535010b0b13e6fc296e2c4e`. The newest `warpkeep-auth-bridge`
deployment is `b338c098-a33e-4922-a3a4-1c2d92a3b035`, created
2026-09-27 19:01:23.825605 UTC. Its only listed version,
`2b28a266-862b-45da-a747-3cea0a0d858c`, is at 100 percent; the deployment
annotation describes restoration of Alpha QR verification and names
`79dfceec-9810-4868-afca-5b794d08a9a5` as its rollback. A fresh
`GET https://auth.warpkeep.com/healthz` returned HTTP 200 with a 106-byte
JSON response. This establishes the selected account, deployed version and
basic Worker health; it does not establish the PTR-specific bindings, owner
exchange, or database state.

SpacetimeDB: the pinned Windows CLI and native `WarpkeepRunner` CLI both report
2.6.1. `login show` succeeded for each without printing login contents; both
Maincloud listings associate the expected publisher identity
`c200431f50cf410304546489e2600c8446408f1aa727c91d86bc00aef6724d15` with the
same three Warpkeep databases:

| Database | Immutable Maincloud identity |
| --- | --- |
| `warpkeep` (G001) | `c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e` |
| `warpkeep-genesis-002` (sealed G002) | `c2003223f6e3c86e988775ddd458c3a45635d0d021e11131551471617c392194` |
| `warpkeep-ptr` | `c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e` |

The Linux CLI configuration remains a regular single-link file owned by
`1000:1000`, mode `0600`. A fresh read-only PTR schema description returned
valid JSON containing 24 tables, 10 reducers, 49 types and 7 miscellaneous
exports. It requested no rows. The checked-in candidate still defines seven
additional `gameplay04_*` tables and five gameplay procedures; the exact names
and live-release consequences are in the [current delivery record](../../operations/0.4.0-live-delivery-status.md).
Publisher login and schema visibility are not permission to update the realm.
The exact-source M1/M2 sequence, preservation evidence and supported PTR
inspection remain necessary before any update; the live PTR does not yet serve
the 0.4 keep.

## Exact-candidate full regression and preview — 29 September 2026, 22:21 CEST

On exact candidate `0c6251b93644b9ea5df345dae42fd4d24a0cfbcb`, native Linux
`npm test -- --reporter=dot` passed 692 test files / 1 skipped and 12,580
tests / 97 skipped (Vitest 4.1.11, exit 0, 979.68 seconds). Environment:
UID 1000 `warpkeep`, Node 22.22.3, npm 10.9.8 and the native SpacetimeDB 2.6.1
executable. The exact `.git/yaml-2.9.0.tgz` test fixture passed its committed
SHA-256 check; existing root and module dependencies were reused without an
install.

The raw test stream contains cancellation/React `act(...)` warnings and
damaged-object errors from negative-path Git fixtures. The actual Runner
checkout remained clean. Post-run `git fsck --full --no-reflogs` exited 0 and
reported dangling commits only, so no loose-object corruption remained in the
candidate repository.

The exact-head `/ptr/` production build and payload write/check passed. Its
manifest SHA-256 is
`334952934371a167bbc321cd58fd5be68f0ef120e2e03285d348fddd66869647`; it covers
446 files / 138,994,282 bytes. Content-manifest SHA-256 is
`2f387cb659727815902cb58796d4651a245870c5680c37e4251c648eb2266527` and root
HTML SHA-256 is
`52cd2ef0f351dd370de1bb36201ade775aa45098e2e5197ced84670b770ece92`. The
independent read-only plan SHA-256 is
`84ce7e69ea095700cbe9a00e6455c19c5749b4a26a6b930c6f843fc5820a5e2c`; it
preserves 341 Alpha entries, targets 800 `/ptr/` files and removes zero
obsolete generated paths.

The local production preview served the stamped menu at `/ptr/#menu`. Retained
390×844 menu and empty-Keep screenshots were visually checked for readable
primary actions and no horizontal overflow; the captures are synthetic
desktop-browser emulation, not physical phone or performance acceptance. The
server and exact temporary `/tmp` symlink were stopped and removed. Fresh public
HTTP reads returned 200 for the Alpha root and 404 for `/ptr/`. No GitHub
Actions, provider/public writes, merge or deployment occurred.

## Exact-head local verification — 29 September 2026, 21:51 CEST

At signed source `7daea5f55e514f1c25e8b9a5e3258e3a5fa87729`, the pinned native
Linux Node 22.22.3 / npm 10.9.8 `/ptr/` production build exited 0. TypeScript,
runtime-asset integrity, production exclusions, the public-boundary scan
(3,350 tracked paths / 1,907 scanned entries), Farcaster integrity, license
policy and tracked-file-size policy passed. The focused
`keep04DocumentPolicy.test.ts` and `keep04WindowsCapture.test.ts` suites passed
91/91. `verify:sealed-launch:preparation` completed and correctly reported the
release disabled: package 0.3.43, Pages approval false, live G001/G002/PTR
identities unset and PTR presentation disabled.

The exact build emitted a 108.81 kB / 33.53 kB gzip PTR host and the existing
677.80 kB / 188.23 kB gzip `RealmMapScreen` chunk. Payload: 446 files /
138,994,282 bytes, manifest SHA-256
`17e6f60ce7610dde8d5bc51ca00d6b81f715d82de1a219c855648b5e707b90f3`, content
manifest SHA-256
`5941b9fc65625f0fe264a349362e790fd7c3c5977d2a8708263885ce8554c4b2`, root
HTML SHA-256
`27e5004b41d16c968683871af6de416b18360a53b3b5c111cc3c082d9a7e804b`. An
independent read-only plan against clean Warpkeep-Live
`b6afe92e7b09197b1578d992103ac3c8f916d8ad` preserves 341 Alpha-root entries,
targets 800 generated paths, removes zero obsolete files and hashes to
`5293912d89646974247b570a3c0964d586cc6305a5a10e6d4fb12d1ba0a4b6b1`.

These generated receipts are ignored local preparation, not release authority;
regenerate them after the following notes-only checkpoint. No GitHub Actions,
provider or public-repository writes, merge or deployment occurred. The public
root remains HTTP 200 and `/ptr/` HTTP 404; physical-phone performance and owner
PTR acceptance remain unverified.

## Exact candidate build and dependency readback — 29 September 2026, 21:41 CEST

At signed candidate `83549312ce88e69acdf30f687a9918d178a95dac`, the pinned
native Linux Node 22.22.3 / npm 10.9.8 `/ptr/` build completed twice with exit
0. TypeScript, runtime assets, production exclusions, public-boundary
verification (3,350 tracked paths / 1,907 scanned entries), Farcaster
integrity, license and tracked file-size checks passed. The PTR host is 108.81
kB / 33.54 kB gzip; `RealmMapScreen` remains 677.80 kB / 188.23 kB gzip.

Payload write and independent `--check` passed: 446 files / 138,994,282 bytes,
manifest SHA-256
`c3a821d4b048edd12c367c726c97193a322d5bfc971ff5308fc4d82d1e0fde10`, content
manifest SHA-256
`7ebe6d25fe081aa0b82735b90f15870d4fa3caa032fd5b66cbbca9525d096791`. The
read-only mirror plan write and independent check against clean
`Warpkeep-Live@b6afe92e7b09197b1578d992103ac3c8f916d8ad` passed: 341 Alpha-root
entries preserved, 800 target files, zero obsolete generated files; plan SHA
`666880a8b1b1bdb0823766b06aa217754cc4c7fe8393b9df81f3e55a2aafd35f`. These
are ignored local receipts, not a public write or deployment.

Sealed-launch preparation remains closed as intended: package `0.3.43`, Pages
approval false, G001/G002/PTR identities unset and PTR presentation disabled.
The read-only Dependabot inventory returned three open moderate alerts on
default `main`, all GHSA-3wwx-pv8p-q78v for Undici in root, auth-bridge and
release-recovery lockfiles. The candidate has root `jsdom` nested Undici 7.30.0
and patched service Undici 7.29.1, but the alerts remain open on `main` until
the candidate lands. See [the GitHub advisory](https://github.com/advisories/GHSA-3wwx-pv8p-q78v).
No GitHub Actions, provider mutation, public write, merge or deployment occurred.

This notes commit changes the source SHA. Regenerate the exact `/ptr/` build,
payload manifest and read-only mirror plan from the new clean head before
publication. The QA capture at `ff0c5b5` remains relevant to unchanged product
code, not deployment or phone/performance acceptance.

## Privacy-safe Keep QA diagnostics — 29 September 2026, 21:31 CEST

Signed commit `ff0c5b518e54da1e24986ca680d8ba72dd883e60` updates the local
Windows CDP capture's security-log record from a generic label to an
allowlisted signal. The focused QA policy/capture suites passed 91/91. A
stable-source Chrome 154 run at that exact commit completed all 36 synthetic
documents: 32 WebGL and four fallback, zero horizontal overflow, no dropped
diagnostics, and verified browser cleanup. Each document reported one
`browser-log-security` warning categorized as `sandbox-script-origin-tokens`.
Raw browser text is not stored. The warning still sets `reviewRequired`; the
category describes the message tokens but does not establish harmlessness or
production impact. Screenshots from this run remain uninspected and no device
performance claim is made.

Removing `allow-same-origin` was tested as a local-only CSP experiment. It
caused browser script/network errors and the capture failed, so the existing
working synthetic policy was restored. The failed run preserves bounded stage
and category metadata only; owned Chrome cleanup was verified. No production
policy or game behavior changed. No GitHub Actions, provider mutation, public
repository write, merge or PTR publication occurred. The diagnostics commit
was pushed to the existing candidate branch using `[skip actions]`.

## Exact notes-inclusive local release candidate — 29 September 2026, 21:11 CEST

No GitHub Actions were queried, dispatched, rerun or used; no provider
mutation, public-repository write, merge or PTR publication occurred.

The only source fix was the native test fixture's current-run title. It now
matches the checked-in operation-plus-source workflow run-name. The focused
workflow-evidence suite passed 118/118. The privileged native Linux preflight
suite passed 104/104 against the locally prepared candidate, including its
97 root-gated tests and the successful read-only G001 path. The fixture permits
GET requests only and the test verifies no private writes. No production or
runtime code changed after signed test fix 7aa95148.

The ordinary native Linux suite passed on product source 2f1cc066: 692 files
passed / 1 skipped, 12,579 tests passed / 97 skipped. Local assembler prepare
and independent rebuilding check passed at 2f1cc066. Candidate
release-workspace-d2953d97bf5117d8ec29c0b2991657b8, transaction
48bcb949e37f411bc7968dfe054cf998: 102 outputs, 3,350 source/candidate files
checked, 3,248 preserved, 624 compiled bundle inputs and 7 recovery inputs.
Journal SHA-256
cb0a22b59e6ce6c7394e031b861ededa9170f55b7e70b0c1fc45ad7d54098954; family
7cc6fc1d4c6492100ddf3c3639a625a2a0009f532c338d488e891eb0b9f7c041; closure
a6990b37d837e2d9450013e8606d7299166f6158c6b55a450040ac15a9ad75c1; scanner
edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71. The
candidate reports finalReleasePrepared=false and is not M1 or deployment
authority.

At exact signed source `7a5f0ef04a69ec12eeb7b7d89af3904d3cd337ba`, the stamped
/ptr/ production build passed on pinned native Node 22.22.3 / npm 10.9.8.
TypeScript, runtime asset verification, production exclusions, public boundary
(3,350 paths / 1,907 entries) and Farcaster integrity passed. Payload has 446
files / 138,994,282 bytes; manifest SHA-256
6bc83b4235e62b3c2cb022c6c572195af1a29b7af2fee7136988e36d333b8950 and content
manifest SHA-256 e223e894f3e01c00509f7eb9ab9f663f09aa76942dff1ba0bdc20c948e2e4150.
The read-only plan against clean Warpkeep-Live@b6afe92 has SHA-256
20c81e4b6e2c4d4042ba71ffa8b63e16c563cadb08051a3d5823dd0bbaf53728: 341
Alpha-root entries preserved, 800 target files, zero obsolete generated paths.
The PTR host chunk is 108.81 kB / 33.54 kB gzip; the 677.80 kB / 188.23 kB
RealmMapScreen chunk warning remains. Sealed-launch remains in preparation
(package 0.3.43, Pages approval false, live IDs unset, PTR presentation
disabled). This plan is preparation only; no public repository or site changed.

The private release store had 205 run directories at the start of this
work and two additional retained runs afterward. Historical/incomplete
records remain untouched by policy; no automatic pruning occurred. About
1.1 TB was free. No new Desktop file, sibling backup or archive was created;
the existing next-work note is updated in place.


## Previous exact-head local PTR verification — 29 September 2026, 18:57 CEST

Windows, GitHub and the native Linux WarpkeepRunner checkout are synchronized
at signed head `794dc6645dbe01975f4d3b1e2af3741fbd9bf8e3` on
`fix/g001-census-admission-proxy`; PR #374 remains open against signed main
`786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`. No GitHub Actions, provider
mutation, `Warpkeep-Live` write or PTR publication occurred.

The exact-source `/ptr/` production build passed TypeScript, runtime asset
checks, production exclusions, the public-boundary scan (3,350 tracked paths /
1,907 scanned entries) and Farcaster integrity using Node 22.22.3 / npm 10.9.8
with VITE_WARPKEEP_BUILD_SHA set to the source head. Payload: 446 files /
138,994,112 bytes; the ignored manifest write and independent check passed with
SHA-256 `50ca98a51c230a36e42e03196fabc58c32fc9e1d1b484771e5202d5866b596ab`.
The read-only plan against clean `Warpkeep-Live@b6afe92` has SHA-256
`49d972ed78600f17a8920b458126ccd6b20690cc5a492634a89ae84f1418cbd3`, preserves
341 Alpha-root entries, targets 800 files and removes zero obsolete files.
License and tracked file-size checks pass. A read-only npm registry audit of
this candidate lockfile reports zero vulnerabilities (115 production, 204
development and 110 optional dependency entries). Auditing `origin/main`'s
lockfile identifies moderate advisory GHSA-3wwx-pv8p-q78v in `jsdom`'s nested
Undici 7.29.0, with a fix available; the candidate updates that copy to 7.30.0.
GitHub's push response reported three moderate alerts on default `main`; the
local npm audit only explains the Undici finding, so do not claim the other
alerts are resolved. No dependency files were changed during this audit. The
read-only open-PR inventory found #375, #376 and #377's exact head commits
already in the candidate history. PR #378's exact head is not an ancestor, but
48 of its 51 changed paths are byte-identical to the candidate; the other three
files retain compatible accumulated additions, including its tree license
entry, build verifier and `/ptr/` asset-base resolution with failed-load retry.
Leave these PRs open during the September no-Actions pause.
Sealed-launch preparation remains closed as intended: Pages approval false,
package 0.3.43, live identities unset and PTR presentation disabled. The
677.80 kB RealmMapScreen chunk warning remains. These receipts prepare a
candidate and do not authorize deployment.

The full Vitest input was `3157e0b` (product code unchanged through `794dc664`) and
required a temporary PATH alias for the pinned
SpacetimeDB 2.6.1 CLI. Its first run without that alias failed two PTR backend
tests with spawnSync ENOENT; the isolated PTR backend file then passed 15/15.
With the alias, 690 files / 12,577 tests passed and 1 file / 97 tests skipped,
while two timing-sensitive cases failed under full-suite load. Their isolated
files passed 53/53 (cutover journal) and 52/52 (production bootstrap). Record
the aggregate as incomplete, not green. The post-test actual-checkout
connectivity check found no corrupt objects; the working tree was clean and
the origin branch matched this head. Re-run with the native CLI path configured
and reduced contention if an all-green aggregate is required.

Regenerate the ignored receipts after this documentation sync so they bind to
the final pushed head. The public root remains available and `/ptr/` is not
published. No deployment or provider mutation occurred.

## September local candidate verification — 29 September 2026, 17:12 CEST

Signed product-source commit `29e94dfa3ca396dcc75f74b4b63edc996971e888` is
synced across the Windows checkout, GitHub origin and native Linux WarpkeepRunner;
this continuation is a notes-only update. No GitHub Actions were queried,
dispatched, rerun or used during September. PR #374 stays open,
`Warpkeep-Live/main` is untouched, and the live root remains HTTP 200 while
`/ptr/` is HTTP 404.

The exact no-Actions candidate includes #375's menu, #376's castle-film action,
#377's owner-requested G002 soundtrack and #378's 40 v3 tree models. G002 is
still sealed; its soundtrack has no current player entry path. The payload
verifier had omitted that single exact M4A path. Commit `29e94dfa` adds only
that approved path and a fixture proving it enters the manifest while arbitrary
M4A paths remain blocked.

Four focused suites on `29e94dfa` passed 39/39 under Node 22.22.3 and native
SpacetimeDB 2.6.1. The complete native suite passed on immediate predecessor
`53aa334d`: 692 files passed / 1 skipped, 12,579 tests passed / 97 skipped,
exit 0 in 932.26 seconds. Fifteen raw context-canceled messages and existing
React act warnings did not produce test failures.

The exact `29e94dfa` `/ptr/` build passed TypeScript, all runtime assets,
production exclusions, the public-boundary scan (3,350 paths / 1,907 entries),
Farcaster integrity, file-size policy and license policy. Its local payload is
446 files / 138,994,239 bytes. The read-only plan against clean
`Warpkeep-Live@b6afe92` preserves 341 Alpha-root entries, targets 800 files
and removes zero obsolete paths. Regenerated ignored receipts are checked
after this notes sync against the final checkout. `verify:sealed-launch` still reports Pages approval false,
package `0.3.43`, unset G001/G002/PTR identities and disabled PTR presentation.
These checks prepare a candidate; they do not authorize deployment.

The current `RealmMapScreen` chunk warning remains 677.80 kB raw / 188.23 kB
gzip. The privacy-safe browser diagnostic still needs human review, and
physical-device performance and owner PTR acceptance remain unmeasured.

## Previous local candidate verification — 29 September 2026, 15:56 CEST

No GitHub Actions were queried, dispatched, rerun or used during September.
Windows, origin, PR #374 and the clean idle native Linux checkout match signed
head 8cdf8967c96897ea9c3b512b9d9b77f2a2feffdf on
fix/g001-census-admission-proxy. Product source remains
65b3d6cd37d0a0dc4435c37e8276440f60f6bfa5.

The full native Linux suite ran as UID 1000 warpkeep with Node 22.22.3,
npm 10.9.8 and native SpacetimeDB 2.6.1. Vitest 4.1.11 completed in 871.42
seconds with exit 0: 692 test files passed / 1 skipped and 12,577 tests passed /
97 skipped. Nine context canceled messages appeared in the raw log, but no test
failed. This supersedes the earlier aggregate exit-1 report, which was not
reproduced; its cause is unknown. The first WSL run using Windows spacetime.exe
remains an invalid cross-OS result. Isolated native runs passed 15/15 for
ptrRealmBackend and 37/37 for ptrProductionExistingUpdateContinuation.

At exact head 8cdf8967, pinned Node 22.22.3 / npm 10.9.8 root and /ptr/
production builds passed TypeScript, runtime asset checks, production
exclusions, public-boundary verification (3,347 tracked paths / 1,902 scanned
entries) and Farcaster integrity. The /ptr/ payload contains 445 files /
134,453,821 bytes; its manifest SHA-256 is
188cdb42c41309199ca6faa357d3e25809c889fe2bddd1c2aa78ceaf2c15b1ec and content
manifest SHA-256 is 1121505aef6c8beb8a03d67298d1be0912c4adefcee6dc6c7beeb6f5311f44fd.
The read-only mirror plan against Warpkeep-Live@b6afe92e7b09197b1578d992103ac3c8f916d8ad
preserves 341 Alpha-root entries (manifest SHA-256
7699d03b70c901e4fb8453b8b515af03376d398bf79e9eabea1c85f6e303c3ef), targets
799 files, removes zero obsolete generated paths and has SHA-256
a848eccfa559e74082c3198747b0e38f40a60a4f7cc2b7300fd523cf36686bdc. The
exact-head sealed-launch preparation reports Pages approval false, package
0.3.43, live identities unset and PTR presentation disabled. Latest bounded
HTTP GETs returned 200 for the Alpha root and 404 for /ptr/. No deployment or
provider mutation occurred. Regenerate the ignored receipts after this
documentation checkpoint.

## Current checkpoint — 27 September 2026

The last validated operational main at this checkpoint is signed generated-only
M2 [`786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32`](https://github.com/ael-dev3/Warpkeep/commit/786c0b2be6f2d2e7eb2de02ef3b6826c8907fc32)
from [PR #373](https://github.com/ael-dev3/Warpkeep/pull/373). Its exact-main
[Verify 36294403406](https://github.com/ael-dev3/Warpkeep/actions/runs/36294403406),
[preflight 36297501189](https://github.com/ael-dev3/Warpkeep/actions/runs/36297501189)
and [G001 policy observation 36297585906](https://github.com/ael-dev3/Warpkeep/actions/runs/36297585906)
passed. [G001 census 36297722529](https://github.com/ael-dev3/Warpkeep/actions/runs/36297722529)
failed closed in its first sample with `g001-admitted-set-mismatch`; no
validated baseline or provider mutation followed. [G002 update inspect 36297899627](https://github.com/ael-dev3/Warpkeep/actions/runs/36297899627)
failed before provider transport. [PR #374](https://github.com/ael-dev3/Warpkeep/pull/374)
repairs both source paths. Require full final-head PR Verify, exact signed M1
merge, provider-free module build, native prepare/check, generated-only M2 and
successful exact-M2 push Verify before any fresh protected inspection. Recheck
live main immediately before dispatch; prior local evidence is source-bound and
not current operation authority. See the [current delivery gates](../../operations/0.4.0-live-delivery-status.md).

## Historical operating checkpoint — earlier 27 September 2026 (superseded)

Generated-only M2 [`007e62f2`](https://github.com/ael-dev3/Warpkeep/commit/007e62f2e5b7440abf483a83aeda2b9621f4054e)
had a failed exact-main Verify at the Linux root-test bound. The then-open
source repair [PR #372](https://github.com/ael-dev3/Warpkeep/pull/372)
initially had failed Verify jobs on head `67bc09c1`; later repairs passed and
merged. That earlier failure is not a standing gate for the present source.

## Historical exact-M2 operation checkpoint — 25 September 2026

Protected generated-only M2 is
[`edb37f4081de1b989a5137627494c1a2575411bb`](https://github.com/ael-dev3/Warpkeep/commit/edb37f4081de1b989a5137627494c1a2575411bb).
Its exact-main Verify, CodeQL, read-only preflight and policy observation
passed. G001 census runs 36087746335 and 36088300562 failed closed with
`g001-policy-budget-reservation`; neither produced a receipt or provider
mutation. Preserve both attempts and do not retry this M2.

Source M1 [PR #357](https://github.com/ael-dev3/Warpkeep/pull/357) repairs
read-only token budgeting while preserving reserved capacity for write-capable
sessions. The pinned Linux build and 14 focused files passed (419 passed,
1 skipped); its required protected checks must pass on the final PR head. Then
prepare and independently check the exact protected M1, and promote its
generated-only M2. Current run links and next steps are in the
[execution handoff](../../agent-notes/0.4.0/execution-handoff.md).

## Prior exact-M1 native prepare/check — 23 September 2026 (superseded)

Protected main `a4852b15902e5486496c17db20440532725f4170` (tree
`157c038cd99b5a53671e52920e4c433566f8bea7`) passed main CodeQL 35847251540
and exact push Verify 35847251543. After rechecking that live `main` had not
moved, the dedicated `WarpkeepRunner` Linux checkout was clean at that exact
source and its native `prepare` and independent rebuilding `check` both passed.

Both runs converged on candidate
`release-workspace-a83a78af7909ded6553b4a7a2a47d652`, source tree
`157c038cd99b5a53671e52920e4c433566f8bea7`, transaction
`cd9b21f404d7bd040fd29e20fba93802`, journal SHA-256
`da549ff1dc6b0c9a723fe40468e2396209bf34cdb0665f099d21e0da4dd9ce41`, family
SHA-256 `b1f13dce7efdaed1631d2dceee714d45c6e91ebdc94fc643ef302fc99135c199`,
closure-manifest SHA-256
`9ccd739d553fc24df0e5d2a954c90cb6227b3586703fc2a8b6718c6ce27e9172`, and
scanner-manifest SHA-256
`edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71`.
Each checked 3,257 source/candidate files, 102 generated outputs, 3,155
preserved source files, 624 compiled bundle inputs and 7 recovery inputs. The
candidate root is `/home/warpkeep/.warpkeep/release-preparation-v1/runs/release-workspace-a83a78af7909ded6553b4a7a2a47d652/candidate`.
Its preparation metadata remains in the existing owner-private run store. No
source was deployed or changed; `finalReleasePrepared:false` is explicit.

PR #344 later advanced protected main to the current generated-only M2. This
candidate remains valid only for `a4852b15`; it is not native preparation
evidence for the current source and is not deployment evidence.

## Historical M2 checkpoint — 22 September 2026 (superseded)

The previously verified protected main was generated-only M2
`8b4fa5ee08048878fa88973f3cd72900a1a1b84a`. Its PR Verify, CodeQL,
push-to-main Verify and read-only preflight passed. Authenticated read-only G001
policy observation `35772933637` failed closed on a valid older-source receipt
in the fixed no-clobber slot. It submitted no mutation; no player/census data
was read. Source-only recovery PR #337 then merged and all required PR checks
passed. Later PRs #341–#344 superseded this source and its next-step sequence.
The [current execution handoff](../../agent-notes/0.4.0/execution-handoff.md)
owns the active M2, failed policy runs, and next source-specific preparation.
Existing native preparation/check and M2 export evidence are private and do not
grant deployment authority.

## Resumption audit — 18 September 2026

Use the [execution handoff](../../agent-notes/0.4.0/execution-handoff.md) for the
dated checkout inventory, protected source, active branch and terminal checks.
Different published branches and a pinned native input are legitimate roles;
clean status alone is not proof of remote equality. Inspect the actual owning
ref after fetching it. Historical full-stack and synthetic results below remain
bound to their original source and platform, not every later main revision.
The sync automation remains paused, no private bytes are copied into this
repository or Desktop, and the existing Desktop handoffs are updated in place.
Private activation, G001 observation, PTR observer/readback, provider
deployment/recovery, owner play, device acceptance and final freeze remain
unresolved; this record is not deployment evidence.
## Historical committed-source native preparation and independent check — 2026-09-12

The dedicated Linux assembler completed both `prepare` and independent `check`
from exact source commit
`03cb8b8fc2c0c59bcb58c4303b2082dead6325d9`. Both lanes converged on candidate
`release-workspace-2d70e1808817fcf50990e5a4b84409b9`, source tree
`108ef93c482ceb86d4a0a72efd7f3e7e50f7291e`, transaction
`dbc484aea13d55eb1e994a5f13a640c9`, journal SHA-256
`48d71bdeb4540329299244d674101b0ed849e4682ee446d9dc42558d1628979b`, family
SHA-256 `841eb93123b88508d82febe883966722d0ffffe46c0cd84b36666a6ed4d2deee`,
closure manifest SHA-256
`689dc56ab6ae708958093b6c8ffb89dcb7fd4671de82261f1c3bdc77ed4a7f77`, and
scanner manifest SHA-256
`edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71`.
The run checked 3,193 source files and 3,193 candidate files, 102 generated
outputs, 3,091 preserved source files, 444 compiled bundle inputs and 7
recovery inputs. `finalReleasePrepared` remains `false`: this is fresh
current-source preparation and convergence evidence, not deployment or release
authorization.

## Previous source-bound native preparation and independent check — 2026-09-11

The dedicated Linux assembler completed both `prepare` and independent `check`
from exact source commit
`64690fc425640b8ea33388caa5a9c89485ea7ea3`. Both lanes converged on candidate
`release-workspace-f16740e2569ed2c63fb0378ad41ca912`, source tree
`6d6db937b545b645d2faddd780fc114087ab1fb9`, transaction
`4208aa73a506dab0c81d6fe404b5a444`, journal SHA-256
`faade55e2b5dbcc2d2523d3a421d08126427b56d081c6e0d72187920fcfe1eda`, family
SHA-256 `8c9575659038d0cd0e4c6fe8cb9db746af218f8ddad0bfba81b98630c06a40a6`,
closure manifest SHA-256
`a0b5892e45fd07f6e821afa826c02f9831dbd6e80b29f1541e4d3bbd2a7e90d0`, and
scanner manifest SHA-256
`edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71`.
The run checked 3,191 source files and 3,191 candidate files, 102 generated
outputs, 3,089 preserved source files, 444 compiled bundle inputs and 7
recovery inputs. `finalReleasePrepared` remains `false`: this is fresh
current-source preparation and convergence evidence, not deployment or release
authorization.

## Earlier source-bound native preparation and independent check — 2026-09-11

The earlier source-bound native pass after repairing WSL checkout ownership
drift completed both `prepare` and independent `check` from
`867c70d7f0d4721df59bdd59967412ba45f02b50`. Both lanes converged on candidate
`release-workspace-b800ee0ee30f970efe56fe6da4efa6fa`, source tree
`563bbbcca8a173f82d55f7f24514f6c8ddb2d1a1`, transaction
`9b8a2aedcef4df54a234e69b606ee7ab`, journal SHA-256
`f30d99e461b81a6b3e464e5e522e9797412eee2c3f90ba3ec11a246662b15bc6`, family
SHA-256 `9c822f12ad08ccde44dc63a26c89181e34091f3deaf4abb228094143067ce5a0`,
closure manifest SHA-256
`ba9640a0aa3660e65b649717cc1ce1f187a6924fdd847f59af7914c042c65d5d`, and
scanner manifest SHA-256
`edebf17145ef78a7ff921041dcc5b5916c94de10a522bd87dbe21461849e1e71`.
The run checked 3,186 source files and 3,186 candidate files, 101 generated
outputs, 3,085 preserved source files, 444 compiled bundle inputs and 7
recovery inputs. `finalReleasePrepared` remains `false`: this is current-source
preparation and convergence evidence, not deployment or release authorization.

The hidden `Warpkeep Runner Keepalive` task was manually started once after its
registration and the `WarpkeepRunner` guest remained available. This verifies
the task action can hold the guest open in the current session; it does not
prove pre-logon, sleep or reboot availability.

## Dedicated runner repair — 2026-09-10

At 21:20 UTC, systemd reported the `WarpkeepRunner` service enabled/active/running
and GitHub reported existing Linux runner ID 22 online/idle. The repair completed
the existing installation's missing service helper and marker, after verifying
the unit against its installed official template. The fixed Node 22.22.3 bytes,
account UID/GID 1000 and path modes were independently checked. Empty sealed
private directories were subsequently provisioned with checked descriptors,
no-follow opens, owner-only modes and directory fsync. No credential or receipt
was created or migrated, and no protected production job was dispatched.

The workflow audit also reproduced a real executable defect: the G001 policy
operation failed CLI parsing despite being selected by the workflow. A regression
test failed at `phase: input` before the parser was repaired to share the dispatch
map. The executable now requires host attestation for that operation. See the
[runner guide](../../operations/0.4.0-linux-runner.md) for the precise operating
profile and remaining authenticated recovery composition.

Verification for this repair: pinned Windows Node 22.22.3 ran the four focused
operation/preflight/dispatch/workflow suites with 43 passing and 66 skipped
platform/fixture cases. Focused strict test types passed. The actual installed
Linux Node separately passed nine fresh-process CLI boundary checks with no
runner environment: all four supported operations stopped at host attestation,
and five unsupported/prototype names stopped at input. These do not execute a
privileged prepared operation. A direct Windows prepared-closure invocation
refused the unsupported POSIX repository boundary; no fresh full native closure
acceptance is claimed for this repair.

At approximately 21:30 UTC, a final availability check found `WarpkeepRunner`
stopped after interactive commands exited; GitHub consequently reported offline.
The enabled service restarted successfully when the guest reopened. A hidden
Windows WSL process now holds this exact guest open for the current session, and
the registered per-user `Warpkeep Runner Keepalive` task repeats that hold at
interactive logon. This does not establish availability before logon or after
Windows sleep. The [runner guide](../../operations/0.4.0-linux-runner.md)
includes the task details, idempotent manual command and limits.

## Native release assembler — 2026-09-11

The final marker-safe pass prepared and independently checked candidate
`release-workspace-342ea5448bfeb9bdf9dc51c7e31b67e4` from source tree
`5def926b9ad4f4cd940742a67bb5335f6b21a1ef`. Its family digest is
`c632804d2990d8f18c7bbf5405775a245139ddddc8fa5a99c01a44a5b69e10df` and its
closure manifest digest is
`0013fc94514cf623b829138d2fe2ed1564dc90498ce84e8cd516bd9aac7dd07b`.
The pass checked 3,181 source/candidate files, 101 generated outputs, 444
compiled bundle inputs and 7 recovery inputs. The closure verifier passed 1,195
members; the public-boundary verifier passed; and the activation artifact had
zero private marker tokens. This is still preparation evidence, not a release
grant.

The earlier functional source-bound checkpoint `22a834e6d7d0106e5d6cfd535a90692bdfe17ff5`
was prepared and independently checked again from the native checkout. Both
lanes returned candidate `release-workspace-328713ba2532b2dcef3815d7e9d7daa2`,
source tree `cec3750ef8a363b55b7f71cd55c0522e160be3a7`, family digest
`c9cf06c09bdd7c52869ecb6b06d091bc912141fae8277c4ad3f963edf43850d8`, closure
manifest digest `445e5f7131ba85dbbe89edb4b28abff39a9d584f73118fbe3ec35d051908320a`,
and transaction `58393eda2cb2d4b7c7226f972f5bd1cc`. They checked 3,181 source
files, 3,181 candidate files, 101 generated outputs, 444 compiled bundle
inputs and 7 recovery inputs. `finalReleasePrepared` remains false. Generated
protected-family refreeze `b8a6c5ab811f8ef6b2cf916d1446336428606823` passes the
native 1,195-member closure verifier. Later branch commits after this
functional checkpoint change documentation only and must not be treated as
native release candidates without a fresh source identity check.

After the closure refreeze, the synchronized native checkout completed both
release-assembler lanes at `c0e30a37` (`8bc06b320f3cddd53225e5d81b1e5965147e399b`):

- `prepare` created candidate `release-workspace-3f372602a3f664b8f5aa5931b28c3244`
  and wrote its owner-private prepared-source marker.
- Independent `check` rebuilt the family from a fresh draft and returned the
  same candidate transaction and digests.
- Both lanes checked 3,181 source files, 3,181 candidate files, 101 generated
  outputs, 444 compiled bundle inputs and 7 recovery inputs.
- The closure verifier passed at 1,195 members. The manifest was generated from
  Linux checkout bytes after the Windows CRLF discrepancy was identified.

This closes local native preparation and restart-safe candidate verification.
It does not establish GitHub protected workflow completion, recovery-service
deployment/readback, live Cloudflare or SpacetimeDB authority, owner admission,
physical-device performance, or final release approval.

## Historical connected rerun — 2026-09-10

Against synchronized head `5b9ba9657d6e66319f41aabd396faf2a6c947b29`,
`npm run qa:fullstack:local` passed. The run covered the title-gateway
departure/focus matrix, exact-current Terms continuity, authoritative Inner
Keep City Mill start/completion and discounted Lumber Camp start, hard-reload
persistence, fresh-browser four-phase Worker re-entry, delayed/failing private
reads with in-place recovery, timeout/missing/torn/visibility seams, the
canonical browser realm, four-worker Gold/Food/Wood/Stone dispatch, individual
recall, Recall All, automatic settlement, return completion and released-node
reuse. The visual aggregate recorded 39 colour buckets, luminance range 178,
zero clipped black/white samples, and both cool high-albedo and warm low-green
sample families. This is disposable local synthetic evidence; it does not
establish physical-device performance, an authenticated owner journey or live
deployment acceptance.

## Windows connected full-stack QA — current source 2026-09-10

The latest recorded run came from synchronized checkout (`f5378daf`, functional
source `211b0b1a`); the published branch has since advanced to
`5b9ba9657d6e66319f41aabd396faf2a6c947b29`. `npm run qa:fullstack:local` passed
at that recorded source. The run repeated the title gateway
departure/focus matrix, restored Terms continuity, authoritative Inner Keep
start/completion and discounted construction, hard-reload persistence,
fresh-browser four-phase Worker re-entry, private-read retry seams,
timeout/missing/torn/visibility cases, four-worker Gold/Food/Wood/Stone
dispatch, individual recall, Recall All, automatic settlement, return
completion and released-node reuse. The visual aggregate again contained cool
high-albedo and warm low-green samples with zero clipped black or white
samples. This is synthetic desktop browser/runtime evidence; it does not
establish physical-phone performance, authenticated owner play or production
delivery.

## Windows connected full-stack QA — 2026-09-10

From the synchronized checkout (`e9f79984`, functional source checkpoint
`1c214e7f`), `npm run qa:fullstack:local` passed. The run covered the title
gateway departure/focus matrix (9 cases, 973 frames), restored Terms continuity,
authoritative Inner Keep City Mill start/completion, discounted Lumber Camp start
with one Builder, hard-reload persistence, fresh-browser four-phase Worker
re-entry, delayed/failing private reads, timeout/missing/torn/visibility seams,
four-worker Gold/Food/Wood/Stone dispatch, individual recall, Recall All,
automatic settlement, return-completion lifecycle and released-node reuse.
The visual aggregate contained 651 samples, 151 cool high-albedo samples and
150 warm low-green samples, with zero clipped black or white samples. This is
synthetic desktop browser/runtime evidence; it does not establish physical-phone
performance, authenticated owner play or production delivery.

## Windows Inner Keep browser QA — 2026-09-10

From the synchronized branch tip (`a3ef1822`, functional source `211b0b1a`),
`npm run qa:inner-keep` passed all 18 synthetic cases. The lane exercised the
single-renderer lifecycle, construction and completion states, schematic
fallback, responsive layouts and browser teardown. It is current Windows
browser evidence for the mobile visual foundation; it does not establish
physical-phone frame pacing, thermal behavior or authenticated owner acceptance.

## Repository-wide test host boundary — 2026-09-10

The focused 0.4 presentation suites, `npm run typecheck`, production build and
`npm run verify:visual-foundation` pass on the synchronized Windows checkout.
The repository-wide `npm test` command was also sampled after the `211b0b1a`
Worker presentation change, but it does not complete green on this host: its
failures cluster in protected operator, private-publication and signal/lifecycle
fixtures that require Unix permission and process-group semantics. Those suites
are covered by the dedicated Linux/CI rails; this Windows result is a host
capability boundary rather than a failed Keep04 assertion. Rerun the full suite
in the supported Linux runner before release evidence is sealed.

## Rendered WebGL host boundary — 2026-09-11

The generic `npm run qa:rendered-webgl` lane now has a portable browser
contract. macOS keeps the reviewed Google application `codesign` attestation;
Windows uses the fixed installed Chrome executable with stable file identity and
process-tree teardown; Linux accepts only the fixed reviewed candidates or the
absolute `WARPKEEP_QA_CHROME` override. The pinned historical castle source
archive also uses the reviewed Windows `tar.exe` adapter, so the full fixture
lane no longer stops at a macOS-only path or POSIX cache-directory check.

On this Windows checkout the browser contract suite, archive extraction and
`npm run qa:inner-keep` pass. The full rendered matrix reaches the real Realm
fixture but remains red on a Windows Chrome runtime exception during the
`desktop-high` case; no rendered-release evidence is claimed from that run.
Rerun the matrix on the supported Linux runner and retain the exact failure
category if it reproduces. This is an open QA gate, not a release approval.

## Windows preparation verifier — 2026-09-10

The published branch tip was cloned into a fresh Windows checkout with
`core.autocrlf=false` and verified with:

```sh
node scripts/verify-0.4.0-sealed-launch.mjs --phase=preparation
```

The verifier returned the checked-in sealed-launch profile with
`phase=preparation`, `packageVersion=0.3.43`, and `pagesDeploymentApproved=false`.
The exact policy-observation shell envelope used `bash.exe -n`, and the local
Git history adapter used `git.exe`; both preserve the existing fail-closed,
no-config checks. This closes the Windows host-command defect without changing
the production envelope or any realm state. The full Windows verifier suite
passed 166 tests; one symlink-only fixture is skipped because this host does not
permit creating symlinks. This is local preparation evidence, not deployment,
owner acceptance, physical-device, or live 0.4 evidence.

## Windows rendered QA profile cleanup — 2026-09-10

The current Windows browser probe initially reached its full scenario set but
failed while removing the disposable Chrome profile because Chromium still held
`first_party_sets.db`. The reviewed headless launch contracts now disable the
First Party Sets feature and the shared teardown removes transiently locked
profiles with a bounded retry for `EBUSY`, `EPERM` and `EACCES`; persistent
failures still fail closed. The rerun completed all 18 synthetic Inner Keep
cases and removed its disposable profile. This changes QA teardown reliability
only; it is not phone performance, owner gameplay or live-release evidence.

## Historical local execution checkpoint — 2026-09-09

The Windows/GitHub source head and the dedicated Linux checkout now match
`206c03683c9039b513b878d7b0d3c6770eda2626` with source tree
`ebc91c6cc7bf205de22e331d127b1f2f7b8ba5da`. The pinned WarpkeepRunner Ubuntu
24.04 guest executed the current native materializer/child path successfully;
the operation-bundle runtime produced activation, G001, G002 and PTR lanes.
The program-artifact path also completed for both frozen G001 and current G002
modules, and the all-realms binding run completed without an error.

The compact all-realms result is retained in the local runner at
`/home/warpkeep/warpkeep-all-realms-206c036.json` and records:

| Lane | Result identity |
| --- | --- |
| G001 current | bundle `7811ce8485cb101e9bd864ca801ade3823353389832921554c757a847d8cf48a`; closure `fcc9b32282ff947da96738a15735aa809919f9229e2861d9a53cb0c98acb6e62`; 180 binding files |
| G001 frozen compatibility | bundle `a2d7f204ed591aadb98696225d68332ee573519187e0989e68f528da8064cd49`; descriptor `cf3cbfff9087c04bd9de553410adb49100c40dbdecebc59e265f83cb904dd04d` |
| G002 | bundle `0037a0979a460aea8607a36fccd649d4311046925faeb3d8186276ac0a6ccbd3`; closure `3135e65b47acf95b174adcf10d9453955afabde9f122382a0166b0a9d5bc26d5`; 50 bindings |
| PTR | bundle `0c8b531995779dc5102ece40e7b4d54ffc4af4809f3873b5231716795ee1e5bf`; closure `acd9fe64d963d38715183a0451e6cc21b25abbfed5092c787d7e01842ab91901`; 25 bindings |

The retained program-artifact manifest records G001 frozen bytes as SHA-256
`a2d7f204ed591aadb98696225d68332ee573519187e0989e68f528da8064cd49` and
Keccak-256 `70fe690512101acc1f63c9d2879cf4ee324e5a0a6df6dc0ad2feef6dc769858f`
(3,439,766 bytes), and G002 current bytes as SHA-256
`0037a0979a460aea8607a36fccd649d4311046925faeb3d8186276ac0a6ccbd3` and
Keccak-256 `0ec47634134fa4b0cdd8f55c8c04c1c002ed46c26676973ca7d4db3d0af4c786`
(3,648,993 bytes).

The separate program-artifact record uses Node 24.19.0 for frozen G001 and
Node 22.22.3 for current G002, with artifact SHA-256/Keccak provenance retained
in the runner output. This closes the local native execution gap for the
assembled artifact. It does not prove provider deployment, live owner admission,
physical-device acceptance, or the remaining R11–R13 production gates.

## GitHub runner gap

Command: `gh api repos/ael-dev3/Warpkeep/actions/runners` with output restricted
to runner identifiers, labels and status (no tokens).

Only one runner was returned: id21, `warpkeep-production-runner-01`, macOS,
offline, not busy. Labels: self-hosted, macOS, ARM64,
warpkeep-production-admin, warpkeep-repository-exclusive.
No local Windows/Linux repository runner is registered in this inventory.
Do not restart or rely on this Mac: the owner excluded it from the release path.

Current checkout workflow dependencies found:

| Workflow | macOS-dependent locations |
| --- | --- |
| `.github/workflows/verify.yml` | native contract job at328 and OS assertion at340 |
| `.github/workflows/sealed-realms-production.yml` | production runner labels at48–53 |
| `.github/workflows/deploy-pages.yml` | production runner labels at452 and627 |
| `.github/workflows/notification-bridge-b0.yml` | runner labels at24 |
| `.github/workflows/notification-bridge-prepared.yml` | runner labels at32 |

These are source migration points, not permission to replace macOS labels alone:
toolchain, identity, workflow provenance, private state, and deployment checks must
agree with the actual supported local runner. Keep unprivileged verification
separate from production credentials. No runner registration/token creation,
workflow dispatch or provider write was performed during this inventory.

## Hosting and environment observations

`gh api repos/ael-dev3/Warpkeep/pages` confirms workflow-based GitHub Pages,
custom domain warpkeep.com, URL https://warpkeep.com/, HTTPS enforced.
Returned Pages status was null; it does not prove live health or version.

`gh api repos/ael-dev3/Warpkeep/environments` returned:
- github-pages: custom deployment branch policy.
- notification-bridge-b0: protected-branches deployment policy.
- notification-bridge-prepared: protected-branches deployment policy.

Only branch-policy protection rules were shown by this response. Do not infer
that repository branch protections or other deployment constraints are absent.
Preserve applicable protections and revalidate before deployment.

## Remaining acceptance

### Cloudflare authenticated CLI recheck — 2026-09-06

Repo-local Wrangler `services/auth-bridge/node_modules/wrangler/bin/wrangler.js`
reports 4.110.0 under pinned Windows Node 22.22.3. No installation performed.
Default `whoami` in the isolated checkout selects account
`48862210185b802e4244417031acb51b`, **not Warpkeep production**.

`auth list` shows existing profile `warpkeep-production`, bound to the sibling
`Warpkeep` checkout. `whoami --profile` is rejected by this installed CLI;
`whoami --cwd` pointing at that existing bound checkout confirms account
`c647739b4535010b0b13e6fc296e2c4e`, OAuth authentication and Workers write scopes.
No profile activation/global credential change was made and no token was printed.

Successful authenticated read:
`deployments list --profile warpkeep-production --name warpkeep-auth-bridge --json`.
The newest returned deployment by created_on is
`ec7c0f41-1404-40f8-9330-3c531afae621`, created
2026-08-28T07:54:39.545445Z, with version
`79dfceec-9810-4868-afca-5b794d08a9a5` at 100 percent. Its annotation names B0
source `308f901d91a1fb68d90f157a2ec164ed1acaf51d`; that annotation is not independent
source-byte attestation. Route binding, deployed bytes/config and live protocol
checks remain required. This demonstrates real provider interaction, not a
deployment attempt or proof of every required permission.

All later Cloudflare operations from this isolated checkout must explicitly use
the correct existing production profile and recheck the target. Never infer the
default account is production. Installed-command help and the
[Wrangler command reference](https://developers.cloudflare.com/workers/wrangler/commands/)
were consulted for this read-only check.

Public discovery and JWKS reads also succeed on 2026-09-06 using curl with
15-second timeout, no redirects and 65536-byte size limit. Discovery at
`https://auth.warpkeep.com/.well-known/openid-configuration` names that exact
issuer and `https://auth.warpkeep.com/.well-known/jwks.json`, with ES256 support.
JWKS advertises `kid=warpkeep-alpha-2026-07-01`, EC/P-256, ES256, use=sig.
These are reachable public metadata endpoints, not a verified token signature,
owner login, private-key possession, or proof of PTR-specific JWT/database claims.

### SpacetimeDB authenticated CLI recheck — 2026-09-06

Installed Windows CLI at
`%LOCALAPPDATA%/Programs/SpacetimeDB/2.6.1/spacetime.exe` reports 2.6.1,
commit `052c83fe984a4c4eb7bb4f9afa5c6b1903891d87`.
`login show` (without `--token`) confirms the recorded publisher identity.
`server ping maincloud` succeeds for https://maincloud.spacetimedb.com.
`list --server maincloud --yes` authenticates and returns these Warpkeep mappings:

| Database | Immutable identity |
| --- | --- |
| warpkeep | c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e |
| warpkeep-genesis-002 | c2003223f6e3c86e988775ddd458c3a45635d0d021e11131551471617c392194 |
| warpkeep-ptr | c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e |

`describe --server maincloud --no-config --yes --json warpkeep-ptr` succeeds;
schema metadata returns 24 tables, 10 reducers and 7 miscellaneous exports.
No table rows, signing keys or auth tokens were requested or printed. The CLI
warns these commands are unstable; record the version with evidence.

This proves configured CLI authentication, endpoint reachability, associated
database identities and a schema read. It does not prove current owner gameplay
admission, deployed module digest, receipt authority, row-read permissions or
successful production mutation. Do not use schema counts as a module hash or
as evidence that 0.4 gameplay is deployed. No database mutation occurred.

### Recorded frontend deployment candidate

Authenticated read on 2026-09-06:
`gh api 'repos/ael-dev3/Warpkeep/deployments?environment=github-pages&per_page=3'`
returned latest listed deployment `6104429969`, created 2026-08-26T13:07:39Z,
ref `main`, source `f39d57c8622077e6543a16e5610d0e4ec73910da`.
`gh api repos/ael-dev3/Warpkeep/deployments/6104429969/statuses`
returned success status `17361302492` at 2026-08-26T13:08:35Z for
https://warpkeep.com/, linked to Actions run `32970007073`, job `98188899707`.

This is provider-recorded deployment history, not proof of currently served
bytes, the frontend version, or a complete G001 baseline. Before mutation,
bind the live frontend bytes/artifact identity to the deployment and separately
capture service/module identities and the private admitted-player baseline.
No production changes were made by these reads.

Follow-up authenticated reads of `actions/runs/32970007073` and its `/artifacts`
endpoint bind that deployment history to completed/successful `Deploy GitHub
Pages`, workflow `.github/workflows/deploy-pages.yml`, event `workflow_run`,
attempt 1, the same source SHA, and one `github-pages` artifact:

- Artifact ID: `9608080344`.
- Size: `78449586` bytes.
- Provider digest: `sha256:bc4f3c14c398b2263b7dca233b378c82f5b931c82e35f81a3baa92a700fbf715`.
- Created: 2026-08-26T13:07:36Z; expired: 2026-08-27T13:07:33Z.
- API explicitly reports `expired: true` on 2026-09-06.

The expired artifact metadata is historical provenance only. Its bytes have not
been recovered or verified, and it is not an available rollback package. Do not
claim that a fresh rebuild reproduces this archive digest without comparing
actual bytes. Establish the served-byte baseline and a tested forward-compatible
recovery artifact independently before production mutation; preserve live player
writes throughout recovery.

Public live HEAD check at response Date 2026-09-06T15:20:22Z:
`curl.exe --head --silent --show-error --max-time 15 --max-redirs 0 https://warpkeep.com/`
returned HTTP 200, GitHub.com server, HTML UTF-8, Content-Length 5351,
Last-Modified 2026-08-26T13:08:19Z, and ETag `"6a8ee543-14e7"`.
This confirms a reachable frontend response and is temporally consistent with
the recorded deployment. The ETag is not a SHA-256 digest; HEAD does not verify
body bytes, loaded assets, application health, or source identity. Do not use it
as an artifact hash or mark the G001 preservation gate complete.

Follow-up bounded GET (System.Net.Http.HttpClient, redirects disabled, 15-second
timeout, 65536-byte maximum response buffer) at response Date
2026-09-06T15:22:27Z returned 5351 bytes, HTTP 200, same ETag, final URL
https://warpkeep.com/. SHA-256 of the raw response bytes:
`e8139922fac3619edff5cbece46a3d9516b75b2b26801935068459502b57d061`.
The fetched HTML references `/assets/application-CJkabyye.js` and
`/assets/application-BRbFA04E.css`; those names are observations, not verified
content digests. This records the served entry-document identity only. Transitive
assets, exact source binding and full application/realm health remain unverified.

R11/R12 remain incomplete: supported local runner/execution setup, source workflow
migration, complete local release execution, genuine workflow/OIDC evidence where
required, and isolated recovery verification. Cloudflare and SpacetimeDB targeting
need separate fresh authenticated checks. Frontend setting verification alone
does not satisfy the complete hosting or live-release gates.
