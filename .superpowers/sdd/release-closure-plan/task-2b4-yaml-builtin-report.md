# Task 2b4 — real-profile YAML builtin compatibility report

## Scope and diagnosis

The provisioned credential-free local binding runtime at clean source commit
`00a38d46a6b5d631cfe1fe4811f106957e1e61b7` exited after 4.58 seconds with the
sanitized `LOCAL_BINDING_RUNTIME_PROCESS_FAILED`. The retained operation
`binding-b8d26adeef5c4e3d994ebc215f1d3e21` contained its captured source,
operation-owned CLI snapshot, and empty cycle-1 builds/generated/handoff
directories. Those directories were canonical mode 0700 and uid 1000; the
captured source was clean at tree `3af20722c325cec4e1db4d55b50801236c442885`.

A read-only, credential-free pinned-Node diagnostic derived the captured source
graph, verified the physical YAML namespace, installed the production hooks,
and imported the fixed `warpkeep:ptr-binding-entry`. It failed before
materialization with:

```text
Error: LOCAL_BINDING_HOOK_RESOLUTION_DENIED
  at scripts/local-binding-native-ts-hooks.mjs:158
  at yaml/dist/compose/composer.js:3
```

The rejected request was the pinned YAML file's bare `require('process')`.
Independent inventory of the exact verified YAML 2.9.0 bytes showed that its
only nonrelative CJS requests are the Node builtins `process` and `buffer`.
The existing YAML-parent resolver allowed only relative, file-URL, or absolute
requests, so provisioning was correct and the compatibility defect was in the
hook boundary. Neither the retained operation nor the clean provisioned source
checkout was edited.

## TDD evidence

The first focused native-CJS regression placed both allowed requests in an
attested nested physical YAML file. Before the production change:

```text
npm exec vitest -- run tests/localBindingNativeTsHooks.test.ts \
  -t "admits only" --maxWorkers=1

Test Files  1 failed (1)
Tests       1 failed | 3 skipped (4)
Error       LOCAL_BINDING_HOOK_RESOLUTION_DENIED
site        attested nested YAML require('process')
exit        1
```

After admitting the two exact names, an unrecorded-parent test produced a
second meaningful RED: the child exited 0 when a test fixture outside the
attested YAML graph imported bare `process`. The hook now rejects either bare
name globally unless the parent URL is an attested YAML file. The final focused
test passed and covers:

- `process` and `buffer` from an attested physical YAML CJS parent, resolved as
  explicit `node:process` and `node:buffer` identities;
- broader builtin `fs` rejected from an attested YAML parent;
- an installed synthetic `unapproved-package` on YAML's normal ancestor lookup
  path rejected before ambient loading;
- both bare `process` and `buffer` rejected from repository parents; and
- both bare names rejected from an unrecorded parent after hooks are installed.

The complete focused hooks suite passed 4/4.

## Implementation

`scripts/local-binding-native-ts-hooks.mjs` now has one fixed two-name YAML
builtin allowlist. Only when `context.parentURL` belongs to the fully attested
YAML namespace does the resolver translate a matching bare name to its explicit
`node:` form through Node's builtin resolver. Other YAML bare names still fail
closed, and the two names are denied from every unrecognized parent. Repository
parents retain their recorded-edge policy and therefore cannot use the bare
aliases. The fixed entry, source graph, full YAML namespace walk, bounded file
reads, identities, and public zero-argument runtime interface are unchanged.

No frozen G001 path, attester, root package, lock, dependency, credential,
network, deployment, or admission behavior changed.

## Actual verified-namespace diagnostic

Before commit, a read-only diagnostic used the repaired hook module with the
retained captured source graph and provisioned physical YAML tree. Pinned Linux
Node 22.22.3 reported:

```json
{"modules":40,"yamlFiles":233,"exportType":"function"}
```

The process exited 0. This demonstrates import compatibility across the actual
verified namespace and fixed PTR entry, but it intentionally did not call the
builder, materialize dependencies, build, or generate bindings. Node emitted
only its expected experimental API warnings.

## Local GREEN evidence

At immutable source/test commit
`27b7dc31e6a3eab4d9357ccafceb50df103beb21`:

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
Tests       97 passed | 7 skipped (104)
Duration    16.89s
exit        0
```

The seven skips are the existing explicit Windows limitations for native Linux
ownership, chmod, and symlink evidence. Both typechecks exited 0:

```text
npm run typecheck

.git/ci-node-22.22.3/node.exe node_modules/typescript/bin/tsc \
  -p tsconfig.app.json \
  --tsBuildInfoFile .git/local-binding-runtime.tsbuildinfo
```

Pinned-node `--check` for both changed JavaScript modules and the staged diff
check also exited 0.

## Native GREEN evidence

The controller transferred the three files from the committed blobs and
verified all destination blobs exactly. WSL Ubuntu 24.04 session 44011 ran
pinned Node 22.22.3 with the same eight-suite command and
`--maxWorkers=1`:

```text
/tmp/warpkeep-root-ci-PwWPWxgX/node-v22.22.3-linux-x64/bin/node \
  node_modules/vitest/vitest.mjs run \
  tests/localBindingRuntime.test.ts \
  tests/localBindingRuntimeParent.test.ts \
  tests/localBindingRuntimeLifecycle.test.ts \
  tests/localBindingNativeTsHooks.test.ts \
  tests/localBindingYamlManifest.test.ts \
  tests/ptrBindingLinuxLockedSourceBuild.test.ts \
  tests/ptrBindingLockedSourceBuildNative.test.ts \
  tests/spacetimeBindingTree.test.ts \
  --maxWorkers=1

Test Files  8 passed (8)
Tests       104 passed (104)
Skipped     0
Failures    0
Unhandled   0
Duration    9.04s
exit        0
```

The YAML builtin regression passed in 306 ms. The two real-writer tests passed
in 908 ms and 1657 ms.

## Limits and next gate

The controller intentionally did not rerun the actual fixed-profile derive
before scoped review. The original provisioned run remains a real failed build
attempt, while the repaired actual-namespace check is import-only diagnostic
evidence. No successful real module typecheck, CLI build, two-cycle generate,
or candidate derivation is claimed. After review, the controller must transfer
the reviewed commit to the clean source checkout and rerun the credential-free
actual derive; any later failure must be diagnosed at its newly reached
boundary.

## Commit

- `27b7dc31e6a3eab4d9357ccafceb50df103beb21` — `fix(runtime): admit pinned YAML builtins`
