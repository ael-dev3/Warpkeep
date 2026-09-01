# Task 5 implementation report: sealed realm selector isolation

## Outcome

Implemented Task 5 from exact clean base
`35b3e53f09a489f1102be0a78a25cd27ecbbaa56` in the supplied linked
worktree. The selector now exposes the exact human label `Public Test Realm`.
Opening the Realm Directory and selecting any realm remain presentation-only.
Only an explicit PTR Enter can start a fresh access check, and only a later
Enter with admitted server authority can invoke the PTR entry boundary.

## TDD evidence

### Clean baseline

The initial package-script invocation did not reach Vitest because the supplied
worktree had no usable local binary shim:

```powershell
npm test -- tests/realmChoicePolicy.test.ts tests/RealmChoiceSelector.test.tsx tests/realmChoiceMenuIntegration.test.tsx tests/WarpkeepExperience.test.tsx tests/WarpkeepExperiencePtrRealm.test.tsx tests/PtrRealmProvider.test.tsx --maxWorkers=1
```

Evidence: exit 1, `'vitest' is not recognized as an internal or external
command`. After establishing an offline cached runtime, the direct equivalent
baseline command passed 6 files and 69 tests:

```powershell
& 'C:\Users\heyas\AppData\Local\hermes\node\node.exe' 'node_modules\vitest\vitest.mjs' --run tests/realmChoicePolicy.test.ts tests/RealmChoiceSelector.test.tsx tests/realmChoiceMenuIntegration.test.tsx tests/WarpkeepExperience.test.tsx tests/WarpkeepExperiencePtrRealm.test.tsx tests/PtrRealmProvider.test.tsx --maxWorkers=1
```

Evidence: 6 files passed, 69 tests passed, 0 failed.

### RED

All required selector, side-effect, PTR state-matrix, browser-forgery, remount,
G002, and G001 regression tests were added before changing product source.
Running the focused command above produced:

- 6 test files total;
- 2 passed and 4 failed;
- 78 tests total;
- 56 passed and 22 failed.

The exact failures matched the expected defects:

- chooser-open tests observed `checkRealms` called once from
  `openRealmChoice()`; and
- accessibility and integration queries could not find
  `Public Test Realm` because the accessible name was still `PTR`.

No product source had changed when this RED evidence was captured.

### GREEN

After the minimal source changes, the focused suite passed 78/78. After adding
additional Experience-level G002, admitted-G001, and provider error/expiry
regressions, the initial implementation focused suite passed 81/81:

```powershell
& 'C:\Users\heyas\AppData\Local\hermes\node\node.exe' 'node_modules\vitest\vitest.mjs' --run tests/realmChoicePolicy.test.ts tests/RealmChoiceSelector.test.tsx tests/realmChoiceMenuIntegration.test.tsx tests/WarpkeepExperience.test.tsx tests/WarpkeepExperiencePtrRealm.test.tsx tests/PtrRealmProvider.test.tsx --maxWorkers=1
```

Evidence: 6 files passed, 81 tests passed, 0 failed before independent review.

The exact focused-plus-accessibility gate passed:

```powershell
& 'C:\Users\heyas\AppData\Local\hermes\node\node.exe' 'node_modules\vitest\vitest.mjs' --run tests/realmChoicePolicy.test.ts tests/RealmChoiceSelector.test.tsx tests/realmChoiceMenuIntegration.test.tsx tests/WarpkeepExperience.test.tsx tests/WarpkeepExperiencePtrRealm.test.tsx tests/PtrRealmProvider.test.tsx tests/realmAccessibilityControls.test.tsx --maxWorkers=1
```

Evidence: 7 files passed, 94 tests passed, 0 failed before independent review.

The nearest G001 entry/admission regression suite passed:

```powershell
& 'C:\Users\heyas\AppData\Local\hermes\node\node.exe' 'node_modules\vitest\vitest.mjs' --run tests/realmChoiceMenuIntegration.test.tsx tests/farcasterAdmissionPanel.test.tsx tests/farcasterMiniAppEntryGate.test.tsx --maxWorkers=1
```

Evidence: 3 files passed, 50 tests passed, 0 failed. This includes the unchanged
admitted Genesis 001 callback and suspended-new-admission presentation.

Root typecheck passed:

```powershell
& 'C:\Users\heyas\AppData\Local\hermes\node\node.exe' 'node_modules\typescript\bin\tsc' -b
```

Evidence: exit 0 with no output.

### Independent-review fix loop

Independent review found that a completed provider check changed the PTR radio
authority but left the locally stored pending live-region notice stale. It also
found that the menu's advertised error/expired/revoked table repeated the same
omitted-authority fixture three times.

Before changing product source, real Experience/provider transition tests were
added for unknown-to-admitted, unknown-to-server-denied, access-error recovery,
and authority expiry/renewal. The targeted RED command was:

```powershell
& 'C:\Users\heyas\AppData\Local\hermes\node\node.exe' 'node_modules\vitest\vitest.mjs' --run tests/WarpkeepExperiencePtrRealm.test.tsx tests/realmChoiceMenuIntegration.test.tsx --maxWorkers=1
```

Evidence: 2 files ran, 35 tests total, 33 passed and 2 failed. The admitted
failure still exposed `PTR_UNKNOWN_NOTICE`; the denied failure expected
`PTR_NOT_ADMITTED_NOTICE` but received `PTR_UNKNOWN_NOTICE`. The distinct real
provider error and expiry transitions already passed, proving one fresh explicit
check and zero preflight/connection before renewed admission.

The first minimal reconciliation passed the 35/35 targeted suite. A subsequent
same-tick Enter test then exposed the prop-only busy race before the guard change:

```text
tests/realmChoiceMenuIntegration.test.tsx: 26 tests, 25 passed, 1 failed
expected checkRealms once, received two calls
```

The final implementation uses a local generation-scoped active status attempt.
It is established synchronously before the check callback, reconciles only after
that exact local attempt observes the provider busy-to-terminal lifecycle, and
is invalidated on Realm Directory reopen, Back, non-PTR selection, terminal
explicit Enter, and unmount. Reconciliation changes presentation state only: it
never invokes another check, PTR entry, preflight, or connection.

First review-loop targeted GREEN evidence: 2 files passed and 37/37 tests passed.
The focused suite passed 6 files and 84/84 tests. The focused-plus-accessibility
gate passed 7 files and 97/97 tests. The G001 regression gate passed 3
files and 50/50 tests. Root typecheck again exited 0 with no output.

### Second independent-review fix loop

The second review identified a synchronous terminal path: an ineligible PTR
provider publishes `unavailable` and returns without exposing a `checking`
render. The local attempt had required an observed busy frame before releasing,
so that no-busy attempt stayed latched and swallowed every later explicit Enter.

Before changing product source, the menu double-submit test was tightened to
dispatch two DOM clicks in one `act`, before effects. Separate menu and real
Experience/provider tests then required a later post-effect Enter to proceed,
including a regular-web synchronous `unavailable` result followed by an eligible
mini-app host. Targeted RED evidence from the same two-file command:

```text
2 files, 39 tests: 37 passed, 2 failed
menu later Enter: expected two total checks, received one
provider unavailable-to-eligible: later Enter remained Access unknown
```

The minimal product change releases a locally initiated attempt at its first
effect when no busy frame was observed. It preserves `PTR_UNKNOWN_NOTICE` and
invokes no callback. Same-call-stack clicks remain synchronously guarded until
that effect, while busy-observed attempts retain admitted/denied reconciliation.

Final targeted GREEN evidence: 2 files passed and 39/39 tests passed. The final
focused suite passed 6 files and 86/86 tests. The final focused-plus-accessibility
gate passed 7 files and 99/99 tests. The final G001 regression gate passed 3
files and 51/51 tests. Root typecheck again exited 0 with no output.

## Product changes

- `src/components/menu/realmChoicePolicy.ts`
  - changed only the human PTR label from `PTR` to `Public Test Realm`;
  - retained realm ID `ptr`, release `0.4.0-ptr.1`, status, tooltip, and
    authority semantics.
- `src/components/menu/WarpkeepMainMenu.tsx`
  - removed the unconditional PTR access check from Realm Directory open;
  - left selection as memory-only React presentation state;
  - on explicit PTR Enter, routes admitted authority only to the distinct PTR
    entry callback, keeps server denial deterministic without retry, keeps the
    checking state locked, and starts one fresh access check for the boundary
    representation shared by unknown/error/expired/revoked states;
  - scopes pending-result status reconciliation to one locally initiated,
    generation-guarded busy lifecycle, preventing same-tick duplicate checks
    and late or unrelated authority updates from rewriting dismissed status;
  - releases synchronous no-busy terminal attempts after their post-event
    render so a later explicit Enter can start one fresh check.

No provider, auth bridge, token, transport, reducer, verifier, workflow,
activation, package/version, infrastructure, or Genesis 001 product source was
changed.

## Regression evidence added

- exact accessible names, versions, statuses, tooltips, and keyboard navigation;
- chooser-open and independent G001/G002/PTR selection side-effect isolation;
- G002 explicit Enter before Terms, session restore, Quick Auth, admission,
  PTR exchange/entry, or either database connection boundary;
- PTR unknown, checking, denied, error, expired/revoked, and authorized branch
  behavior;
- admitted and server-denied live-status reconciliation through real provider
  transitions, with no automatic entry or connection;
- same-tick duplicate Enter suppression and late-result dismissal isolation;
- synchronous unavailable-to-eligible retry through real Experience/provider
  wiring, with zero entry, preflight, or connection before admission;
- two-step PTR access-check then admitted-entry ordering;
- provider admission plus current opaque authority before preflight/connection;
- forged query, `#realm`, local storage, session storage, cookie, and
  `history.state.warpkeepRealmId` refusal;
- remount reset to Genesis 001 with no retained PTR authority;
- unchanged existing-player G001 callback and suspended-new-admission UI.

## Dependency-runtime incident and restoration

The supplied worktree initially contained no usable Vitest shim. An explicitly
offline, scripts-disabled cached install was attempted. `npm ci --offline`
failed on malformed Windows reparse-point shims. The subsequent
`npm install --offline --ignore-scripts --no-bin-links` populated ignored
`node_modules` from cache but npm 12 pruned 26 tracked lockfile lines for two
optional peer entries. No source work continued while the lockfile was dirty.

Those exact entries were restored with a targeted patch. Verification after
restoration:

```text
git diff -- package-lock.json: empty
worktree package-lock blob: 1c042ba59d1e90565dbaa8293545d5f57d3cd822
HEAD package-lock blob:     1c042ba59d1e90565dbaa8293545d5f57d3cd822
```

No further dependency/install command was run. Ignored `node_modules` is not
part of the commit.

## Scope and protected-byte checks

```text
package version: 0.3.43
package.json worktree/HEAD blob: 7e6b102d6778aa66ee237cfd5c33ab769aaa83df
package-lock.json worktree/HEAD blob: 1c042ba59d1e90565dbaa8293545d5f57d3cd822
sealed release binding worktree/HEAD blob: 303178c14aa232529072394af6149d486f87119d
protected G001 diff: empty
Task 3/4/auth/transport/verifier/workflow/config diff: empty
git diff --check: exit 0
```

Tracked implementation scope before this report was exactly:

```text
src/components/menu/WarpkeepMainMenu.tsx
src/components/menu/realmChoicePolicy.ts
tests/PtrRealmProvider.test.tsx
tests/RealmChoiceSelector.test.tsx
tests/WarpkeepExperiencePtrRealm.test.tsx
tests/realmChoiceMenuIntegration.test.tsx
tests/realmChoicePolicy.test.ts
```

No network, GitHub, Cloudflare, SpacetimeDB, deployment, or infrastructure
operation was performed.

## Residual risks and environment limitations

- The available local compatible runtime was Node `22.23.2`, not the plan's
  exact CI snapshot `22.22.3`. The code remains inside the declared Node 22
  engine range, and hosted verification retains the exact release toolchain.
- The supplied Windows binary-shim tree was malformed, so verification used the
  project-pinned Vitest `4.1.9` and TypeScript `7.0.2` entrypoints directly
  instead of the `npm test`/`npm run typecheck` wrappers. The exact requested
  test files and compiler build mode were executed.
- Error, unknown, and expired/revoked states intentionally collapse to the same
  no-authority presentation boundary in `WarpkeepMainMenu`; provider tests prove
  the distinct error/expiry transitions and fresh server-check requirement.
