# Fixed Node24 preparation bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for implementation and independent review. Start after the G001 source-builder review is resolved.

**Goal:** Install and verify the exact G001 Node24 runtime through a reproducible credential-free local command.

**Architecture:** A fixed no-argument Linux bootstrap validates its committed source and existing preparation namespace, fetches only the pinned public Node release evidence, verifies its signature/archive/member bytes, then performs a durable no-clobber installation. Keep this separate from recovery-private bootstrap and existing runtime installations.

**Tech Stack:** Pinned Node22 host, Node HTTPS/crypto/descriptor I/O, fixed system GPG and archive tools in WSL Ubuntu-24.04.

**Spec:** `docs/superpowers/specs/2026-09-05-warpkeep-local-release-preparation-design.md`.

## Global Constraints

- Keep all `GENESIS_001_ADOPTION_SOURCE_PROJECTION_PATHS` bytes unchanged, including root package/lock and the historical source/build helpers. G001 bindings are an exact zero-diff check, never a write target.
- G002 remains sealed and PTR remains owner-only. Local build code neither needs nor receives production credentials, FIDs, raw receipts or database contents.
- Bootstrap verifies upstream evidence before populating the dedicated namespace; offline derivation only consumes already verified archives. No replacement of existing user installations.
- No ambient PATH, launcher, preload, home configuration, caller command or executable override is authority.
- This task installs Node24 only. Real G001 compilation/public binding zero-diff, final bundles/refreeze, production operations and live verification remain required.

### Task 1: Credential-free fixed Node24 installation

**Files:**
- Create `scripts/bootstrap-genesis001-local-node.mjs` and `.d.mts`: narrow public no-argument command/API and redacted result/error boundary.
- Create `scripts/bootstrap-genesis001-local-node-core.mjs`: fixed source/toolchain checks, verified downloads, signature/member verification and installation lifecycle.
- Create `tests/genesis001LocalNodeBootstrap.test.ts`: fixture/mocked failure tests plus real native invocation evidence in task report.

**Interfaces:**

```typescript
export interface PreparedGenesis001Node {
  readonly profile: 'warpkeep-genesis001-local-node-bootstrap-linux-x64-v1';
  readonly sourceCommit: string;
  readonly sourceTree: string;
  readonly nodeVersion: '24.19.0';
  readonly nodeSha256: string;
  readonly installed: boolean;
}
export function bootstrapGenesis001LocalNode(): Promise<PreparedGenesis001Node>;
```

Reject every supplied argument, including explicit undefined, before importing the core. Direct CLI accepts no options and prints only this metadata. No arbitrary root, URL, executable, version, headers, credentials, adapter or destination inputs. Failure prints a bounded fixed error code, not raw HTTP bodies/environment or private paths.

Run only Linux/x64 uid1000 using `/home/snapmeter/.warpkeep/release-preparation-v1/toolchain/node-v22.22.3-linux-x64/bin/node` with no preloads/NODE_OPTIONS. Reuse the existing public preparation host/binary validation semantics, not recovery-private dispatch. Attest the complete executing local module closure against one selected commit before network or installation, including any transitively imported source validators/process helpers. Recheck selected source identity before accepting installation.

Use the committed `services/release-recovery/scripts/release-recovery-wsl-toolchain-source-policy-v1.json` Node24 release record only for exact upstream URLs, sizes, archive/member hashes and signer. Do not execute its private bootstrap or change its old system-tool pins. Node24 archive is31633904bytes/SHA25614b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647; exact selected member `node-v24.19.0-linux-x64/bin/node` is125989464bytes/SHA256bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12. Require exact key/sums/signature sizes and hashes from that record and exact EdDSA signer5BE8A3F6C8A5C01D106C0AD820B1A390B168D356. Parse only the fixed record; never treat unrelated recovery source policy values as local authorization.

Validate canonical existing preparation root/toolchain/runs as real uid1000 mode0700 directories with every component checked. Create one fresh owned0700 operation child in runs. No root/elevation fallback. Final destination is exactly `toolchain/node-v24.19.0-linux-x64/bin/node` relative to preparation root. Only the version directory, its bin child and the one executable belong to this install. Do not touch other Node versions, shared dependencies, caches or production namespaces.

Fetch fixed HTTPS URLs with no redirects/userinfo/credentials/configured proxy authority, exact200, identity encoding, exact expected length/hash, and absolute30s deadline per request. Stream bounds apply when Content-Length is absent too. Destroy request/response on rejection, zero partial buffers and prevent late writes. Store source provenance only in a fixed private `cache/node-v24.19.0-provenance-v1` family of key/sums/signature/archive files; validate any existing exact files rather than overwrite. Use exclusive O_NOFOLLOW0400 writes and fsync/re-read identity/hash. Stage all required verified evidence before final installation.

Verify sums contains the exact archive line exactly once. Use a fresh operation-owned GPG home, `--no-options --batch`, no key retrieval/network and the pinned key bytes. Check exactly one expected primary key/fingerprint/algorithm, one exact VALIDSIG and no bad/expired/revoked status. Do not consult the user's keyring. Current local tools (all canonical root-owned mode0755) are:

| Path | Bytes | SHA256 |
|---|---:|---|
| /usr/bin/gpg | 1147800 | 403e04c779ad9fab3895c405f8c53d35ab59fa8e3b8bbe3437f61bc41f468dd4 |
| /usr/bin/gpgv | 310416 | f14d026b9eae172c432e015bce227483293b4966f2f3fdcfa582f71d3dbb2ae8 |
| /usr/bin/tar | 440264 | 3ee2c3c0b4dd9aacebfd2f0fbae44bad36348203acff78a44888dd58c05f811c |
| /usr/bin/xz | 89008 | b5b163eb273291934556377ab883b4b2a5d4da50bd0dc0a91774ecc234ccd8d0 |

These are current installed OS tool pins, not an assertion of independent upstream package-signature verification. Observed package metadata is GPG/gpgv2.4.4-2ubuntu17.6, tar1.35+dfsg-3ubuntu0.4, xz-utils5.6.1+really5.4.5-1ubuntu0.3. Runtime authority is the exact canonical executable bytes and descriptor identity, checked before/after execution; package version labels are diagnostic context, not a second executable lookup or a substitute for hashes. Do not downgrade GPG to the old recovery pin. If current identity differs, fail and report instead of auto-updating pins. These dynamically linked OS tools rely on the existing local OS trust boundary; this task does not claim a hermetic OS or authenticate every shared library.

Use only explicit executable paths and a minimal constructed child environment; no inherited HOME, GNUPGHOME, proxy variables, preload variables or tool options. GPG state belongs exclusively to the fresh operation directory. Public-key inspection/import/signature verification must not start a persistent agent or use a personal socket/keyring. Account for and bound any child process required by the selected invocation rather than silently trusting an ambient helper. No shell-built command strings. Check the selected fixed invocation on the installed tools before treating fixture tests as native evidence.

Only after exact archive authentication, extract the single fixed member to bounded binary stdout, never a filesystem archive extraction. Use exact `/usr/bin/tar`, fixed archive/member args and fixed `/usr/bin/xz` decompressor with a clean environment (no TAR_OPTIONS/XZ_OPT/XZ_DEFAULTS/GPG overrides). Bound wall-clock60s, stdout to exact member bytes plus1 and stderr64KiB; kill/reap on excess/failure and keep stdout binary (the existing text-only process helper is not suitable without a distinct internal binary reader). Full archive hash authenticates its namespace/headers; selected-member exact size/hash rejects missing, wrong, duplicated or substituted output. Unselected members are never installed. This is a fixed pinned-artifact extractor, not a generic archive service.

Install executable only with exclusive no-follow creation, mode0500, file and parent fsync, exact re-read hash/identity. Existing final namespace must contain exactly bin/node, with correct owner/modes/no links/bytes; validate and return installed:false without changing it. A mismatched or partial pre-existing version directory fails closed. On fresh failure remove only verified objects created by this operation or retain uncertain state; never remove a replaced namespace or silently overwrite to recover. Successful installation executes exact Node `--version` with clean environment, bounded output/time, requires `v24.19.0`, then reattests executable. Repeated successful invocation verifies the same installation and evidence. Preserve primary and cleanup errors.

Version/bin directories are uid1000 mode0700. A missing provenance file in an otherwise valid cache may be populated exclusively after verification; an existing mismatched file fails, with no replacement. A partial pre-existing final installation is never automatically deleted: report its fixed error and retain it for an explicit identity-checked recovery operation. No configurable repair/force flag belongs to this command. Document this distinction in the report so interruption behavior is operationally clear.

- [ ] **Step 1: Add RED argument and security-boundary tests.**

```typescript
await expect(bootstrapGenesis001LocalNode(undefined as never)).rejects.toThrow();
expect(networkSpy).not.toHaveBeenCalled();
expect(installSpy).not.toHaveBeenCalled();
```

Use complete module-mocked fixtures without exported production injection. Include individual wrong host/tool/source/transitive-helper, URL/status/redirect/encoding/oversize/trickledeadline, key/sums/signature/fingerprint/status, archive/member hash/size, subprocess failure/timeout/binary preservation, destination owner/mode/symlink/extra/partial/mutation, fsync/cleanup aggregation, idempotence and no-late-effects tests. Prove each rejection precedes the relevant network/install/execute action. Do not replace substantive failures with test-only success markers.

- [ ] **Step 2: Implement fixed lifecycle with private helpers.** Reuse bounded file semantics and pure signature-status validation patterns where practical; do not import the monolithic private Python recovery entrypoint. Keep source inventory complete.

- [ ] **Step 3: Run covering tests and typecheck.**

```powershell
& .git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run tests/genesis001LocalNodeBootstrap.test.ts tests/genesis002LocalBindingCache.test.ts --maxWorkers=1
& .git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc -p tsconfig.app.json --tsBuildInfoFile .git/genesis001-node-bootstrap.tsbuildinfo
```

- [ ] **Step 4: Commit scoped changes; run real fixed bootstrap twice from exact committed source.** Record literal commands/complete stdout+stderr/source commit/tree, installed:true thenfalse, final exact executable bytes/mode/owner/version and provenance checks. Previously staged public artifacts may inform diagnosis, but are not a shortcut past the implemented command. Do not claim runtime completion from mocks alone.

- [ ] **Step 5: Self-review and report for independent review.** Include failure evidence and remaining G001 compiler/binding work. No release or deployment claim.
