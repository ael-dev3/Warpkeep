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
