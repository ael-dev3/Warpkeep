# Genesis 001 Local Upgrade Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the historical-to-frozen G001 upgrade on a disposable local SpacetimeDB instance and prove the exact baseline ABI, preserved legacy interfaces, and frozen admission writers.

**Architecture:** Extend the accepted local preparation runtime with one fixed no-argument compatibility operation. Authenticate and build the exact historical baseline and frozen source independently, then publish baseline followed by frozen into the same fresh loopback-only database with deletion forbidden. Return bounded nonsecret evidence after real descriptor, policy, and writer-state checks; do not load the private production publisher runtime.

**Tech Stack:** Ubuntu-24.04 WSL, installed Node22.22.3 worker, Node24.19.0 compiler, SpacetimeDB2.6.1 CLI/standalone, existing locked dependencies and source graph.

**Spec:** docs/superpowers/specs/2026-09-05-warpkeep-local-release-preparation-design.md

## Global Constraints

- Keep all `GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS` bytes unchanged, including root package/lock and the historical source/build helpers.
- G001 bindings are an exact zero-diff check, never a write target. Existing G001 players and its latest 0.3 behavior remain intact; new admissions remain closed.
- G002 remains sealed and PTR remains owner-only. Local build code neither needs nor receives production credentials, FIDs, raw receipts or database contents.
- No ambient PATH, launcher, preload, home configuration, caller command or executable override is authority.
- Use the existing `/home/snapmeter/.warpkeep/release-preparation-v1` namespace as guest user `snapmeter`; no Mac, root fallback, runtime reinstall, production mutation, or external download.
- Every executed helper and tool must be authenticated using the existing captured-source and installed-toolchain model. Preserve default, paired, and G001 compilation entrypoints.
- Keep failure evidence private and retained; contain the local process group before any success cleanup. Never touch the retained policy-denied replacement-test clone.
- This proof does not replace current-source/frontend zero-diff, actual production preservation checks, all-realm preparation, refreeze, gameplay verification, or live deployment.

### Task 1: Build and execute the fixed local G001 upgrade proof

**Files:**
- Modify `scripts/genesis001-binding-frozen-source.mjs` and declaration for a separate fixed historical-baseline materializer using the same authenticated historical materializer bytes.
- Modify `scripts/ptr-binding-locked-source-build-core.ts` and add `scripts/genesis001-baseline-binding-linux-locked-source-build.ts` for a named baseline wrapper, without exposing an arbitrary profile factory.
- Add `scripts/genesis001-local-upgrade-proof.mjs` and declaration for contained local-server operations and bounded evidence; use focused adjacent helpers if transport/process responsibilities warrant separation.
- Modify `scripts/local-binding-runtime.mjs`, `scripts/local-binding-runtime-core.mjs`, `scripts/local-binding-runtime-worker.mjs`, their declarations, `scripts/local-binding-runtime-worker-result.mjs`, and `scripts/local-binding-native-ts-hooks.mjs` only as required for the fixed operation and complete transitive graph.
- Add `tests/genesis001LocalUpgradeProof.test.ts` and extend relevant source-builder/runtime/lifecycle tests.

**Interfaces:**
- Produce `derivePreparedGenesis001LinuxCompatibility()` with no arguments, including rejection of explicit `undefined` or caller options; CLI `--genesis001-compatibility` selects it.
- Return frozen metadata only: `profile`, `sourceCommit`, `sourceTree`, `baselineBundleSha256`, `frozenBundleSha256`, `baselineDescriptorSha256`, `frozenDescriptorSha256`, `checkedFrozenWriters` (exact six names). Profile remains `warpkeep-spacetime-binding-final-preparation-linux-x64-v1`; use a distinct fixed internal request/result discriminator for this operation. No credentials, local paths, descriptors, raw response bodies or production receipts in public result.
- Baseline wrapper consumes `{repositoryRoot, dependencyCacheRoot, materializationParent, operation}` exactly as the existing four-key G001 frozen wrapper. Same historical dependency coordinates, independent baseline provenance domain and source inventory.

- [ ] **Step 1: Write failing contract and rejection tests.**

```ts
it('rejects caller authority', async () => {
  await expect(derivePreparedGenesis001LinuxCompatibility(undefined as never)).rejects.toThrow();
});
```

Use existing runtime fixture style to assert that wrong profile, altered executable hash/owner/mode, source replacement, malformed worker response, and extra result fields fail before accepting evidence. Add baseline materializer tests for exact three-key metadata (no freezeNonce), historical commit/tree, independent inventory, source mutation and safe cleanup. Derive the expected baseline inventory from real authenticated extraction and record its derivation; never substitute the frozen inventory or undo frozen source edits.

- [ ] **Step 2: Run the focused tests and record genuine RED.**

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/genesis001LocalUpgradeProof.test.ts
```

- [ ] **Step 3: Implement the baseline build and fixed proof operation.**

Authenticate historical commit `2ae51984e1fa6ce5b0028c1a250359fed79d819b` and tree `90deebb5faf4129282f5c35999244f540001b27d`. Reuse authenticated `materializeGenesis001HistoricalBaseline` rather than editing historical helpers. Each baseline/frozen build runs twice in independent private materializations, typechecks with pinned Node24, and compares full bundle bytes and dependency closure. Preserve verified bundles internally before source cleanup, not through new caller-controlled paths. Use fixed existing cache `cache/genesis002` with independently verified historical lock SRI. Capture the preparation source once.

Run installed CLI and standalone under constructed environment, private HOME/TMP/config, explicit loopback bind and owned fresh database. Generate local-only signing keys in the private operation directory; these are disposable test credentials, never production credentials. Publish baseline, describe, assert the fixed canonical baseline digest `cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03`; then publish frozen to the same database, both with `--delete-data=never --no-config`. No caller server/database/command injection.

Use `assertGenesis001BaselineDescriptor` without a replacement expected digest and `assertFrozenDescriptorPreservesBaseline` from the existing pure core only after checking and capturing its full import graph. Alternatively isolate equivalent pure checks in an unprotected local helper with regression coverage; do not import `genesis001-frozen-publisher-runtime.ts` or broad production publishing code. Bound and strictly decode JSON before these checks.

The frozen schema must retain 56 tables, 49 reducers, all 32 legacy procedures and RLS, plus exactly `genesis_001_access_policy_v1`. Call that policy and assert all seven wire fields against existing fixed policy constants, including baseline and freeze nonce. Do not accept HTTP success alone.

Exercise `admin_allow_fid`, `admin_admit_founder_v1`, `admin_disable_fid`, `admin_bump_auth_epoch`, `access_request_submit_v1`, and `admin_reset_access_request_v1` using the existing local proof's argument shapes. Verify the expected freeze rejection, not merely any 4xx/5xx, and compare authenticated status/request/policy state before and after each. Derive local authorization from the historical source's existing test contract; never guess or use production owner identity. If the existing proof relies on unauthorized rejection rather than the actual freeze guard, report the discrepancy and implement a source-supported local assertion rather than claiming coverage.

Bound startup, HTTP bodies, stdout/stderr, every child and total operation; reject redirects and non-loopback URLs. Preserve error redaction. Terminate and verify containment of all owned server descendants on every outcome. Cleanup only verified success; retain failure artifacts with private modes and never print key/token material.

- [ ] **Step 4: Cover behavior and failure paths, then run real native proof.**

Tests must reject wrong baseline digest; changed table/reducer/procedure/RLS; duplicate/missing policy; malformed/wrong policy fields; a writer unexpectedly succeeding; wrong rejection reason; changed before/after state; truncated/oversized/non-UTF8 descriptor; startup timeout; command failure; namespace mutation; and failed process containment. Ensure success evidence cannot be emitted on any failure. Cover nondeterministic baseline/frozen builds and cross-lane substitution. Use existing pure-core fixtures where suitable, without treating mock success as native evidence.

```powershell
& C:/Windows/System32/wsl.exe --distribution Ubuntu-24.04 --user snapmeter -- /usr/bin/env -i LANG=C.UTF-8 LC_ALL=C.UTF-8 /home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/scripts/local-binding-runtime.mjs --genesis001-compatibility
```

Run covering existing source-builder, compilation, runtime, parent/lifecycle and native-hook suites once after iteration, plus app TypeScript check with a task-owned `.git` build-info path. Record exact commands, exit codes, real output hashes and retained failure directories without secrets. Report native failures honestly and diagnose them; do not replace native acceptance with mocked evidence.

- [ ] **Step 5: Self-review, commit exact files, and hand off.**

```powershell
git diff --check -- scripts tests
```

Stage only owned changed files, never unrelated dirty files or generated frontend bindings. Commit implementation and tests. Report RED/GREEN, covering/native evidence, changed files and concerns to the task report. Independent review is controller-owned.
