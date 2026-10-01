# Local operations evidence

Dated local and authenticated inventory. **Not deployment evidence.**

## M1 native preparation and M2 publication — 1 October 2026

Signed source-only M1 `acbb51285485d918ae861db4bc18046e32378951`, tree
`3fab7749ce35a2904b57194b3de42340bfce9710`, merged PR #374 at 11:08:48 UTC.
The reviewed head `6e9f50bf` had all 17 jobs pass in
[Verify 36847966470](https://github.com/ael-dev3/Warpkeep/actions/runs/36847966470).
Actual-M1 push-main Verify 36853528379 passed all 17 jobs at 12:10:56 UTC;
Pages 36860066242 classified successfully and skipped all six downstream jobs.
Retain `artifacts/qa/october-m1-acbb-workflow-terminal-summary.json` and
`artifacts/qa/october-release-m1-integration.json`; reviewed-head CI and actual
M1 native preparation retain their distinct commit identities.

Actual-M1 native prepare/check ran at 11:15:57–11:49:09 UTC with identical
19-field results. Its authenticated export covers 102 outputs; exactly 11 paths
change, producing tree `d2ce0e6d34f4fe37fc65130ecc4342be68368e7b`.
Retain the private phase receipts and
`artifacts/qa/october-release-acbb5128-independent-export-review.json`.

The first receiver applied exactly the authenticated 11-path delta but rejected
normal-index physical identity. The cause remains unestablished; a separate small
text/binary probe did not reproduce it. Reconciliation removed exactly the owned
effects and verified full M1 raw bytes and the logical M1 index. It did not claim
restoration of the original raw index identity. A fresh receive used an
authenticated temporary index for plain working-tree apply/check, verified its
unchanged logical M1 tree and the new normal-index baseline, and succeeded at
12:18:41 UTC. Head, nonoutputs and all authenticated outputs were checked.
Retain `october-release-acbb5128-receive-failed-effects.json`,
`october-release-acbb5128-receive-reconciled.json` and
`october-release-acbb5128-received-isolated.json` under `artifacts/qa/`; isolation
is containment, not proof of the original cause.

Signed M2 `5ecd17c0f091418c52f101eaca5964b0c45517bb` is a direct child of M1
with that generated tree. Checked-in sealed-launch verification, prepared bridge
policy and 190 affected local tests pass at M2; retain
`october-release-m2-validation.json` and its referenced logs. Signed publication
opened [PR #379](https://github.com/ael-dev3/Warpkeep/pull/379) at 12:34:13 UTC;
retain `october-release-m2-publication.json`.
[Verify 36862649149](https://github.com/ael-dev3/Warpkeep/actions/runs/36862649149)
currently fails the same 45 historical Darwin-fixture cases in two jobs. Local
fixture repair passed locally; this does not establish a new runtime bug. No repaired
head CI pass, M2 integration, provider write or live 0.4 acceptance is claimed.

The isolated synthetic four-file runner reproduced exactly 45 failures and 215
passes before repair. The same command with the reviewed Dispatcher fixture
completed at 13:03:28.313 UTC, exit 0: 260 passed, zero failed and one unchanged
unsupported-runtime skip. The fixture now authenticates current compiler M1
independently of the original Darwin inputs at `5d175edf` / `e7f36c6c`, with exact
Git blobs, SHA-256 and envelope length. Production pins remain unchanged. Evidence
is scoped to `5ecd17c0` plus test-file SHA-256
`d0501e63c2c364bc1a9872e4fca1099a3db27434226dd29da4b27b216a261689`.
Both actual test groups were absent at 13:05:41 UTC. HEAD/index stayed unchanged;
all other tracked bytes/modes/owners matched M2. Retain
`artifacts/qa/october-release-5ecd-darwin-fixture-summary.json`, SHA-256
`13079712219c080db15f68992ab52c6418938a6f3e2051d3a7ad2f6f3552b5de`,
its before/after logs and terminal readback. This local result does not relabel
the failed hosted source as a pass.

The six current note paths and `tests/sealedRealmsProductionDispatcher.test.ts`
have no membership in the received prepared-deploy closure, sealed production
graph manifest or recovery compiler-input manifest. Their respective SHA-256s
are `985a033d5020e3421418071295f93d807a4722317e376b2b3cbbe73ca7f4f05d`,
`764e796fd4337d40705b2587f4d14b325bbc04dc9ca40e548d888c4a44e1c296`
and `b520784d091dad1caa3d28e2ef452189008c3747a6276ec6820b4050d95ca8ca`.
Recheck this against the final checkpoint diff. Excluded-only repairs preserve
M1 compiler ancestry and need no new assembler cycle. The
[current handoff](../../agent-notes/0.4.0/execution-handoff.md#operating-source-and-signer-component-route)
defines the planned frozen-S/separate-F/direct-child-A sequence. Genuine fixture
outputs, full signer promotion and activation have not yet been proved. Alpha
remains 0.3.43; owner PTR, full production R06 and actual-owner/device acceptance
remain open.

## Patched pnpm runtime and current Linux snapshot — 1 October 2026

Earlier source-bound checkpoint, superseded for the next action by the M1/M2
record above. Its retained failures, repairs and source scopes remain evidence.

The published repair `7be8ae48` starts normal PR Verify
[36841020942](https://github.com/ael-dev3/Warpkeep/actions/runs/36841020942),
attempt 1. Its Linux scanner and full-history native-contract jobs pass;
the two original blockers are exercised successfully. The recovery job finishes
failed at 09:12:10 UTC with 1,498 passes and one stale Pages-toolchain assertion
across 49 files. The precise service test now expects CLI 11.11.0 and the explicit
no-switch command: its selected case fails before and passes after, with 353
unselected cases. Retain `october-recovery-pages-focused-summary.json`.

Root shard 4 finishes failed at 09:19:58 UTC with 2,572 passes and one
post-gate SIGKILL fixture timeout. The fixture announces its identity before
releasing the gate; killing immediately can legitimately leave it pre-gate.
The test now observes durable gate consumption and the live group before
killing its parent, then retains both ambiguity-denial checks and verifies the
same surviving group. No publisher runtime, fixture, timeout or skip changes.
The unmodified selected case passes locally; the retained hosted failure is
the before evidence. The patched full native file passes 67/67; owned actors
and groups are absent and the original clean native source is restored.
Retain `october-postgate-summary.json` with its exact report hashes.

That hosted run also shows the v6.0.9 Actions installer first installing its
older 11.7 seed before switching to the requested CLI 11.11.0. The reviewed
[official v6.0.10 release](https://github.com/pnpm/action-setup/releases/tag/v6.0.10),
verified commit `0977fd99725f1db4007ccb2928dbb4e90d06cc86`, replaces all nine
current CI/Pages installer pins. Its integrity-pinned pnpm and standalone seeds
are 11.19.0; the bundled implementation matches those locks. Explicit requested
CLI 11.11.0, no-switch settings, historical declarations and fixtures stay fixed.
The changed cache-restore branch is inactive for these consumers. The official
exact-version advisory query returns no published matches; no absolute security
guarantee or exploitation claim follows. Retain
`october-action-setup-v6010-audit.json`. Focused Windows caller checks pass
36 cases, zero failures and 39 platform skips across three files. At signed
`a9878234`, tree `78b95888`, the complete 16-output family independently
reproduces with manifest `c64fe8b750e8d67bb551137991fb440568349c74cdddaeb34af1cc91f6f939d5`.
Native policy and seven affected files pass 160 cases, zero failures and three
Darwin/ARM64 skips. The selected Pages and service caller each pass separately;
their 163 and 353 unselected cases remain outside that evidence. All actual
children exit 0 at unchanged clean UID-1000/Node-22.22.3 input. Retain the
`october-pnpm1111-native-*-a9878234-*` source/identity/terminal records.
One coherent publication follows the current hosted run's terminal result;
no final-head hosted pass is claimed.

The credential-free temporary install workspace is removed at 09:47:34 UTC,
after exact contained-path/ownership and absent owned PID/group checks. Its
1,240,421,465 logical regular-file bytes are removed; no physical free-space
measurement is claimed. The candidate, raw receipts, private patched runtime
and actual release cache remain intact. Retain `october-pnpm-shadow-cleanup.json`.

Official GitHub advisory metadata retained in
`artifacts/qa/october-pnpm-11.7-advisories.json` identifies four high-severity
advisories affecting pnpm 11.7.0. Three first require 11.11.0:
[virtual-store path traversal](https://github.com/advisories/GHSA-c59q-g84q-2gj5),
[tarball manifest path traversal](https://github.com/advisories/GHSA-vq4v-j7r6-jq4m)
and [proxy-setting environment disclosure](https://github.com/advisories/GHSA-vx52-2968-3vc6).
The [configDependencies path traversal](https://github.com/advisories/GHSA-qrv3-253h-g69c)
first requires 11.8.0. This is package-manager maintenance evidence;
dependency audits alone did not establish that the CLI itself was unaffected.
No exploitation or provider compromise is demonstrated.

At 08:22:04 UTC, the native UID-1000/Node-22.22.3 readback verifies a separate
official pnpm 11.11.0 installation, retaining the original 11.7 tool and cache.
Registry integrity and archive SHA-256
`85ef2eff216a1ae90804c00c8dfbfa6685353644650d10906a893c05aedcd884`
bind the downloaded package. The private wrapper includes
`--pm-on-fail=ignore`. The reviewed
[runtime authority](../../../scripts/auth-bridge-notification-prepared-pnpm-linux-x64-v1.json)
has SHA-256 `2f74f205f1a6ddd54263d8eb6f362d92491f157177e3be8e518e85bb7e53a8ab`
and binds the wrapper, generic CJS entry, intermediate MJS launcher and actual
`dist/pnpm.mjs` implementation. The
[Linux workflow](../../../.github/workflows/notification-bridge-prepared-linux.yml)
checks regular-file ownership, single links, modes and all four hashes before
its isolated credential-free install; the
[runner](../../../scripts/auth-bridge-notification-prepared-linux-runner.mjs)
rechecks runtime hashes, exact source, closure, installed graph and policy
before workflow authority or provider work. Retain
`october-pnpm-native-runtime.json`; its 08:22 receipt predates the additional
launcher/implementation guards and is not a standalone receipt for those hops.
The independent 08:50:39 UTC native readback subsequently verifies all four
regular-file owners, single links, modes and exact hashes, plus wrapper version
11.11.0. Retain `october-pnpm-runtime-final-readback.json`; its child evidence
retains the original 08:38:32 execution time.

The actual credential-free shadow install at source `e5bccbdc` finishes
08:29:13.768 UTC, exit 0. It uses the patched wrapper and frozen-lockfile,
ignore-scripts and isolated-store options; `.modules.yaml` identifies actual
pnpm 11.11.0. The retained source/installed-graph declaration remains
`pnpm@11.7.0`. Raw source and installed lock both remain
`e1478d3eaaaf16505f4171f5c2570164f94a5abb17dcf592ed433c14ae524327`:
the prior Linux snapshot's `369a7a6d…` described an older graph, rather than a
lock rewritten by the patched CLI. The genuine derived
[Linux snapshot](../../../scripts/auth-bridge-notification-prepared-installed-toolchain-linux-x64-v1.json)
has SHA-256 `9fbdfc888b2df0d1c91d1e8f59e37a0690b39d50b95a535eb783714c533c6103`.
Its six changed fields are the lock digest, resolver entry/file counts,
resolver digest, total bytes and tree digest. Current Linux policy now matches
that lock and namespace; Darwin and historical compiler declarations stay
unchanged. Retain `october-pnpm-shadow-summary.json` and
`october-pnpm-installed-linux-candidate.json`.

An initial isolated direct-entry probe shows that
`npm_config_pm_on_fail=ignore` does not prevent automatic selection of the
retained older CLI. That first failed probe's raw log was not retained.
The corrected ordinary-CI environment is `pnpm_config_pm_on_fail=ignore`.
At 08:38:32.689 UTC, the direct official entry, without the private wrapper or
CLI no-switch flag, successfully executes a child reporting
`pnpm/11.11.0 npm/? node/v22.22.3 linux x64`; the shadow package descriptor is
restored byte-exact. This proves a `pnpm exec` child, not a `pnpm run` script
or hosted CI. Retain `october-pnpm-actual-child-summary.json` and
`october-pnpm-actual-child.log`. The separately retained
`october-pnpm-child-probe-deps-diagnostic.log` records a probe PATH/ENOENT
failure during automatic dependency checking, not the wrong-prefix failure
or an authentication/provider failure.

Independent raw-byte checks at `e5bccbdc` confirm all 31 tracked package
descriptors/locks/workspace files, seven retained compiler/bundle records and
three frozen G001 input objects are unchanged. The authored Linux snapshot is
an exact copy of the derived candidate and matches the current auth lock.
Retain `october-pnpm-installed-linux-independent.json`. Focused runtime
regressions improve from five passes/one failure to seven passes/zero failures
at their intermediate scope; retain `october-pnpm-linux-before.{json,log}`
and `october-pnpm-linux-after.{json,log}`. Syntax and diff checks pass.
At signed family checkpoint `9f13974e`, tree `d07a5020`, all 16 outputs
independently reproduce and native policy passes. The complete manifest is
`2cf75c0d2b23722b034a1fb5a611a3fb93a07070d94472a741af8c5e1efa0930`;
the generated Linux workflow pin now binds the actual snapshot `9fbdfc88…`.
Native affected checks finish at 08:56:45 UTC: 93 passed, zero failed across
six files, with three Darwin/ARM64-only historical-install cases skipped.
The separate Pages-ordering case passes at 08:56:51 UTC; its 163 unselected
cases are not executed evidence. Fixed Node 22.22.3/UID 1000 and the clean
source stay unchanged; both actual children exit 0 and are absent afterward.
Retain `october-pnpm1111-native-{callers,pages-order}-9f13974e-*`.
The expanded Windows Linux-workflow suite passes all eight cases at
08:58:52 UTC, using the same runtime/family source plus five documentation-only
edits. Retain `october-pnpm-linux-final-summary.json` and the exact linked
report/log hashes. These observations establish no final-head hosted Verify,
deployment, full R06 or owner/device acceptance.

## October validation repair and preparation — 1 October 2026

The first normal October PR Verify is
[36795398220](https://github.com/ael-dev3/Warpkeep/actions/runs/36795398220),
attempt 1, with PR head `974a3ae6` and base `786c0b2b`. The module job actually
checks out their CI merge `ef0b72a37956bd15540860a1ba908ac8b2a98cf8`;
its results must not be relabeled as tests of the later repaired source.
The run starts at 00:17:07 UTC and finishes failed at 01:19:44 UTC:
14 independent jobs succeed, two leaves fail and their aggregate fails.

The [Linux history scan](https://github.com/ael-dev3/Warpkeep/actions/runs/36795398220/job/110157556144)
finds only historical `9e07f475`'s public
`keep04-cathedral-roof-teal-v1` shader-program cache label in
`src/components/keep04/keep04CathedralRoofPalette.ts`. The label is not a
credential. The repair requires the exact rule, path and literal together;
same-path changed-value and copied/wrong-path examples remain mandatory
findings. Real Gitleaks 8.30.1 regression passes 49 allowed examples and
98 mandatory negatives; seven focused unit tests pass. The full retained
history at signed `b3c6a072` and complete outgoing `974a3ae6` → `271946c4`
range both finish with zero findings. Original failed logs remain intact.

The [native-contract collection](https://github.com/ael-dev3/Warpkeep/actions/runs/36795398220/job/110157555953)
cannot resolve genuine retained compiler input `5d175edf` from its shallow
checkout. Only this checkout changes to full history; compiler manifests,
original input identities and authentication remain unchanged. The native
Dispatcher passes all 90 cases with the real historical tree. Separate
workflow-boundary checks pass 35 cases with 39 Windows platform skips, then
all 74 cases across three actual files on native Linux at `271946c4`.

The [module job](https://github.com/ael-dev3/Warpkeep/actions/runs/36795398220/job/110157556183)
succeeds at 01:19:37 UTC. Its pure suite passes 598 cases with zero failures
or skips in 20m42.965s. Main/G002/PTR typechecks and builds, CLI 2.6.1
binding comparison, actual disposable G002 private loopback, worker/access
migration and all eight admission-rejection surfaces pass. Full additive
protocol-v18 migration takes 33m1.604s and succeeds; connected synthetic
import, relocation/rollback and active population also pass. Module dependency
audit reports no known vulnerabilities. The long run establishes no hang
or module timing failure. Saved module log is 307,974 bytes, SHA-256
`1ae5ec694a4b0035cf1bc285a3c2349714b404590b66439d1687f1f4aa2d62de`.

Signed repair `271946c447c4238653cdc4e9a0be86635d080447`, tree
`9a5b539b8c2199ee109887697ed0b7f772b22807`, completes exact native production
preparation at 00:42:01.872–00:46:38.831 UTC: exit 0, unchanged clean
UID-1000/Node-22.22.3 source and verified absent owned actor/group. Its complete
16-output/1,250-member family independently reproduces, with manifest
`0e0d9de130abda66e2cb17c4e5a753ab0b68aeb291a218085afaa315e71506cb`.
The payload manifest is
`443af894ac2282572bb0bae745337798d4dd07fbf63d70e165a3da61f6a88b9e`.
Independent raw-Git preservation against public parent `b6afe92e` retains
all 341 Alpha entries and removes none; plan is
`c1294aefbe4be0620472ad43fb839a0ffa55fd0952592bc201c5946952d03113`.
The exact signed repair is backed up on GitHub under
`source-history/warpkeep-0.4-october-validation-271946c4`; no duplicate
Actions run follows that tag. The complete refreshed inventory finishes at
01:22:11.841 UTC with no active runs in either repository.

These are scoped development and original-PR receipts. Require normal Verify
on the repaired final head, actual M1/M2 integration, supported source-bound
realm operations, activated-A publication and real-owner/device acceptance.
Neither local preparation nor this original failed run establishes a release.

## Completed keyboard readback and Keep lifecycle heap — 1 October 2026

At signed `789933e2`, tree `a157a78d`, all 16 family outputs / 1,250 members
independently reproduce and native policy passes. Manifest is
`53e470d8cd41565e7dea2998b7f5b8a57e1ff5e605e5fdeb4c8554eb95cd8c57`;
the only changed protected member is the reviewed modal focus hook. Exact
production preparation runs 2026-09-30T22:47:24.509Z with terminal readback at
22:52:25.880 UTC, exit 0, UID 1000/Node 22.22.3, unchanged clean source and absent
owned actor/group. Payload has 446 files / 139,001,703 bytes, SHA-256
`a2a26511240742221dc49f4e3d8d0574c4e19977d62e908c9908c31696e3304c`;
content is `faf0ad16ea033128feecd62a3ea07b9daf8f1394c624c8830d6640f1c81a2a61`
and HTML is `3033dd6e104e9001f4a9c380a3af82dda1e129410ba31ffbe7e57755fc1a51b4`.
Independent plan `9d9bf35453fb192b34ae52a6cc88f0b34f0677cf41c38fee1d1ed3828e22c799`
preserves all 341 Alpha entries, the same public parent/canonical digest,
800 target paths and zero removals. No public or provider mutation occurs.

Actual rebuilt 320×640 production inspection closes the demonstrated keyboard
visibility defect. Settings' Shift+Tab target Back occupies y=561.61–605.61
inside its y=16–624 panel; scrolling reaches 580.5px. Forward wrap reveals the
selected radio at y=310.06–327.66, scrollTop 4.5px, and reverse wrap reveals
Back again. Terms' Cancel occupies y=568.44–612.44 inside y=8–632, scrollTop
526.5px; forward wrap reveals Close at y=19.40–63.40 and scrollTop 0, and reverse
wrap reveals Cancel. Escape restores each correct caller. Terms stays unchecked;
document client/scroll widths both remain 320px. Screenshots and DOM are inspected
through Cua; no local screenshot path is invented. Retain
`tervain-modal-focus-after.json`. Exact owned preview is stopped/absent, the task
tab blank and viewport reset. No legal acceptance or owner login is performed.
The 124 affected caller tests and app types retain their separate repair scope;
the earlier full-suite source is not relabeled.

The frozen-native `8d3b4c38` DEV Keep-only lifecycle diagnostic completes
22:29:47–22:32:12 UTC. Actual signed Chrome 154.0.8037.58 / RTX 3080 Ti uses
390×844, 4× CPU and unshaped loopback; the in-page recorder stays off and raw
samples are retained outside the page. Each of balanced, reduced, reduced-motion
and fallback performs three warmups, then a baseline and 20 precise post-GC
samples: 24 mounts/disposals per mode. `HeapProfiler.collectGarbage` precedes
finite `Runtime.getHeapUsage` readings. All meet the established local comparison
limits of final ≤ baseline +8 MiB and fitted growth ≤0.25 MiB/cycle:

| Mode | Final minus warmed baseline | Fitted bytes/cycle |
| --- | ---: | ---: |
| Balanced | 1,426,400 B | 59,350.84 |
| Reduced | 1,396,264 B | 58,259.61 |
| Reduced motion | 1,410,696 B | 58,348.11 |
| Fallback | 286,056 B | 8,696.63 |

WebGL counts stay at 30 geometries / two textures. Three real
`WEBGL_lose_context` restoration cycles per WebGL mode preserve those counts;
fallback deliberately has no WebGL context. Every final disposal has zero
canvas, scene-owned RAF, active loader and listener. Observer-owned byte
estimates are not driver GPU-memory measurements. Root independently recomputes
all slopes/growth from raw samples and checks resources and cleanup. Receipt
`tervain-keep04-dev-heap-20260930T222947141Z-5340dda6-8445-44c9-a5e6-9c6df35b2cd1.json`
has SHA-256 `8ed60ec26e56b5e1cf574a308fbdc4c1d037febc5ce44bb3d7291f089272f45e`;
retain `tervain-keep04-dev-heap-independent.json`. This diagnostic does not close
production world/keep, realm re-entry, owner, device or full R06 acceptance.

The first complete heap attempt is retained. Its adapter closed the CDP pipe
immediately after Browser.close acknowledgement and recorded unverified normal
close/nonzero exit diagnostics despite independently confirmed OS cleanup.
The ignored adapter now waits for actual close before closing transport; the
controlled retry verifies all four normal exits 0, no forced close, all 32
recorded Chrome PIDs and four new owned profiles absent, native PID/process group
absent and port 4176 clear. Native source and browser executable remain stable.
The known DEV sandbox-script-origin-tokens diagnostic remains visible.

Fresh read-only provider inventory completes nine successful calls at
22:33:36–22:39:28 UTC. Node 22.22.3, Wrangler 4.110.0 and SpacetimeDB 2.6.1 are
verified. The documented production Cloudflare account/profile, QR-recovery
deployment and all three immutable realm targets match. The native private CLI
config is regular, single-link, UID:GID 1000:1000/mode 600; parent mode is 700.
The live PTR still lacks all seven required gameplay tables and five procedures.
That is the pending source-bound update; read authentication works and requires
no owner login action. Schema access does not establish update permission,
secret values or an owner row/session. Sanitized ignored receipts are
`ptr-provider-readiness-e2337099-summary.json` and `-metadata.json`; no player
rows, credential bytes, Actions requests or provider writes are collected.

## Final prepared source and keyboard visibility — 1 October 2026

This local checkpoint starts at 00:03 CEST on October 1, while UTC remains
September 30. The September Actions pause therefore remains in force until
00:00 UTC / 02:00 CEST; no Actions requests or provider writes are performed.

Signed source `8d3b4c38`, tree `b91995a6`, independently reproduces all 16
generated outputs / 1,250 members. Authored input `d2520f21` captures 3,355
tracked raw files matching Git bytes; closure manifest is
`c79498414f4cca4a055bb0fb6688fa9e97cff6b815c9a774d1f26bd8d8bb1cc7`.
Native policy passes. Exact production preparation starts at
2026-09-30T21:55:43.011Z and has terminal readback at 22:03:51.774 UTC:
exit 0, UID 1000/Node 22.22.3, unchanged clean source and absent owned actor
and process group. Build, types, asset/public boundary, Farcaster integrity,
license, file-size, sealed preparation, payload and mirror-plan checks pass.

The payload contains 446 files / 139,001,757 bytes; SHA-256 is
`7c277dacc6a70c59b93d75ac3b56dfa5edc5bd9a6a325fb5a256b2bcd8056fe3`,
content manifest is `3af7388d286b0cc1622f51cfdee238a66ac9f3b2ef998471820b54d3065cb914`
and HTML is `303a5b4270b7fd31b01d8feab686cf1ae73fa71d1ab0cdb27d882766a35997a3`.
Independent plan `644edab285d2f277273b5444e780c5479cca7a873d36edb42d782eb609854e10`
binds public parent `b6afe92e7b09197b1578d992103ac3c8f916d8ad`, preserving all
341 Alpha entries with the previously recorded canonical digest, 800 target
paths and zero removals. Current small `ptr-final-*` receipts are copied and
raw-byte verified in Windows; the earlier `1ab86add` preparation metadata is
retained separately. These are prepared development receipts, not M2 or deployment.

Actual `8d3b4c38` production review at 320×640 reproduces a keyboard defect in
the shared modal hook. Shift+Tab from Settings' initially focused heading
focuses Back at y=1,142–1,186 while the panel occupies y=16–624 and remains at
scrollTop 0. Terms similarly focuses Cancel at y=1,095–1,139 while its panel
occupies y=8–632. Both controls are entirely below the visible panel. DOM and
screenshots confirm the defect; no legal acceptance or authentication occurs.
The exact owned preview is stopped, the task tab blank and viewport reset.
`tervain-modal-focus-before.json` retains these actual observations separately
from the failing test report.

The minimal follow-up permits scrolling only for handled keyboard focus entry
and boundary wrapping. Initial heading focus, fallback focus and restoration
behavior stay unchanged. Both Settings/Terms caller regressions fail before
repair, then 76 menu/modal tests in five files and 48 shared Realm/worker/chat/
lyric caller tests in four files pass, zero failures/skips. App noEmit types
pass on Node 22.22.3. Retain `tervain-modal-focus-tests-before/after.*`,
`tervain-modal-focus-realm-tests.*` and `tervain-modal-focus-types.log`.
This follow-up is tested against the `8d3b4c38` base with only its hook/caller
changes; fresh committed-family/build and actual-browser visibility readback
remain necessary. The earlier full suite and image/performance receipts below
keep their original source scopes.

## Prepared menu, Settings and full-suite verification — 30 September 2026

Source `1ab86add`, tree `ee5804e3` independently reproduces all 16 generated family outputs;
native policy passes, with manifest `1003bb5d9a2cc94eef834803e72bbbad2010921d276af27d81c0a4c60e5ea274`.
The prepared production build's terminal readback is at 21:15:03.567 UTC, exit 0, clean
unchanged input and verified absent actor. Payload SHA-256 is
`dbb8bcf8709aee9e2cb56a0feabd61fd36081a380c357b09fd83a86b837e3379`;
HTML is `d4f72ece6a6844404b46a9456ecaa11469bb555fb163e01014e55f5944b77468`.
The independent mirror plan preserves all 341 Alpha entries with canonical
preservation SHA-256 `7699d03b70c901e4fb8453b8b515af03376d398bf79e9eabea1c85f6e303c3ef`.
These are prepared development receipts, not integrated M2 or provider writes.

The full pinned native suite runs 2026-09-30T21:25:17.987Z–2026-09-30T21:42:32.282Z, exit 0:
12,720 passed, zero failed, 97 skipped across 694 actual files.
UID 1000/Node 22.22.3, four workers, clean unchanged source, zero newly retained
fixture roots and zero historical removals. Actual source/handle/report/log/
summary/exit remain under ignored `artifacts/qa/tervain-final-root-*`.
Platform, privilege and opt-in skips do not become passes. Earlier full and
435-test selection receipts retain their original inputs.

The four production-menu captures at
`.cache/warpkeep-qa/title-transition/20260930T212421350Z-8288` pass direct
entry at desktop, phone, 320px and reduced-motion short landscape. Root inspected
all four exact saved PNGs; separate `tervain-production-menu-1ab-inspection.json`
preserves the original manifest. Castle/guardian readiness is measured;
optional scenery settlement and performance are outside image acceptance.

Actual rebuilt Settings inspection closes the reproduced horizontal clipping:
320×844 and 320×640 panels both measure 276px client/scroll width; all five
choice cards measure 239px client/scroll width. Landscape measures 724px and
desktop 734px client/scroll width, without internal horizontal overflow.
Descriptions and Standard badge are visible; narrow lower audio/Back controls
are reached by scrolling, and Back restores Settings focus. Cua images were
direct tool observations; no local screenshot path is invented. Retain
`tervain-settings-production-inspection.json`. The task tab is blank, viewport
reset and exact owned preview actor stopped/absent. Legal and owner acceptance
were not performed by this Settings-only review.

The fixed, ignored menu observer completes both fresh profiles in
`tervain-menu-performance-20260930T212300566Z-baf65ec8-9e2a-41ff-961f-a7be14aa064f.json`.
Actual Chrome 154.0.8037.58 uses RTX 3080 Ti/ANGLE D3D11. Source and executable
identities remain stable; server closes, both actual Chrome roots exit 0 and
their new owned profiles retire. The mobile observer sees one explicit pending
pre-HTML root, then succeeds; unknown transport/errors remain failures. The first
failed attempt and uncertain old profile are retained without inventing its cause.

Desktop first observed usable menu is 2,536.6ms; phone-size 4× CPU is 3,154.2ms.
Each uncompressed, unshaped loopback sample records 54 resources, 3,839,260 body
bytes and zero failed/pending/late requests. Desktop callback intervals are
p50/p95/p99 16.7/17.0/17.3ms, with callback work 1.1/1.6/1.9ms; phone-size intervals
are 16.6/17.1/17.1ms, work 5.9/8.1/9.7ms. These are one cold navigation and one
10-second passive application-RAF callback sample per profile, not actual draw/
paint/GPU cadence, shaped production transfer, ten-run p95, world/keep workloads
or R06 acceptance. Coarse requested-GC heap snapshots do not establish fitted
repeated-switch growth. Physical phone and actual-owner evidence remain open.

Independent read-only review finds no additional demonstrated defect in actual
world/keep controller lifetime, background/resume, policy replacement or disposal.
Existing caller regressions were reviewed; this structural review does not
establish owner expiry, retained heap or phone performance. The patch-note hover
trigger has a separate accessible-label mismatch: preview activation pins, so its
label now says Pin; pinned says Close and closed says Open. The existing
hover-gap caller regression fails before repair and passes afterward; all 17
affected menu/build-stamp tests in two actual files and app noEmit types pass.
Retain `tervain-preview-label-before/after.*` and `tervain-preview-label-types.log`.
This follow-up does not relabel the full-suite source or change pointer behavior.

Current synchronization guidance now uses ordinary PR metadata during September
and the already implemented Alpha-preserving `/ptr/` operator. Historical root-only
publisher observations remain dated; no new infrastructure or recovery key is
required. Final exact-source preparation receipts belong on PR #374 after these
label/documentation changes and complete family derivation. No final quality
score, integrated M1/M2, provider mutation or shipped 0.4 claim is established.


## Tervain comparison and local renderer verification — 30 September 2026

Immutable Tervain source `db2a356c062f5e65fa29cf3f642fc6498f57c013` supplies the
sibling-project comparison. All 209 shared archive GLBs match existing Warpkeep
originals by size, SHA-256 and Git blob, so no duplicate asset copy was needed.
The [ecosystem record](../../engineering/repository-ecosystem.md#sharing-with-tervain)
records its separate product/lore, useful stable-population idea and provenance.
The separate source-only delta review to Tervain `18e33586` does not replace
this byte-verification baseline; its new menu score remains Tervain-specific.
Signed `13491c60` improves existing forest support, stable quality transforms,
terrain color grouping, narrow-menu text and failed atlas-chunk cleanup. Windows
combined checks pass 206/206 in seven actual files; app/build-mode types pass.

The complete four-worker native root suite at `086fa02e`, tree `70f9eb22`, ran
18:04:30.302–18:22:16.744 UTC: 12,694 passed, zero failed, 97 skipped, 694 actual
files, exit 0, Node 22.22.3/UID 1000 and unchanged clean source. Retain the full
report/log/source/summary/exit under ignored `artifacts/qa/tervain-native-full-*`.
This precedes the camera and fixture changes below.

Signed `7479e183` repairs the legal portrait atlas-window fit in the actual host:
preserve the finite fit direction beyond the normal phone zoom ceiling, and scale
distant fog against the normal fit. Two new actual-runtime regressions fail before
repair; all 38 host tests pass on Windows and native Linux, with app types passing.
Real local 320×844 browser terrain is visible; no authority/window/budget expansion
or physical-phone performance claim is made. Evidence is retained in ignored
`greater-realm-camera-fit-2026-09-30-*` and `tervain-camera-native*`.

Signed `9d357e6e` gives ten synthetic test owners exact fixture-root retirement,
guarding root identity and preserving borrowed linked targets. Native affected
verification runs 18:49:06.719–18:49:18.696 UTC: 91 passed, zero failed/skipped,
ten actual files, unchanged clean source, zero newly retained roots and zero
historical removals. The full suite's 100 earlier allocated synthetic roots were
separately audited against its immutable allocation ledger, ownership/filesystem
identity and terminal actors; only those roots were removed at 18:57:30.259 UTC.
No historical or unrelated root was removed. Provenance, cleanup and affected
reports remain under ignored `artifacts/qa/tervain-native-fixture-*`.

All 36 guarded PNGs in `artifacts/keep04-qa/windows-run-gwMDNz` were inspected at
stable clean `9d357e6e`. Actual signed Chrome is 154.0.8037.58, hardware RTX 3080 Ti
through ANGLE/D3D11, four viewport/quality profiles, no network shaping. No concrete
visible regression was found. The report records one latest frame per case;
constructing still has one pending loader. Viewport crops do not attest all lower
content, motion/cadence or performed context restoration. Chrome closed normally
with verified zero remaining owned actors. Its disposable fresh profile is retained
because automatic approval review rejected deletion; original provenance is intact.

Separate actual DEV smoke at `086fa02e` completed three warm-ups plus 20
mount/dispose cycles each for balanced, reduced, reduced motion and fallback.
The three WebGL profiles return to 30 geometries/two textures/11 listeners;
fallback has no scene canvas/listeners. Disposal leaves zero scene-owned RAFs,
loaders and listeners. Three performed context-loss/restore cycles return to one
canvas and the same baseline. This is keep-only smoke, not world/realm cycles,
retained-heap, cold-load/transfer, owner or phone acceptance. Initial creation's
85–99ms submission long tasks remain recorded. Local further scroll review found
missing invalid-placement guidance beside confirmation. Signed `f1a967c8`
repairs it using canonical validation/messages and an accessible description;
three new regressions fail before and 80 affected UI tests pass after. Actual
320×844 browser inspection at `328404b9` shows the reason beside disabled
confirmation, with Adjust placement focusing the open schematic and no overflow.
Signed `328404b9` separately repairs enabled placement navigation during healthy
refresh/pending; four regressions fail before and 136 tests in four affected
suites pass after, retaining disabled commands and terminal-scope guards.
Before/after logs remain under ignored `artifacts/qa/keep04-placement-feedback-*`
and `keep04-retained-navigation-*`.

Signed `cec57240` fixes menu shadow targets retaining their former size after
rotation, plus stale castle failure/readiness flags surviving quality rebuild.
Four meaningful regressions fail before repair; 42 tests in lifecycle, responsive
layout, media and main-menu suites pass after under pinned Windows Node 22.22.3.
The shadow tests exercise Three 0.185.1's real allocation/viewport/dispose code
with GPU draws stubbed. Same-size resizes and Performance allocate no extra
targets; late parsed models retire correctly. App typecheck passes. These menu
checks are retained in the collaborator's tool output, not an invented report;
the forthcoming native final-source checks will have separate retained receipts.

Signed `997a3575` explains confirmation blocked by an existing construction or
missing Realm details. Both recovery regressions fail before repair; 88 affected
UI tests pass after. App types then identified an unsafe wire-string name lookup;
signed `5b7b50ee` narrows it through the canonical UI kinds. App noEmit and both
recovery/reconfirmation tests pass after that correction. Retain the actual
`keep04-confirmation-causes-*`, `tervain-confirmation-types.log` and
`tervain-confirmation-typed.*` receipts; do not relabel the earlier full suite.

The current direct-menu QA correction passes 18 caller/boundary tests in one
actual file, with no failures/skips, exit 0: `tervain-menu-entry-final.json`.
Independent review reproduced a lost WebGL context passing as healthy; the
new caller regression fails before correction and passes afterward, with
`tervain-menu-lost-context-before/after.*` receipts. The fixture inventory now
records only successfully created directories, preserving preexisting paths.
It waits for castle/guardian readiness and serves the generated `/ptr/` namespace
from the fixed native build. Optional scenery, image inspection and performance
remain outside those tests. Failed diagnosis receipts remain retained. Automatic
approval review rejected removal of seven synthetic fixture directories totaling
95,685 bytes; they remain retained, without a cleanup workaround.
Final family/build/preservation receipts belong on PR #374 after the repairs.

At signed `926f2ce8`, tree `bd70cb24790b8c73239c2a99272b59812710b605`,
fresh native family reproduction/policy passes. The affected selection ran
20:32:09.174–20:37:43.824 UTC: 435 passed, zero failed/skipped, 16 actual files,
exit 0, clean unchanged source, zero newly retained fixture roots and zero
historical removals. The prepared build and independent Alpha preservation pass;
the actual production menu runner passes four viewports and root inspects all
four saved images. Native production QA exclusion checks pass 20/20 in one file.
Retain `tervain-final-ui-*`, `tervain-final-family-verification.json`,
`tervain-production-qa-boundary.*` and `tervain-production-menu-inspection.json`;
PR #374 owns exact build/payload/mirror hashes. Historical preparation metadata
is preserved in `tervain-prior-preparation.json` before refreshing fixed outputs.

Further actual 320×844 production Settings inspection reproduces internal
horizontal overflow: panel client width 276px, scroll width 320px; the fieldset
extends beyond the panel, clipping descriptions and the STANDARD badge. The CSS
repair removes intrinsic minima, lets the text track shrink and reserves badge
space only where used. Four existing Settings behavior tests pass in
`tervain-settings-narrow-behavior.*`; this is not rendered layout acceptance.
Rebuild and remeasure the panel before declaring the defect closed.

The first separate menu-only startup attempt retains a complete desktop sample
and a failed mobile observer evaluation in
`tervain-menu-performance-20260930T204808870Z-325fcd04-4a4f-490c-9e27-01fea7a9da07.json`.
Both recorded Chrome roots are independently absent afterward; the uncertain
failed profile remains retained. The historical receipt lacks exact expression
diagnostics, so a reproduced provisional-document observer failure is not asserted
as its proven cause. No R06, phone, repeated-switch heap or owner pass is claimed.

## Native recovery verification and evidence audit — 30 September 2026, 18:21 CEST (16:21 UTC)

The earlier signed source a23b863c0093293195a7fbfe6477e9b9e2f93ee1 (tree
9e6b075c8f10be154a126a1f10aae930fbdea186) passed its scoped UID-1000/Node 22.22.3
native selection: 276/276 across seven files:
shared ownership/budget, bootstrap, observation envelope, publisher, cutover
journal, private-deploy journal and operator. Actual caller regressions preserve
live partial-file bytes, and publisher supervision agrees with the shared birth
reader. Before/after inventory records zero new homes and zero historical removals
for both repaired private-deployment test helpers. The Windows journal attempt
remains an unsupported POSIX-mode attempt, not behavioral evidence.
Ignored process-birth-native source/result/log/retention reports retain this scope.

After reviewed refreeze, raw capture at signed 8b9a2d38 checked all 3353 tracked
files against exact Git bytes (220069143 bytes, maximum 12507408). All 16 closure
outputs independently reproduce across 1250 members; native policy passes with
manifest SHA-256 1ba229ec3135301c822a6db3d6f6ec79623b8ec2cdb2e3015a359c025be89fb0.
Earlier family 2fa6947c at 580cd588 is superseded.
The source-only compiler audit derives 28 direct retained paths: 24 four-lane
bundle/declaration/workflow-entry/lane-entry paths, both compiler manifests,
the recovery claim bundle and its wrapper. Every raw blob equals main 786c0b2b.
An earlier 22-path inventory summary was incomplete, not a complete compiler
audit. Both manifests preserve original input 5d175edf/tree e7f36c6c; its raw
repository input rows and graph digests verify, and it remains an ancestor of main.
This is identity/metadata audit, not new compilation or archive attestation.

Fresh pinned npm/root and pnpm 11.7.0 service/module audits return zero known
vulnerabilities in all four package boundaries. Main's existing three moderate
alerts await integration/rescan. Direct GETs at 13:00:38.949 UTC (15:00 CEST) show
Alpha 200 with unchanged HTML SHA-256
18658055f4fa1c2376fae34d9d34e400c4bb308f922de48aaeb604a1de0c3a4d,
auth health 200 and unpublished /ptr/ 404. GitHub profile/repository descriptions,
homepages, visibility and open PR identities match the documented boundaries.

The complete native report at a23b863c finished at 13:55:45.765 UTC:
12,558 passed, 110 failed and 97 skipped across 694 files. No Vitest processes
remain; zero new private-home directories or historical removals were retained.
The serial run exceeded its wrapper's timeout. The wrapper ended before the
still-running child wrote its report; the child exit status was not retained.
The report is a failed full run, not a successful verification. Source, log,
report and recovered summary remain in ignored root-suite-process-birth files.
The next full run must use bounded parallel workers and a timeout that supervises
the whole owned process group; a wrapper exit alone is not child termination.

Diagnosis separates an omitted legacy-envelope source pin from historical
compiled-dispatcher fixtures and six current-bootstrap recovery cases. The
seven-path fixture repair derives current SHA-256, Git blob, length-framed link
and receipt digest from actual bytes only when opted in. Historical defaults,
original corpus, validators and equality assertions remain intact. Pinned Windows
Node 22.22.3 selection passes 27/27 across six files. The source-pin generator
now owns the missing legacy envelope hash; its real-policy regression fails
before the repair and rejects drift in either paired envelope after derivation.
Dispatcher fixtures reopen genuine raw Git blobs from the retained manifest's
original compiler input instead of mixing current source with frozen compiled
pins. The compiled outputs and original manifest remain unchanged. Their pinned
Windows selection passes 114, with two platform skips and zero failures; native
verification initially returned 320 passed and one failed across 11 files at
6d143a92. The remaining actual CLI failure correctly rejected current operator
bytes against an older refreeze. Root and an independent reviewer checked the
complete projection: all 134 remaining frozen blobs (including all 115 module
blobs) retain exact bytes and modes. The original four reviewed operators are
unchanged; only the stable-birth budget, legacy envelope and publisher differ.
The reviewed operator subset now binds these seven exact files to signed
580cd588. The complete historical contract and original freeze remain intact;
new regressions reject byte/mode drift in every operator. Native checks at
5edbce26 passed 321, including the actual V2/V4/V5 release CLI, and failed only
the new test's POSIX worktree/index mode mismatch. That synthetic setup now
sets the actual executable bit as well; its single targeted native regression
passes with all 14 byte/mode drift refusals (169 cases filtered, not platform skips).
Signed 3d47d05e contains the test repair. Its durable four-worker native suite
exited 0: 12,670 passed, zero failed and 97 skipped across 694 files. Exact tree
5a65e56567fe64c80a177326ced7a8015729d0f5, Node 22.22.3, UID 1000 and clean
native source are retained. Source capture started 14:38:56.000 UTC; summary
finished 14:55:44.068 UTC. Vitest reports 937.31 seconds; distinguish that
reported duration from wall-clock timestamp subtraction. Zero new private
fixture homes or historical removals remain. Root verified the job is terminal.
Source/report/log/summary and actual test/wrapper exit records are retained
under ignored artifacts/qa/root-suite-recovery-final-* and copied to Windows.
The failed full/affected attempts remain separate. The current source-family and scoped checks are recorded below; PR #374 owns
final exact-source build/payload/mirror receipts.

Public presentation readbacks also identified private source/archive links that
returned 404 for anonymous readers. Signed profile checkpoint
`d64f4ab65352a5c1191f9776dfdd8f5ac76953fb` now uses the playable Alpha and public
release assets. Signed Water Engine checkpoint
`5bb43525859f02569099f7d8c973a8c73d48a878` clarifies the placeholder and private
implementation boundary; its homepage now resolves to `https://warpkeep.com/`.
Both outgoing ranges passed Gitleaks 8.30.1 and explicit non-forced pushes have
matching remote readbacks. These documentation/metadata corrections do not
change the served game, publish PTR, or establish engine implementation.

The existing Explore feedback action exposed the private GitHub issue chooser to
public players. The actual rendered regression failed before repair. The footer
now has one PROPOSE / REPORT action to the existing public Farcaster channel,
matching accessible text and preserved new-tab/no-referrer attributes. Its single
column fills the existing community area. Windows Node 22.22.3 checks passed
60/60 across the drawer, actual realm host, CSS contracts and intake/link tests;
zero failures or skips. Before/interim/final reports are retained separately under
`artifacts/qa/public-feedback-route-*`. This later scoped UI repair is not included
in the 3d47d05e full-suite scope and is not deployed to Alpha or PTR.

The menu build stamp also offered a source commit URL in the private development
repository. Its actual rendered regression failed before repair. The build-info
factory retains the exact full/short SHA while omitting that inaccessible default
commit URL; the menu continues to display BUILD identity as text rather than
mislabeling it LOCAL. Explicit alternative repository links keep their existing
behavior. Windows Node 22.22.3 checks passed 11/11 across the factory and actual
menu tests. Before/final reports are separate under `artifacts/qa/private-build-stamp-*`.
No private source SHA was substituted into the public generated-assets repository.
This later scoped presentation repair is not included in the 3d47d05e full pass.

Anonymous readbacks of the served Terms, Social Contract and Privacy pages
confirmed private repository/security links returned 404. Their source now uses
the observed-200 public channel for ordinary feedback and owner profile contact
links to request a private reporting channel before sharing details. Privacy
no longer tells public visitors to open an inaccessible repository issue. The
source also corrects the open-source and absent-gameplay descriptions: development
is private and Alpha systems remain unfinished, without claiming unpublished PTR
capabilities are live. Dated correction notices preserve the agreement/notice
revision IDs; admission, conduct, reward, privacy and material-change obligations,
server policy and historical acceptance remain unchanged. Root independently
recomputed all three normalized visible-text SHA commitments from actual HTML;
strict text/version tests remain intact. Windows Node 22.22.3 legal checks passed
15/15 with zero failures/skips; genuine contact and status regressions failed
before repair. Source/readback/review reports are under `artifacts/qa/public-legal-*`.
These source corrections remain unpublished, and the PTR plan preserves the
existing Alpha root bytes; do not label the served Alpha pages as corrected.

Later bounded source repairs correct public feedback/legal contact routes, dated
project descriptions and the private-source build link. Native checks at signed
601635cd passed 86/86 across nine files, zero failures/skips, exit 0. Exact tree
3e0a56f001d7ddc00a7b31b6005af65a0fcb319c; Node 22.22.3/UID 1000 and clean source
are retained under artifacts/qa/public-route-native-final-*. These later repairs
are scoped separately from the 3d47d05e full pass. The complete 16-output family
was raw-captured at 1e1cad71 (3353 files, 220079849 bytes, 16 MiB/file and 256 MiB
aggregate caps) and independently reproduced; native policy passes. Manifest
862f68eb675632273d2541a82b9b2f9d816c633e83eafc294524ea50e7c35399.
The initial owning source-family checkpoint is signed 601635cd. PR #374 maintains the final
exact-source production-build/payload/mirror receipts; resolve those receipts and
current refs before publication. The 28 retained compiler outputs and original
M1 inputs remain unchanged. These source corrections are not yet served; PTR
publication preserves the existing Alpha root, including its historical pages.

Browser QA of the prepared c221e3e8 build at 320×640 found the legal revision
metadata used 11.2px bold, widely spaced uppercase text: Terms occupied 199.63px
and Social Contract 235.93px. A subsequent CSS-only polish gives those existing
version notices 12.8px type, tighter tracking and their canonical text casing;
the decorative eyebrow retains its original presentation. Document wording and
normalized text commitments are unchanged. Final rendered layouts and the new
exact-source build receipts belong on PR #374; this style change is separate
from the earlier native 86-case source scope and is not deployed to Alpha.

The subsequent legal-only native checks passed 15/15, zero failures/skips, exit 0,
at signed 490d67d3 / tree dcb8978d14743c766933d78f6f75de4db6459d3e.
Node 22.22.3/UID 1000 source/report/log/exit records are under
`artifacts/qa/public-legal-style-native-*`. A fresh raw capture of that source
covered 3353 files / 220084480 bytes and independently reproduced all 16
outputs with the same 862f68eb675632273d2541a82b9b2f9d816c633e83eafc294524ea50e7c35399
manifest; native policy passes. Document text pins and acceptance versions stay
unchanged. PR #374 owns final build and rendered readbacks for the final source.

Independent PTR review found no further demonstrated source defect in authority,
selection, immutable retry or provider renewal. The existing connected smoke
manually replaces fixture sessions at 80s; it does not exercise the production
provider's automatic 120s expiry/Quick Auth callback through a real browser host.
Synthetic provider/host tests cover those callers. Preserve actual-owner browser,
server-restart and physical-phone acceptance as separate outstanding evidence.

## Stable process-birth repair — 30 September 2026, 14:35 CEST (12:35 UTC)

A separately documented abandoned synthetic timeout fixture exposed a current-source
recovery defect. Its PID and kernel start tick stayed unchanged while `ps lstart`
moved by ten seconds. Linux procps reconstructs that display from boot wall time
and elapsed ticks ([procps 4.0.4 source](https://gitlab.com/procps-ng/procps/-/raw/v4.0.4/src/ps/output.c)).
That display cannot reliably prove PID reuse. The old shared owner helper and
digest-only partial-file callers could misclassify a live owner and remove its
record; bootstrap lifecycle recovery could also treat the same process as reused.
The clock-drift owner regression failed before repair (`true` instead of unknown).
The current timeout test passed; this does not prove why the historical fixture
became orphaned, and the finding is not a production incident claim.

New Linux records use `linux-v1:<boot UUID>:<kernel start tick>`, read from bounded
proc files without wall time or timezone. Bootstrap, both launch envelopes,
publisher supervision and shared journal helpers use the same critical-field
validation while allowing arbitrary process-name bytes. Existing schemas and
legacy records remain readable. An exact legacy match remains live; a live legacy
or digest-only mismatch remains unknown. Only kernel birth mismatch for complete
stable identities, or `kill(pid, 0)` returning ESRCH, proves the recorded owner
is gone. Missing, inaccessible or malformed proc evidence alone is insufficient.

Portable pinned Node 22 identity checks and independent caller reviews passed;
actual private-deploy and both cutover temporary-file regressions now require
preservation of the live record bytes. Native integration and full-suite checks,
source-family regeneration and exact-source build/plan refresh are pending this
source checkpoint. PR #374 will record their actual source and results. No
private production record was inspected, rewritten or deleted by this repair.
For an ambiguous historical record, preserve it and the active owner; use the
supported inspector after proven owner exit, rather than deleting a lock,
repeatedly retrying a provider write or requesting another recovery key.

## Test-fixture retention repair — 30 September 2026

Final workspace inspection found that notificationPagesPrivateDeployOperator's
test home helper allocated a private temporary directory without registering
cleanup. Repeated checks therefore retained synthetic journals. The repair
registers each newly allocated root immediately, restores mocks, verifies its
canonical temporary parent/name/type/ownership, and removes only those owned
roots after each test. It does not scan/delete historical directories by age,
name alone, or alter production journals and retention policy.

The native UID-1000/Node 22.22.3 focused suite passed 32/32 at byte-identical
test SHA-256 a10dc3fc5c87c0d3e46f4ce369e51124ff3eaf06edc3fd494e463a8d25ec571d.
Before/after inventory showed zero new fixture directories retained; historical
native and Windows directories were unchanged. Independent cleanup review
passed. The native test was restored to its committed source after this run;
the signed source checkpoint retains the tested bytes.

A separate abandoned synthetic timeout shell had no surviving fixture directory
or test owner. Its exact executable/argv, UID, isolated group/session, deleted
working directory and unchanged kernel birth tick were rechecked before killing
only that fixture group. Group absence was verified; the persistent production
runner was untouched. This is local fixture cleanup, not a production recovery
operation or evidence of a live provider failure.

The adjacent private-deployment journal tests had the same missing home cleanup.
Their helper now registers each new root and uses the same bounded cleanup;
the new preservation regression no longer needs separate removal. The Windows
attempt reached the existing POSIX ancestor-mode refusal before journal behavior,
so it is not a functional pass. Cleanup still retained zero new roots. The full
native journal suite and before/after inventory remain pending this checkpoint.

## Public mirror line-ending repair — 30 September 2026, 13:19 CEST (11:19 UTC)

Exact candidate e308a64d passed the native production build and local payload/
mirror checks. A subsequent comparison against the publication operator found
a real disagreement: the clean Windows public checkout uses core.autocrlf,
so CNAME has 14 CRLF bytes while its reviewed parent Git blob has 13 LF bytes.
The planner hashed the working file; the publisher preserves the parent blob
and would reject it with PUBLIC_PAGES_PUBLICATION_SOURCE_CHANGED before any
public or provider change. All other 340 preserved files matched. That saved
mirror plan is superseded, despite passing its own local check.

The repair hashes each preserved file from the exact reviewed parent commit
as binary bytes, with the publisher's 64 MiB bound. It preserves all checkout,
hosting and target checks. It neither rewrites the public CNAME nor normalizes
legitimate committed CRLF or binary assets. The clean-CRLF-checkout regression
failed before repair; all ten planner tests pass afterward, including committed
CRLF and a binary model containing invalid UTF-8, NUL and CRLF. Independent
source review confirms the publication contract. The five existing signed
publisher cases pass, and the new signed-PREPARE integration regression passes:
its candidate retains the parent's exact LF CNAME blob and good signature while
the clean CRLF checkout and main/HEAD stay unchanged. No fixture push occurs.
The immutable 341-file Alpha manifest remains
7699d03b70c901e4fb8453b8b515af03376d398bf79e9eabea1c85f6e303c3ef.

At earlier exact e308a64d, affected closure/menu/capability/controller/QA tests
passed 315, zero failed, one Windows-specific junction case skipped on Linux.
The checked-in sealed-launch, license and file-size verifiers passed. These
receipts retain that source; refresh the complete closure and final payload/
mirror after this repair. PR #374 holds the final exact-source identities.
The normal-clock connected gameplay pass below remains valid at its recorded
source. No hosted Actions, main merge or public/provider write occurred.

## Real PTR first-entry repair and connected smoke — 30 September 2026, 12:50 CEST (10:50 UTC)

A real attested SpacetimeDB 2.6.1 procedure rejected its first keep read with
"The module instance encountered a fatal error: GAMEPLAY04_NOT_INITIALIZED".
The generated SDK returns this entire string. The client recognized only the
bare code, producing failed/unknown instead of uninitialized; the controller
then refused initialization. The older synthetic protocol test injected a bare
code and had not established the actual server envelope.

Signed repair 6d1c08c9449df30e26120228efecbdcfff9eb808 accepts only the exact
observed prefix followed by an entire existing allowed code. Error objects,
unknown prefixes/codes, multiline strings and extra tails remain uncertain.
A generated-SDK frame through the branded capability and real controller
failed before the repair and passed afterward. It also verifies definite
rejection clears pending work while an unknown outcome retains the same frozen
command for retry. The implementer passed 95 capability cases; independent
capability/controller checks passed 143/143. Script types and diff checks passed.
The connected rerun at that exact source proved uninitialized -> ready against
the actual module; it then exposed an unrelated harness route-selection error.

The local runner now uses complete owner-to-location tree routes, with a real
procedure cross-check, rather than global node ordinal zero/root depth. At the
supported private PTR fixture anchor, selected food/wood/stone routes contain
5/6/12 cells; the old food choice contained 56. The existing <=31-cell budget,
normal travel/gather timers and 120-second construction remain intact. Each
dispatch must advance the accepted sequence once and expose the matching
assignment and captured yield. The fixture's inactive/unassigned resource
policy is preserved. Seven focused harness tests and its dedicated types pass;
independent review checked capacity, cost, placement, retry and renewal.

The first harness setup failure incorrectly repeated the inherently forbidden
G001 identity in the importer's additional exclusion list; the production
guard remains unchanged, and all three production targets remain excluded.
The runner also clears only its exact owned prior success receipt before a
new attempt, preserving unexpected linked objects. A failure cannot leave a
stale same-source pass. Its loopback transport, synthetic atlas/owner and
private ephemeral fixture keys never contact the production bridge or realms.

Connected runtime PASS: native session 64935 exited 0 at signed
98a561dbfc36574ed0ce80ff699b62f35c36d22a, elapsed 321,215ms (5m21s). All nine
outcomes passed: initialization, credited gathering, stale quote unsent, exact
immutable retry, single deduction, natural completion, improved 72-food return,
authority renewal and fresh-connection readback. The running in-memory database
retained the completed state across client reconnection; server restart is not
part of this run. The receipt explicitly records productionPtrVerified:false
and cleanupComplete:true. Root readback verified mode 0600/UID 1000, clean native
source and no owned temporary fixture directories. The identical Windows/native
ignored artifacts/qa/ptr-gameplay04-local-smoke.json hashes to
78da5e7efe2024ba1251e9b12b86961c4136a58f9444c7089490d8de7c12f002.
This is connected local integration with synthetic authority/atlas and normal
clocks. Actual-owner production-atlas pacing, browser play and physical-phone
acceptance remain open.

All reviewable checkpoints were signed, outgoing-range scanned and pushed with
[skip actions]. No Actions runs/checks were queried or used. Refresh the full
16-output source-closure family, preserving retained compiled identities, then
record the final exact-head build/payload/read-only mirror receipts on PR #374.

## World touch targets and short-landscape drawers — 30 September 2026, 11:39 CEST (09:39 UTC)

Independent review of candidate d7bcd820 found 35.2px gathering buttons,
34.4px camera buttons and 36px narrow navigation buttons. Resource buttons
also overrode the generic disclosure minimum through selector specificity.
The existing resource controls and Worker picker now have a 44px minimum;
narrow/coarse camera controls are at least 44×44px, and navigation/disclosures
are at least 44px high. Desktop camera density remains unchanged.

Rendered review of the existing synthetic Greater Realm host at 320×640,
390×844 and 700×390 found no horizontal overflow. Closed drawer plaques now
have an 11.12px gap at the standard 16px root size. At 700×390, the navigation
card previously covered the open drawer's disclosure, preventing a touch
close. Open narrow/coarse drawers now render above that card; DOM hit-tests
and actual open/close actions verified both resource and camera disclosures.
Camera controls measured at least 44×44px, with a 187px scrolling body over
237px of content. Existing scroll limits remain unchanged. The source-scoped
Worker-picker rule was reviewed; this legacy-host fixture does not render the
new PTR picker. These viewport checks do not establish physical-phone or
authenticated-owner acceptance.

The existing WorldScene/PTR host suites passed 81/81 under pinned Windows
Node 22.22.3. Only the existing world stylesheet changes game presentation.
The separate source-only M1 audit found the retained compiled bundles and
their original input identities unchanged and within native capture limits.
Current source closure/build receipts still need refresh after the signed
checkpoint; September's Actions pause and live release requirements remain.

## Menu readability and source-link repair — 30 September 2026, 10:49 CEST (08:49 UTC)

The full native root suite at clean signed 15b88b578c118416c19f4d6ba92bd3a5f0327f75
exited 0: 12,603 tests passed, zero failed, 97 skipped across 693 files.
Node 22.22.3 ran as UID 1000 with the pinned CLI and offline YAML archive.
Source identity is retained in artifacts/qa/root-suite-ui-final-source.json;
the separate result/log are root-suite-ui-final.json and .log. The earlier
failed report and focused ownership recovery remain intact. This full pass
covers the confirmation, focus and gesture repairs; it precedes the CSS-only
and archive-link changes below. Do not relabel it as a later exact-head run.

The real 390×844 menu preview showed ivory commands over pale castle geometry.
The final CSS cascade's almost-white translucent panel could leave label
contrast near 1.4–1.6:1. Replacing only its two existing gradient declarations
with dark Verdant slate retains layout, scene, command states and 44px mobile
targets. A conservative white-backdrop calculation using the actual cascade,
without blur/brightness/vignette/shadow credit, gives normal labels 7.33:1,
prominent 5.53:1 and hover/focus 6.35:1; the focus outline is 7.75:1.
These are calculated bounds, not a physical-device pixel measurement.
Existing menu/response-layout tests passed 27/27 under pinned Node 22.22.3.
The updated source render was checked at 390×844 and 1365×900: no horizontal
overflow, 44px mobile commands, a visible 2px keyboard focus outline, and
no console errors/warnings. Preview servers and the owned tab were stopped;
the temporary browser viewport override was reset. Final production build
verification remains source-bound and belongs on PR #374.

Two G002 soundtrack references incorrectly named a published release whose
tag endpoint returned 404. Its source archive is a draft in Assets PR #38.
ASSETS-LICENSE.md and the dated audio record now link immutable source
manifest f0993b0b14e865922f739f9ac218334b4695b577, whose source/runtime hashes
match the recorded exact files. Castle, emblem, menu-score and v3 tree links
resolved to matching source records. No asset bytes, license grant or archive
publication changed. The approved G002 audio is packaged by existing payload
policy, while playback remains sealed; no broader reuse rights are inferred.

Signed polish d4465897ed9d2670cdd35e2f241d913244a8e8a2 passed its outgoing
Gitleaks scan and was pushed. All 3,351 native tracked files matched raw Git
before the full 16-output family was derived, independently reproduced and
checked by the UID-1000 policy verifier. Its manifest SHA-256 is
8c637963331d7c899f695788aaf3b95d9983d4ab54bc5813b5f1c1bb4334de6b.
Record the final signed source and affected native checks/build/payload/mirror
receipts on PR #374 after execution; do not claim another full run at that head.

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
