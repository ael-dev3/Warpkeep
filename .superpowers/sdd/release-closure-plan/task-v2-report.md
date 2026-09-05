# V2 mobile Greater Realm presentation repair

## Result

Implemented the bounded narrow-screen presentation repair on base
`f4ccc26da4f9668a3c435d03514b519f83823507`.

Source and tests commit:
`d9c29f73aa16f6024727d529d93370f742b791f7`

At narrow widths the persistent summary keeps current loading/failure status,
Inner Keep entry (when available), and Return to Menu visible. Optional balances
and Worker totals are behind the `Realm details` disclosure. Map/vessel actions
and resource/Worker actions are behind the `Map and vessel controls` and
`Nearby resources and workers` disclosures. The scene disclosures share one
open state with Realm details, so opening one closes the others. Escape closes
the active custom disclosure and restores focus to its trigger.

Desktop content remains expanded. The renderer canvas is not conditionally
mounted by this presentation state. Narrow-to-narrow resize retains the same
canvas host and selection in the component test. The browser breakpoint probe
retains the same canvas DOM node across 390 -> 1440 -> 390. Existing adaptive
view policy can recreate the internal host when its device class/profile/view
dependencies change across the desktop/mobile breakpoint; this task did not
change that renderer policy and does not claim host-instance continuity across
that breakpoint.

## Exact owned files

- `src/components/realm/GreaterRealmWorldScene.tsx`
- `src/components/realm/RealmMapScreen.tsx`
- `src/components/realm/RealmMapScreen.css`
- `src/components/realm/useNarrowRealmPresentation.ts`
- `tests/greaterRealmWorldScene.test.tsx`
- `tests/greaterRealmHostQaNavigation.test.tsx`
- `tests/realmMapScreen.test.tsx`
- `tests/realmCastleCssContract.test.ts`
- `.superpowers/sdd/release-closure-plan/task-v2-report.md` (this report only)

No renderer-runtime, voxel-mechanics, backend, policy, persistence,
authentication, dependency, package, or lock file was changed. Pre-existing
unrelated line-ending dirt and the root `node_modules` junction were preserved.

## TDD evidence

RED command:

```powershell
& '.\.git\ci-node-22.22.3\node.exe' '.\node_modules\vitest\vitest.mjs' run tests/greaterRealmWorldScene.test.tsx tests/realmMapScreen.test.tsx tests/greaterRealmHostQaNavigation.test.tsx tests/realmCastleCssContract.test.ts --maxWorkers=1
```

Initial result: exit 1; 4 files failed; 5 tests failed and 53 passed. Missing
disclosure triggers and disclosure-body CSS caused the expected failures. One
RealmMapScreen assertion initially expected different status wording; it was
corrected while production was still unchanged, and the isolated rerun then
failed on the missing `Realm details` trigger as intended.

Additional RED checks found during actual-browser review:

- The resource trigger was not hidden while map controls were open: targeted
  `greaterRealmWorldScene` run exited 1 at the new sibling-occlusion assertion.
- Opening `Realm details` left map controls expanded: targeted
  `realmMapScreen` run exited 1 (`expected aria-expanded "false"`, received
  `"true"`).
- A desktop/mobile round trip retained an open details panel: targeted
  `realmMapScreen` run exited 1 (`expected aria-expanded "false"`, received
  `"true"`).

GREEN focused command (before the final resize-default assertion): the same
four-file command exited 0 with 4 files and 58 tests passed. Pinned app
TypeScript also exited 0.

Final scoped gate command after all source changes:

```powershell
& '.\.git\ci-node-22.22.3\node.exe' '.\node_modules\vitest\vitest.mjs' run tests/greaterRealmWorldScene.test.tsx tests/greaterRealmHostQaNavigation.test.tsx tests/realmMapScreen.test.tsx tests/realmCastleCssContract.test.ts tests/realmChoicePolicy.test.ts tests/realmChoiceMenuIntegration.test.tsx tests/WarpkeepExperiencePtrRealm.test.tsx --maxWorkers=1
```

Result: exit 0; 7 files passed; 102 tests passed; duration 33.22s.

Pinned TypeScript command, chained after that green test run:

```powershell
& '.\.git\ci-node-22.22.3\node.exe' '.\node_modules\typescript\bin\tsc' -p tsconfig.app.json --tsBuildInfoFile .git/voxel-runtime.tsbuildinfo
```

Result: exit 0 with no diagnostics.

`git diff --cached --check` passed before the source/test commit. Git emitted
only the already-known warning that `RealmMapScreen.css` will be converted from
LF to CRLF the next time Git touches it.

## Actual local Chrome synthetic QA

The controller ran the private local synthetic host at both required sizes.

Baseline evidence:

- `.git/voxel-viewport-compact-koeZIu` (360x640), exit 0
- `.git/voxel-viewport-balanced-sHqFcQ` (390x844), exit 0
- Existing four-panel rectangle union covered 89.99% and 71.57% of the
  respective viewports, leaving only 10.01% and 28.43% uncovered (chat was not
  included in that union). The 360 screenshot showed the map nearly entirely
  obscured.

First repaired pass:

- `.git/voxel-viewport-ui360-QnElJh`, exit 0 in 7.26s
- `.git/voxel-viewport-ui390-qiqUyn`, exit 0 in 6.94s
- Default uncovered fractions improved to 70.44% and 78.06%.
- Visual inspection found that the expanded map/vessel panel still had controls
  occluded by the closed resource trigger and chat launcher. That observation
  produced the additional RED coverage and overlap correction above.

Final repaired pass:

- `.git/voxel-viewport-ui360-7oJ2Ls`, exit 0 in 7.43s
- `.git/voxel-viewport-ui390-sAZoel`, exit 0 in 7.39s
- Individual screenshot inspection confirmed that the previous sibling/chat
  occlusion was removed. The vessel disclaimer and enabled map/vessel controls
  are visible; the resource panel clears the chat launcher.
- All three disclosures defaulted closed with matching `aria-expanded` and
  `aria-controls`; controlled panels were visible and viewport-bounded when
  opened.
- Every enabled panel-button center hit the intended button or a descendant
  through `elementFromPoint` after `scrollIntoView`.
- Synthetic Escape collapsed each panel and returned focus to its trigger.
- The responsive round trip retained the same canvas DOM node.
- Three realm-navigation cycles and context recovery passed.

This is synthetic/emulated local Chrome evidence. Clicks and Escape were DOM
events. It is not authenticated gameplay acceptance, physical-device/touch or
physical-keyboard acceptance, long-duration performance evidence, or proof that
the internal renderer host instance survives an adaptive-policy breakpoint.

## Full-suite attempt and unresolved concerns

A full `vitest run --maxWorkers=1` was attempted after the first repaired browser
pass. It was manually interrupted after about ten minutes, before Vitest emitted
its final error-detail section, because unrelated Git/security fixture groups
were taking minutes each and had already reported these failures:

- `tests/greaterRealmRuntimeRelease.test.ts`: 5 failures
  - `persists a 0600 seed control before a 0700 release and makes exact retries idempotent`
  - `rejects a stale release from another selected candidate at the same C0`
  - `fails closed when publication lacks its separate seed control`
  - `persists PTR bytes only inside its release-specific private namespace`
  - `fails closed when PTR publication lacks its dedicated seed control`
- `tests/licensePolicy.test.ts`: 4 failures
  - `cannot skip a newline-containing package manifest during Git tree enumeration`
  - `rejects a symlink-mode required file at the cutover commit`
  - `accepts a valid two-commit cutover and attestation`
  - `rejects current HEAD when it no longer preserves the attested invariants`
- `tests/greaterRealmCliSecurity.test.ts`: 7 failures
  - `rejects tracked, untracked, and ignored importer drift but allows outside-scope drift`
  - `requires an exactly clean C3 Git tree before preparing the C4 report`
  - `allows only the exact C0-to-C3 v17 policy transition while preparing C4`
  - `restricts public evidence exports to one canonical JSON basename`
  - `publishes exact sanitized evidence bytes with pinned public-file metadata`
  - `rejects temporary-file substitution without deleting the replacement`
  - `fails closed when sanitized evidence bytes or mode drift before install`
- `tests/authBridgeNotificationB0Closure.test.ts`: 1 failure
  - `keeps the derived and builtins-only closure namespaces equal`

Exact assertion/stack errors were not emitted before interruption, so no error
text beyond the failing test names is available. These failures were not
reproduced on base and are classified only by ownership/source inspection as
outside the V2 UI paths; this report does not claim the full suite is green.
The required scoped gates and pinned app TypeScript are green as recorded above.

Full release, backend gameplay, palette polish, authenticated/physical-device
acceptance, and long-duration performance remain separate requirements.

## Review fix round 1 (superseding corrections)

This section supersedes the earlier breakpoint-continuity limitation and the
classification of the B0 closure failure above. The correction was developed
from review base `9c4bf5f131ad98eb29f79fc336a8d8046d8a16ef`.

Fix source and tests commit:
`3bbcfc18c4918e9047ded6201f4e866d5b076b1e`

The canvas host is now keyed only to genuine session, identity, and own-castle
authority changes. A responsive policy change keeps the same canvas host and
WebGL renderer, creates a profile-appropriate scene runtime inside that host,
reapplies the latest validated snapshot so uploads are queued under the new
budget, and retains a selected target only when the same kind and atlas
coordinate remain in the returned view. The old scene runtime is disposed only
after its replacement starts. Replacement is deferred while the context is
lost and applied after restoration; a failed replacement is cleaned up and
fails the host closed. Genuine session/identity changes still dispose the host
and its authority. The generation-scoped public client runtime/subscription is
still replaced when its adaptive device/profile/window policy changes, so its
network and selected-chunk budgets are not frozen. This report claims host,
WebGL renderer, and valid world-selection continuity across the breakpoint; it
does not claim that every internal scene or client runtime object is retained.

The Greater-Realm disclosure wrappers now render only in the
`greater-realm` strategy. The `connection-hold` branch again renders its status,
resource/Worker spans, Inner Keep action, and Return to Menu directly under the
original `.realm-map-screen__loading` parent, with no hidden disclosure trigger
or Greater-Realm wrapper in that branch.

Narrow disclosure state and adjacent realm-chat device chrome now use the same
exported predicate. The shared boundary is `< 760px` (or a coarse pointer), and
the CSS queries use the same strict width comparison, eliminating the mixed
mode at exactly 760px.

The exact prepared-deploy closure authority now includes all five paths that
were present in the derived graph but missing from the fixed sorted namespace:

- `scripts/ptr-binding-locked-source-build-core.ts`
- `scripts/ptr-binding-locked-source-build.ts`
- `src/components/realm/greaterRealmVoxelPresentation.ts`
- `src/components/realm/useNarrowRealmPresentation.ts`
- `src/components/realm/voxelSurfaceMesh.ts`

The exact member-count assertions in B0Closure, PreparedWorkflow, and
PreparedReleaseProjection are now 1027. Derived/fixed graph equality,
declaration parity, membership checks, and release-transition verification were
retained; no release activation, refreeze, graph bypass, or security-guard
weakening was added.

### Fix-round exact owned files

- `scripts/auth-bridge-notification-prepared-deploy-closure.mjs`
- `src/components/realm/GreaterRealmWorldScene.tsx`
- `src/components/realm/RealmMapScreen.css`
- `src/components/realm/RealmMapScreen.tsx`
- `src/components/realm/createGreaterRealmWorldCanvasHost.ts`
- `src/components/realm/useNarrowRealmPresentation.ts`
- `tests/authBridgeNotificationB0Closure.test.ts`
- `tests/authBridgeNotificationPreparedReleaseProjection.test.ts`
- `tests/authBridgeNotificationPreparedWorkflow.test.ts`
- `tests/greaterRealmWorldCanvasHost.test.ts`
- `tests/greaterRealmWorldScene.test.tsx`
- `tests/realmCastleCssContract.test.ts`
- `tests/realmMapScreen.test.tsx`
- `.superpowers/sdd/release-closure-plan/task-v2-report.md` (report commit only)

Unrelated line-ending dirt, the unrelated integrated-voxel plan edit, G001
projection, backend work, and the root `node_modules` junction were preserved.
No dependency or lockfile was changed.

### Fix-round TDD and verification evidence

Responsive/legacy/threshold RED command:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/greaterRealmWorldScene.test.tsx tests/greaterRealmWorldCanvasHost.test.ts tests/realmMapScreen.test.tsx --maxWorkers=1
```

Result: exit 1; 3 files failed; 5 tests failed and 62 passed. The new tests
reported that the host factory was called twice at 390 -> 1440,
`host.updatePolicy` did not exist, the disclosure trigger was present at exactly
760px, and the connection-hold branch still contained the hidden Realm-details
trigger/wrappers. A later canvas lifecycle assertion also failed because the
missing-method exception aborted the new host test before disposal and leaked
its listeners; it passed once that primary RED was corrected.

Closure RED command:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/authBridgeNotificationB0Closure.test.ts --maxWorkers=1
```

Result: exit 1; 1 test failed and 2 passed. Exact error:
`AssertionError: expected [ …(1027) ] to deeply equal [ …(1022) ]`. The diff
listed exactly the two PTR build files, the two voxel files, and the new narrow
presentation hook recorded above.

Final UI/host gate after all source changes:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/greaterRealmWorldScene.test.tsx tests/greaterRealmWorldCanvasHost.test.ts tests/greaterRealmHostQaNavigation.test.tsx tests/realmMapScreen.test.tsx tests/realmCastleCssContract.test.ts tests/realmChoicePolicy.test.ts tests/realmChoiceMenuIntegration.test.tsx tests/WarpkeepExperiencePtrRealm.test.tsx --maxWorkers=1
```

Result: exit 0; 8 files passed; 128 tests passed; duration 34.44s. The host
coverage includes adaptive replacement/requeue, valid-selection retention,
invalid-selection clearing, context-loss deferral/restoration, failed-swap
cleanup, and genuine owner teardown.

Final pinned app TypeScript command:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -p tsconfig.app.json --tsBuildInfoFile .git/voxel-runtime.tsbuildinfo
```

Result: exit 0 with no diagnostics.

Final B0 topology command was the RED command above after correction. Result:
exit 0; 1 file passed; 3 tests passed; duration 6.26s.

Focused PreparedWorkflow command:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/authBridgeNotificationPreparedWorkflow.test.ts -t "derives the exact executable" --maxWorkers=1
```

Native Windows result: exit 1; the focused test reached its final policy
verifier after the exact path/manifest/count assertions, then failed with
`AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_REPOSITORY_INVALID` at
`scripts/auth-bridge-notification-prepared-deploy-closure.mjs:1247`, called by
the verifier at line 1876 and the test at line 1320. The guard was not changed.

Focused PreparedReleaseProjection command:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/authBridgeNotificationPreparedReleaseProjection.test.ts -t "constructs the same C0 authority" --maxWorkers=1
```

Native Windows result: exit 1 with the same
`AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_REPOSITORY_INVALID` at closure lines
1247/1876, reached from the projection verifier/test at lines 231/454. No test
or security-policy source was weakened.

Fresh exact-source Linux verification used detached commit
`3bbcfc18c4918e9047ded6201f4e866d5b076b1e` in
`/tmp/warpkeep-v2-closure-rKkfKm9k/repo`, cloned with `--no-hardlinks` and an
initial clean Git status. Existing root and auth-bridge dependencies were
reused through ignored symlinks; nothing was reinstalled. The projection filter
passed 1 test with 6 filtered in 1.138s. The workflow filter passed 1 test with
117 filtered, exit 0, in 8.72s. An initial combined attempt had a workflow
import/setup failure because service dependencies were absent; after linking
the existing service dependency tree, the exact workflow filter passed. These
are focused exact-source results, not the complete PreparedWorkflow or
PreparedReleaseProjection files.

`git diff --cached --check` passed before the fix source/test commit. Git again
emitted only the known `RealmMapScreen.css` LF-to-CRLF working-copy warning.

### Fix-round actual local Chrome synthetic QA

The controller reran the strengthened private probe against the stable fix
source:

- `.git/voxel-viewport-ui390-yrMwy8`, exit 0 in 7.63s
- `.git/voxel-viewport-ui360-gtP0qp`, exit 0 in 8.99s

The probe used the actual `SELECT NEXT` control and retained the exact selected
status `The Hegemony Lowlands at -1, 1` through 390 -> 1440 -> 390, with the
same canvas. All disclosure, hit-target, synthetic Escape/focus, three realm
cycles, resize, and actual WebGL context-recovery checks passed. Fresh visual
inspection of `ui360-gtP0qp/panel-2.png` and
`ui390-yrMwy8/recovery.png` confirmed that the map/vessel panel and disclaimer
remain clear of chat and that the recovered scene is visible with compact
controls.

This remains local synthetic Chrome evidence using DOM clicks and synthetic
Escape. It is not physical-device/touch/keyboard acceptance, authenticated
gameplay, long-duration performance evidence, or proof that all internal scene
and client runtime objects persist across the breakpoint.

### Corrected full-suite classification

The earlier full-suite attempt remains interrupted before Vitest emitted a
final summary or assertion-detail section; it was not rerun in this fix round.
The 16 named RuntimeRelease, LicensePolicy, and GreaterRealmCliSecurity failures
were independently reproduced on native Windows. The controller then ran the
three complete groups in an existing Linux scratch whose implicated test/source
hashes matched and obtained 89/89 passing in 322.95s. That Linux scratch was not
the current fix commit, so this is platform-diagnostic evidence rather than a
current-HEAD full-suite certification. It is consistent with the native
failures exercising POSIX ancestor-mode, newline-filename creation, and trusted
Git-mode admission guards; those guards were intentionally left unchanged.

The B0 closure mismatch was not unrelated: it was a real source-closure defect
within this fix scope. It is corrected by the exact five-member integration and
the focused B0 gate is green as recorded above. The original interrupted run
still provides no whole-suite-green claim.
