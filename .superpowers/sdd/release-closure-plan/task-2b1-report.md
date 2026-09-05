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

## Fix round 1: review findings

Implementation commits:

- `2987a05b9bd849d7e647ba365e36d5b85e674fe8` — exact selected-package
  platform/optional authority, retained read/close failures, and isolated
  native-writer integration coverage.
- `a4f6dd88cbb86d93a4008d7f35ee5e706a2d52dc` — fixture-only correction that
  reproduces the real materializer's private `0700` directory contract.

### Review RED

The focused mutation and combined descriptor-failure command was:

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run \
  tests/ptrBindingLockedSourceBuild.test.ts --maxWorkers=1 \
  -t "exact optional-platform metadata mutation|preserves a descriptor read failure"
```

Before the production fix it returned exit 1: 7 failed, 2 passed, and 25
skipped. Six mutations incorrectly passed validation: missing esbuild `cpu`,
missing esbuild `os`, missing fsevents `os`, a misplaced fsevents `cpu`, and
misplaced generic platform/optional markers. The widened esbuild `cpu` and
missing esbuild optional marker were already rejected. The combined failure
case exposed only `MOCK_DESCRIPTOR_CLOSE_FAILED`, proving the primary read
failure had been replaced by descriptor cleanup.

The first native Linux run of commit `2987a05b` returned exit 1 with 55 passed,
1 failed, and 3 existing Darwin-only skips. The new test reached the real
staged writer, which rejected the copied PTR root at
`exactPrivateDirectory` with `GREATER_REALM_OPENAT_HELPER_INVALID` before any
write. Source audit established the cause: the real production materializer
creates the destination and every source ancestor through the descriptor
writer at `0700`, while the test materializer had relied on `cpSync`-inherited
directory modes and supplied `0755`. Commit `a4f6dd88` corrects only that test
boundary by making every copied source directory private before it is
snapshotted and returned; no production permission check was relaxed.

### Review GREEN and changes

`EXPECTED_OPTIONAL_PLATFORM_METADATA` now binds the exact `os`, `cpu`, and
snapshot `optional` presence and values for every selected key (with absence
required for all other selected packages). Focused mutations cover missing,
widened, and misplaced metadata and assert the stable PTR lock rejection
before the operation boundary.

`readExactBoundedFile` now captures its primary outcome and descriptor-close
failure separately. A non-PTR read failure is retained as the cause of the
stable PTR validation error; simultaneous primary and close failures are
ordered in `PTR_LOCKED_SOURCE_BUILD_READ_AND_CLOSE_FAILED`. The regression
asserts the stable primary code, its underlying read cause, the close cause,
and `read-failed` then `close-failed` ordering.

`tests/ptrBindingLockedSourceBuildNative.test.ts` mocks only commit
materialization. On Linux it uses the unchanged staged Python writer and real
filesystem syscalls. It asserts native `0700` directory and `0600` lock-copy
modes, the exact top-level and `.pnpm` layouts, the exact set of package,
internal-dependency, and `.bin` symlinks, relative targets, lexical and
resolved PTR containment, an independently framed provenance digest, exact
tree id/result, and post-lifecycle materialization removal.

Focused Windows GREEN after the production fix:

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run \
  tests/ptrBindingLockedSourceBuild.test.ts --maxWorkers=1 \
  -t "exact optional-platform metadata mutation|preserves a descriptor read failure"
```

Result: exit 0; 9 passed and 25 skipped. The complete helper file returned
exit 0 with 34/34 passed. The native file returned exit 0 with its one test
explicitly skipped on Windows. The covering Windows helper/native/publisher/
race command returned 51 passed, 1 skipped, and only the two known native-mode
race assertions failed because Windows reports mode `0666`; those assertions
were not weakened. The publisher file passed 17/17.

Pinned typecheck after the fixture correction:

```text
.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc \
  -p tsconfig.app.json \
  --tsBuildInfoFile .git/ptr-binding-source-fix-app.tsbuildinfo
```

Result: exit 0, no diagnostics. Staged/committed `git diff --check` returned
exit 0.

Definitive native Linux verification copied the committed `a4f6dd88` snapshot;
the controller reported all five copied blob hashes matched. The exact five-
suite helper/native/publisher/race/historical command returned exit 0 in 4.71
seconds: 56 passed, 3 existing Darwin-only skips, 0 failures, and all 5 files
passed. Breakdown: helper 34/34, native real-writer 1/1 (1004 ms), publisher
17/17, race 2/2, and historical 2 passed/3 skipped.

### Fix-round limits and concerns

- Windows remains test-only evidence for the mocked writer and cannot prove
  native POSIX symlink or chmod behavior; the native integration is therefore
  Linux-only. No native Darwin run was performed.
- The review's minor source/archive/aggregate size-bound test expansion was
  explicitly deferred and is not included in this fix round.
- No full root suite, real module generation/build/publish, remote call, or
  private credential access was performed. No frozen G001 projection, shared
  immutable helper, package/lock, or `spacetimedb` source file changed.
