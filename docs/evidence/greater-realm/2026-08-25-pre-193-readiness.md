# Greater Realm pre-#193 readiness evidence

Audited on 2026-08-25 from the isolated `codex/greater-realm-final-integration` checkout. This record is intentionally public-safe: it contains source identities, aggregate check results, and environment errors only. It contains no production data, credentials, owner receipts, or player identifiers.

## Source identity

Audited commit: [`4387b37ad6433b38136db745643029335b854100`](https://github.com/ael-dev3/Warpkeep/commit/4387b37ad6433b38136db745643029335b854100). Required baseline: [`0ca019b797fcfbf56f0f8598900d80d85e0ea037`](https://github.com/ael-dev3/Warpkeep/commit/0ca019b797fcfbf56f0f8598900d80d85e0ea037).

| Command | Exit | Result / counts |
| --- | ---: | --- |
| `git status --short` | 0 | Pass: clean checkout (0 changed paths). |
| `git rev-parse HEAD` | 0 | Pass: emitted the audited SHA above (1 identity). |
| `git merge-base --is-ancestor 0ca019b797fcfbf56f0f8598900d80d85e0ea037 HEAD` | 0 | Pass: the required baseline is an ancestor of audited `HEAD` (1 ancestry assertion). |
| `gh api repos/ael-dev3/Warpkeep/branches/main --jq .commit.sha` | 1 | Failed: GitHub API connection failed before any response, so no authenticated current `main` tip was emitted (0 tip identities). |

The source identity is locally proven, but protected-main status cannot be
inferred from local history. `READY` requires exact equality between the
authenticated current `main` tip and the audited SHA, followed by a successful
push-triggered Verify run for that same SHA. Neither result is available here.

## Pull-request census

| Command | Exit | Result / counts |
| --- | ---: | --- |
| `gh pr list --state open --limit 100 --json number,title,isDraft,headRefName,headRefOid,baseRefName,mergeStateStatus,statusCheckRollup` | 1 (initial), 1 (retry) | Both attempts failed: GitHub API connection failed before any response. PRs returned: 0; PR state and checks: unavailable. |

No PR title, SHA, or check conclusion was captured because neither API attempt returned data. Consequently, this run cannot prove that draft PR #193 is the sole intended open PR, nor that it remains draft.

## Server gameplay authority

| Command | Exit | Result / counts |
| --- | ---: | --- |
| `cd spacetimedb && ../node_modules/.bin/tsx --test tests/greaterRealmActivationPolicy.test.ts tests/greaterRealmV17Policy.test.ts tests/greaterRealmV17Authority.test.ts tests/greaterRealmRelocationAuthority.test.ts tests/greaterRealmResourceLocationAuthority.test.ts tests/greaterRealmWorkerPolicy.test.ts tests/greaterRealmWorkerAuthority.test.ts` | 1 | Failed before test enumeration: `tsx` could not create its IPC pipe (`listen EPERM` under the managed sandbox). Pass/fail/skip counts were not emitted; 0 tests were observed to start. |

No server assertion was observed as passing because the runner did not start. The named suite is the required evidence for: 600-slot exhaustion and six-region balance; Tier-I-only validation; 12,000 resource nodes; 2,400 workers; food, wood, stone, and gold resource authority; replay/idempotency; and public projections that do not expose private node identity. All of these remain unverified by this local run.

Bounded diagnostic only (not a replacement for the mandated runner): `cd spacetimedb && node --import tsx --test tests/greaterRealmActivationPolicy.test.ts tests/greaterRealmV17Policy.test.ts tests/greaterRealmV17Authority.test.ts tests/greaterRealmResourceLocationAuthority.test.ts tests/greaterRealmWorkerPolicy.test.ts tests/greaterRealmWorkerAuthority.test.ts` exited 0 with 56 passed, 0 failed, 0 skipped. A separate `node --import tsx --test tests/greaterRealmRelocationAuthority.test.ts` emitted only `TAP version 13`, no subtests, and was terminated after five seconds (exit 1 after interruption). The exact mandated `tsx --test` command and authenticated protected CI remain required.

## Client living-world presentation

| Command | Exit | Result / counts |
| --- | ---: | --- |
| `node_modules/.bin/vitest run tests/greaterRealmPresentationPlan.test.ts tests/greaterRealmSceneRuntime.test.ts tests/greaterRealmClientBridge.test.ts tests/greaterRealmResourceLocations.test.ts tests/greaterRealmWorkerControl.test.ts --maxWorkers=2` | 0 | Pass: 5 test files passed; 45 tests passed; 0 failed and 0 skipped. |

Observed coverage includes roads, rivers/streams, bridges/fords, water animation, bounded moving ambient boats, reduced motion, NPCs, wildlife, castles, public resource markers, worker dispatch/recall, and closed presentation gates.

### Client command provenance

The mandated client command was rerun from a fresh detached local clone at
`/private/tmp/warpkeep-pre193-audited.8NHGOh`, created without network access
at the audited commit. Its `node_modules` was supplied by a local copy-on-write
copy from the trusted dependency tree; no dependency installation occurred.

| Command | Exit | Result / counts |
| --- | ---: | --- |
| `pwd` | 0 | `/private/tmp/warpkeep-pre193-audited.8NHGOh` (1 checkout path). |
| `git rev-parse HEAD` | 0 | `4387b37ad6433b38136db745643029335b854100` (1 SHA). |
| `git status --short` | 0 | Pass: no output; clean checkout (0 changed paths). |
| `node_modules/.bin/vitest run tests/greaterRealmPresentationPlan.test.ts tests/greaterRealmSceneRuntime.test.ts tests/greaterRealmClientBridge.test.ts tests/greaterRealmResourceLocations.test.ts tests/greaterRealmWorkerControl.test.ts --maxWorkers=2` | 0 | Pass: 5 test files passed; 45 tests passed; 0 failed and 0 skipped. |

The checkout SHA exactly equals the audited commit
`4387b37ad6433b38136db745643029335b854100` (1 equality assertion). This
isolated rerun supplies client-test provenance only; it does not resolve any
other readiness blocker.

## Release and security gates

| Command | Exit | Result / counts |
| --- | ---: | --- |
| `npm run verify:licenses` | 0 | Pass: license cutover verification completed (1 policy check; no count emitted). |
| `npm run verify:atlas-public-boundary` | 0 | Pass: 2,068 tracked paths and 1,130 scanned entries. |
| `npm run verify:runtime-assets` | 0 | Pass: 42 runtime assets plus 4 provenance masters; 114 static GLBs plus 6 previews; 40 population GLBs; 3 rabbit GLBs. |
| `npm run verify:file-sizes` | 0 | Pass: tracked file-size policy completed (5 legacy and 2 Inner Keep allowlisted assets). |
| `npm run verify:greater-realm-release-gates` | 0 | Pass: release phase is `pre-generation`; legacy 100 and v17 600 verifiers are distinct. Gates remain closed. |
| `npm run stdb:verify-additive-migration` | 1 | Failed: pinned SpacetimeDB CLI 2.6.1 was not active. No pass/fail/skip counts emitted. |
| `npm run stdb:verify-admission-cas-rehearsal` | 1 | Failed: pinned SpacetimeDB CLI 2.6.1 was not active. No pass/fail/skip counts emitted. |
| `npm run typecheck` | 0 | Pass: TypeScript project build completed (no diagnostic count emitted). |
| `npm run build` | 0 | Pass: 1,928 modules transformed; production asset and public-boundary checks completed (1,513 scanned entries in the final boundary pass). A chunk-size warning was emitted, not a failure. |
| `pnpm --dir services/auth-bridge run check` | 1 | Failed before checks: pnpm refused non-interactive removal of the modules directory (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`). No pass/fail/skip counts emitted. |

Portable local gates passed where they could run. The migration rehearsal, admission-CAS rehearsal, and auth-bridge check remain unresolved. No fallback install, gate edit, or production action was attempted.

## Protected CI

| Command | Exit | Result / counts |
| --- | ---: | --- |
| `gh api repos/ael-dev3/Warpkeep/branches/main/protection` | 1 | Failed: GitHub API connection failed before any response; branch-protection status unavailable. |
| `gh run list --branch main --workflow Verify --limit 10 --json databaseId,headSha,status,conclusion,event,attempt,createdAt,updatedAt,url` | 1 | Failed: GitHub API connection failed before any response; 0 runs returned and no check URL available. |

The authenticated evidence required to show protected `main`, exact equality
between the current authenticated `main` tip and audited `HEAD`, and a
successful push-triggered `Verify` run for that same SHA is unavailable. Local
history is not treated as a substitute.

## Environment limitations

| Command | Exit | Result / counts |
| --- | ---: | --- |
| `/bin/ps -o lstart= -p "$$"` | 127 | Managed sandbox denied execution: `operation not permitted: /bin/ps`. No process rows emitted. |

The sandbox also denied the Unix-domain IPC socket needed by `tsx`. The required
process-lifecycle tests were neither edited nor waived. The client provenance
rerun above used a copy-on-write local dependency copy without installation. A
`READY` result would still require the authenticated protected-main CI success.

### Evidence self-review and public-safety scan

The scoped report review used `git diff --check` (exit 0), `git diff --stat` (exit 0: exactly 1 added evidence file), and `git diff -- docs/evidence/greater-realm/2026-08-25-pre-193-readiness.md` (exit 0: only this report). No whitespace errors or out-of-scope tracked changes were found.

The public-safety scan used `git grep -n -I -E 'BEGIN (RSA|OPENSSH|EC|PRIVATE) KEY|Bearer [A-Za-z0-9._-]+|WARPKEEP_[A-Z0-9_]*(TOKEN|SECRET)=' -- docs/evidence/greater-realm/2026-08-25-pre-193-readiness.md`; it exited 1 with 0 matches, which is the expected no-match result. Self-review finding: the report is secret-free and names only public SHAs, aggregate counts, and bounded error summaries.

### Step 8 commit record

| Command | Exit | Observed result |
| --- | ---: | --- |
| `git add docs/evidence/greater-realm/2026-08-25-pre-193-readiness.md` | 0 | Exactly the evidence file was staged. |
| `git commit -m "docs: record Greater Realm pre-193 readiness"` | 0 | Initial result `7c90e4629427b11d96c5c59c97831f3400f8a43f`: 1 file, 92 insertions. |

Task-level review amendments later produced final evidence-task commit `e7a9225015192a510d69f1ff1603399b94bd5869`: 1 file, 99 insertions. The separate branch-level final-review provenance correction changes plan/spec/evidence documentation and is not evidence-only.

## Verdict

**NOT READY.** The audited checkout is clean and descends from the required baseline, and the portable license, atlas-boundary, runtime-asset, file-size, release-gate, typecheck, and build checks passed. However, readiness is blocked by all of the following unresolved conditions:

1. GitHub API access failed, so the current `main` tip/equality, open-PR census, protected branch configuration, and exact protected-main `Verify` run cannot be authenticated.
2. The server authority suite could not start because the managed sandbox denied the `tsx` IPC pipe.
3. The additive-migration and admission-CAS rehearsals could not run because the pinned SpacetimeDB CLI was inactive.
4. The auth-bridge check could not run because pnpm refused non-interactive modules-directory removal.
5. The managed sandbox denied `/bin/ps`; process-lifecycle evidence must come from protected CI.

No release gate was opened, and no production mutation, deployment, notification, player admission, push, or merge was performed.
