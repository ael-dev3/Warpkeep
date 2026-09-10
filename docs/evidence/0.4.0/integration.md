# 0.4.0 integration evidence

Updated 2026-09-10. R14 remains incomplete; source publication is not production deployment.

## Current checkpoint — 2026-09-10

The reviewed branch head is `69fef64772b479cc274368b587410faed0fd97cd` on
`codex/prepared-keep-bindings-fix`; PR #228 remains a draft. The functional
source lane is `6e2164f1`. Verify run `34470619853` is in progress and CodeQL run
`34470619784` is in progress for this exact head. The regenerated closure
manifest is `882fcba311ad46c9f2528cd9d77687d6adaa132b4900caacb418359a3bcc56cd`.
This is current
integration status only: no terminal Verify pass, live owner journey,
physical-device acceptance or production deployment is claimed.

## Historical checkpoint — 2026-09-09

The reviewed branch checkpoint is `75d577c8086cc6860713977e661181e9852995d1`
on `codex/prepared-keep-bindings-fix`; the current notes update is published
after it. PR #228
remains a draft. The checkpoint includes the portrait keep framing and mobile
surface polish, the truthful workflow-runtime provenance expectation, Linux
G001 receipt/adoption/activation consumers, credential-boundary evidence
refresh, the fixed native preparation caller, the shared production-admin
transport extraction, a regenerated 1,194-member protected closure containing
the complete Linux G001 spawned program family, the compatible dependency
security pins required by the service audit lanes, and the complete optional
peer entry required by root `npm ci`, and the runtime image verifier now tracks
Sharp's hosted `libvips 8.18.6` tuple. The private Greater Realm Sharp/libvips
lock and WebP contracts are also refreshed.

The functional visual checkpoint remains `0ce25c8`; `07c9e8b6` is a
documentation-only clarification of the visual-foundation contract's reviewed
source pin and does not claim final visual, device or live acceptance.

CodeQL run `34348989688` passed. Verify run `34348989741` for `75d577c8` has
green auth-bridge, native-contract and release-recovery jobs; Linux and
SpacetimeDB remain in progress. R14 remains incomplete until the current run
reaches terminal passing results and the release-relevant review is reconciled.

### Current dependency-alert state — 2026-09-09

Authenticated GitHub Dependabot alert #2 (`GHSA-528h-pc64-c93x`) now reports
`fixed`. The authoritative npm lock resolves the Solana Jayson path to
`jayson@4.1.3`, and the root npm graph no longer contains `stream-json`.
The detailed 2026-09-06 reachability investigation below remains useful
historical evidence; it is no longer an open alert claim.

The first post-pin Verify run for `c8505d7` failed before tests in Linux,
native-contract and SpacetimeDB because root `npm ci` reported the missing
optional `utf-8-validate@5.0.10` peer; auth-bridge and release-recovery were
green. Commit `1486b57` adds the missing lock entry; `05103e3` aligns the
runtime image verifier with Sharp 0.35.4, and `ce54d6e` refreshes the private
Greater Realm Sharp/libvips lock and WebP contracts. Its Verify run and CodeQL result must
confirm the clean install and downstream lanes. Local
auth-bridge and release-recovery checks now pass with zero known
vulnerabilities (477 + 18 and 1,092 + 53 tests respectively), but this is not
a final R14 result. Local source-range Gitleaks for the four published commits is clean;
the repository's historical scanner findings remain a separate issue.

## Published development checkpoints

- PR: https://github.com/ael-dev3/Warpkeep/pull/228, draft, targeting main.
- First synchronization: 259 commits published from remote `2d7e24f76cfb6da567770f3a940871a985f55c9b` through `de801391d26cf3bc1c3a1b80b0342a20181ae8d5`.
- Next checkpoint: reviewed controller repair `615597c152d8bc603052c98c8e25fa4b1d2dc4f8` and sync procedure `76480d6be2951cc884d6ecf705e12fc9d9dfe6dd`. Local and remote development heads were verified equal at the latter commit.
- No main merge, tag, release, provider mutation, or production deployment was performed by these pushes.
- Reviewed keep UI and its repeated-rejection repair were published through `737f68e46e2853186dedaf94590aaf64431a58cd`.
- Reviewed PTR integration was published at `acd62c7ce785939cbe8a16ca4ef3b63291a31e08`; `git ls-remote upstream refs/heads/codex/prepared-keep-bindings-fix` confirmed the exact remote head. Its one-commit outgoing scan with pinned Gitleaks 8.30.1 inspected 43,407 bytes and returned no leaks, exit 0. This does not resolve earlier history findings.
- Uncommitted renderer work and plans are not represented as published source. See `docs/operations/0.4.0-development-sync.md` for the publication procedure.

## CI observations

Verify run 34044383667 tested `de801391d26cf3bc1c3a1b80b0342a20181ae8d5`. Its completed Linux job 101516706723 scanned 725 commits / approximately 41.34 MB and failed with 14 secret-scanner findings. A separate local pinned Gitleaks 8.30.1 scan of the 259 outgoing commits reproduced 14 findings. Inspected findings were public signing-key hashes/thumbprint, schema field names, and synthetic invalid-key/credential/JWS test fixtures. This is a classification, not a passing scanner result. Precise exceptions and a successful complete-history scan remain required; do not disable scanning or broadly exclude test directories.

Native-contract job 101516706868 failed one of 105 tests:

```text
authBridgeNotificationPreparedDeployRuntime.test.ts
attests and resolves the exact pinned Wrangler from the pnpm layout
AUTH_BRIDGE_PREPARED_CLOUDFLARE_WRANGLER_INVALID
exactWrangler: auth-bridge-notification-prepared-cloudflare-runtime.mjs:998
```

The failing branch catches failure to resolve/stat the supplied Wrangler entrypoint. The job installs root dependencies with `npm ci` but does not install `services/auth-bridge` dependencies through its pinned pnpm layout; the test explicitly requires that layout. Repair must retain exact toolchain validation. The goal additionally requires removal of the mandatory Mac execution dependency, not another Mac-only workaround.

No-Mac repair preflight: the three `native-contract` test files exclude Windows
for POSIX filesystem cases, but have no Darwin/ARM64-only test gate. The workflow
itself explicitly requires macOS/ARM64. The Linux job already installs pinned
pnpm 11.7.0 and the exact bridge toolchain. A disposable Linux execution of the
same native-contract cases with those dependencies is therefore the concrete
replacement to verify, not a reason to delete the cases. This is source inspection,
not a passing replacement-run result. The public activation verifier still uses
a `Library/Application Support` path suffix, which must be reconciled with the
local release operations contract rather than silently treated as portable.

Auth-bridge and release-recovery jobs passed. SpacetimeDB verification was still running when checked; no result is asserted here. A subsequent Verify run 34044461236 for `76480d6be2951cc884d6ecf705e12fc9d9dfe6dd` also showed those two failures, the two service jobs passing, and the module job in progress.

Follow-up authenticated result: run `34044383667` is now completed with overall
failure, while SpacetimeDB job `101516706815` completed successfully at
`2026-09-06T17:01:35Z`. Its module/generated-binding verification, synthetic
exporter/server compatibility, connected relocation/rollback, active population/
gathering rehearsal and module dependency audit all report success. This is
evidence for that run's `de80139` source, not the later renderer commit, live
production state or actual-owner ten-minute journey. Linux history scanning and
native-contract failures still prevent aggregate Verify acceptance.

Later authenticated result: [SpacetimeDB job 101532737031](https://github.com/ael-dev3/Warpkeep/actions/runs/34050353854/job/101532737031)
for source `e711523946a0982050461ce9f2e4b9fff3771a32` completed successfully at
`2026-09-06T18:57:18Z`. Module/generated bindings, synthetic exporter/server
compatibility, connected relocation/rollback, active population/gathering and
module dependency audit all passed. This covers that source's CI rehearsals,
not the later QA tooling, live realm preservation, actual owner journey or final
release. The separately failed Linux history scan and native-contract job still
prevent aggregate Verify acceptance.

## Remaining R14 acceptance

The newer [SpacetimeDB job 101537410746](https://github.com/ael-dev3/Warpkeep/actions/runs/34052095337/job/101537410746)
also completed successfully at `2026-09-06T19:19:49Z` for source
`b62b7920021f3ef9fe56e43883e276622e127503`. Its module/generated bindings,
exporter/server compatibility, connected relocation/rollback, active population/
gathering and dependency audit all passed. This updates the previously pending
job result only; it does not resolve the other CI failures or prove live release
acceptance.

Dependency triage (2026-09-06): authenticated Dependabot alert #2 is open,
GHSA-528h-pc64-c93x, medium severity, for quadratic-depth denial of service in
stream-json pick/ignore/filter/replace filters. The advisory marks versions
through 3.4.0 affected and 3.5.0 first patched. Current root lockfile contains
stream-json 1.9.1 through jayson 4.3.0 (`^1.9.1`), itself required by the Solana
dependency tree. Inspected local jayson code imports StreamValues and Verifier;
this is not proof that the vulnerable filters are reachable, nor proof of safety.
Application source search found no direct stream-json import. Resolve the
dependency audit/reachability question before final integration; do not force
an incompatible major override or dismiss the alert without evidence. No
dependencies, lockfiles, scanner rules, or alert state were changed by triage.

### Recheck at fffc761 (2026-09-06)

Authenticated [Verify run 34058969788](https://github.com/ael-dev3/Warpkeep/actions/runs/34058969788)
targets `fffc761c0e27148bad833b603d555b1ed3c44cd0`. At inspection,
auth-bridge and release-recovery succeeded; SpacetimeDB remained in progress.
Native-contract job 101555939306 completed with 104 passing tests and one
failure: exact pinned Wrangler resolution, at `exactWrangler` line 998.
The job installs root npm dependencies but not the required bridge pnpm layout.
The resolver's realpath/file check fails before multipart generation. Preserve
that resolver and install the pinned dependency layout in disposable verification.

The same job explicitly requires macOS/ARM64; its workflow test also pins
`macos-14` and ARM64. Removing the Mac dependency therefore requires a reviewed
workflow/test amendment and running all three existing contract suites on the
replacement native Linux environment, not skipping contracts or changing the
production authority checks. No replacement run is claimed here.

Linux job 101555939351 again stopped at the full-history Gitleaks scan with
14 findings. This is not a successful root test run. Current development-range
scans do not replace the required history scan. No scanner exception, dependency,
workflow, production state, or authority check was changed by this inspection.

Local reproduction with pinned Gitleaks 8.30.1, the unchanged configuration,
`git --redact --verbose --log-opts=--all`, scanned 759 commits / approximately
42.13 MB and exited 1 with the same 14 findings. The redacted inventory is:

- Six `generic-api-key` findings on `keySha256` in recovery toolchain records,
  the historical WSL preparer, and Spacetime fixture tests (two per file).
- Three generic-key findings in realm-evidence, bridge recovery-config, and
  bridge recovery-observation tests.
- One `private-key` finding in the historical GitHub-evidence malformed-key test.
- Two generic-key findings on activation schema field names in GitHub evidence
  and sealed-realms activation records.
- One generic-key finding on the recovery public-key thumbprint.
- One `jwt` finding on the hand-derived test-only status JWS.

Historical-source inspection confirms the malformed-key case contains literal
`AAAA` and an oversized repeated-A negative fixture, not a usable RSA key.
The realm-evidence case is a deliberately thrown redaction-test error string.
The thumbprint is exported beside a public P-256 JWK; the toolchain values are
public signing-key SHA-256 pins. The status fixture has fixed epoch-second
timestamps 1000 through 1060. These observations support narrowly scoped
triage, not blanket suppression or a claim that the remaining history is clean.
Before any exception, verify each exact value and use rule + exact path + exact
value conjunctions with negative controls proving other secrets remain detected.
No scanner configuration was changed and no finding is marked resolved.

### Disposable Linux native-contract probe

On 2026-09-06, root ran all three native-contract files in the pre-existing,
disposable WSL Ubuntu24.04 checkout at
`8dcabc4dc40c9214c586f957514c284aa2e86eab`, with pinned private Node22.22.3,
existing root dependencies and the bridge pnpm installation. Invocation used
`env -i`, an explicit toolchain/system PATH and `NODE_ENV=test`, with no inherited
provider credentials. No dependency installation or source edit was performed.

```text
node node_modules/vitest/vitest.mjs run \
  tests/sealedRealmsPublicActivationArtifactVerifier.test.ts \
  tests/authBridgeNotificationPreparedReceipt.test.ts \
  tests/authBridgeNotificationPreparedDeployRuntime.test.ts --maxWorkers=1
Test Files 3 passed (3)
Tests 105 passed (105)
exit 0
```

The target test files and Cloudflare runtime have no Git diff between that
checkout's commit and current `a3569d6`; their disposable worktree paths also
remained clean. This is a diagnostic of the Linux/pnpm replacement hypothesis,
not proof of the full current source or transitive closure. The replacement CI
job still needs an explicit reviewed workflow/test amendment, equivalent pinned
dependency preparation and a successful run on the final source. Production
execution and GitHub workflow identity remain separate requirements.

### Exact scanner-exception diagnostic (not installed)

Root completed historical-source triage for the remaining fixture values:
the bridge RPC fixture encodes sequential test bytes; the observation fixture
throws an example-domain URL with a literal redaction-test token; the two
activation fields are schema names. A targeted scan of the malformed-key test
identified the exact match as the literal invalid `AAAA` key plus the next
line's opening marker, rather than a usable key or the runtime-generated test key.

An ignored diagnostic configuration copied all existing rules/allowlists and
added only exact rule + path + value conjunctions for the14 known findings.
With pinned Gitleaks8.30.1, the full local history scan inspected763 commits /
approximately42.17MB, returned no findings and exited0. This is a proposal test,
not a passing run of the unchanged repository `.gitleaks.toml` or GitHub CI.

In an isolated two-file synthetic Git fixture, the unchanged configuration
reported3 findings. The proposal reported exactly2: the same allowlisted value
at a wrong path, and a changed value at the intended path. Only the exact
intended path/value was suppressed. This demonstrates those generic-key
negative controls; broader per-entry/private-key/JWT controls remain required
before reviewed implementation. No actual credential or private player data
was used in these synthetic controls.

The first diagnostic attempt used configuration extension, which did not retain
the existing global allowlist and therefore resurfaced16 old findings. It was
not accepted. The successful probe retained the existing configuration verbatim
and appended exact exceptions. Do not replace existing entries or use broad
path/commit exemptions. Repository scanner configuration is still unchanged.

The diagnostic matrix was subsequently expanded to all14 intended path/value
cases, including the exact JWT and cross-line malformed-key match. The unchanged
configuration reported37 findings; the proposal retained exactly23 negative
findings and suppressed only the14 intended positives. Root compared complete
rule/file/start-line sets, not counts alone. Mutated values in permitted paths
and original values in wrong paths remained detected. This resolves the earlier
diagnostic coverage gap; permanent regression tests, reviewed configuration
implementation and actual-config full-history/CI acceptance are still pending.

### Current committed source: Linux native contracts

Root then repeated all three native-contract suites against a separate clean
Linux checkout of `a3569d6ebdf2343fa638f36a0b2593c5aacc1970`, tree
`a909803c10f6179208ecc93622dab495aca2f7d0`. All105 tests passed with no skips,
exit0, and the checkout remained clean. This removes the older-source limitation
for these three suites, not for unrelated tests or production operations.

The older disposable checkout was found to contain unrelated local source edits
and was preserved. The new snapshot borrowed Git objects read-only, linked the
existing Linux root dependencies and copied the existing bridge dependency
layout into its own service directory without reinstalling. Root and bridge
lockfile SHA-256 values matched the source installations exactly. The copy
command emitted a portability warning about `cp -n`; it exited0. No shared
dependencies or active Windows source were changed.

The test command retained the explicit `env -i` credential-free invocation,
pinned private Node22.22.3 and `--maxWorkers=1`. Production workflow identity,
fresh dependency installation in CI and the reviewed no-Mac workflow amendment
are not proven by this local suite result and remain required.

### Readability checkpoint cb8cac6: production build and initial native inspection

Root inspected the presentation/camera source diff at
`cb8cac640f7f05a7cde30824801b3c455bb0d573`. The selected-card reordering
leaves quote construction, confirmation guards and command authority unchanged.
This is an initial source review, not final acceptance of all camera/layout cases.

The pinned Node22.22.3 full `npm run build` completed with exit0: genuine voxel
provenance check, TypeScript, asset checks, Vite, production exclusions, atlas
public boundary and Farcaster integrity checks passed. The large-chunk warning
remains. Package metadata still identifies0.3.43; this is not a final0.4 artifact.
The subsequent `KEEP04_QA_VERIFY_DIST=1` run of
`tests/keep04QaContract.test.ts` passed19/19 with exit0 against that emitted dist,
including the opt-in actual-output exclusion check; no tests were skipped.

Root operated the actual Inspect selected site control in Chrome on the local
`mill-complete` balanced-quality fixture at390×844 and844×390. Both inspected
screenshots show the complete mill silhouette and footprint below the persistent
resources/actions and camera toolbar, with Inspect retaining focus. The temporary
viewport override was reset. This is browser-emulated synthetic-fixture evidence,
not a physical-phone result or authoritative gameplay. Numeric silhouette
measurement, remaining families/states, reciprocal placement, readiness,
accessibility and production performance gates remain open.

### Native portrait placement round trip at0e00269

Root operated Chrome at390×844 against the local balanced-quality
`mill-placement` fixture on source `0e00269862e75c4fb79511fd1a590e7321dabbda`.
Adjust placement focused the real schematic, whose measured top170.09px lay
below the sticky header bottom161.89px. A settled screenshot showed the legal
outline, reserved areas, validity text and movement/review controls. An immediate
post-click screenshot lagged the DOM scroll; the subsequent settled screenshot
confirmed the destination rather than treating the stale frame as a layout failure.

Move right and Rotate changed the reviewed draft from x−15,z15,0° to
x−14.5,z15,90°. Review placement focused Place City Mill at top169.99px,
below the same header. The inspected review showed cost, duration, benefit,
coordinates and permanent warning before Confirm, with Other buildings after
the action and no horizontal overflow. Explicit confirmation produced the QA
status `Synthetic controller: command suppressed. No resources or authority changed.`
and disabled repeat confirmation. No real build or server acceptance is claimed.

Root then opened the `blocked-placement` fixture and used Adjust placement.
The inspected schematic visibly placed the draft over civic space, displayed
`Keep roads and civic space clear.`, retained schematic focus and measured
top170.09px, and Confirm placement was disabled. This resolves the earlier
portrait legal/blocked evidence gap where only identical catalog views were
captured. Temporary viewport emulation was reset. Remaining landscape,
all-family, accessibility, readiness and actual-owner gates remain open.

### Six-family level-five inspection coverage

Root exercised all six actual selection controls in the local balanced
`all-six-level-five` fixture at390×844. Each explicit selection focused its own
Upgrade heading, placed its sole card before the other five, retained disabled
maximum-level confirmation, and inspection labelled the selected family with
one canvas. Portrait screenshots showed contained mill, lumber, stoneworks,
goldworks, barracks and cathedral silhouettes/footprints. The economy sites
remain distinguishable by their roofs and working structures; this qualitative
inspection does not replace the numeric projected-extent gate.

At844×390, all six selected inspection states measured the canvas at
x33,y222.39,width763,height159.61,bottom382, with no horizontal overflow.
Immediate screenshots in that batch lagged the measured scroll position and
are not accepted as six landscape visual passes. A separately settled cathedral
frame showed its complete silhouette and footprint beneath the sticky resources
and toolbar. The temporary viewport override was reset. Visual source remains
cb8cac6; concurrent CI-only work does not change the scene. This is synthetic
browser-emulation evidence, not physical-device or actual-owner gameplay proof.

### Reduced-quality fallback navigation

Root exercised the local `fallback` fixture in Chrome at390×844 with reduced
quality. The page reported that3D graphics were unavailable and commands remained
available through the schematic. Zoom, Fit grounds and Inspect were disabled;
there were zero canvases. Selecting the existing level-five mill focused its
review. View site focused the open schematic; Review upgrade returned focus to
Upgrade City Mill. No horizontal overflow was measured. The viewport override
was reset. This verifies initial WebGL-unavailable navigation, not missing-asset
recovery or context restoration, which remain separate mandatory checks.

### Hosted Linux native contracts passed at88e35b4

The reviewed CI amendment `88e35b48cb0eb66ec35e472081caa906bb2df461`
was scanned and pushed; the remote branch SHA matched. Authenticated inspection
of Verify run34062404692, native-contract job101565131316, reports success.
All preparation steps passed: hosted Linux X64 guard, pinned Node/pnpm setup,
private Node staging, fresh root and bridge installation, and post-install
re-attestation. The actual job log reports three files and105 tests passed,
no skips, duration3.95s at2026-09-06T21:54:16Z.

Evidence: https://github.com/ael-dev3/Warpkeep/actions/runs/34062404692/job/101565131316

This closes the missing-Wrangler/native-verification CI defect for this commit.
Auth-bridge and release-recovery jobs also succeeded in that run. The Linux job
still failed its full-history scanner and the SpacetimeDB job was in progress
when inspected. No aggregate Verify pass, production runner migration, live
deployment, or final release-source acceptance is claimed.

Ruling: retain duplicated inline private-Node setup in the two disposable jobs,
with full parsed-step parity checks, for the bounded repair. This preserves the
existing execution boundaries; cost is duplicated maintenance. Carry this
explicit maintainability trade-off to the final whole-branch review.

### Post-readability pending-to-ready mobile check

Root armed the existing one-shot synthetic pending-to-ready checkbox, then
explicitly confirmed a legal City Mill draft at390×844. Immediate DOM observation
reported focus on Back during pending. After ready returned, focus was Close
panel; its measured top182.99/bottom227.49 and44.5px height lay below the header
bottom161.89. One canvas and no horizontal overflow; settled screenshot inspected.

At844×390 the previous draft remained disabled, so the attempted click correctly
timed out without submission. Root did not override it: selected a fresh Lumber
Camp draft using the real catalog control, confirmed it with the one-shot option,
observed pending Back, then restored Close with the same vertical measurements,
one canvas and no overflow. Landscape screenshot inspected, viewport reset.
This confirms native synthetic readiness focus after the readability change;
it does not prove an authenticated command, reconnect or real server transition.

### Native context loss and restoration after readability

Root used the actual QA Lose/Restore WebGL context controls in Chrome390×844,
reduced quality, `context-cycle` fixture. Before loss, selected City Mill
inspection was WebGL. After the asynchronous loss event, mode was fallback,
Inspect disabled, and the unavailable-graphics explanation present. The one
retired canvas remained for the existing restoration listener; it was not counted
as an active renderer. View site still focused the schematic during fallback.

After restoration settled, WebGL returned with exactly one canvas, City Mill
selection retained and camera at Whole grounds as specified. Explicit Inspect
worked again and the recovered screenshot was inspected. Unmount keep then
left zero canvases and zero keep roots. Viewport override reset. This is one
native synthetic loss/restoration cycle and DOM cleanup evidence, not the
multi-cycle heap/RAF/listener budget or physical-device acceptance.

### Missing-model native inspection (2026-09-07 local)

Root selected the existing missing-model fault through the local QA dropdown
on the completed level-one mill, balanced quality, Chrome390×844. After loading,
Inspect selected site remained available, WebGL mode returned with one canvas,
and the inspected screenshot showed the simple mill fallback and its full
footprint in frame. The schematic remained present. Viewport override reset.
This fault removes the admitted model from the fixture asset bundle; it is not
an actual HTTP transport failure or a physical-phone test.

Repair and review the concrete CI failures, complete the no-Mac execution path, publish reviewed gameplay/visual/operating sources, pass every required check on the final source, and integrate through repository protections. Capture final source/CI/PR identities in the release ledger. These intermediate observations cannot satisfy final release verification.

### Scanner checkpoint — 2026-09-07

Published `f6cb1bae40f8ad392f92a985cb3e3aee99c60e42` to
`codex/prepared-keep-bindings-fix`; authenticated `git ls-remote` returned that
exact commit. Root reviewed all four changed files: eight anchored rule/path/value
AND exceptions, independently constructed scanner fixtures, bounded process and
cleanup handling, regression tests, and the single CI invocation before the
unchanged full-history scan. Existing allowlists and scanner defaults remain.

Independent root execution of the real pinned Gitleaks 8.30.1 regression exited
0: 14 audited positives excluded and all 23 exact negative identities retained.
The four focused scanner/workflow test files passed 34/34 (00:10:12 local,
11.88 seconds). Outgoing `88e35b4..f6cb1ba` scanned one commit / 17,320 bytes
with no findings. The implementer separately recorded a successful actual-config
full-history scan of 767 scanned commits / 42,226,410 bytes; that is not yet a
hosted CI result. Hosted acceptance remains pending. No production effects.

### Settled landscape level-five follow-up — 2026-09-07

Root revisited the balanced `all-six-level-five` local fixture in native Chrome
at 844×390 on source `78a0a7a` (visual code unchanged from cb8cac6). Selected
City Mill, Lumber Camp, City Stoneworks, City Goldworks and City Barracks through
their actual controls, then Inspect selected site. Each screenshot was requested
in a separate call after the camera/scroll action, avoiding the stale immediate
frames recorded earlier. All five selected silhouettes and footprints were
contained in the visible canvas beneath the resource header and toolbar.

The final barracks DOM check measured canvas x33/y222.390625, width763,
height159.609375, bottom382; WebGL mode, one canvas, Inspect focus and no
horizontal overflow. Viewport emulation was reset. Along with the previously
settled cathedral image, this fills the six-family level-five landscape
qualitative coverage gap. Numeric projected extent, other progression and
construction states, production performance and real owner gameplay remain
separate open acceptance gates. These were synthetic fixtures, not phone tests.

### Reduced construction inspection and busy-Builder copy defect

On 2026-09-07 root inspected the `mill-constructing` reduced-quality fixture in
Chrome at 390×844 and 844×390. Separately settled screenshots showed the full
scaffold and footprint beneath the toolbar in both layouts. Opening the catalog
reported Builder busy and disabled Confirm upgrade. Selecting Lumber Camp
focused Place Lumber Camp and retained disabled Confirm placement despite
sufficient displayed resources. No command or authoritative state changed;
the viewport override was reset.

Observed clarity defect: the selected legal draft's scene status says
`Ready to build.` while the catalog still reports `Builder busy`. The disabled
command behavior is correct, but the placement-validity copy overclaims command
readiness. A bounded copy/state regression fix is needed; it must not change
Builder authority or enable submission. This finding is within the existing
clear-next-action requirement, not a new gameplay feature. Other building
construction states and authoritative completion remain unverified.

Source trace: `src/ptr/gameplay04/gameplay04Placement.ts:27` maps geometric
reason `valid` to the misleading sentence. `Keep04Schematic.tsx:65` displays it
without command eligibility context. Separately, `quoteBuilding04` in
`gameplay04Presentation.ts:86` rejects an active project, so the catalog cannot
form a confirmable quote. The bounded correction is to describe valid placement
only, leaving quote validation and command enablement unchanged. Regression
coverage should exercise a legal draft with a busy Builder and insufficient
resources, not merely assert a string constant in isolation.

Resolution checked during the 2026-09-08 documentation audit: commit
`fd8b146c877fdbe75f02e4b0adecae31ffe1a0a3`, already in the current development
history, changes the message to `Placement is valid.` and adds the relevant DOM
regression. See [placement-readiness evidence](placement-readiness-copy.md).
The observation above is historical and is not an outstanding copy defect.
