# Task 2b1 report — independent PTR locked-source build

Status: DONE_WITH_CONCERNS. The stable implementation commit passed the final
native Linux focused gate; Windows and native Darwin limitations remain below.

Base: `75367e37c9527a23f4739eb77963b04a93e95a66`

Implementation commit: `58a7b326365a78e22f51916f984bd592043a551a`

## Delivered scope

- Added `scripts/ptr-binding-locked-source-build.ts`, a synchronous low-level
  PTR source-build lifecycle that owns only PTR manifest/lock validation,
  Darwin ARM64 dependency graph selection, private npm cache verification,
  descriptor-writer installation, PTR-specific provenance, callback
  reattestation, and exact cleanup.
- Reused the unchanged commit materializer and descriptor-relative writer.
  From the frozen historical seam, used only `parseSafeNpmTar` and
  `dependencyTreeSnapshot`; the source comment records why the historical
  export name remains.
- Changed the actual PTR publisher preparation path to
  `withPtrLockedSourceBuild` and removed its caller-selected `generatedFiles`
  authority. Publisher build/generate, staging, ABI, config, token, receipt,
  and publish behavior is otherwise unchanged.
- Added synthetic offline npm TAR/cache fixtures that exercise real YAML graph
  parsing, canonical SHA512 cache addressing and verification, the frozen TAR
  validator, package identity checks, PTR-only layout, content provenance,
  mutation detection, synchronous callback enforcement, retained failures,
  and writer/materializer failure propagation.

No package manager, source build, binding generation, publish, network request,
or credential access was performed.

## TDD evidence

### Publisher selection RED

After writing the publisher-path regression, I mutation-checked it by
temporarily restoring the old workspace helper call and its `generatedFiles`
argument, then ran:

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run \
  tests/ptrProductionPublisherDirectoryRace.test.ts --maxWorkers=1 \
  -t "prepares PTR source builds through the independent PTR closure"
```

Result: exit 1; 1 failed, 1 skipped. The assertion expected
`stop after independent PTR closure` and received exactly
`workspace closure selected`. This establishes that the regression detects
the actual publisher choosing the old workspace closure, not source text.

After restoring the PTR call, the same command returned exit 0; 1 passed,
1 skipped on Windows. The controller's native Linux rerun of the complete race
file returned exit 0; 2/2 passed.

### PTR helper RED

The first synthetic fixture run against the explicit unimplemented helper stub
returned exit 1: 6 failed, 18 passed. Successful installation/lifecycle,
deterministic provenance, retained mutation failures, and callback failure
propagation all failed on `PTR_LOCKED_SOURCE_BUILD_NOT_IMPLEMENTED` (or before
materialization was recorded), as intended.

The stateful-input regression was also observed RED before the input snapshot
fix: exit 1 with `PTR_LOCKED_SOURCE_BUILD_INPUT_INVALID` caused by rereading a
getter after its first valid value.

### PTR helper GREEN

Fresh stable-snapshot command:

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run \
  tests/ptrBindingLockedSourceBuild.test.ts --maxWorkers=1
```

Result: exit 0; 25/25 passed. Malformed negative cases assert the intended
PTR lock/manifest/cache/archive/source/output/cleanup cause and operation
ordering rather than accepting an arbitrary throw.

## Verification evidence

Exact requested focused command on Windows:

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run \
  tests/ptrBindingLockedSourceBuild.test.ts \
  tests/ptrProductionPublisher.test.ts \
  tests/ptrProductionPublisherDirectoryRace.test.ts \
  tests/genesis001HistoricalDependencyClosure.test.ts --maxWorkers=1
```

Result: exit 1; 44 passed, 2 failed, 3 skipped. Both task implementation files
passed (PTR 25/25 and publisher 17/17). The two failures are host limitations:
the frozen G001 test invokes `/usr/bin/git`, and Windows reports the native
publisher-race victim mode as `0666` where the POSIX assertion requires
`0755`. No assertion was weakened.

The controller's earlier native Linux four-file copy ran 44 passed, 1 failed,
3 skipped; the sole failure exposed a test-double bug that translated
descriptor `fchmod(fd)` into pathname `chmod(path)`. Root-cause analysis fixed
only the test boundary: Linux now uses real descriptor chmod and real stat
modes. The controller reran the race file after that fix: exit 0, 2/2 passed.
Definitive native Linux verification copied from implementation commit
`58a7b326365a78e22f51916f984bd592043a551a`: all four copied file SHA256
values matched the committed files; the exact requested four-suite command
returned exit 0 in 3.16 seconds with 46 passed and 3 existing Darwin-only
skips (PTR 25/25, publisher 17/17, race 2/2, historical 2 passed/3 skipped).

Pinned typecheck:

```text
.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc \
  -p tsconfig.app.json \
  --tsBuildInfoFile .git/ptr-binding-source-app.tsbuildinfo
```

Result: exit 0, no diagnostics.

`git diff --check` returned exit 0. A semantic diff audit over every named
G001 projection file, root package/lock, and the complete `spacetimedb` tree
returned no paths. Only the four authorized implementation paths were staged
in `58a7b32`.

## Limits and concerns

- Windows cannot create the relative package/file symlinks used by the real
  descriptor writer without additional privileges. The test-only writer
  validates each computed target and copies its tiny synthetic target; Windows
  stat modes are normalized only inside the test double. This is not native
  link/openat/chmod proof. Native Linux coverage of the stable commit is the
  required independent platform gate.
- The full root suite was not run, per the brief's stale-closure warning. The
  focused G001 regression was preserved and no historical file was edited.
- Failures after uncertain callback/install mutation intentionally retain the
  owned operation materialization. This helper adds no recovery framework or
  public capability factory; existing trusted materialization controls remain
  the recovery boundary.
