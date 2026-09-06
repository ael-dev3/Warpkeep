# Linux operation bundle cache implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Provide the real, explicit two-package archive bootstrap needed by the fixed Linux operation-bundle runtime.

**Architecture:** Share bounded HTTPS archive transport with the existing G002 bootstrap, while keeping package selection and cache namespaces fixed in each public wrapper. The new bootstrap acquires authenticated archive bytes only; the offline runtime must independently verify archives and extracted namespaces before loading compiler code.

**Tech Stack:** Node 22.22.3 ESM, node:https, SHA-512, existing bounded-file reader, Vitest, Windows/WSL.

**Spec:** docs/superpowers/specs/2026-09-05-warpkeep-local-release-preparation-design.md, Four-operation bundle execution refinement.

## Global Constraints

- Keep all `GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS` bytes unchanged.
- G001 bindings are an exact zero-diff check, never a write target.
- G002 remains sealed and PTR remains owner-only.
- Local build code neither needs nor receives production credentials, FIDs, raw receipts or database contents.
- Do not install into or modify the Windows node_modules junction.
- Package acquisition is an explicit bounded bootstrap operation; ordinary derivation remains offline.
- No package script execution, package imports, compiler execution, generated artifact installation, or provider mutation in this task.

### Task 1: Fixed Linux operation compiler archive bootstrap

**Files:**
- Create: `scripts/local-preparation-archive-download.mjs`
- Create: `scripts/local-preparation-archive-download.d.mts`
- Create: `scripts/bootstrap-operation-bundle-cache.mjs`
- Create: `scripts/bootstrap-operation-bundle-cache.d.mts`
- Modify: `scripts/bootstrap-genesis002-local-binding-cache.mjs` (transport delegation and shared-helper committed control-file inventory)
- Create: `tests/operationBundleCache.test.ts`
- Modify/Test: `tests/genesis002LocalBindingCache.test.ts` (shared-helper control fixture and transport regressions).

**Interfaces:**
- Internal `downloadLocalPreparationArchive(url, {maximumBytes, deadlineMs, errorCode})` returns `Promise<Buffer>`. It accepts only canonical HTTPS registry.npmjs.org default-port URLs without credentials/fragment; has no credential/header/executable injection. Existing wrapper passes its existing 256MiB/30000ms/error code. New wrapper passes 32MiB/30000ms/`OPERATION_BUNDLE_CACHE_FETCH_REJECTED`. This internal transport is not package-selection authority.
- Public `bootstrapOperationBundleCache(...arguments_)` rejects every argument, including explicit undefined. Returns frozen `{profile:'warpkeep-operation-bundle-cache-bootstrap-linux-x64-v1',packageCount:2,installedCount}`. It does not claim captured source provenance.
- Fixed archive cache: `/home/snapmeter/.warpkeep/release-preparation-v1/cache/operation-bundles`, content-addressed SHA512 `_cacache/content-v2/sha512/<first2>/<next2>/<rest>` like the existing G002 cache.
- Fixed Node path `/home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node`, bytes124819136, SHA256 `e6ec2c188d83d813f81f2de8aea084d74dce603ac1abedd0a30ad941b10087b2`, Linux x64 uid1000, no execArgv/NODE_OPTIONS. Validate owned canonical private namespace and Node before and after bootstrap.
- Exactly two fixed packages, verified against the existing root lock records without modifying them:
  - esbuild0.28.1, URL `https://registry.npmjs.org/esbuild/-/esbuild-0.28.1.tgz`, SRI `sha512-HrJrvZv5ayxBzPfwphOoNzkzOIIlifzk0KJrGK2c8R4+LKpMtpYLQeUdjnwjWv/LZlkH2laZk+4w78pi99D4Vw==`.
  - @esbuild/linux-x640.28.1, URL `https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.28.1.tgz`, SRI `sha512-u/anNYF2mmVOEDwLtnQ1wOr3EZ9sTNGLWrsYGYwHWzGA3Si84IOkHXlbWTD1NB+9/1lcnweYKO54uhxZydNzfA==`.
- Root-lock validation is fixed selection, not arbitrary resolution: bound JSON to4MiB; require exact version/resolved/integrity of both entries, esbuild optional linux-x64 version0.28.1 and companion os=['linux']/cpu=['x64']. Other platform entries remain untouched. The future runtime must validate its captured committed lock independently; bootstrap alone does not attest a source tree.
- Add the extracted helper to G002 bootstrap's committed control-file inventory and its fixture. Moving transport must not remove source-byte attestation from the existing bootstrap. Do not change historical protected helpers or promote test-only authority seams.

- [ ] **Step 1: Write failing behavior tests.** Cover public argument/host rejection before transport, fixed lock selection and drift rejection, SHA mismatch, valid existing cache hit with no network, corrupt existing cache rejection without replacement, symlink/wrong-owner/writable cache rejection, and transport status/redirect/encoding/declared and streamed size/timeout/truncation errors. Reuse existing bounded-file and G002 test fixtures; test seams stay internal, never public authority.

```ts
await expect(bootstrapOperationBundleCache(undefined)).rejects.toMatchObject({code:'OPERATION_BUNDLE_CACHE_ARGUMENTS_INVALID'});
// Extend the existing boundary fixture to emit these response conditions.
boundary.contentLength = '100';
boundary.responseBody = Buffer.from('short');
await expect(bootstrap()).rejects.toBeInstanceOf(Error);
expect(boundary.installedArchives).toHaveLength(0);
```

- [ ] **Step 2: Run the new file and record the missing-module RED.**

```powershell
& '.git/ci-node-22.22.3/node.exe' 'node_modules/vitest/vitest.mjs' run 'tests/operationBundleCache.test.ts'
```

- [ ] **Step 3: Share transport and implement the fixed bootstrap.** Extract the existing G002 `downloadArchive` transport into the internal helper rather than duplicate its promise/state machine. Preserve G002 defaults and public errors. Enforce200/no Location/no content encoding, canonical declared length, actual declared-length equality, streamed cap and total deadline; destroy response/request on failure and clear retained chunks. Add explicit EOF/incomplete-close handling. New wrapper performs only fixed lock checks, verified cache reads and missing-archive download/install. Reuse `readLocalBindingBoundedFile` for no-follow/identity checks. New owned directories0700, archives0400, exclusive O_NOFOLLOW creation, descriptor fsync, parent fsync and post-write SHA verification; EEXIST validates the existing file. Invalid existing entries fail without deletion/replacement. Retain partial invalid evidence; do not silently repair.

```js
const body = await downloadLocalPreparationArchive(fixedUrl, {
  maximumBytes: 32 * 1024 * 1024,
  deadlineMs: 30_000,
  errorCode: 'OPERATION_BUNDLE_CACHE_FETCH_REJECTED',
});
try { installVerifiedArchive(fixedIdentity, body); }
finally { body.fill(0); }
```

- [ ] **Step 4: Verify regression and types, then commit exact task files.** Run the new test and located existing G002 bootstrap tests, followed by app tsc. Report exact commands/output, no full-suite repeat. Preserve unrelated dirt and all protected roots.

```powershell
& '.git/ci-node-22.22.3/node.exe' 'node_modules/typescript/bin/tsc' --project tsconfig.app.json --noEmit --tsBuildInfoFile .git/tsbuildinfo/operation-bundle-cache.app.tsbuildinfo
```

- [ ] **Step 5: Exercise the committed public bootstrap in WSL.** Use the fixed Node under env-i, no ambient production credentials. First call downloads only missing approved archives; second verifies both and reports installedCount0. Record actual source commit, results and archive identities. Do not install/extract/execute packages. Actual permission failures stop; no escalation or replacement shortcut.

```powershell
& 'C:/Windows/System32/wsl.exe' --distribution Ubuntu-24.04 --user snapmeter -- /usr/bin/env -i LANG=C.UTF-8 LC_ALL=C.UTF-8 /home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/scripts/bootstrap-operation-bundle-cache.mjs
```

## Self-review and remaining scope

One task owns shared transport and both consumers, preventing interface mismatch. G002 transport regression is mandatory because its code changes; its package graph and namespace do not. Root lock supplies fixed authenticated coordinates only and remains unchanged. This plan delivers real archive acquisition, not the full Linux runtime: contained package extraction/attestation, eight independent source builds, actual bounded load children and final transaction remain required successor work under the linked spec.
