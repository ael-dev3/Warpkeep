# Task 2b5 — private CLI build output report

## Scope and concrete diagnosis

The reviewed Task 2b4 runtime reached the real credential-free PTR build at
source commit `27b7dc31e6a3eab4d9357ccafceb50df103beb21`, then exited after about
30 seconds with the sanitized `LOCAL_BINDING_RUNTIME_PROCESS_FAILED`. The
retained operation `binding-94d52e607d80423d8ff8225c82d6ffe9` contains an
actual build-tree bundle and immutable handoff bundle. Both are 1,397,631 bytes
with SHA-256
`8d624c0d6c8072682457ee7381f63c811ea3361e5a7d4ebd24800d4ebb956303`.
Cycle 1's generated directory is empty.

A read-only invocation of the exact operation-owned CLI generated 20 binding
files from the retained handoff in an isolated private `/tmp` root with an
empty HOME and TMPDIR. This ruled out the bundle and generator. The retained
build showed that the real CLI created `spacetimedb/ptr/dist` at mode 0755
under ambient umask 0022. The next locked-source materialization verification
requires every traversed directory to be canonical, operation-owned, and mode
0700. It therefore rejected `dist` before cleanup and before the worker could
emit its canonical result. This exactly explains the complete build and
handoff, empty generated tree, and parent process failure. No retained
operation or provisioned source clone was edited.

## TDD evidence

The focused lifecycle fixture was changed to reproduce the CLI's recursive
`mkdir(..., 0755)` rather than creating a synthetic private output itself. It
also records whether `dist` existed before the CLI, its mode before and after
the CLI call, and whether the post-operation materialization verifier ran.

With the production worker restored to the Task 2b4 baseline, the final test
shape produced the required behavioral RED:

```text
npm exec vitest -- run tests/localBindingRuntimeLifecycle.test.ts --maxWorkers=1

Test Files  1 failed (1)
Tests       7 passed | 5 failed (12)
Failure     expected buildOutputWasPrecreated true, received false
Negatives   existing directory/file/link and escaped root had no
            LOCAL_BINDING_WORKER_BUILD_OUTPUT_INVALID boundary
Duration    2.86s
exit        1
```

After the production change, the focused suite passed 12/12. The success case
proved that the production worker precreated the directory, observed mode 0700
before the CLI, retained mode 0700 after the CLI's recursive 0755 mkdir, wrote
the controlled bundle, reached post-operation materialization verification,
and completed locked-source cleanup. Focused negative cases prove that an
unexpected existing directory, regular file, junction/symlink, or escaped
materialized root produces `LOCAL_BINDING_WORKER_BUILD_OUTPUT_INVALID` before
the CLI build. The existing-directory/file/link cases reach typecheck first,
while the escaped root is rejected before any command.

## Implementation

`scripts/local-binding-runtime-worker.mjs` now binds the build output to the
fixed source builder layout
`<materializationRoot>/ptr-locked-source-builds-v1/<32-hex>/spacetimedb/ptr`.
Before typecheck it verifies the exact parent, materialization, and PTR
directories are canonical nonsymlink directories owned by uid 1000 at exact
mode 0700. Immediately after typecheck and executable reattestation, it creates
only the absent `dist` child with nonrecursive `mkdir` at mode 0700 and then
reattests its type, owner, mode, canonical path, and exact parent before the
fixed CLI build.

Creation is exclusive: any existing file, directory, or link is rejected; the
worker never chmods an existing target into acceptance. Typecheck-before-build,
all executable reattestations, exact bundle allowlisting, immutable handoff,
post-build materialization verification, cleanup, and primary/cleanup error
preservation are unchanged. The generic materialization verifier, global umask,
environment, public zero-argument API, frozen G001 paths, root package, and lock
remain byte-identical.

## Local GREEN evidence

At immutable successor commit
`759e12712d8048770a1884bcbba334efb72fb807`:

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
Tests       101 passed | 7 skipped (108)
Failures    0
Duration    17.95s
exit        0
```

The seven skips are the existing explicit Windows limitations for native Linux
ownership, chmod, and symlink evidence. These commands also exited 0:

```text
npm run typecheck

.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc \
  -p tsconfig.app.json \
  --tsBuildInfoFile .git/local-binding-runtime.tsbuildinfo

.git/ci-node-22.22.3/node.exe --check \
  scripts/local-binding-runtime-worker.mjs
```

The exact-path staged diff check was clean.

## Native fixture correction and evidence

The first native transfer at code commit
`b72bcd7fff46bf9bb4233eccadf99fd77a54ec18` hash-matched both committed blobs,
but WSL session 77392 reported 97 passed and 11 lifecycle failures, with no
skips, in 10.01 seconds (exit 1). The failures occurred before typecheck at the
new path verifier. Independent pinned-Linux-Node evidence showed the lifecycle
provenance mock's recursive `cpSync` created its destination root,
`spacetimedb`, and `spacetimedb/ptr` at 0755 even though the synthetic source
directories were 0700. All were uid 1000, nonsymlink, and canonical; only the
mode differed. The real descriptor writer creates every materialized directory
at 0700, and the existing native writer fixture already reproduced that
contract explicitly.

Commit `759e12712d8048770a1884bcbba334efb72fb807` therefore makes the lifecycle
test materializer reproduce the real writer's 0700 directory contract after
`cpSync`. It does not change production code or weaken any check.

The controller transferred the two successor blobs and verified their hashes
exactly. WSL Ubuntu 24.04 session 79860 ran pinned Node 22.22.3 with the same
eight-suite command:

```text
Test Files  8 passed (8)
Tests       108 passed (108)
Skipped     0
Failures    0
Unhandled   0
Duration    10.74s
exit        0
```

The two real descriptor-writer cases passed in 975 ms and 1846 ms. This native
run supplies the real POSIX mode and link evidence that Windows emulates or
skips.

## Limits and next gate

The lifecycle CLI and command results remain controlled test boundaries; no
test is labeled as actual Spacetime execution. The earlier retained operation
is a real successful typecheck/build and failed post-build verification, not a
successful full derive. The controller intentionally has not rerun the actual
credential-free two-cycle derive pending scoped review. After review, it must
update the clean provisioned source to the reviewed commit and rerun that
derive; no successful two-cycle generation or candidate derivation is claimed
here.

## Commits

- `b72bcd7fff46bf9bb4233eccadf99fd77a54ec18` — `fix(runtime): precreate private ptr build output`
- `759e12712d8048770a1884bcbba334efb72fb807` — `test(runtime): preserve private materializer modes`
