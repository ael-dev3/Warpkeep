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
