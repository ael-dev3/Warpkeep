# Paired Linux binding generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for implementation and independent review.

**Goal:** Run real reproducible G002 private and PTR public binding generation from one committed source snapshot, returning verified bytes for final refreeze.

**Architecture:** Extend the verified fixed local runtime with a private immutable G002 lane and a no-argument paired entrypoint. Preserve the existing PTR-only entrypoint. One parent captures one source, attests the fixed binaries/YAML, executes two isolated cycles per lane and rejects any mismatch. No binding installation occurs here.

**Tech Stack:** Node22.22.3, SpacetimeDB2.6.1, WSL Ubuntu-24.04 Linux x64, existing bounded child/descriptor/hook infrastructure.

**Spec:** `docs/superpowers/specs/2026-09-05-warpkeep-local-release-preparation-design.md`.

## Global Constraints

- G001 frozen source and bindings are never modified. G002 stays closed and PTR owner-only. No production credentials, database, deployment or admission operations.
- Preserve existing PTR public API, worker-v1 request/result behavior, source attestation, bounds, failure retention, cleanup and exact profile meanings.
- No caller-selected profile, module, cache, executable, generated destination, source commit or environment authority. Realms and paths are fixed by internal constants.
- Only final atomic refreezer installs G002/PTR bindings, four bundle pairs, manifest, closure and pins; this task returns memory-owned bytes, not ad-hoc installed files.
- Windows fixtures are not native evidence. Actual paired generation must succeed with pinned Linux runtime and real SRI-verified package archives before acceptance.

### Task 1: Fixed paired parent and G002 worker lane

**Files:**
- Modify `scripts/local-binding-runtime.mjs` and `.d.mts`: add paired no-argument API while preserving existing PTR API and CLI default.
- Modify `scripts/local-binding-runtime-core.mjs` and `.d.mts`: one-source paired execution, fixed lane validation, source graphs, result checks and exact output prefixes.
- Modify `scripts/local-binding-runtime-worker.mjs` and `.d.mts`: fixed G002 dispatch through accepted `withGenesis002LinuxLockedSourceBuild`, native output binding and compile commands.
- Modify `scripts/local-binding-runtime-worker-request.mjs`, `scripts/local-binding-runtime-worker-result.mjs`: validate/bind new distinct G002 request/result profile without weakening legacy PTR shape.
- Modify `scripts/local-binding-native-ts-hooks.mjs` only if needed to give G002 an explicit fixed synthetic entry; keep existing PTR entry semantics unchanged.
- Create `tests/localBindingPairedRuntime.test.ts`; extend `tests/localBindingRuntimeParent.test.ts`, `tests/localBindingRuntimeLifecycle.test.ts`, `tests/localBindingRuntime.test.ts` and related fixture helpers only as needed for fixed lane coverage.
- Create `scripts/bootstrap-genesis002-local-binding-cache.mjs` and `tests/genesis002LocalBindingCache.test.ts`: fixed credential-free provisioning of exact15 G002 lock archives into cache/genesis002, required by the real run, not a general downloader.

**Interfaces:**

```typescript
export interface PreparedLinuxRealmBindings {
  readonly bundleSha256: string;
  readonly dependencyClosureDigest: string;
  readonly bindings: readonly Readonly<{path: string; bytes: Uint8Array}>[];
}
export interface PreparedPairedLinuxBindings {
  readonly profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
  readonly sourceCommit: string;
  readonly sourceTree: string;
  readonly genesis002: PreparedLinuxRealmBindings;
  readonly ptr: PreparedLinuxRealmBindings;
}
export function derivePreparedPairedLinuxBindings(): Promise<PreparedPairedLinuxBindings>;
```

Reject any argument, including explicit undefined, before side effects as existing PTR wrapper does. Nested result bytes are copied, not aliases into mutable retained buffers. Legacy `derivePreparedPtrLinuxBindings()` remains unchanged. Add exact CLI `--paired` mode; no arbitrary options. Print only profile/source identity/per-lane bundle/closure digests and binding counts, never bundle/binding bodies or private paths as authority.

Fixed G002 request profile `warpkeep-local-binding-genesis002-worker-v1`, result profile `warpkeep-local-binding-genesis002-worker-result-v1`. Keep same bounded canonical request keys; profile selects only exact internal mapping: graph entry scripts/genesis002-binding-linux-locked-source-build.ts, cache `/home/snapmeter/.warpkeep/release-preparation-v1/cache/genesis002`, module spacetimedb/genesis002, build child genesis002-locked-source-builds-v1. Existing PTR profile selects exactly existing coordinates. Reject cross-profile field substitution; don't accept a generic caller lane object. Parent/worker revalidate before executing imports or binaries. Bind response profile to expected lane as well as nonce, source and handoff.

Paired parent captures/attests source once before either lane, executes G002 cycles1/2 and PTR cycles1/2 in disjoint owned roots, compares bytes/path lists/bundle/closure and exact source identities within each lane, then proves both lanes share captured source. Do not compare G002 bytes with PTR bytes. G002 generation uses exact pinned CLI --no-config --js-path plus --include-private; PTR remains public. Map only to `scripts/genesis002_module_bindings/` and `spacetimedb/ptr/generated-bindings/` respectively after strict binding-tree validation. Private G002 operator bindings legitimately contain tables; PTR public tables stay empty. Preserve bundle copying before source cleanup and executable/source reattestation around each child.

Cache bootstrap is a fixed no-argument Linux-x64 entrypoint. Use committed workspace lock and exact selected15 package graph from accepted G002 builder; validate canonical owned preparation root/toolchain first, no production-admin/recovery-private prerequisites. Fetch only canonical HTTPS registry.npmjs.org tarballs for exact name/version with no redirects, no credentials, deadline and256MiB byte cap, SHA512 verification before installation. Create private0700directories and new0400archive files using exclusive no-follow writes, fsync files/directories, re-read hashes/identity. Existing files are verified, never overwritten; mismatch fails closed. No npm install/hooks and no root/PTR cache mutation. Keep test injection confined to test fixtures/mocks, not public bootstrap arguments. Actual bootstrap/source/runtime must consume the same committed workspace authority; fail on source drift, not silently update lock.

- [ ] **Step 1: Add RED tests for the new API and exact lane boundaries.**

```typescript
await expect(derivePreparedPairedLinuxBindings(undefined as never)).rejects.toThrow();
// In the existing controlled parent fixture, observe one source snapshot and
// two disjoint cycles per fixed lane; assert paired result has the same source.
expect(result.genesis002.bindings.every(e => e.path.startsWith('scripts/genesis002_module_bindings/'))).toBe(true);
expect(result.ptr.bindings.every(e => e.path.startsWith('spacetimedb/ptr/generated-bindings/'))).toBe(true);
```

Implement these assertions in fixture-backed complete tests, not standalone placeholders. Distinct cases: wrong G002 graph/cache/module/profile/result substitution; different source between lanes; two-cycle nondeterminism in each lane; include-private missing/extra; handoff mutation/escape; malformed paths; unknown options; legacy PTR request/public behavior unchanged; bootstrap wrong platform/root/mode/source/SRI/status/redirect/oversize/deadline/existing-file mismatch and idempotent valid cache. Assertions must prove rejection precedes child/output mutation where relevant.

- [ ] **Step 2: Implement through shared private fixed-lane lifecycle, no copied second runtime.** Keep control-file inventory/source graph attestation current for any new executing helper. Preserve existing source count/byte limits unless actual bounded graph evidence requires an explicit controller ruling.

- [ ] **Step 3: Run covering tests and typecheck.**

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/localBindingPairedRuntime.test.ts tests/genesis002LocalBindingCache.test.ts tests/localBindingRuntime.test.ts tests/localBindingRuntimeParent.test.ts tests/localBindingRuntimeLifecycle.test.ts tests/localBindingNativeTsHooks.test.ts --maxWorkers=1
& .git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -p tsconfig.app.json --tsBuildInfoFile .git/paired-linux-binding.tsbuildinfo
```

- [ ] **Step 4: Commit scoped implementation, then run real fixed Linux bootstrap and paired CLI against that commit.** Report source commit/tree, per-lane two-cycle proof, hashes/counts and complete commands/output. Existing pinned runtime/cache are available; do not install into root dependency junction. Actual G00230private tables/operator bindings and PTR31private tables/public surface must be inspected, including exact construction procedure and absent client-callable scheduler. Return generated bytes without installing checked-in bindings. Fix actual execution failures and repeat against the final committed source if changed.

- [ ] **Step 5: Self-review and report.** Explain limits: G001 frozen-node/source generation, four bundles, crash-recoverable final installer, actual client journey and deployment remain required. Do not call paired candidate generation a prepared or live release.
