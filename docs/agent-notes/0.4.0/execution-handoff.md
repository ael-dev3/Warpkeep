# Execution handoff and continued work

Created 2026-09-07 from audit baseline `1600f4b`. This is the bounded working queue
for the existing [R01–R18 contract](../../operations/0.4.0-release-checklist.md),
not a replacement goal. The owner's current priority is completing and reviewing
the README/documentation/agent rails before resuming this release queue.
Update the continuation section when authoritative state
changes; keep historical test results tied to their actual inputs.

## Before editing

1. Read [start here](README.md), inspect current commit, explicit changed paths,
   remote refs and running jobs. Preserve unrelated changes. This worktree had
   roughly 1,756 dirty tracked paths, largely line endings, plus local probes.
   Do not `git add -A`, normalize the checkout, reset it, or discard those changes.
2. Work on `codex/prepared-keep-bindings-fix` in the isolated 0.4 worktree. Read
   current permissions. Configured credentials may be used normally within actual
   authorization; an access denial is not permission to extract or bypass secrets.
3. Inspect scripts before invocation. Many production CLI entries intentionally
   refuse unconfigured execution. Do not replace these fences with success returns.
4. The root dependency tree is a shared junction. Do not install/remove packages
   there or use it for writable scratch state. Use an isolated clone/workspace for
   clean installs, dependency audits and disposable generation. Scope temporary
   output and subprocess ownership; never kill all Node processes or delete caches
   broadly to fix an incidental timeout.
5. Use exact file staging, review the staged diff, secret-scan outgoing history,
   push a non-forced explicit refspec, then verify remote SHA. Follow the
   [development sync policy](../../operations/0.4.0-development-sync.md).
   The temporary `codex/0.4-local-checkpoint` backup avoids cancelling a still-running
   PR database job; it is not a substitute for eventual PR-branch synchronization.

## Verification traps found in this audit

- **Root `tsc --noEmit` is not an app typecheck here.** `tsconfig.json` has
  `files: []` and only project references. A trivial exit 0 from that command does
   not traverse the app/Vite-configuration projects. Use the explicit two project checks below
  for read-only checking, or the repository build-mode `npm run typecheck` in a
  suitable isolated environment. Do not count earlier root-only noEmit exits as
  coverage of changed tests or application source.
- Root Vitest selects `tests/**/*.{test,spec}.{ts,tsx}`. Passing a module test path
  under `spacetimedb/tests` can leave it unselected; verify actual file/test counts
  and invoke the module's Node/tsx harness separately.
- A passing targeted test is not a full suite/build. A passing composite Linux
  clone with copied changed files is not exact-commit release evidence. A mocked
  SDK transaction is not a live owner/database call. Label all four separately.
- Windows private-file/fsync cases have shown timing variability. Keep default
  validation/deadlines; diagnose owned workloads and compare isolated Linux rather
  than deleting assertions or silently raising timeouts.
- A successful final PowerShell command does not prove earlier commands passed.
  Guard `$LASTEXITCODE` after each native command. Truncated logs and observation
  timeouts do not prove a running process failed or finished; resume its handle.

## Non-production local verification

Run from the repository root with its accepted Node/toolchain. This worktree has
Node 22.22.3 at `.git/ci-node-22.22.3/node.exe`; that local path is a convenience,
not a portable deployment identity. These commands do not run publishers.

```powershell
# Check the app and Vite-configuration projects, without build-info output.
& .git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit
if ($LASTEXITCODE -ne 0) { throw 'App typecheck failed' }
& .git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -p tsconfig.node.json --noEmit
if ($LASTEXITCODE -ne 0) { throw 'Vite configuration typecheck failed' }

# Separate module test selection.
& .git/ci-node-22.22.3/node.exe spacetimedb/node_modules/tsx/dist/cli.mjs --test spacetimedb/tests/genesis001AccessFreeze.test.ts
if ($LASTEXITCODE -ne 0) { throw 'G001 freeze test failed' }
```

Fresh audit backend/client/auth run at `1600f4b`: 17 suites, **301 passed**, 22.18s,
default timeouts, no installs:

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/gameplay04Policy.test.ts tests/gameplay04Keep.test.ts tests/gameplay04KeepModules.test.ts tests/gameplay04WorkerJourney.test.ts tests/gameplay04Workers.test.ts tests/gameplay04WorkersModules.test.ts tests/gameplay04Construction.test.ts tests/gameplay04ConstructionModules.test.ts tests/gameplay04Placement.test.ts tests/ptrOwnerPolicy.test.ts tests/ptrGameplay04Bindings.test.ts tests/ptrGameplay04Capability.test.ts tests/gameplay04Controller.test.ts tests/gameplay04ControllerLifecycle.test.tsx tests/ptrRealmAuthClient.test.ts tests/ptrRealmConnection.test.ts tests/PtrRealmProvider.test.tsx --maxWorkers=2
```

Second fresh run: 9 suites, **171 passed**, 24.30s. The separate G001 module command
above passed **7 tests**. Total audit gameplay/client/routing/module cases: **479**.

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/RealmChoiceSelector.test.tsx tests/WarpkeepExperiencePtrRealm.test.tsx tests/PtrGameplay04SurfaceHost.test.tsx tests/gameplay04ClientState.test.ts tests/gameplay04ClientPlacement.test.ts tests/gameplay04Presentation.test.ts tests/ptrRealmBackend.test.ts tests/ptrAtlasReadContract.test.ts tests/ptrRealmConfig.test.ts --maxWorkers=2
```

Recovery follow-up: the isolated Linux dependency-repair checkout, overlaid with
the three changed descriptor/source-declaration/test files from this worktree,
passed **39 tests in two suites** in 1.75s (Vitest 4.1.9, Node 22.22.3). The clone
contains earlier diagnostic overlays; this is component evidence, not final-source
attestation. The Windows async-consumer target separately passed; a Windows full
descriptor-suite pass was not claimed.

```text
node node_modules/vitest/vitest.mjs run tests/sealedRealmsProductionActivationRecords.test.ts tests/genesis001SealedLaunchAdoption.test.ts --maxWorkers=2
```

Full acceptance still needs the actual root `check` pipeline, service/module
checks, exact generated bindings, compiled family and mandatory CI. Root `build`
contains additional asset/private-output checks beyond Vite. Service and module
package scripts/lockfiles define their own toolchains; do not assume the root
TypeScript/Vitest version applies to all subprojects.

## Evidence-backed next sequence

1. **Complete the audit-driven refresh correction and interrupted descriptor
   regression.** Preserve canvas/focus on healthy reads, block unresolved commands,
   retire on failures/expiry, and test in-place completion. Recovery async results
   must be observed and rejected by the private FD owner; no-clobber evidence
   remains retained on failure. See continuation below for actual outcomes.
2. **Finish the representative owner path as soon as legitimate infrastructure
   permits it.** Trace generated bindings through provider/controller into real
   module adapters. Prove cross-expiry re-entry/uncertain-command behavior and the
   ten-minute improved-return gate; do not infer this from synthetic adapter tests.
3. **Complete required visual coverage and local release operations alongside
   each other.** Use the real 0.4 water path, not G001. Implement fixed recovery
   generator/source authentication, remaining producer/workflow adapters,
   existing-database update/reconciliation and supported local runner/workflow
   identity. A helper is done only when the required caller operates and tests
   cover its full boundary. Keep genuine app-admin/owner access as an explicit
   prerequisite for private live inspection, not something to fake locally.
4. **Test preservation/recovery before production effects.** Capture G001's exact
   deployed baseline privately; exercise isolated compatible update/recovery that
   retains later writes. Test G002 denied access without opening admissions.
5. **After operating/gameplay/visual source is settled, derive the complete
   candidate family.** Run the native compiler/assembler/probe on exact committed
   source, all five failed CI suites and all mandatory checks; verify repeated
   convergence. Never final-freeze early or type closure hashes/counts by hand.
6. **Protected integration → deployment → live verification → Desktop handoff.**
   Link exact source/CI/artifacts/deployments/databases/results. Upload success,
   a draft PR or unit tests cannot substitute for required live evidence.

Unrelated orchestration refactors, new admissions, additional gameplay, general
asset replacement and unrelated PRs remain deferred. No percentage estimate based
on test count or commits is a meaningful release-completion measure.

## Safe status inspection

Use these through currently permitted configured access; stop at a genuine denial.
Avoid repeated polling of unchanged jobs while useful local work is available.

```powershell
git log -1 --format='%H %s'
git diff --stat -- PATHS_OWNED_BY_THIS_CHANGE
git ls-remote upstream refs/heads/codex/0.4-local-checkpoint refs/heads/codex/prepared-keep-bindings-fix
gh pr view 228 --repo ael-dev3/Warpkeep --json state,isDraft,headRefOid,mergeStateStatus
gh run view 34145030182 --repo ael-dev3/Warpkeep --json headSha,status,conclusion,jobs
gh api repos/ael-dev3/Warpkeep/actions/runners
gh api repos/ael-dev3/Warpkeep/pages
```

A completed job's log may be available via `gh api .../actions/jobs/JOB_ID/logs`
before `gh run view --log` will return the still-running aggregate's logs. Do not
cancel/restart the live database job merely because log retrieval is delayed.

## Continuation after the audit

- Created the five-file agent index/map/audit/handoff, and linked it from the main
  documentation index. This adds navigation and feedback, not release scope.
- Verified the interrupted recovery descriptor correction on Linux: 39 tests pass.
  Added negative candidate database/module bytes/tree/atlas-header/owner-receipt
  cases and rejected asynchronous consumer coverage. The historical consumer
  contract and production activation fences remain unchanged.
- The real hook/controller/keep integration regression reproduced both timer and
  focus refresh removing the canvas. The bounded correction adds a `refreshing`
  phase for an already verified view; commands remain blocked. Its integration
  tests cover retained canvas/scene/assets/focus, failed/malformed/expired reads,
  blocked uncertain outcomes with original-envelope retry and in-place construction
  completion/reveal. The implementing reviewer reported 134 passing tests across
  eight focused suites before the session permission change. The main reviewer
  inspected the complete three-file diff. External SDK/assets/GPU are fixtures;
  this is not browser/device or live-owner proof.
- Corrected guidance after discovering root-only `tsc --noEmit` checks no referenced
  project. Main-agent explicit `tsc -p tsconfig.app.json --noEmit` and
  `tsc -p tsconfig.node.json --noEmit` both passed after the frontend changes.
  The second covers Vite configuration only, not every release script.
- No production mutation, admissions change, final freeze or live-completion claim
  was made by this audit. Keep the full release goal active.

## Documentation-first checkpoint — 2026-09-07

The owner requested a README/project-structure/agent-guidance overhaul before
resuming game shipping. Completed locally: 0.4-first root README, durable root
AGENTS guide, product direction/roadmap, current architecture, documentation index,
contribution routing, development/evidence workflow and five detailed audit notes.
The historical image is explicitly 0.3, legacy policy is labeled separately,
version remains 0.3.43, and no live acceptance is inferred from source.

Two independent reviews found and corrected recovery-test ordering, inventory
terminology, source-path conventions, test/typecheck scope, overly broad privacy
wording, Cathedral-adjusted duration and the actual 0.4 water route. Main-agent
checks found 146 local Markdown links across 14 documents, all resolving; canonical
README community/intake links and tracked documentation whitespace checks passed.
No visual/gameplay acceptance was claimed from this documentation review.

Remaining verification/publication limitations:

- The attempted `projectLinks`, `communityIntake`, `licensePolicy` Vitest run never
  started tests: the session's new filesystem restrictions deny Vite's temporary
  config write under the external shared dependency junction. Do not report those
  suites as passed or modify that shared tree to bypass the restriction.
- The standalone license verifier stopped at its committed-policy cleanliness
  precondition while CONTRIBUTING was being edited. Rerun after the documentation
  checkpoint; preserve unrelated dirty manifests and report any remaining blocker.
- Fresh GitHub status inspection was denied at the socket/network layer before
  authentication. Network permission requests returned no grant. The earlier
  remote/CI snapshots remain historical; no new push or current remote equality
  is proved. Re-login is not a fix for this network restriction.

Finish permitted local review/checkpoint work, then restore legitimate test and
GitHub access before claiming the documentation is fully verified/published or
resuming the user-deferred shipping queue. These limits do not establish a blanket
prohibition on production deployment, and do not complete any live release gate.
