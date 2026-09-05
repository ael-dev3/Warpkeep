# Task 2b2 report — fixed Linux PTR source build

## Outcome

Implementation commit
`115b9c373ed1af3d0a67499e23269a733b74c24c` provides one shared,
nonfrozen PTR locked-source build core with two closed profiles and fixed
wrappers. The existing `withPtrLockedSourceBuild` remains the fixed Darwin
ARM64 contract. `withPtrLinuxLockedSourceBuild` is the new fixed Linux x64
contract. Neither wrapper accepts a profile, platform, generated-file list,
writer/parser/process injection, or other caller-selected authority.

The production implementation consists of:

- `scripts/ptr-binding-locked-source-build-core.ts`: the single private
  installer/lifecycle worker, immutable internal Darwin and Linux profiles,
  the preserved error class, exact public input/result types, and two fixed
  internal entry points.
- `scripts/ptr-binding-locked-source-build.ts`: compatibility wrapper that
  re-exports the preserved error identity and aliases the fixed Darwin entry
  point to `withPtrLockedSourceBuild`.
- `scripts/ptr-binding-linux-locked-source-build.ts`: fixed Linux wrapper
  exposing `withPtrLinuxLockedSourceBuild` with the same generic signature.

The Linux provenance domain is exactly
`warpkeep-ptr-independent-linux-x64-dependency-closure-v1`. The Darwin domain
remains exactly `warpkeep-ptr-independent-dependency-closure-v1`.

## Exact Linux profile

The selected Linux closure is exactly these 15 sorted keys:

```text
@esbuild/linux-x64@0.25.12
base64-js@1.5.1
esbuild@0.25.12
get-tsconfig@4.14.3
headers-polyfill@4.0.3
object-inspect@1.13.4
prettier@3.9.6
pure-rand@7.0.1
resolve-pkg-maps@1.0.0
safe-stable-stringify@2.5.0
spacetimedb@2.6.1
statuses@2.0.2
tsx@4.20.6
typescript@5.6.3
url-polyfill@1.1.14
```

Shared edges are unchanged. Linux changes only `esbuild` to depend on
`@esbuild/linux-x64`, and `tsx` to depend on `esbuild` and `get-tsconfig`
without `fsevents`. The Linux native package requires exact `os: ['linux']`,
`cpu: ['x64']`, and snapshot `optional: true`; every other selected Linux
record requires those fields to be absent. The committed lock's Linux esbuild
SRI remains
`sha512-uqZMTLr/zR/ed4jIGnwSLkaHmPjOjJvnm6TVVitAa08SLS9Z0VM8wIRx7gWbJB5/J54YuIMInDquWyYvQLZkgw==`.
Synthetic archive integrities are independently derived from fixture TAR
bytes and do not override that production authority.

## TDD evidence

### Missing-interface RED

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run \
  tests/ptrBindingLinuxLockedSourceBuild.test.ts --maxWorkers=1
```

Before the wrapper existed this returned exit 1 during suite import with
`Cannot find module '../scripts/ptr-binding-linux-locked-source-build'`; no
tests ran. A temporary fixed-name wrapper that forwarded to the reviewed
Darwin implementation then made the interface test green without selecting a
Linux graph.

### Semantic old-graph RED

With that temporary fixed-name forwarding wrapper, the focused positive test
was run:

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run \
  tests/ptrBindingLinuxLockedSourceBuild.test.ts --maxWorkers=1 \
  -t "installs the exact Linux x64 closure"
```

It returned exit 1 with 1 failed and 24 skipped. The valid Linux fixture
reached the old Darwin selector and failed
`PTR_LOCKED_SOURCE_BUILD_CACHE_INVALID` while trying to open the absent
Darwin archive. This demonstrated a semantic profile failure rather than a
source-text assertion. After introducing the closed Linux profile in the
shared core, the same command returned exit 0 with 1 passed and 24 skipped.

## Behavioral coverage

`tests/ptrBindingLinuxLockedSourceBuild.test.ts` exercises the real shared
core with only commit materialization and writer syscalls replaced at their
existing test boundaries. Its 27 cases cover:

- exact Linux closure/layout and an independently framed Linux-domain digest;
- deterministic provenance across fresh fixture roots;
- missing, widened, and misplaced `cpu`/`os`/`optional` metadata;
- foreign-platform substitution, malformed foreign optional metadata, and a
  missing Linux package while Darwin records remain;
- missing/malformed PTR lock and missing PTR manifest despite valid root
  fallback files;
- malformed package archives;
- callback dependency mutation, callback throw, and thenable rejection;
- the exact bundle allowance, cleanup failure, and owned-root retention;
- rejection of caller `profile`, `platform`, and `generatedFiles` keys;
- fixed cross-profile rejection and shared public error identity.

The existing Darwin behavioral regression remained unchanged and passed
34/34. This retains the stateful-input snapshot, exact Darwin graph/metadata,
descriptor read-plus-close aggregation, cache/source identity, callback
timing, output allowance, and retained-failure cleanup behavior.

`tests/fixtures/ptrLockedSourceBuildFixture.ts` holds only shared test data,
synthetic TAR construction, exact expected graphs/links, and the independent
digest calculation. It does not provide a production injection seam.

## Authentic native writer evidence

`tests/ptrBindingLockedSourceBuildNative.test.ts` retains the prior Darwin
native case and adds a Linux case. It mocks only commit materialization; Node
filesystem calls and the unchanged staged Python descriptor-relative writer
are real. The fixture keeps the reviewed `0700` materializer-directory
contract. The Linux case runs two fresh roots and asserts:

- native `0700` directories and the `0600` copied lock;
- the exact 15-key `.pnpm` closure and exact top-level package layout;
- the exact package, internal dependency, and `.bin` symlink set with real
  `lstat(...).isSymbolicLink()` results;
- relative targets plus lexical and resolved PTR containment;
- absence of fsevents, Darwin native, root, and G002 dependency trees;
- the exact bundle allowance, independently framed Linux provenance,
  deterministic fresh-root digests, and complete lifecycle cleanup.

The controller copied the exact six committed blobs from `115b9c3`; all blob
hashes matched. The prescribed native Linux six-file command returned exit 0
in 6.92 seconds: 84 passed, 3 existing Darwin-only skips, 0 failures, and all
6 files passed. Both real staged-writer cases passed: Darwin layout in 940 ms
and Linux across two fresh roots in 1785 ms.

## Local verification

Focused shared-kernel command:

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run \
  tests/ptrBindingLinuxLockedSourceBuild.test.ts \
  tests/ptrBindingLockedSourceBuild.test.ts --maxWorkers=1
```

Result: exit 0; 61/61 passed.

Prescribed Windows covering command:

```text
.git/ci-node-22.22.3/node.exe node_modules/vitest/vitest.mjs run \
  tests/ptrBindingLockedSourceBuild.test.ts \
  tests/ptrBindingLinuxLockedSourceBuild.test.ts \
  tests/ptrBindingLockedSourceBuildNative.test.ts \
  tests/ptrProductionPublisher.test.ts \
  tests/ptrProductionPublisherDirectoryRace.test.ts \
  tests/genesis001HistoricalDependencyClosure.test.ts --maxWorkers=1
```

Result: exit 1; 79 passed, 5 skipped, and 2 known host-only failures. The
historical test could not spawn `/usr/bin/git`, and Windows reported mode
`0666` where the native publisher-race assertion requires `0755`. Neither
assertion was weakened. Both native writer cases were explicitly skipped on
Windows because that host cannot prove POSIX modes and symlinks.

Pinned typecheck:

```text
.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc \
  -p tsconfig.app.json \
  --tsBuildInfoFile .git/ptr-linux-source-app.tsbuildinfo
```

Result: exit 0, no diagnostics. `git diff --check` returned exit 0.

## Self-review and scope audit

- The core exports only the preserved error/type declarations and the two
  fixed entry points. The generalized worker and both profile tables are
  module-private; no production host auto-selection exists.
- There is one installer/lifecycle implementation. Both profiles share the
  same manifest/lock authority, cache verification, descriptor writer,
  provenance framing, callback reattestation, bundle cleanup, and failure
  lifecycle.
- The existing publisher continues importing the Darwin compatibility path;
  publisher and race tests were not edited. Its 17-case regression remained
  green in the native controller run.
- Only the six authorized source/test paths were staged in the implementation
  commit. No frozen G001 projection, immutable helper/CLI/provenance file,
  root package/lock, `spacetimedb` source, binding output, pin/count/manifest,
  workflow, or controller-owned design/ledger file was staged.

## Limits and remaining concerns

- Windows test doubles cannot prove native POSIX permission or symlink
  behavior. Native proof is Linux-only. Running the fixed Darwin selector on
  Linux proves selection/layout compatibility but is not a native Darwin host
  attestation.
- No full root suite was run because the brief excludes known stale-closure
  failures. No real dependency install, module build/generation, publish,
  network request, credential access, or refreeze occurred.
- This component does not complete the local final-preparation adapter,
  binding adapters, refreezer, or release. Its next consumer is the fixed
  final-preparation adapter specified by the local-release design.
