# Task 2b3 report — operational local PTR build and binding runtime

## Status

Implementation is committed at `bc931c6b26495b980a53c98b5b9aa5a6d14618e2` on top of the assigned source base
`4fe68fee0c6b85eba8643f6ed1ee9889f60ad2a0`.  The intervening `758ad4e` commit
is the controller's unrelated voxel-renderer design document; Task 2b3 neither
staged nor changed that document.  No frozen G001 member, root package/lock,
generated binding, workflow, release pin, credential, or production surface was
changed.

## RED evidence

Tests were added before each corresponding implementation:

1. `.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs --run tests/localBindingYamlManifest.test.ts`
   exited 1 with 3/3 failures.  The failures named the missing fixed generator
   and manifest path; the archive-mutation case could not reach the generator.
2. `.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs --run tests/localBindingNativeTsHooks.test.ts`
   exited 1 with 2/2 failures because the native-hook module was absent.  After
   the first implementation, a focused rerun exposed two behavioral defects:
   Windows mode emulation was compared as native evidence, and the CJS resolver
   rejected Node's absolute resolved YAML child.  Both were corrected without
   weakening Linux mode checks or namespace containment.
3. `.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs --run tests/localBindingRuntime.test.ts`
   exited 1 at import resolution because the fixed public runtime did not exist.
4. A later direct-CLI test produced a second meaningful RED: without
   `--experimental-vm-modules`, a static named `SourceTextModule` import failed
   before malformed CLI arguments were rejected.  The public module now checks
   arguments before lazily importing the core, and the core performs an explicit
   VM capability check before graph parsing.

## Implemented component

- `local-binding-runtime.mjs` exposes only `LocalBindingRuntimeError` and the
  zero-argument `derivePreparedPtrLinuxBindings()`.  It returns copied, sorted
  candidate bytes and a sanitized direct-CLI summary.
- The fixed core attests the Linux x64 Node, Git, CLI/standalone, private roots,
  captured commit/tree, its committed control files, a bounded 256-module
  SourceTextModule graph, and the complete physical YAML namespace.  It ignores
  ambient HOME/PATH/TMP/npm/SPACETIME values by constructing a child allowlist,
  and rejects actual preloads/unapproved exec arguments.
- Each derivation creates one private detached committed worktree and runs two
  independent cycles.  Each cycle sends one canonical <=1 MiB request on fd 3
  to a one-use pinned Node child, with closed stdin, bounded stdout/stderr and a
  15-minute parent deadline.
- Synchronous native hooks admit only the synthetic PTR Linux builder entry,
  recorded static graph edges and builtins, and the attested physical YAML CJS
  namespace.  All graph identities and the full YAML inventory are rechecked
  before evaluation; dynamic/unrecorded imports, extension fallback, links,
  extra YAML files, and source identity swaps fail closed.  Hooks deregister in
  `finally`.
- The worker calls the real `withPtrLinuxLockedSourceBuild`, runs pinned Node on
  staged `tsc --noEmit --project <PTR tsconfig>`, runs exact direct CLI
  `build --module-path spacetimedb/ptr`, and synchronously copies the bounded
  bundle into the operation-owned handoff before builder cleanup.
- The parent reattests the handoff, runs exact direct CLI
  `generate --lang typescript --yes --no-config --js-path <handoff> --out-dir
  <private empty tree>`, and uses `readSpacetimeBindingTree`.  It requires exact
  bundle and binding bytes and dependency closure equality across both cycles.
  Primary failures and descriptor/deregister/runtime cleanup failures remain
  jointly observable; uncertain failed operation roots are retained.
- The stdlib-only Python generator accepts exactly `--write` or `--check`,
  attests the fixed 112,086-byte archive SHA-256 and SRI before TAR parsing,
  rejects links/devices/traversal/collisions/unsafe directory entries and all
  stated bounds, validates package identity/node export, and emits the sole
  canonical 233-file authority.  It never extracts or writes archive members.
  Its documented length-prefixed digest framing is implemented independently
  in the Node runtime.

## GREEN evidence

Local final covering command:

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs --run \
  tests/localBindingRuntime.test.ts \
  tests/localBindingNativeTsHooks.test.ts \
  tests/localBindingYamlManifest.test.ts \
  tests/ptrBindingLinuxLockedSourceBuild.test.ts \
  tests/spacetimeBindingTree.test.ts

Test Files  5 passed (5)
Tests       59 passed | 4 skipped (63)
Duration    5.86s
exit        0
```

The four skips are existing platform-specific cases in the reviewed builder
suite.  The new suites themselves passed 13/13 after the final native identity
race and extra-YAML tests were added.

Local app typecheck:

```text
.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc \
  -p tsconfig.app.json \
  --tsBuildInfoFile .git/local-binding-runtime.tsbuildinfo
exit 0 (no diagnostics)
```

The generator's final `--check` exited 0.  The committed manifest SHA-256 is
`a55cc03f08013a9591a03ff7270299eb36d7be7bb5f63e7634a5e049924683e4`.
The controller independently verified the archive and manifest with .NET
TarReader/GZip/SHA rather than the Python implementation: exact SRI, all 233
regular paths/modes/sizes/SHA-256 values, 685,953 expanded bytes, and aggregate
digest `536aff7a68aae4dfa5116d824b25a63237f59e25b6e6713938725af8efac81cb`
matched (exit 0).

## Native gate

The controller transferred all 14 files from the committed blobs at
`bc931c6b26495b980a53c98b5b9aa5a6d14618e2` and independently confirmed every
destination with `git hash-object`. The public offline archive SHA-256 also
matched
`008fa204cb1ba700e0272ba045abbf09a6ffe63456e8146ba97cac6c2ad1ef91`.

Native command in WSL Ubuntu 24.04, using the pinned Node 22.22.3 binary at the
controller's temporary fixture path and `--maxWorkers=1`:

```text
node node_modules/vitest/vitest.mjs --run \
  tests/localBindingRuntime.test.ts \
  tests/localBindingNativeTsHooks.test.ts \
  tests/localBindingYamlManifest.test.ts \
  tests/ptrBindingLinuxLockedSourceBuild.test.ts \
  tests/spacetimeBindingTree.test.ts \
  --maxWorkers=1

Test Files  5 passed (5)
Tests       63 passed (63)
Duration    5.04s
exit        0
```

There were zero native skips or failures. This supplies native Linux evidence
for directory/file modes, identity-swap rejection, contained nested physical
YAML CJS loading, TS enum/parameter-property transformation, the reviewed PTR
builder regression suite, and strict generated-binding tree validation. It
does not execute the unprovisioned fixed-profile Spacetime build/generate
operation and is not represented as such.

## Limits and concerns

- Windows tests prove transform/resolution behavior with pinned Node 22.22.3,
  but Windows chmod metadata is deliberately not treated as native Linux
  permission proof.  Linux retains exact 0700-directory and manifest-mode
  checks.
- No provisioned fixed `/home/snapmeter/.warpkeep/release-preparation-v1`
  profile exists in this Windows environment, so the tests did not execute a
  real Spacetime build or generate.  This is not claimed as release-build
  evidence.  The operational entrypoint reaches the reviewed builder and exact
  transports; actual provisioning and the first authorized full derivation are
  later gates.
- The runtime produces candidate bytes only.  It does not refreeze/install
  bindings, publish, contact a network, read credentials, or validate the
  separately reported G001 full-history issue.

## Commit

- `bc931c6b26495b980a53c98b5b9aa5a6d14618e2` — `feat: add fixed local PTR binding runtime`

---

## Fix round 1 — review findings 1–4

### Scope and baseline

This round addresses all four Important findings in `task-2b3-review.md` on the
assigned fix base `bc931c6b26495b980a53c98b5b9aa5a6d14618e2`. The intervening
Task 2b3 report and controller-owned voxel plan commits were not changed. No
frozen G001 path, root package/lock, checked-in binding, workflow, release pin,
credential, network path, or production installation was touched.

### RED evidence

- The first focused bounded-reader test run failed at module resolution because
  `scripts/local-binding-bounded-file.mjs` did not exist. The test exercises a
  descriptor whose checked two-byte file grows to three bytes and requires the
  rejection to occur after reading no more than checked-size-plus-one.
- The primary-plus-close fixture initially failed for the same missing module;
  its final assertion requires the primary read exception to remain
  `AggregateError.cause` while both the read and descriptor-close exceptions
  remain present in `errors`.
- The immutable CLI request test rejected the attester-style snapshot path with
  `LOCAL_BINDING_WORKER_REQUEST_INVALID` under the old implementation, proving
  the old contract still required the mutable original CLI path. It became
  GREEN only after the request and execution boundary used the returned
  snapshot authority.
- Replacing the previous string-search “wiring” assertion with the controlled
  functional driver exposed that no test reached the worker/locked-source
  lifecycle. The new driver then produced a test-only fixture RED
  (`LOCAL_BINDING_WORKER_EXECUTABLE_INVALID`) until its Windows uid/mode
  emulation faithfully represented the fixed Linux owner. Production
  executable checks were not relaxed.
- The controller's first exact-blob native run at `198b35a` supplied a further
  platform-specific RED: 80 tests passed and the sole failure was the lifecycle
  fixture expecting the Windows basename `node.exe` where Linux correctly
  reported `node`. The assertion now derives only the display basename from
  `process.execPath`; it does not normalize or bypass executable authority.

### Implemented fixes

1. All affected file readers now share one exact descriptor implementation.
   It opens with `O_NOFOLLOW`, validates path/descriptor identity, reads at most
   the attested size/cap plus one sentinel byte, checks EOF and post-read
   identity, and preserves primary plus close failures. Digest-only executable
   reads use a bounded 1 MiB scratch buffer rather than allocating the 47–130
   MiB executable size. Source remains capped at 4 MiB/file; handoff remains
   capped at 32 MiB. Executables with `0o022` set are rejected.
2. The parent and worker execute the attester's immutable CLI snapshot path and
   reattest its companion. Node, Git, CLI, companion, and snapshot-directory
   identities are retained and required to remain identical across uses; Git
   is checked immediately before and after every direct Git child, and Node/CLI
   are checked around worker/typecheck/build/generate execution. Exact CLI
   snapshot mode 0500 and private directory mode 0700 remain mandatory.
3. The worker launches from the captured commit worktree. The evaluated
   bootstrap closure now includes the bounded reader, runtime/core, worker,
   hooks, result reader, manifest, binding-tree reader, CLI attester, and the
   attester's relative additive-proof dependency. Captured bytes/digests and
   inode identities are checked before and after worker execution and around
   dynamic evaluation of the captured attester and binding-tree modules.
4. Behavioral coverage now includes the public zero-argument entrypoint,
   defensive result copies, bounded growth/digest/write-mode/close failures,
   process output/nonzero/signal/timeout cases, canonical request/result
   framing, two-cycle byte mismatch, native hook races, and a controlled
   public-entrypoint to actual worker to real
   `withPtrLinuxLockedSourceBuild` lifecycle. The lifecycle asserts synchronous
   typecheck/build order, execution of the snapshot CLI (not the mutable
   original), Node/Git/CLI/companion mutations before typecheck, separate
   typecheck/build failures, hook deregistration, primary-plus-deregister
   preservation, helper cleanup ordering, and byte-identical absence of writes
   to the live generated-binding tree. Test-only module mocks provide process
   and materialization boundaries; production accepts no runner/adapter.

### Local GREEN evidence

Definitive Windows covering command at `6b05496`:

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run \
  tests/localBindingRuntime.test.ts \
  tests/localBindingRuntimeLifecycle.test.ts \
  tests/localBindingNativeTsHooks.test.ts \
  tests/localBindingYamlManifest.test.ts \
  tests/ptrBindingLinuxLockedSourceBuild.test.ts \
  tests/ptrBindingLockedSourceBuildNative.test.ts \
  tests/spacetimeBindingTree.test.ts \
  --maxWorkers=1

Test Files  6 passed | 1 skipped (7)
Tests       76 passed | 7 skipped (83)
Duration    19.50s
exit        0
```

The skips are explicit platform limitations: native Linux ownership/mode and
real symlink proof are not claimed on Windows. The focused app typecheck also
passed with no diagnostics:

```text
.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc \
  -p tsconfig.app.json \
  --tsBuildInfoFile .git/local-binding-runtime.tsbuildinfo \
  --pretty false
exit 0
```

### Native GREEN evidence

The controller copied all 12 owned source/test files from committed blobs at
`6b05496d0fb5d09c14e1f91213f85d36804d52c4` and verified every destination
blob exactly before execution. In WSL Ubuntu 24.04 it ran pinned Node 22.22.3:

```text
/tmp/warpkeep-root-ci-PwWPWxgX/node-v22.22.3-linux-x64/bin/node \
  node_modules/vitest/vitest.mjs run \
  tests/localBindingRuntime.test.ts \
  tests/localBindingRuntimeLifecycle.test.ts \
  tests/localBindingNativeTsHooks.test.ts \
  tests/localBindingYamlManifest.test.ts \
  tests/ptrBindingLinuxLockedSourceBuild.test.ts \
  tests/ptrBindingLockedSourceBuildNative.test.ts \
  tests/spacetimeBindingTree.test.ts \
  --maxWorkers=1

Test Files  7 passed (7)
Tests       83 passed (83)
Skipped     0
Duration    8.92s
exit        0
```

Both real staged-writer tests passed natively (1.056s and 1.818s). This final
gate covers native file modes/ownership, real relative symlinks and containment,
the captured-bootstrap replacement test, native hooks, the functional
worker/helper lifecycle, and both reviewed PTR builder/tree regressions. It
still does not claim a provisioned real Spacetime build/generate.

### Limits and remaining gate

- Windows tests use test-only uid/mode normalization where necessary; they are
  not native chmod, ownership, or symlink evidence. The production Linux checks
  have no platform bypass.
- The controlled lifecycle invokes the actual worker and reviewed locked-source
  helper but mocks external command results and materialization system calls.
  It performs no real Spacetime build/generate, network access, install,
  provisioning, credentials, or production operation.
- The provisioned fixed-profile two-cycle derivation remains a separate
  required gate. This round returns candidate behavior only and does not claim
  release-build evidence.

### Fix commits

- `198b35a97be4988dcb3c1312ae644ed93ea8fc62` — `fix(release): harden local binding runtime boundaries`
- `6b05496d0fb5d09c14e1f91213f85d36804d52c4` — `test(release): close captured bootstrap race`

## Fix round 2 — operation-owned CLI authority and production-parent coverage

This section supersedes the round-one description of the attester-created
temporary CLI as sufficient execution authority. The unchanged frozen attester
still validates and snapshots the pinned tool, but that ambient temporary
snapshot is now only a verified source for a second bounded descriptor copy.
The actual build and generate executable plus its companion live at the exact
private operation-owned `cli/` path.

### RED evidence

- The focused worker-request mutation first rejected the new exact
  `<operation>/cli/spacetimedb-cli` path with
  `LOCAL_BINDING_WORKER_REQUEST_INVALID`, demonstrating that the old validator
  still selected the ambient attester path.
- The bounded-copy test first failed because
  `copyLocalBindingBoundedFile` did not exist. The parent-cycle suite then
  failed all seven initial scenarios because the production cycle function was
  not reachable independently of the full host setup. After extracting only
  that internal orchestration, the first run reached the production code and
  exposed a test mapper defect; the fixed mapper then made all production
  parent cases behavioral rather than string assertions.
- The parent primary-plus-cleanup test produced `8 passed, 1 failed` because
  `preserveLocalBindingRuntimePrimaryAndCleanup` did not exist. It became
  `9 passed` after the production finalization path used the same helper and
  retained the primary exception as `AggregateError.cause` with both errors.
- The real fd3 early-exit regression initially resolved successfully even
  though the child exited before accepting the 4 MiB request, and Vitest also
  reported an uncaught `write EOF`. The process boundary now requires completed
  fd3 writing before a zero exit can succeed and converts pipe errors to the
  sanitized process failure without an uncaught exception. A companion control
  proves a complete fd3 write/read still succeeds.
- The controller's first exact-blob Linux run at `369565b` found two additional
  fixture-boundary REDs: `101 passed, 1 failed`, plus one unhandled error,
  exit 1. The hostile-ambient snapshot case failed at the post-copy operation
  identity check because the fixture captured the parent identity before its
  own expected `cli/` mkdir changed parent mtime/ctime. The fd3 request helper
  emitted an uncaught Linux `ECONNRESET` when the oversized malformed reader
  closed early. The correction captures the operation identity after the
  expected mkdir and then holds it across both copies; the test helper awaits
  and records fd3 pipe closure and requires no pipe error on the canonical
  request. Production directory ownership, 0700 mode, canonical-path, and
  identity checks were not relaxed.

### Implemented F2/F4 closure

1. `bindOperationOwnedCliSnapshot` creates exactly
   `<operation>/cli/{spacetimedb-cli,spacetimedb-standalone}` under the fixed
   uid-1000, mode-0700 operation. Both files are copied exclusively through
   bounded descriptors, pinned by exact size/digest and mode 0500, and source,
   operation directory, destination directory, and destination identities are
   reattested across the copy and every later execution. The fd3 request accepts
   only that exact relationship. Hostile ambient `TMPDIR`, `HOME`, `PATH`, npm,
   and `SPACETIME_BIN` values cannot select the executed path; preload authority
   remains rejected.
2. The production parent now has behavioral coverage without mocking its core.
   Tests mock only low-level filesystem/process boundaries while running the
   actual request framing, two-cycle orchestration, handoff reattestation,
   fixed generate command, strict binding-tree reader, and reproducibility
   comparison. Cases cover canonical fd3 plus early close, source-graph escape,
   ambiguous and missing resolution, real enum/parameter-property parsing,
   hostile ambient snapshot paths, forged nonce, changed handoff bytes,
   generate failure, bundle mismatch, binding-byte mismatch, binding-path
   mismatch, dependency-digest mismatch, exact executable-verification order,
   and primary-plus-cleanup preservation. The public runtime remains the fixed
   zero-argument API; no production runner, resolver, environment, path, or
   authority injection was added.
3. The evaluated committed bootstrap closure includes the new CLI-snapshot,
   process, and fd3-request modules. The worker reads its one-use request from
   real fd3 through the same exact request validator, and its CLI-directory
   check independently requires the operation-owned sibling path.

### Final local GREEN evidence

At immutable successor `8e445b9`, the Windows covering command was:

```text
npm exec vitest -- run \
  tests/localBindingRuntime.test.ts \
  tests/localBindingRuntimeParent.test.ts \
  tests/localBindingRuntimeLifecycle.test.ts \
  tests/localBindingNativeTsHooks.test.ts \
  tests/localBindingYamlManifest.test.ts \
  tests/ptrBindingLinuxLockedSourceBuild.test.ts \
  tests/ptrBindingLockedSourceBuildNative.test.ts \
  tests/spacetimeBindingTree.test.ts \
  --maxWorkers=1

Test Files  7 passed | 1 skipped (8)
Tests       95 passed | 7 skipped (102)
Duration    16.17s
exit        0
```

The seven skips remain explicit Windows-only limitations for native Linux
ownership, chmod, and symlink behavior. Both typecheck commands passed:

```text
npm run typecheck
exit 0

.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc \
  -p tsconfig.app.json \
  --tsBuildInfoFile .git/local-binding-runtime.tsbuildinfo
exit 0
```

`node --check` over the changed runtime and fixture JavaScript also exited 0,
and `git diff --cached --check` reported no errors before each source/test
commit.

### Final native GREEN evidence

The controller copied the two-file correction from `8e445b9` over the first
native snapshot and rechecked all 17 owned files against their committed blobs.
All hashes matched. In WSL Ubuntu 24.04, session 64722 ran the pinned Linux Node
22.22.3 with the same eight suites and `--maxWorkers=1`:

```text
Test Files  8 passed (8)
Tests       102 passed (102)
Skipped     0
Failures    0
Unhandled   0
Duration    8.96s
exit        0
```

The two native real-writer tests passed in 939 ms and 1717 ms. This is native
evidence for the operation-owned directory identities, permissions, symlinks,
real fd3 closure behavior, native hooks, and existing reviewed PTR writer/tree
boundaries.

### Remaining limitation

No test in this fix round provisioned the fixed guest root or ran a real
Spacetime module build/generate. Process and materialization effects remain
controlled low-level test boundaries, with the actual worker/locked-source
helper and actual parent orchestration exercised separately. The provisioned
two-cycle derive is still the explicitly separate gate; this report makes no
claim of release binding generation, publication, network access, credential
use, or deployment.

### Fix-round-2 commits

- `369565b992c402f747f9cee3fa722d1b9438472c` — `fix(runtime): bind local PTR execution authority`
- `8e445b940320b85681f969123fec207063f2b931` — `test(runtime): harden native fd3 fixtures`
