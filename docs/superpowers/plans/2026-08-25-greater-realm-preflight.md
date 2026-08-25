# Greater Realm Preflight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce reviewable evidence that current `main` satisfies the approved Greater Realm gameplay and security contract before the final adaptation of PR #193.

**Architecture:** This plan does not open production gates or duplicate already implemented gameplay. It verifies server authority, client presentation, release boundaries, and GitHub state from an isolated checkout, then commits one public, secret-free evidence report. Production-only process tests must be proven by protected CI when the local sandbox cannot read process identities.

**Tech Stack:** Node.js 22.22.3, npm 10.9.8, TypeScript 7, Vitest 4, Node test runner through `tsx`, SpacetimeDB 2.6, GitHub CLI.

**Spec:** `docs/superpowers/specs/2026-08-25-greater-realm-final-rollout.md`

## Global Constraints

- Baseline commit is `0ca019b797fcfbf56f0f8598900d80d85e0ea037` or a strict protected-main descendant containing no unreviewed gate change.
- PR #193 remains unmerged and is integrated last only after its separate worker reports the immutable final head ready.
- Import, activation, client presentation, server presentation, notification delivery, and downstream release approvals remain compiled closed throughout this plan.
- Only the six named Tier-I regions may be public, passable, foundable, or gatherable; Tier II and Tier III remain sealed and absent from public current-world authority.
- Capacity remains exactly 600 castles, 2,400 workers, and 12,000 active resource nodes, with 100 castle slots per Tier-I region and four workers per castle.
- Do not read, copy, print, or commit private candidate data, FIDs, credentials, tokens, owner-only receipts, or production census contents.
- No production mutation, deploy, notification, admission, push, or merge is authorized by this preflight plan.

---

### Task 1: Produce the pre-#193 readiness evidence

**Files:**
- Create: `docs/superpowers/evidence/2026-08-25-greater-realm-pre-193-readiness.md`
- Verify: `spacetimedb/src/greaterRealmActivationPolicy.ts`
- Verify: `spacetimedb/src/greaterRealmFoundingAuthority.ts`
- Verify: `spacetimedb/src/greaterRealmWorkerAuthority.ts`
- Verify: `src/greater-realm/greaterRealmPresentationPlan.ts`
- Verify: `src/greater-realm/createGreaterRealmSceneRuntime.ts`
- Verify: `src/components/realm/createGreaterRealmWorldCanvasHost.ts`
- Verify: `scripts/verify-greater-realm-release-gates.mjs`

**Interfaces:**
- Consumes: the protected-main source tree and GitHub PR/check metadata.
- Produces: one secret-free Markdown report with immutable commit/PR identities, command results, acceptance counts, known environment limitations, and a final `READY` or `NOT READY` verdict.

- [ ] **Step 1: Prove the source and PR baseline**

Run:

```bash
git status --short
git rev-parse HEAD
git merge-base --is-ancestor 0ca019b797fcfbf56f0f8598900d80d85e0ea037 HEAD
gh api repos/ael-dev3/Warpkeep/branches/main --jq .commit.sha
gh pr list --state open --limit 100 --json number,title,isDraft,headRefName,headRefOid,baseRefName,mergeStateStatus,statusCheckRollup
```

Expected: clean checkout; `HEAD` is the named baseline or a descendant; the
only intended open pull request is draft #193; no other PR remains silently
outstanding. The authenticated current `main` tip returned by the exact branch
API command must equal the audited `HEAD` SHA before `READY`; local ancestry is
not a substitute. Capture the exact branch-tip command and result, plus only PR
numbers, titles, public SHAs, and check conclusions.

- [ ] **Step 2: Verify server allocation, Tier-I, relocation, resources, and workers**

Run:

```bash
cd spacetimedb
../node_modules/.bin/tsx --test \
  tests/greaterRealmActivationPolicy.test.ts \
  tests/greaterRealmV17Policy.test.ts \
  tests/greaterRealmV17Authority.test.ts \
  tests/greaterRealmRelocationAuthority.test.ts \
  tests/greaterRealmResourceLocationAuthority.test.ts \
  tests/greaterRealmWorkerPolicy.test.ts \
  tests/greaterRealmWorkerAuthority.test.ts
```

Expected: zero failed tests. The report must name the observed assertions for
600-slot exhaustion, six-region balance, Tier-I validation, 12,000 nodes,
2,400 workers, all four resource kinds, replay/idempotency, and no private-node
leakage.

- [ ] **Step 3: Verify client living-world presentation and controls**

Run:

```bash
pwd
git rev-parse HEAD
git status --short
node_modules/.bin/vitest run \
  tests/greaterRealmPresentationPlan.test.ts \
  tests/greaterRealmSceneRuntime.test.ts \
  tests/greaterRealmClientBridge.test.ts \
  tests/greaterRealmResourceLocations.test.ts \
  tests/greaterRealmWorkerControl.test.ts \
  --maxWorkers=2
```

Expected: zero failed tests. The report must name observed coverage for roads,
rivers/streams, bridges/fords, water animation, bounded moving ambient boats,
reduced motion, NPCs, wildlife, castles, public resource markers, worker
dispatch/recall, and closed presentation gates. A client rerun in any other
checkout must record its `pwd`, exact `git rev-parse HEAD`, clean `git status
--short`, and explicit equality to the audited commit before its file/test
counts can support this evidence.

- [ ] **Step 4: Verify fail-closed release and repository security boundaries**

Run:

```bash
npm run verify:licenses
npm run verify:atlas-public-boundary
npm run verify:runtime-assets
npm run verify:file-sizes
npm run verify:greater-realm-release-gates
npm run stdb:verify-additive-migration
npm run stdb:verify-admission-cas-rehearsal
npm run typecheck
npm run build
pnpm --dir services/auth-bridge run check
```

Expected: every command exits zero. If a local managed sandbox denies a
platform primitive such as `/bin/ps`, record the exact command, exit status,
and error without editing the test or production code; the corresponding
protected-main CI job must still be authenticated green before `READY`.

- [ ] **Step 5: Authenticate protected CI instead of inferring it**

Run:

```bash
gh api repos/ael-dev3/Warpkeep/branches/main/protection
gh run list --branch main --workflow Verify --limit 10 --json databaseId,headSha,status,conclusion,event,attempt,createdAt,updatedAt,url
```

Expected: `main` is protected and the newest Verify run for the exact audited
`HEAD` completed successfully from a push. `READY` additionally requires that
the authenticated current `main` tip captured in Step 1 equals the audited
`HEAD`, and that successful push-triggered Verify run has that same SHA; a
historical successful run is insufficient. A DNS/API failure yields `NOT READY`;
it is not replaced by an assumption based on local history.

- [ ] **Step 6: Write the evidence report**

Create `docs/superpowers/evidence/2026-08-25-greater-realm-pre-193-readiness.md` with these
exact top-level sections:

```markdown
# Greater Realm pre-#193 readiness evidence

## Source identity
## Pull-request census
## Server gameplay authority
## Client living-world presentation
## Release and security gates
## Protected CI
## Environment limitations
## Verdict
```

For every command include its exact invocation, exit code, pass/fail/skip
counts when emitted, and public commit/check URL when available. Do not paste
private output or unbounded logs. The verdict is `READY` only when all local
portable checks and exact protected CI are green; otherwise it is `NOT READY`
with each unresolved condition listed.

- [ ] **Step 7: Verify the report is public-safe and the tree is scoped**

Run:

```bash
git diff --check
git diff --stat
git diff -- docs/superpowers/evidence/2026-08-25-greater-realm-pre-193-readiness.md
git grep -n -I -E 'BEGIN (RSA|OPENSSH|EC|PRIVATE) KEY|Bearer [A-Za-z0-9._-]+|WARPKEEP_[A-Z0-9_]*(TOKEN|SECRET)=' -- docs/superpowers/evidence/2026-08-25-greater-realm-pre-193-readiness.md
```

Expected: no whitespace errors; exactly one evidence file is added; the secret
pattern scan emits no matches.

- [ ] **Step 8: Commit the evidence**

```bash
git add docs/superpowers/evidence/2026-08-25-greater-realm-pre-193-readiness.md
git commit -m "docs: record Greater Realm pre-193 readiness"
```

Expected: the evidence task's one commit contains only the evidence report. A
later branch-level review or provenance fix is a separate commit and must list
its own touched files; do not characterize the entire final branch as containing
only the evidence commit. Do not push or merge under this task.
